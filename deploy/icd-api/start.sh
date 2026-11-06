#!/bin/sh
# Starts the ICD-API the way WHO's own startICDAPI.sh does, minus the SSH server that script also
# launches: nothing here needs a shell into the container, so there is no reason to run one.
set -eu

cd /usr/share/icdapi
mkdir -p analytics

export ASPNETCORE_ENVIRONMENT="${ASPNETCORE_ENVIRONMENT:-container}"
containerId="$(cat /usr/share/icdapi/containerId)"
export containerId

exec /usr/share/icdapi/ICD-API --urls http://0.0.0.0:80
