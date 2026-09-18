# Play store assets

Drag these into Play Console → Grow users → Store presence → Store listings →
Default store listing → Common visual assets. They cannot be uploaded from the
command line: Play builds the file input only when you click, which opens the
macOS file picker.

| File | Slot | Size |
| --- | --- | --- |
| `icon-512.png` | App icon | 512×512 |
| `feature-graphic-1024x500.png` | Feature graphic | 1024×500 |
| `screenshot-0*.png` | Phone screenshots (need ≥2) | 1080×2400 |

**The icon** is rendered from the app's own `ic_launcher_foreground.xml` on the
`#006874` launcher background, so the store and the phone show the same mark
rather than two drawings of it.

**The feature graphic** is plain: brand navy `#004E72`, the same clock, and the
orange `#FF6D41` from the palette. It is honest and correct, not designed. If
the product ever gets a designer, this is the first thing to replace.

**The screenshots** are the real app on a Pixel 8, signed in to the seeded demo
tenant (احمد کریمی at شرکت ساختمانی کابل) — not mockups. Note that
`screenshot-02-checkin.png` shows the geofence refusing a check-in 4,360 m from
the site, in red. That is the product's whole point and worth showing, but if
you would rather the store did not open on a warning, move the emulator inside
the fence and retake it.
