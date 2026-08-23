#!/usr/bin/env bash
# Nasadenie novej verzie na VPS: stiahne main, nainštaluje závislosti a reštartuje službu.
# Spúšťa sa z lokálu:  bash deploy/deploy.sh
set -euo pipefail

SERVER="${TBAU_SERVER:-tbau@80.211.202.23}"
APP_DIR="/opt/tbau-portal"

echo "→ Nasadzujem na ${SERVER} ..."
ssh "$SERVER" bash -s <<EOF
set -euo pipefail
cd "$APP_DIR"
git pull --ff-only origin main
npm ci --omit=dev
node src/db/seed.js || true
sudo systemctl restart tbau-portal
sleep 1
systemctl is-active tbau-portal
EOF
echo "✓ Hotovo."
