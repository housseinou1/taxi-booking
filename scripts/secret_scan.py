#!/usr/bin/env python3
"""Local secret scanner (fallback when gitleaks is not installed). Never prints secret values.

Usage:
    python scripts/secret_scan.py --staged          # added lines in the git index (pre-commit)
    python scripts/secret_scan.py --all             # every tracked file
    python scripts/secret_scan.py PATH [PATH ...]   # specific files or directories

Findings are reported as ``path:line rule fp=<6 hex chars of sha256>``; the fingerprint lets you
match a finding against a known leak without showing the value. Exit code 1 when anything is found.

Suppress a reviewed false positive with a trailing ``secret-scan: allow`` comment on the line.
Optional deny-list: put sha256 hex digests of known leaked values, one per line, in the file named
by $SECRET_SCAN_FINGERPRINTS (default .git/secret-fingerprints). Keep that file out of git: hashes
of short passwords can be brute-forced.
"""
from __future__ import annotations

import argparse
import hashlib
import math
import os
import re
import subprocess
import sys

SKIP_DIRS = ("node_modules/", ".worktrees/", "venv/", ".venv/", "__pycache__/", "frontend/build/")
SKIP_EXT = (".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".pdf", ".zip", ".gz", ".apk", ".aab",
            ".jks", ".keystore", ".woff", ".woff2", ".ttf", ".eot", ".mp4", ".mp3", ".sqlite3", ".db", ".map")
MAX_BYTES = 2_000_000

PLACEHOLDER = re.compile(
    r"(?i)^(\$\{?[A-Z_][A-Z0-9_]*\}?|<[^>]*>|\*+|x{3,}|\.{3}|"
    r".*(change[-_ ]?me|replace[-_ ]?me|your[-_ ]|example|placeholder|dummy|redacted|not[-_ ]set|"
    r"test[-_]?only|fake|sample|todo|insecure).*)$"
)

RULES: list[tuple[str, re.Pattern, int]] = [
    # (rule id, regex, capture group holding the secret)
    ("private-key", re.compile(r"-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY(?: BLOCK)?-----"), 0),
    ("aws-access-key-id", re.compile(r"\b((?:AKIA|ASIA)[0-9A-Z]{16})\b"), 1),
    ("stripe-secret-key", re.compile(r"\b((?:sk|rk)_live_[0-9A-Za-z]{16,})\b"), 1),
    ("stripe-test-key", re.compile(r"\b((?:sk|rk)_test_[0-9A-Za-z]{16,})\b"), 1),
    ("google-api-key", re.compile(r"\b(AIza[0-9A-Za-z_\-]{35})\b"), 1),
    ("github-token", re.compile(r"\b((?:ghp|gho|ghu|ghs|ghr)_[0-9A-Za-z]{36}|github_pat_[0-9A-Za-z_]{40,})\b"), 1),
    ("slack-token", re.compile(r"\b(xox[abprs]-[0-9A-Za-z-]{10,})\b"), 1),
    ("url-with-password", re.compile(r"\b[a-z][a-z0-9+.-]{1,20}://[^\s:/@'\"]+:([^\s@/'\"]{4,})@[^\s'\"]+"), 1),
    ("django-secret-key", re.compile(
        r"""(?i)\b(?:DJANGO_)?SECRET_KEY\b["']?\s*[:=]\s*["']?([^\s"',)]{20,})"""), 1),
    # Specific forms first: a value is reported once per line, under the first rule that matches.
    ("password-env-default", re.compile(
        r"""(?i)(?:environ\.get|getenv)\(\s*["'][A-Z0-9_]*(?:PASS|PW|SECRET|TOKEN)[A-Z0-9_]*["']\s*,\s*["']([^"'\n]{6,})["']"""), 1),
    ("shell-password-default", re.compile(
        r"""\$\{[A-Z0-9_]*(?:PASS|PW|SECRET|TOKEN)[A-Z0-9_]*:-([^}\s]{6,})\}"""), 1),
    ("json-password", re.compile(r""""password"\s*:\s*"([^"\\\n$]{6,})\""""), 1),
    ("env-secret-assignment", re.compile(
        r"""(?im)^\s*(?:export\s+)?[A-Z0-9_]*(?:PASSWORD|PASSWD|SECRET|TOKEN|API_KEY|PRIVATE_KEY)[A-Z0-9_]*\s*=\s*["']?([^\s"'#]{6,})"""), 1),
    ("hardcoded-password", re.compile(
        r"""(?i)["']?\b[a-z_]*(?:password|passwd|pwd|_pw)\b["']?\s*(?:=|:|,)\s*[rbu]?(["'])([^"'\n]{6,})\1"""), 2),
]


