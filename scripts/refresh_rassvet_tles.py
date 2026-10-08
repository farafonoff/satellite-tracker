#!/usr/bin/env python3
"""Refresh RASSVET TLEs from N2YO API using .env key and id list."""
import os, sys, urllib.request, json, time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from pathlib import Path

ENV_FILE = Path(".env")
IDS_FILE = Path("data/rassvet_ids.txt")
OUT_FILE = Path("data/tles/rassvet.txt")

# Load key
key = None
if ENV_FILE.exists():
    for line in ENV_FILE.read_text().splitlines():
        if line.startswith("N2YO_API_KEY="):
            key = line.split("=", 1)[1].strip()
if not key:
    print("Missing N2YO_API_KEY in .env")
    sys.exit(1)

if not IDS_FILE.exists():
    print(f"Missing id list: {IDS_FILE}")
    sys.exit(1)

results = []
with IDS_FILE.open() as f:
    for line in f:
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        parts = line.split(None, 1)
        norad_str = parts[0]
        name = parts[1] if len(parts) > 1 else f"NORAD-{norad_str}"
        url = f"https://api.n2yo.com/rest/v1/satellite/tle/{norad_str}&apiKey={key}"
        try:
            with urllib.request.urlopen(url, timeout=15) as resp:
                data = json.load(resp)
            tle = data.get("tle")
            if tle:
                lines = tle.replace("\r\n", "\n").split("\n")
                if len(lines) >= 2 and lines[0].startswith("1 ") and lines[1].startswith("2 "):
                    results.append((name, lines[0], lines[1]))
                    print(f"OK {norad_str} {name}")
                else:
                    print(f"BAD FORMAT {norad_str} {name}")
            else:
                print(f"NO TLE {norad_str} {name} (decayed/removed?)")
        except Exception as e:
            print(f"ERROR {norad_str} {name}: {e}")
        time.sleep(0.15)

OUT_FILE.write_text("@ GROUP=Rassvet\n" + "".join(f"{n}\n{l1}\n{l2}\n" for n, l1, l2 in results))
print(f"\nWrote {len(results)} entries to {OUT_FILE}")
