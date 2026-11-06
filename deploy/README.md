# Deploying and operating E-Poch

There is one way to deploy E-Poch: a prebuilt Docker image on the clinic machine, installed once
from a transfer folder and updated afterwards over Tailscale.

## What lives where

| In this repository | Purpose |
|---|---|
| `Dockerfile.clinic` | The one application image: API, migrations, document rendering and the web app |
| `deploy/clinic/` | **Everything copied into the clinic install folder** — compose file, env template, start/update/backup/restore/heartbeat scripts and systemd units |
| `deploy/build-clinic-image.sh` | Builds a full offline install folder (first install, or a new ICD-11 / PostgreSQL release) |
| `deploy/push-update.sh` | Ships a routine update: only the changed image layers, plus the current `deploy/clinic/` files |
| `deploy/clinic-entrypoint.sh`, `deploy/clinic-nginx.conf` | Baked into the image |
| `deploy/icd-api/` | The offline ICD-11 lookup image |

On the clinic machine, the install folder holds `docker-compose.yml`, `clinic.env` (secrets — never
leaves the machine), the scripts, and `data/` (database, uploads, backups, logs). Updates replace
the scripts and the image; they never touch `clinic.env` or `data/`.

## 1. Prepare the clinic machine (once)

Two PCs: the **server** (front desk — runs Docker) and the **doctor's PC** (browser only).

- Ubuntu Desktop 24.04 LTS with Docker Engine + Compose plugin; add your user to the `docker` group.
- **Fixed LAN IP** (router DHCP reservation). Workstations use this address.
- **Never sleep**: Settings → Power → Automatic suspend **Off** (screen blanking is fine).
- Firewall: allow only `3000` and `5173` (TCP) from the LAN, and never forward them from the router.
  The app serves plain HTTP, so treat the clinic network as trusted — no guest devices on it.
- Tailscale, so the dev team can reach the machine over SSH.

Containers use `restart: always`, so the system comes back on its own after a reboot once Docker starts.

## 2. First install

On the build machine (internet is needed only while building):

```bash
./deploy/build-clinic-image.sh deploy/releases/epoch-clinic   # output folder must be empty
```

Copy that folder to the clinic machine (USB drive, LAN or `scp`). It carries the application,
PostgreSQL 17, the ICD-11 lookup and the local image store as image files, so the install needs no
internet. On the clinic machine:

```bash
cd epoch-clinic
cp clinic.env.example clinic.env
nano clinic.env          # SITE_HOST, POSTGRES_PASSWORD (in all three places), JWT_SECRET, BACKUP_DEST
./start-clinic.sh admin  # starts everything and creates the first administrator
./clinic-registry.sh seed  # once: lets later updates send only what changed
```

`bootstrap-production.js` (run by `start-clinic.sh`) creates the administrator and, only if none
exist, the standard payment methods and dosage forms. Production never runs the demo seed.

**Workstations** need nothing installed: open `http://<SITE_HOST>:5173` and sign in. The workspace
that opens follows the account's role; a front desk account switches between reception and
pharmacy from the topbar. Make a desktop shortcut per PC (in Chrome, create a shortcut that opens
as a window).

### What runs on the clinic machine

- **PostgreSQL** (`db`) stores its data in `data/postgres`. It publishes no port — only the
  application reaches it. `start-clinic.sh` refuses to start if `POSTGRES_PASSWORD` disagrees with
  the password inside `DATABASE_URL`/`DIRECT_URL`. `SKIP_DB_SECURITY_CHECK=true` stays set: that
  check is for Supabase roles, which do not exist here.
- **ICD-11 lookup** (`icd-api`) is WHO's own API with the classification baked in. No internet, no
  WHO account, about 450 MB of memory, and a minute or two to load after a restart. While it is
  down, doctors can still type a diagnosis as free text.
- **The application** (`epoch-medical`) on ports 5173 (web app) and 3000 (API). Migrations run
  automatically before each new version starts; they are forward-only.

> **This machine is the only copy of the clinic's records.** Set up backups (section 4) and complete
> a restore drill *before* real patient data is entered.

## 3. Updating

Routine release, from the repository root on the development machine:

```bash
./deploy/push-update.sh --apply
```

It builds the image, pushes only the missing layers (usually a few MB) through an SSH tunnel into the
clinic's local image store, syncs `deploy/clinic/` into the install folder, and runs
`update-from-registry.sh` there. That script:

1. dumps the database to `data/backups/before-update-<version>-<time>.dump`,
2. records counts and checksums of patients, medicines, batches, stock, prescriptions and invoices,
3. keeps the running image as `epoch-medical:before-<version>`,
4. starts the new version (migrations run as usual),
5. compares the records afterwards and exits with a warning if anything differs.

Without `--apply`, it prints the command to run at the clinic later. Set `CLINIC_HOST` and
`CLINIC_DIR` to target a different clinic.

