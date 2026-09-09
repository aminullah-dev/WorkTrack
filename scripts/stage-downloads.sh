#!/usr/bin/env bash
#
# Stages the signed release APKs into the built portal so Firebase Hosting
# serves them from a stable address customers can be sent to.
#
# The APKs are 130+ MB and are deliberately NOT in git (see .gitignore). They
# are copied into web/dist after `npm run build` and before `firebase deploy`,
# which is why this is a step rather than a checked-in directory: the repo
# stays small and the download always matches the build you just made.
#
# Firebase serves a file that exists in preference to a rewrite, so these win
# over the SPA catch-all in firebase.json without any config change.
#
# Usage, from the repo root:
#
#   npm --prefix web run build      # with .env.local moved aside
#   scripts/stage-downloads.sh
#   npx firebase deploy --only hosting --project worktrack-prod
#
# Result: https://worktrack-prod.web.app/app/
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="${1:-prod}"

# Gradle owns these directories and clears stale outputs from them, so read the
# APKs where the build actually leaves them rather than from a hand-kept copy.
case "$TARGET" in
  prod)
    SRC="$ROOT/app/build/outputs/apk/release"
    WEB="$ROOT/web/dist"
    DEST="$WEB/app"
    GRADLE_TASK=":app:assembleRelease"
    WEB_TASK="npm --prefix web run build"
    ;;
  demo)
    # The demo hosting is rebuilt from scratch on every portal deploy, so the
    # APKs have to be re-staged each time or the download links on
    # linumic.com/…/demo/ start returning the SPA's index.html.
    SRC="$ROOT/app/build/outputs/apk/demo"
    WEB="$ROOT/web/dist-demo"
    DEST="$WEB"
    GRADLE_TASK=":app:assembleDemo"
    WEB_TASK="npm --prefix web run build -- --mode demo --outDir dist-demo"
    ;;
  *)
    echo "Usage: $0 [prod|demo]" >&2
    exit 1
    ;;
esac

if [ ! -d "$SRC" ]; then
  echo "No $SRC — build the signed APKs first:" >&2
  echo "  ./gradlew $GRADLE_TASK" >&2
  exit 1
fi

if [ ! -d "$WEB" ]; then
  echo "No $WEB — build the portal first:" >&2
  echo "  $WEB_TASK" >&2
  exit 1
fi

# Version straight from the build output, so the filename cannot drift from the
# thing it names.
VERSION="$(
  python3 - "$SRC/output-metadata.json" <<'PY'
import json, sys
m = json.load(open(sys.argv[1]))
print(m["elements"][0]["versionName"])
PY
)"

echo "Staging WorkTrack $VERSION ($TARGET)"
if [ "$TARGET" = "prod" ]; then
  rm -rf "$DEST"
fi
mkdir -p "$DEST"

# x86_64 is emulator-only; shipping it to anyone just adds 33 MB of confusion.
#
# The demo filenames are fixed rather than versioned: linumic.com's demo page
# links to them by name, so a version in the filename would break those links
# on every release.
if [ "$TARGET" = "prod" ]; then
  declare -a NAMES=(
    "app-arm64-v8a-release.apk:worktrack-$VERSION-arm64.apk"
    "app-armeabi-v7a-release.apk:worktrack-$VERSION-arm32.apk"
    "app-universal-release.apk:worktrack-$VERSION-universal.apk"
  )
else
  declare -a NAMES=(
    "app-arm64-v8a-demo.apk:worktrack-demo.apk"
    "app-armeabi-v7a-demo.apk:worktrack-demo-older-phones.apk"
  )
fi

for pair in "${NAMES[@]}"; do
  from="${pair%%:*}"
  to="${pair##*:}"
  if [ ! -f "$SRC/$from" ]; then
    echo "  missing $from — did $GRADLE_TASK run?" >&2
    exit 1
  fi
  cp "$SRC/$from" "$DEST/$to"
  echo "  $to  ($(du -h "$DEST/$to" | cut -f1))"
done

