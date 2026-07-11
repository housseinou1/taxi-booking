#!/usr/bin/env python3
"""Scan keystores and AABs for SHA-1 fingerprints."""
import re
import subprocess
from pathlib import Path

PLAY = "92:87:04:8F:E0:B4:24:B9:62:F5:EC:56:7D:B9:6B:AE:23:A0:D6:3B"
WRONG = "18:AB:BF:3F:AD:8B:95:83:4A:84:96:4D:2D:F3:1D:D7:31:4A:94:1E"
KEYTOOL = r"C:\Program Files\Android\Android Studio\jbr\bin\keytool.exe"
ROOT = Path(r"c:\Users\Housseinou\Projects\Django\taxi-booking")


def sha1_jar(path: Path) -> str | None:
    out = subprocess.run(
        [KEYTOOL, "-printcert", "-jarfile", str(path)],
        capture_output=True,
        text=True,
    )
    m = re.search(r"SHA1:\s*([0-9A-F:]+)", out.stdout + out.stderr, re.I)
    return m.group(1).upper() if m else None


print("Google Play expected:", PLAY)
print("Rejected AAB had:   ", WRONG)
print()
print("=== Driver AABs ===")
for aab in sorted((ROOT / "release" / "android").glob("yala-driver*.aab")):
    s = sha1_jar(aab)
    tag = "MATCH" if s == PLAY else ("WRONG" if s == WRONG else "other")
    print(f"{aab.name}: {s} [{tag}]")
