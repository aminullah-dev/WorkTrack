#!/usr/bin/env python3
"""Renders the iOS app icon from the same mark the Android launcher uses.

The two apps are one product and should be recognisable as such on a desk with
both phones on it, so this reproduces ic_launcher_foreground.xml exactly — the
clock ring and its two hands, in the 108-unit viewport that file is drawn in —
on the same #006874 ground from colors.xml.

A clock, not a tool: the app is about hours and records, and the tab bar and
icon should say office rather than site.

    python3 ios/make-appicon.py
"""
from PIL import Image, ImageDraw
import pathlib

TEAL = (0, 104, 116)          # #006874, ic_launcher_background
UNIT = 108                    # the Android vector's viewport
SIZE = 1024                   # what App Store Connect and iOS want
SS = 4                        # supersample, then downscale for clean edges

canvas = SIZE * SS
scale = canvas / UNIT
image = Image.new("RGB", (canvas, canvas), TEAL)
draw = ImageDraw.Draw(image)

def box(cx, cy, r):
    return [((cx - r) * scale, (cy - r) * scale), ((cx + r) * scale, (cy + r) * scale)]

# Ring: outer circle minus inner, exactly as the even-odd path does.
draw.ellipse(box(54, 54, 24), fill="white")
draw.ellipse(box(54, 54, 18), fill=TEAL)

# Hands: 12-to-centre, and centre-to-4-o'clock.
draw.rectangle([(52 * scale, 42 * scale), (56 * scale, 55 * scale)], fill="white")
draw.polygon(
    [(53 * scale, 53 * scale), (62.5 * scale, 58.5 * scale),
     (60.5 * scale, 61.9 * scale), (51 * scale, 56.4 * scale)],
    fill="white",
)

out = pathlib.Path(__file__).parent / "WorkTrack/Assets.xcassets/AppIcon.appiconset"
out.mkdir(parents=True, exist_ok=True)
image.resize((SIZE, SIZE), Image.LANCZOS).save(out / "icon-1024.png")
print(f"wrote {out/'icon-1024.png'}")