**Rollback**, on the clinic machine:

```bash
docker tag epoch-medical:before-<version> epoch-medical:clinic && SKIP_IMAGE_LOAD=1 ./start-clinic.sh
```

Migrations are forward-only, so if the failed version changed the database schema, restore the
pre-update dump as well (`./restore.sh --live`).

A new **ICD-11 release** (WHO publishes one each January) or a **PostgreSQL version** change goes as
a full folder from `build-clinic-image.sh`; follow the note at the top of `deploy/icd-api/Dockerfile`
and change the release in `deploy/clinic/docker-compose.yml` and `deploy/build-clinic-image.sh` to
match. For a full folder that should not carry the 1 GB ICD-11 image, build with `INCLUDE_ICD_API=0`.

The image defaults to `linux/amd64`. For an ARM clinic computer, build with
`PLATFORM=linux/arm64 ./deploy/build-clinic-image.sh`.

## 4. Backups and recovery

There is no managed off-site copy, so this is part of the installation, not an extra. The backup
is `backup.sh`: a daily copy of the database + uploads to an *independent* drive.

> The API has on-demand backup endpoints (`/settings/backups`), but the Settings → Backups screen is
> not currently shown in the app, so `backup.sh` is the only backup layer clinics actually have.

In `clinic.env`:

```
BACKUP_DEST=/media/clinic/backup-drive/epoch     # an EXTERNAL drive or share — not this disk
BACKUP_PASSPHRASE_FILE=/etc/epoch-backup.pass    # encrypts backups (they contain patient records)
BACKUP_HEARTBEAT_URL=https://hc-ping.com/<id>    # alerts you if a night is missed
```

Then, from the install folder:

```bash
./backup.sh            # prove it works before trusting the timer
sudo cp epoch-backup.service epoch-backup.timer /etc/systemd/system/
sudo sed -i "s#__INSTALL_PATH__#$(pwd)#" /etc/systemd/system/epoch-backup.service
sudo systemctl daemon-reload && sudo systemctl enable --now epoch-backup.timer
```

The timer runs daily at 02:00 and catches up after the PC was off. Uploaded photos and attachments
are not in the database — the backup includes them.

**Prove it works** — on a schedule, and after any change to backups. Restore into a throwaway empty
database, never the live one:

```bash
./restore.sh --drill database-<ts>.dump.enc,uploads-<ts>.tar.gz.enc --target-url postgresql://postgres:pw@localhost:5432/drill
./restore.sh --drill backup-2026-….tar --target-url …     # an archive from the API's /settings/backups
```

The time the drill reports is your recovery time. The data-loss window is the time since the last
backup — up to 24 h with the daily timer; run `backup.sh` more often if that is too much.

**Real disaster recovery** (replaces current data; stops the app while it runs):

```bash
./restore.sh --live <backup>     # asks you to type a confirmation phrase
```

It saves a safety dump first, restores in a single transaction (all-or-nothing), restores the
uploaded files, revokes every session and restarts. Restoring from inside the application is
deliberately disabled.

## 5. Monitoring

- `SMTP_*` and `ERROR_ALERT_EMAIL` in `clinic.env` → the app emails someone when something breaks.
  **Test it once** by making it fail — silence proves nothing.
- `heartbeat.sh` pings an outside monitor every 5 minutes, only while the app is healthy, the disk
  has room and every container is up. Set `HEARTBEAT_URL` in `clinic.env`, then:

  ```bash
  sudo cp epoch-heartbeat.service epoch-heartbeat.timer /etc/systemd/system/
  sudo sed -i "s#__INSTALL_PATH__#$(pwd)#" /etc/systemd/system/epoch-heartbeat.service
  sudo systemctl daemon-reload && sudo systemctl enable --now epoch-heartbeat.timer
  ```

- Logs rotate automatically (Docker: 5 × 10 MB per container; app error log: 3 × 20 MB) and live in
  `data/logs`.

## 6. Before real patients — checklist

- [ ] `JWT_SECRET` is new for this clinic
- [ ] Admin password is unique (not reused anywhere) and 2FA enabled for administrators
- [ ] `BACKUP_DEST` points at an external drive, `backup.sh` run once by hand, timer enabled
- [ ] `BACKUP_PASSPHRASE_FILE` set — the backup drive holds patient records
- [ ] A **restore drill** completed successfully from a real backup
- [ ] Error email and heartbeat alert each **tested** by making them fail once
- [ ] `clinic-registry.sh seed` run, so the first update is small
- [ ] Every workstation can open the app by the server's address, log in, and land in the right workspace
- [ ] Letter preview → issue → download → print tested; a payment and refund tested on a synthetic patient
- [ ] Clinician and pharmacist have accepted prescription-quantity and dispensing behaviour
