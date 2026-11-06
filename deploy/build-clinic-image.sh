#!/bin/sh
# Build one offline-transferable image and place it with the clinic runtime files.
set -eu

cd "$(dirname "$0")/.."

output_dir="${1:-deploy/transfer}"
platform="${PLATFORM:-linux/amd64}"
# Pinned so the clinic always gets the same database version, and so this is the exact image
# saved into the bundle below. Must stay on PostgreSQL 17 to match the client in the app image.
postgres_image="${POSTGRES_IMAGE:-postgres:17-alpine}"
# The ICD-11 lookup service. Its tag is the ICD-11 release it holds and must match the image and
# ICD11_RELEASE in deploy/clinic/docker-compose.yml.
icd_image="epoch-icd-api:2026-01"
# The ICD-11 image is large and only changes with a new ICD-11 release, so an update bundle for a
# clinic that already has it can leave it out: INCLUDE_ICD_API=0 ./deploy/build-clinic-image.sh
include_icd="${INCLUDE_ICD_API:-1}"

# Never mix a new release with an older transfer directory. In particular, an existing
# clinic.env can contain live credentials and must not be silently carried into a new bundle.
if [ -e "$output_dir" ] && [ -n "$(find "$output_dir" -mindepth 1 -maxdepth 1 -print -quit 2>/dev/null)" ]; then
  echo "Refusing to build into non-empty directory: $output_dir" >&2
  echo "Move the old bundle to a secure archive, or pass a new empty output directory." >&2
  exit 1
fi

mkdir -p "$output_dir"

echo "Building epoch-medical:clinic for $platform ..."
docker build --platform "$platform" -f Dockerfile.clinic -t epoch-medical:clinic .

# The clinic machine has no internet, so the database image has to travel in the bundle too —
# otherwise `docker compose up` tries to pull it and the whole install stalls at the first run.
echo "Fetching $postgres_image for $platform ..."
docker pull --platform "$platform" "$postgres_image"

echo "Exporting both images (this file will be large) ..."
docker image save -o "$output_dir/epoch-medical-clinic.tar" epoch-medical:clinic "$postgres_image"

# A separate file, so application updates do not have to carry it. Building it downloads the
# ICD-11 release from WHO once, here, and bakes it in — the clinic machine never goes online.
if [ "$include_icd" = 1 ]; then
  echo "Building $icd_image (downloads ICD-11 from WHO on the first build) ..."
  docker build --platform "$platform" -t "$icd_image" deploy/icd-api
  docker image save -o "$output_dir/epoch-icd-api.tar" "$icd_image"
  (cd "$output_dir" && sha256sum epoch-icd-api.tar > epoch-icd-api.tar.sha256)
else
  echo "Skipping $icd_image (INCLUDE_ICD_API=0): the clinic machine must already have it loaded."
fi
# Everything the install folder needs besides the images lives in deploy/clinic — the clinic machine
# has no checkout of this repository. Updates refresh the same files (deploy/push-update.sh).
cp deploy/clinic/* "$output_dir/"
chmod +x "$output_dir"/*.sh
# Small updates afterwards travel over Tailscale as changed layers only, into a local image store
# on the clinic machine (clinic-registry.sh). Its image has to travel too: there is no internet.
docker pull --platform "$platform" registry:2
docker image save -o "$output_dir/registry-2.tar" registry:2

(cd "$output_dir" && sha256sum epoch-medical-clinic.tar > epoch-medical-clinic.tar.sha256)

echo ""
echo "Transfer this directory to the Ubuntu clinic machine: $output_dir"
echo "There, copy clinic.env.example to clinic.env, fill it in, then run:"
echo "  ./start-clinic.sh admin     # first install: also creates the administrator"
echo "  ./start-clinic.sh           # afterwards"
