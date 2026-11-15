#!/bin/sh
# Switch the clinic to a new version that deploy/push-update.sh has pushed into this machine's
# local image store (see clinic-registry.sh). Run from the install folder on the clinic machine:
#   ./update-from-registry.sh 20261003-1530
#
# Never touches clinic.env or data/. Before switching it takes a database dump and records record
# counts and checksums of every medicine and stock batch; afterwards it compares them and says
# loudly if anything differs. The previous image stays tagged for a one-command rollback:
#   docker tag epoch-medical:before-<version> epoch-medical:clinic && SKIP_IMAGE_LOAD=1 ./start-clinic.sh
set -eu

cd "$(dirname "$0")"
version="${1:-}"
registry="${EPOCH_REGISTRY:-localhost:5000}"
if [ -z "$version" ]; then
  echo "Usage: $0 <version>   (the version push-update.sh printed)" >&2
  exit 1
fi
[ -f clinic.env ] || { echo "Run this from the clinic install folder (no clinic.env here)." >&2; exit 1; }

image="$registry/epoch-medical:$version"
stamp="$(date +%Y%m%d-%H%M%S)"
db="$(docker compose -f docker-compose.yml ps -q db)"
[ -n "$db" ] || { echo "The database container is not running; start the clinic first." >&2; exit 1; }

counts() {
  docker exec -i "$db" sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tA -F " "' <<'SQL'
select 'medicines', count(*) from "Medicine"
union all select 'batches', count(*) from "Batch"
union all select 'stock_units', coalesce(sum(qty_on_hand),0) from "Batch"
union all select 'patients', count(*) from "Patient"
union all select 'users', count(*) from "User"
union all select 'consultations', count(*) from "Consultation"
union all select 'prescriptions', count(*) from "Prescription"
union all select 'invoices', count(*) from "Invoice"
union all select 'medicine_checksum', coalesce(sum(hashtext(medicine_id::text||name||coalesce(generic_name,'')||coalesce(strength,''))),0) from "Medicine"
union all select 'batch_checksum', coalesce(sum(hashtext(batch_id::text||batch_no||qty_on_hand::text||coalesce(selling_price_per_base_unit::text,''))),0) from "Batch";
SQL
}

echo "Fetching $image from the local image store ..."
docker pull "$image"

# data/backups belongs to the containers' user on some installs; keep the update's own copies beside
# it in the home folder then, rather than failing before the update starts.
backups=data/backups
if ! { mkdir -p "$backups" 2>/dev/null && [ -w "$backups" ]; }; then
  backups="$HOME/epoch-update-backups"
  mkdir -p "$backups" && chmod 700 "$backups"
fi
dump="$backups/before-update-$version-$stamp.dump"
echo "Backing up the database to $dump ..."
docker exec "$db" sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$dump"
chmod 600 "$dump"
counts > "$backups/counts-before-$version.txt"

# Keep the running version for rollback.
docker tag epoch-medical:clinic "epoch-medical:before-$version"
docker tag "$image" epoch-medical:clinic

# An image file left in this folder by an older full install would be loaded by a plain
# ./start-clinic.sh and silently roll the clinic back. Keep it, but out of the way.
if [ -f epoch-medical-clinic.tar ]; then
  mv epoch-medical-clinic.tar "epoch-medical-clinic-superseded-$stamp.tar.old"
  [ ! -f epoch-medical-clinic.tar.sha256 ] || mv epoch-medical-clinic.tar.sha256 "epoch-medical-clinic-superseded-$stamp.tar.sha256.old"
fi

SKIP_IMAGE_LOAD=1 ./start-clinic.sh

counts > "$backups/counts-after-$version.txt"
if diff "$backups/counts-before-$version.txt" "$backups/counts-after-$version.txt" >/dev/null; then
  echo ""
  echo "Records unchanged by the update:"
  sed 's/^/  /' "$backups/counts-after-$version.txt"
else
  echo "" >&2
  echo "WARNING: record counts or checksums differ after the update:" >&2
  diff "$backups/counts-before-$version.txt" "$backups/counts-after-$version.txt" >&2 || true
  echo "The pre-update backup is $dump." >&2
  exit 2
fi
echo "Now running version $version. Previous version kept as epoch-medical:before-$version."