if [ "$TARGET" = "demo" ]; then
  echo
  echo "Staged into web/dist-demo — deploy the demo hosting to publish:"
  echo "  npx firebase deploy --only hosting --project worktrack-demo-af --config firebase.demo.json"
  exit 0
fi

# Customers are told to check this before installing, so it has to be generated
# from the files actually being published, not typed by hand.
( cd "$DEST" && shasum -a 256 ./*.apk | sed 's|\./||' > SHA256SUMS.txt )
echo "  SHA256SUMS.txt"

cat > "$DEST/index.html" <<HTML
<!doctype html>
<html lang="fa" dir="rtl">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>دانلود اپلیکیشن ورک‌ترک</title>
<style>
  :root { color-scheme: light dark; }
  body { margin:0; padding:32px 20px; font-family:system-ui,-apple-system,"Segoe UI",sans-serif;
         background:#F9F9F9; color:#0A2735; line-height:1.7; }
  main { max-width:640px; margin:0 auto; }
  h1 { font-size:22px; margin:0 0 4px; }
  .sub { color:#5b6b78; margin:0 0 28px; font-size:14px; }
  a.dl { display:block; padding:14px 16px; margin-bottom:10px; border-radius:12px;
         background:#fff; border:1px solid #e2e6ea; text-decoration:none; color:inherit; }
  a.dl:hover { border-color:#FF6D41; }
  .name { font-weight:600; }
  .note { font-size:13px; color:#5b6b78; }
  .box { background:#fff; border:1px solid #e2e6ea; border-radius:12px; padding:16px; margin-top:24px; font-size:14px; }
  code { direction:ltr; unicode-bidi:embed; font-size:12px; word-break:break-all; }
  @media (prefers-color-scheme: dark) {
    body { background:#0A2735; color:#eef2f5; }
    a.dl, .box { background:#12324a; border-color:#1d4360; }
    .sub, .note { color:#a9bccb; }
  }
</style>
<main>
  <h1>اپلیکیشن ورک‌ترک برای اندروید</h1>
  <p class="sub">نسخهٔ $VERSION — برای اندروید ۸ و بالاتر</p>

  <a class="dl" href="worktrack-$VERSION-arm64.apk">
    <span class="name">گوشی‌های معمول (arm64)</span><br>
    <span class="note">تقریباً همهٔ گوشی‌های چند سال اخیر. این را بگیرید.</span>
  </a>
  <a class="dl" href="worktrack-$VERSION-arm32.apk">
    <span class="name">گوشی‌های قدیمی‌تر (arm32)</span><br>
    <span class="note">اگر نسخهٔ بالا نصب نشد، این را امتحان کنید.</span>
  </a>
  <a class="dl" href="worktrack-$VERSION-universal.apk">
    <span class="name">نسخهٔ همگانی</span><br>
    <span class="note">روی همهٔ گوشی‌ها کار می‌کند اما حجمش بیشتر است.</span>
  </a>

  <div class="box">
    <strong>پیش از نصب، اصالت فایل را بررسی کنید</strong>
    <p style="margin:8px 0 0">فهرست کدهای کنترلی: <a href="SHA256SUMS.txt">SHA256SUMS.txt</a></p>
    <p style="margin:6px 0 0" class="note">
      امضای رسمی ورک‌ترک (SHA-256 گواهی):<br>
      <code>e37a2ec8cdd024198dda6db7e97bb30ce03344a9bfbe47ab7db15280f4a7d983</code>
    </p>
  </div>

  <div class="box">
    <strong>پشتیبانی</strong>
    <p style="margin:8px 0 0">
      لینومیک — کابل، افغانستان<br>
      <a href="tel:+93793817977" dir="ltr">+93 793 817 977</a> ·
      <a href="mailto:contact@linumic.com">contact@linumic.com</a>
    </p>
  </div>
</main>
</html>
HTML
echo "  index.html"

echo
echo "Staged into web/dist/app — deploy hosting to publish:"
echo "  npx firebase deploy --only hosting --project worktrack-prod"
