#!/usr/bin/env bash
#
# Creates the alerting that turns the nightly integrity audit into something
# that actually reaches a person.
#
# The audit already logs and stores its findings, but a log nobody reads is
# how the original failure stayed invisible for weeks. This attaches an email
# alert to it.
#
# Usage:
#   bash backend/monitoring/setup-alerts.sh you@example.com [project-id]
#
# Requires gcloud, logged in with an account that can edit monitoring:
#   gcloud auth login
#
# Safe to re-run: an existing channel for the same address is reused, and the
# policy is matched by display name and updated rather than duplicated.
set -euo pipefail

EMAIL="${1:-}"
PROJECT="${2:-worktrack-prod}"
POLICY_FILE="$(cd "$(dirname "$0")" && pwd)/attendance-integrity-alert.json"
POLICY_NAME="Attendance integrity — recorded punches missing from the board"

if [ -z "$EMAIL" ]; then
  echo "usage: bash backend/monitoring/setup-alerts.sh <email> [project-id]" >&2
  exit 1
fi

command -v gcloud >/dev/null || {
  echo "✗ gcloud not on PATH. Try:" >&2
  echo '    export PATH=/opt/homebrew/share/google-cloud-sdk/bin:"$PATH"' >&2
  exit 1
}

gcloud auth list --filter=status:ACTIVE --format="value(account)" | grep -q . || {
  echo "✗ gcloud is not logged in. Run: gcloud auth login" >&2
  exit 1
}

echo "==> Project: $PROJECT"
echo "==> Alert recipient: $EMAIL"

# --- Notification channel -----------------------------------------------
# Google emails the address a verification link; the alert only delivers once
# that link is clicked.
CHANNEL=$(gcloud alpha monitoring channels list \
  --project="$PROJECT" \
  --filter="type=email AND labels.email_address=$EMAIL" \
  --format="value(name)" | head -1)

if [ -n "$CHANNEL" ]; then
  echo "==> Reusing notification channel: $CHANNEL"
else
  echo "==> Creating email notification channel…"
  CHANNEL=$(gcloud alpha monitoring channels create \
    --project="$PROJECT" \
    --display-name="WorkTrack alerts" \
    --type=email \
    --channel-labels="email_address=$EMAIL" \
    --format="value(name)")
  echo "    $CHANNEL"
  echo "    Check $EMAIL for a verification link — alerts stay undelivered until it is clicked."
fi

# --- Alert policy --------------------------------------------------------
EXISTING=$(gcloud alpha monitoring policies list \
  --project="$PROJECT" \
  --filter="displayName='$POLICY_NAME'" \
  --format="value(name)" | head -1)

if [ -n "$EXISTING" ]; then
  echo "==> Updating existing policy: $EXISTING"
  gcloud alpha monitoring policies update "$EXISTING" \
    --project="$PROJECT" \
    --policy-from-file="$POLICY_FILE" \
    --set-notification-channels="$CHANNEL" >/dev/null
else
  echo "==> Creating alert policy…"
  gcloud alpha monitoring policies create \
    --project="$PROJECT" \
    --policy-from-file="$POLICY_FILE" \
    --notification-channels="$CHANNEL" >/dev/null
fi

echo
echo "✔ Done. The nightly audit now emails $EMAIL when attendance goes missing."
echo "  Verify: gcloud alpha monitoring policies list --project=$PROJECT --format='value(displayName,enabled)'"
