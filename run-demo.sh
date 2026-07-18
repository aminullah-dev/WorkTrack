#!/usr/bin/env bash
#
# One command to run the whole WorkTrack demo locally.
#
#   bash run-demo.sh
#
# It builds the backend, starts the Firebase emulators, seeds the sample Afghan
# tenant, and launches the web manager portal — in the right order, in ONE
# terminal. Press Ctrl+C once to stop everything.
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"

echo ""
echo "==> WorkTrack demo starting. This uses local emulators only (no real Firebase)."
echo ""

# --- 0. Prerequisites -------------------------------------------------------
if ! command -v firebase >/dev/null 2>&1; then
  echo "✗ Firebase CLI not found. Install it once with:"
  echo "    npm install -g firebase-tools"
  exit 1
fi
if ! command -v java >/dev/null 2>&1; then
  echo "✗ Java not found (the Firestore emulator needs it)."
  echo "    Install Temurin JDK 21 from https://adoptium.net and re-run."
  exit 1
fi

# --- 1. Backend -------------------------------------------------------------
echo "==> Preparing backend…"
cd "$ROOT/backend/functions"
[ -d node_modules ] || { echo "   installing backend deps (first run)…"; npm install --silent; }
[ -f .secret.local ] || echo 'KIOSK_HMAC_SECRET=demo-secret' > .secret.local
echo "   building functions…"
npm run build --silent

# --- 2. Web -----------------------------------------------------------------
echo "==> Preparing web portal…"
cd "$ROOT/web"
[ -d node_modules ] || { echo "   installing web deps (first run)…"; npm install --silent; }
[ -f .env.local ] || cp .env.emulator .env.local

# --- 3. Emulators -> seed -> web (single lifecycle) -------------------------
# emulators:exec starts the emulators, runs the inner command while they're up,
# and shuts them down when it exits. The inner command seeds the data and then
# runs the web dev server (which blocks until you press Ctrl+C).
echo "==> Starting emulators, seeding data, and launching the portal…"
echo "    (first start takes ~20s; the portal URL will be printed below)"
echo ""
cd "$ROOT/backend"
firebase emulators:exec \
  --project demo-worktrack \
  --only functions,firestore,auth \
  "node \"$ROOT/backend/functions/seed.js\" && echo '' && echo '======================================================' && echo '  Portal starting — open the http://localhost URL below' && echo '  Login:  admin@worktrack.af    Password:  Passw0rd!' && echo '======================================================' && echo '' && cd \"$ROOT/web\" && npm run dev"
