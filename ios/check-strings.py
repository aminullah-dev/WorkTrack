#!/usr/bin/env python3
"""Every L.t("…") in the views must exist in all three dictionaries.

A missing key is not an error at runtime — L.t returns the key itself, so the
screen shows "common_cancel" where a button label should be. That is invisible
to anyone testing in English-only, and invisible in a unit test that never
renders the view. So it is checked here instead.

    python3 ios/check-strings.py
"""
import re, sys, pathlib

root = pathlib.Path(__file__).parent
used = set()
for f in (root / "WorkTrack").rglob("*.swift"):
    used |= set(re.findall(r'L\.t\("([^"]+)"\)', f.read_text()))

loc = (root / "WorkTrack/Core/Localization.swift").read_text()
dicts = {}
for lang in (".dari", ".pashto", ".english"):
    start = loc.index(f"{lang}: [")
    end = loc.index("]", loc.index('"retry"', start))
    dicts[lang] = set(re.findall(r'"([a-z_0-9]+)":', loc[start:end]))

failed = False
for lang, keys in dicts.items():
    missing = sorted(used - keys)
    if missing:
        failed = True
        print(f"{lang}: {len(missing)} key(s) used but not defined: {missing}")

shared = set.intersection(*dicts.values())
for lang, keys in dicts.items():
    only = sorted(keys - shared)
    if only:
        failed = True
        print(f"{lang}: defines keys the other languages do not: {only}")

print(f"{len(used)} keys used across the views" + ("" if failed else " — all present in all three languages"))
sys.exit(1 if failed else 0)
