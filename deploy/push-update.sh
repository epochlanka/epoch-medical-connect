#!/bin/sh
# Ship a new version to the clinic over Tailscale, sending only the image layers the clinic does
# not already have — usually a few megabytes of application code instead of the full ~760 MB image.
# Run from the repository root on the development machine:
#   ./deploy/push-update.sh                 # build, push, then print the command to run at the clinic
#   ./deploy/push-update.sh --apply         # ... and run it at the clinic too
#
# Needs SSH access to the clinic machine (key-based) and clinic-registry.sh set up there once.
set -eu
cd "$(dirname "$0")/.."

host="${CLINIC_HOST:-city-medical-front-desk@city-medical-front-desk-jytc}"
dir="${CLINIC_DIR:-Desktop/epoch-clinic-20260925}"
local_port="${LOCAL_PORT:-5055}"
version="$(date +%Y%m%d-%H%M)"
apply=0
[ "${1:-}" != --apply ] || apply=1

echo "Building epoch-medical:clinic ($version) ..."
docker build --platform linux/amd64 -f Dockerfile.clinic -t epoch-medical:clinic -t "epoch-medical:$version" .

# The clinic's image store only listens on the clinic machine's own localhost; reach it through an
# SSH tunnel. Docker treats localhost registries as trusted, so no daemon settings change anywhere.
sock="$(mktemp -u)"
ssh -f -N -M -S "$sock" -o ExitOnForwardFailure=yes -o ServerAliveInterval=30 \
  -L "$local_port:127.0.0.1:5000" "$host"
trap 'ssh -S "$sock" -O exit "$host" 2>/dev/null || true' EXIT INT TERM

target="localhost:$local_port/epoch-medical:$version"
docker tag epoch-medical:clinic "$target"
echo "Sending the changed layers ..."
docker push "$target"

# The install folder's scripts travel with every update so the clinic always has the matching
# versions. Only files from deploy/clinic are written: clinic.env and data/ are never touched.
rsync -a -e ssh deploy/clinic/ "$host:$dir/"

if [ "$apply" = 1 ]; then
  ssh -t "$host" "cd $dir && ./update-from-registry.sh $version"
else
  echo ""
  echo "Version $version is at the clinic. To switch to it there:"
  echo "  ssh $host 'cd $dir && ./update-from-registry.sh $version'"
fi
