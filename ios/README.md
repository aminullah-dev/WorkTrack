# WorkTrack for iOS

The employee app. Early — one screen works end to end.

```
cd ios
xcodegen generate          # the .xcodeproj is generated, not committed
open WorkTrack.xcodeproj
```

Or from the command line:

```
xcodebuild -project WorkTrack.xcodeproj -scheme WorkTrack \
  -sdk iphonesimulator -destination 'platform=iOS Simulator,name=iPhone 17 Pro' test
```

## What works

Sign in, and "your work" — today and the next working day, with the project,
the place, who else is on the job, and reporting progress on your own task. It
talks to the live demo backend (`Backend.current` in `Core/Environment.swift`).

## What is deliberate

**No signing.** There is no Apple Developer ID, so this runs in the Simulator
only. That is not a blocker for building it — see `docs/15-ios-app.md` for why
distribution, not the code, is the hard part for this app.

**No Firebase SDK.** Sign-in and token refresh are two POSTs
(`Auth/FirebaseAuthREST.swift`), so the project stays buildable from a
checked-in spec with no package resolution. The SDK arrives if push
notifications or Firestore do.

**No `X-Device-Id`.** The licence counts phones running the *Android* app. The
server treats a missing header as "not a licensed device", so sending an
invented id here would quietly eat a customer's seats.

**Foundation's Persian calendar**, not a port of the Kotlin one — checked
against `web/src/shamsi/solarHijri.ts` across Nowruz and a leap day before it
was relied on. Only the month names are ours: Afghanistan says حمل where Iran
says فروردین, and a test holds that line.

## Next

Attendance (GPS punch), then offline, then face — in that order, and face last
because it has to reproduce the Android embedding pipeline exactly or people
who enrolled on Android stop being recognised. `docs/15-ios-app.md` has the
numbers.
