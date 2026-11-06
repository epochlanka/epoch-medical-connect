#!/bin/sh
# Pushes a "still alive" ping to a dead-man's-switch monitor (e.g. healthchecks.io, free tier)
# only when the local stack actually answers healthy — never exposes anything inbound, just an
# outbound call this machine makes on its own schedule. If the machine loses power, loses
# internet, or the application goes unhealthy, pings stop arriving and the monitor alerts the dev
# team (email/Slack/etc, configured on the monitor's own side) — no port-forwarding, no public
# exposure of this PC required.
#
# Setup:
#   1. Create a free check at https://healthchecks.io (or any compatible dead-man's-switch
#      service) with an expected period of 5 minutes (epoch-heartbeat.timer).
#   2. Put its ping URL in clinic.env as HEARTBEAT_URL=...
#   3. Install the systemd timer (see epoch-heartbeat.service).
set -e
# Runs from the clinic install folder (beside docker-compose.yml and clinic.env).
cd "$(dirname "$0")"
# A HEARTBEAT_URL already in the environment wins over an empty one in clinic.env.
url_from_env="${HEARTBEAT_URL:-}"
[ -f clinic.env ] && { set -a; . ./clinic.env; set +a; }
HEARTBEAT_URL="${url_from_env:-${HEARTBEAT_URL:-}}"
if [ -z "$HEARTBEAT_URL" ]; then
  echo "Set HEARTBEAT_URL (your healthchecks.io ping URL) in clinic.env first." >&2
  exit 1
fi

fail() { curl -fsS -m 10 "$HEARTBEAT_URL/fail" >/dev/null || true; exit 1; }

# 1. The app answers and its database is reachable.
HEALTH_URL="${HEALTH_URL:-http://localhost:3000/health}"
curl -fsS -m 10 "$HEALTH_URL" | grep -q '"status":"healthy"' || fail

# 2. The disk is not about to fill (a full disk stops the database, uploads and logging).
#    Checked on the filesystem holding this install folder (and so the database in data/).
USED="$(df -P . | awk 'NR==2 { gsub("%", "", $5); print $5 }')"
[ "${USED:-0}" -lt "${DISK_ALERT_PERCENT:-90}" ] || fail

# 3. Every container that should be running is running.
DOWN="$(docker compose -f docker-compose.yml ps --status exited --status restarting --status dead -q 2>/dev/null | wc -l)"
[ "$DOWN" -eq 0 ] || fail

curl -fsS -m 10 "$HEARTBEAT_URL" >/dev/null
