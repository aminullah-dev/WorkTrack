# WorkTrack for iOS

The employee app. Early — one screen works end to end.

```
cd ios
xcodegen generate          # the .xcodeproj is generated, not committed
pod install                # TensorFlow Lite, for the face model
open WorkTrack.xcworkspace # the WORKSPACE, not the project
```

`brew install cocoapods` if you do not have it — the system Ruby is too old for
the gem.

Or from the command line:

```
xcodebuild -project WorkTrack.xcodeproj -scheme WorkTrack \
  -sdk iphonesimulator -destination 'platform=iOS Simulator,name=iPhone 17 Pro' test
```

(`-workspace WorkTrack.xcworkspace` rather than `-project`, now that there is a
pod.)

## What works

Sign in, and "your work" — today and the next working day, with the project,
the place, who else is on the job, and reporting progress on your own task. It
talks to the live demo backend (`Backend.current` in `Core/Environment.swift`).

## What is deliberate

**No signing.** There is no Apple Developer ID, so this runs in the Simulator
only. That is not a blocker for building it — see `docs/15-ios-app.md` for why
distribution, not the code, is the hard part for this app.

**TensorFlow Lite is the one pod.** Face embedding has to use the SAME model
and the SAME interpreter as Android — `mobilefacenet.tflite` is copied from
`feature/attendance/src/main/assets/`. Vision's own face descriptors, or a
Core ML conversion, would land in a different vector space, and the server
compares against whatever the *enrolling* phone produced. Core TFLite for iOS
is still CocoaPods-first, so that is why a Podfile exists at all.

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

**The cross-platform face test, on real devices.** Everything about the face
pipeline is verified on this side — the preprocessing contract, the crop, the
model loading, determinism — but the one test that actually matters cannot be
run in a Simulator, which has no camera:

> Enrol on an Android phone. Verify the same person on an iPhone. The
> similarity the server reports must be well above the 0.6 threshold — aim for
> 0.8+. Anything near the line means the preprocessing differs somewhere.

Until that has been done with a real face on two real handsets, treat face
check-in on iOS as unverified. It will not error if it is wrong; it will just
stop recognising people.

After that: the check-in camera screen, and regularisation requests.
