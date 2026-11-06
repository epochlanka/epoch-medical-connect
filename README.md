# E-POCH Medical System

E-POCH is a local-network clinic system: one web application with an Administration, Clinical,
Reception and Pharmacy workspace, backed by one Express API and PostgreSQL database.

## Address

| | Address on the clinic network |
|---|---|
| The application | `http://<server-ip>:5173` |
| API health | `http://<server-ip>:3000/health` |

Everyone opens the same address and signs in. The workspace that loads follows the account's role,
and staff who hold two roles (front desk covers reception and pharmacy) switch between them without
signing out.

The usual two-computer setup runs Docker and PostgreSQL on the front-desk computer. The doctor
computer only needs a browser.

## Deploying

Clinics run one prebuilt Docker image. First install, on a build machine:

```sh
./deploy/build-clinic-image.sh deploy/releases/epoch-clinic
```

Routine updates, over Tailscale (sends only what changed):

```sh
./deploy/push-update.sh --apply
```

Installation, updating, rollback, backups and recovery are all in [deploy/README.md](deploy/README.md).

## Repository layout

| | |
|---|---|
| `backend/` | Express API, Prisma schema and migrations |
| `frontend/` | The web application (React + Vite), one workspace per role |
| `deploy/` | The clinic image build and update tooling; `deploy/clinic/` is the install folder's contents |
| `Dockerfile.clinic` | The single application image |
| `docs/` | Requirements (`docs/srs/`), security audit, review notes |

## Development

Needs Node 24 and a local PostgreSQL 17 (`backend/.env` from `backend/.env.example`).

```sh
cd backend && npm install && npx prisma migrate dev && npm run dev    # API on :3000
cd frontend && npm install && npm run dev                             # app on :5173
```

Before shipping:

```sh
cd backend && npm run test:isolated
cd ../frontend && npm run build
```

The isolated backend test command uses a throwaway PostgreSQL 17 container and never targets the
configured clinic database.