def fingerprint(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8", "replace")).hexdigest()


def entropy(value: str) -> float:
    if not value:
        return 0.0
    counts = {c: value.count(c) for c in set(value)}
    return -sum(n / len(value) * math.log2(n / len(value)) for n in counts.values())


def is_placeholder(value: str) -> bool:
    v = value.strip()
    if PLACEHOLDER.match(v):
        return True
    # code references, not literals: os.environ[...], settings.X, function calls, f-string fields
    if re.search(r"[(){}\[\]]|^(os\.|settings\.|self\.|env\(|config\()", v):
        return True
    return False


def load_denylist() -> set[str]:
    path = os.environ.get("SECRET_SCAN_FINGERPRINTS", os.path.join(".git", "secret-fingerprints"))
    try:
        with open(path, encoding="utf-8") as fh:
            return {line.strip().lower() for line in fh if re.fullmatch(r"[0-9a-fA-F]{64}", line.strip())}
    except OSError:
        return set()


DENY = load_denylist()
TOKEN = re.compile(r"[^\s\"'`,;(){}\[\]<>=]{6,}")


def scan_line(path: str, lineno: int, line: str, findings: list):
    if "secret-scan: allow" in line:
        return
    seen = set()
    for rule, rx, group in RULES:
        for m in rx.finditer(line):
            value = m.group(group) if group else m.group(0)
            if rule not in ("private-key",) and is_placeholder(value):
                continue
            if rule in ("django-secret-key", "env-secret-assignment") and entropy(value) < 3.0:
                continue
            key = (lineno, fingerprint(value))
            if key in seen:
                continue
            seen.add(key)
            findings.append((path, lineno, rule, fingerprint(value)[:6]))
    if DENY:
        for tok in TOKEN.findall(line):
            for cand in {tok, tok.rstrip(".:!"), tok.rstrip(".:")}:
                fp = fingerprint(cand)
                if fp in DENY and (lineno, fp) not in seen:
                    seen.add((lineno, fp))
                    findings.append((path, lineno, "known-leaked-value", fp[:6]))


def skip(path: str) -> bool:
    p = path.replace("\\", "/")
    return p.endswith(SKIP_EXT) or any(d in p for d in SKIP_DIRS) or p.endswith("secret_scan.py")


def scan_text(path: str, text: str, findings: list):
    for n, line in enumerate(text.splitlines(), 1):
        scan_line(path, n, line, findings)


def git(*args: str) -> str:
    return subprocess.run(["git", *args], capture_output=True, text=True, encoding="utf-8",
                          errors="replace", check=True).stdout


def scan_staged(findings: list):
    """Scan only lines being added in the index, so existing history does not block commits."""
    diff = git("diff", "--cached", "--no-color", "--unified=0", "--diff-filter=ACMR")
    path, lineno = None, 0
    for line in diff.splitlines():
        if line.startswith("+++ "):
            path = line[6:] if line.startswith("+++ b/") else None
        elif line.startswith("@@"):
            m = re.search(r"\+(\d+)", line)
            lineno = int(m.group(1)) if m else 0
        elif path and line.startswith("+") and not skip(path):
            scan_line(path, lineno, line[1:], findings)
            lineno += 1
    # Refuse real env files outright, whatever their content.
    for name in git("diff", "--cached", "--name-only", "--diff-filter=A").splitlines():
        base = os.path.basename(name)
        if re.fullmatch(r"\.env(\..+)?|.+\.env", base) and not base.endswith((".example", ".template")):
            findings.append((name, 0, "env-file-staged", "------"))


def scan_paths(paths: list[str], findings: list):
    for root in paths:
        targets = [root] if os.path.isfile(root) else [
            os.path.join(d, f) for d, _, fs in os.walk(root) for f in fs]
        for p in targets:
            if skip(p):
                continue
            try:
                if os.path.getsize(p) > MAX_BYTES:
                    continue
                with open(p, encoding="utf-8", errors="replace") as fh:
                    scan_text(p, fh.read(), findings)
            except OSError:
                continue


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--staged", action="store_true", help="scan lines added in the git index")
    ap.add_argument("--all", action="store_true", help="scan every tracked file")
    ap.add_argument("--summary", action="store_true", help="print per-rule counts only")
    ap.add_argument("paths", nargs="*")
    args = ap.parse_args(argv)

    findings: list = []
    if args.staged:
        scan_staged(findings)
    elif args.all:
        files = [f for f in git("ls-files").splitlines() if not skip(f)]
        scan_paths(files, findings)
    elif args.paths:
        scan_paths(args.paths, findings)
    else:
        ap.error("give --staged, --all or paths")

    if args.summary:
        by_rule: dict[str, int] = {}
        for _, _, rule, _ in findings:
            by_rule[rule] = by_rule.get(rule, 0) + 1
        for rule, n in sorted(by_rule.items()):
            print(f"{rule:24s} {n}")
    else:
        for path, lineno, rule, fp in findings:
            print(f"{path}:{lineno} {rule} fp={fp}")
    if findings:
        print(f"secret-scan: {len(findings)} potential secret(s) found (values not shown).", file=sys.stderr)
        if args.staged:
            print("Move the value to an environment variable / ignored .env file, or mark a reviewed "
                  "false positive with 'secret-scan: allow'.", file=sys.stderr)
        return 1
    print("secret-scan: no findings.", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
