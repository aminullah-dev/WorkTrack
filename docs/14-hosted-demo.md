# 14 — The hosted demo

The public "try it" tenant behind the demo page on linumic.com: a manager portal
anyone can sign into, and an Android build they can install.

## Why it is a separate Firebase project

The demo publishes its own password. That password must never exist in a project
that also holds a real company's attendance and pay, so the demo gets its own
Firebase project and its own Firestore. `seed.js` enforces this rather than
trusting anyone to remember it:

- a project id containing `prod`, `production` or `live` is **refused outright**,
  and no flag overrides that;
- any real project additionally requires `--yes-write-real-data`.

Both refusals exit non-zero, so a scripted run stops rather than continuing.

## One-time setup

The project already exists: **`worktrack-demo-af`** (the plain `worktrack-demo`
id was taken by someone else — GCP project ids are globally unique). Its web app
and `web/.env.demo` are set up, and `.firebaserc` has a `demo` alias.

1. **Enable billing.** Cloud Functions cannot deploy on the free plan, so the
   demo project needs a billing account. This is the only step that costs money,
   and at demo volume it is negligible:

   ```
   gcloud billing projects link worktrack-demo-af --billing-account=<account-id>
   ```

2. **Provision Firestore and Auth** in the Firebase console for the project:
   create the Firestore database, and enable the Email/Password sign-in provider.

3. **Build the portal against the demo project.** Move `.env.local` aside first —
   Vite lets it override, which would bake emulator config into the build:

   ```
   mv web/.env.local web/.env.local.off
   npm --prefix web run build -- --mode demo --outDir dist-demo
   mv web/.env.local.off web/.env.local
   ```

4. **Deploy**, using the demo's own config file so the production bundle in
   `web/dist` can never be published to the demo by accident (or the reverse):

   ```
   npx firebase deploy --config firebase.demo.json --project demo
   ```

5. **Seed the tenant:**

   ```
   node backend/functions/seed.js --target worktrack-demo-af --yes-write-real-data
   ```

   This creates the company (شرکت ساختمانی کابل), its branch and geofence, three
   shifts, eight employees across four roles, the last seven days of attendance
   including late arrivals and corrections, leave balances and requests, and a
   finished payroll run with payslips.

6. **Publish the APK** so the demo page's download link resolves. Copy the signed
   release into the demo bundle before deploying:

   ```
   cp app/build/outputs/apk/release/app-arm64-v8a-release.apk web/dist-demo/worktrack.apk
   ```

   Note this is the *production-signed* APK pointing at production. For a demo
   build that talks to the demo backend, rebuild with the endpoint passed in —
   see "The Android build" below.

The demo is then at **https://demo.linumic.com** — a CNAME on the linumic.com
domain pointing at this project's Firebase Hosting site:

```
demo   CNAME   worktrack-demo-af.web.app
```

Firebase issues and renews the certificate itself. The original
`worktrack-demo-af.web.app` address keeps working; both serve the same site, and
nothing redirects between them, so an APK built against either endpoint is fine. No custom domain is
needed; `worktrack.af` does not currently resolve at all.

## Keeping it clean

The demo is shared and anyone can write to it, so it drifts. Re-running the seed
overwrites the seeded documents in place; it does not delete anything a visitor
added. To reset properly, delete the `companies/comp_kabul` document tree and the
demo auth users, then seed again.

A daily reset is worth setting up before the page is linked publicly.

## The Android build

The demo APK is a **release** build pointing at the demo backend, not the debug
build. Debug defaults to the local emulator (see `app/build.gradle.kts`), so
build the demo APK with the endpoint passed in:

```
./gradlew :app:assembleRelease -Pworktrack.apiBaseUrl=https://demo.linumic.com/v1/
```

Release signing is configured: the key is read from `~/.gradle/gradle.properties`
(outside the repo) or `keystore.properties`. With neither present the output is
named `…-release-unsigned.apk`, so an unsigned build cannot be shipped by
mistake.

## Licensing in the demo

The demo tenant's licence should stay generous and unenforced (`enforceDevices:
false`), so visitors installing the app never hit a seat limit. Set it from the
portal under **Devices & licence**, or leave it on the default free licence.
