#!/bin/sh
# One-time setup on the clinic machine: a private image store that receives updates as
# differences only. It listens on this machine's localhost alone — nothing on the clinic network
# or the tailnet can reach it; push-update.sh reaches it through an SSH tunnel.
#   ./clinic-registry.sh            # start it (loads registry-2.tar if the image is missing)
#   ./clinic-registry.sh seed       # also store the version that is running now, so the first
#                                   # update only needs to send what changed since then
set -eu
cd "$(dirname "$0")"

name=epoch-registry
store="$(pwd)/data/registry"

if ! docker image inspect registry:2 >/dev/null 2>&1; then
  [ -f registry-2.tar ] || { echo "registry:2 is not loaded and registry-2.tar is not here." >&2; exit 1; }
  docker image load -i registry-2.tar
fi

mkdir -p "$store"
if ! docker ps -a --format '{{.Names}}' | grep -qx "$name"; then
  docker run -d --name "$name" --restart unless-stopped \
    -p 127.0.0.1:5000:5000 -v "$store:/var/lib/registry" registry:2 >/dev/null
fi
docker start "$name" >/dev/null
echo "Local image store running on 127.0.0.1:5000 (data in $store)."

if [ "${1:-}" = seed ]; then
  docker tag epoch-medical:clinic localhost:5000/epoch-medical:current
  docker push localhost:5000/epoch-medical:current
  echo "Stored the running version; updates now only carry what changed."
fi
