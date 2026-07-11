#!/usr/bin/env python3
"""List SHA fingerprints for local Android keystores (no passwords printed)."""
from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

TARGET_SHA1 = "92:B7:04:8F:ED:04:24:89:52:F5:EC:56:7D:89:6B:AE:23:AC:C6:38"
ROOT = Path(__file__).resolve().parents[1]
KEYTOOL = Path(r"C:\Program Files\Android\Android Studio\jbr\bin\keytool.exe")

def load_env_file(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not path.exists():
        return values
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip()
    return values


def build_known_pairs() -> dict[Path, tuple[str, str]]:
    known: dict[Path, tuple[str, str]] = {}
    creds = load_env_file(ROOT / "signing" / "credentials.env")
    driver_props = load_env_file(ROOT / "driver-app" / "android" / "driver-signing.properties")

    def add(path_value: str | None, alias: str | None, password: str | None) -> None:
        if not path_value or not alias or not password:
            return
        known[Path(path_value)] = (alias, password)

    add(
        driver_props.get("YALA_ANDROID_KEYSTORE") or str(ROOT / "yala-release.keystore"),
        driver_props.get("YALA_ANDROID_KEY_ALIAS") or creds.get("YALA_DRIVER_KEY_ALIAS"),
        driver_props.get("YALA_ANDROID_STORE_PASSWORD") or creds.get("YALA_DRIVER_STORE_PASSWORD"),
    )
    add(creds.get("YALA_RIDER_KEYSTORE"), creds.get("YALA_RIDER_KEY_ALIAS"), creds.get("YALA_RIDER_STORE_PASSWORD"))
    add(creds.get("YALA_DRIVER_KEYSTORE"), creds.get("YALA_DRIVER_KEY_ALIAS"), creds.get("YALA_DRIVER_STORE_PASSWORD"))
    add(creds.get("YALA_DELIVERY_KEYSTORE"), creds.get("YALA_DELIVERY_KEY_ALIAS"), creds.get("YALA_DELIVERY_STORE_PASSWORD"))

    # Legacy local keystores documented in git history.
    known[Path.home() / "yala-driver.jks"] = ("yala-driver", "YalaDriver2026!")
    known[Path.home() / "yala-rider.jks"] = ("yala-rider", "YalaRider2026!")
    return known


def find_keystores() -> list[Path]:
    patterns = ("*.jks", "*.keystore")
    paths: set[Path] = set()
    for pattern in patterns:
        paths.update(ROOT.glob(pattern))
        paths.update((ROOT / "signing").glob(pattern))
        paths.update((ROOT / "signing" / "recovered").glob(pattern))
    paths.update(Path.home().glob("yala*.jks"))
    return sorted(p for p in paths if p.is_file())


def parse_fingerprints(output: str) -> tuple[str, str, str]:
    owner = ""
    sha1 = ""
    sha256 = ""
    owner_match = re.search(r"Owner:\s*(.+)", output)
    if owner_match:
        owner = owner_match.group(1).strip()
    sha1_match = re.search(r"SHA1:\s*(.+)", output)
    if sha1_match:
        sha1 = sha1_match.group(1).strip()
    sha256_match = re.search(r"SHA256:\s*(.+)", output)
    if sha256_match:
        sha256 = sha256_match.group(1).strip()
    return owner, sha1, sha256


def inspect_keystore(path: Path, known_pairs: dict[Path, tuple[str, str]]) -> list[dict]:
    rows: list[dict] = []
    known = known_pairs.get(path)
    if known:
        alias, password = known
        proc = subprocess.run(
            [str(KEYTOOL), "-list", "-v", "-keystore", str(path), "-storepass", password, "-alias", alias],
            capture_output=True,
            text=True,
            timeout=15,
        )
        if proc.returncode == 0:
            owner, sha1, sha256 = parse_fingerprints(proc.stdout)
            rows.append(
                {
                    "path": str(path),
                    "alias": alias,
                    "sha1": sha1,
                    "sha256": sha256,
                    "match": sha1 == TARGET_SHA1,
                    "status": "unlocked",
                    "owner": owner,
                }
            )
            return rows
    rows.append(
        {
            "path": str(path),
            "alias": "(locked)",
            "sha1": "",
            "sha256": "",
            "match": False,
            "status": "locked",
            "owner": "",
        }
    )
    return rows


def main() -> int:
    if not KEYTOOL.exists():
        print(f"keytool not found: {KEYTOOL}", file=sys.stderr)
        return 1

    all_rows: list[dict] = []
    known_pairs = build_known_pairs()
    for ks in find_keystores():
        all_rows.extend(inspect_keystore(ks, known_pairs))

    print(f"TARGET_SHA1={TARGET_SHA1}\n")
    for row in all_rows:
        print(f"PATH={row['path']}")
        print(f"ALIAS={row['alias']}")
        print(f"STATUS={row['status']}")
        if row["owner"]:
            print(f"OWNER={row['owner']}")
        print(f"SHA1={row['sha1'] or 'n/a'}")
        print(f"SHA256={row['sha256'] or 'n/a'}")
        print(f"MATCH={row['match']}")
        print("---")

    matches = [r for r in all_rows if r["match"]]
    if matches:
        print("MATCHING_KEYSTORES=" + str(len(matches)))
        return 0
    print("MATCHING_KEYSTORES=0")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
