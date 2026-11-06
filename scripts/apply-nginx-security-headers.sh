#!/usr/bin/env bash
# =============================================================================
#  YALA — Apply nginx security headers  (SAFE, REVERSIBLE)
# =============================================================================
#  Run ON THE SERVER:  bash scripts/apply-nginx-security-headers.sh [--apply]
#
#  Default is a DRY RUN: prints the diff and validates the config, but does
#  NOT touch the live file and does NOT reload nginx. Pass --apply to deploy.
#
#  WHY INLINE INSTEAD OF `include`
#    The container mounts ONLY /opt/yala/nginx/nginx.conf as a single file.
#    An `include /etc/nginx/snippets/...` would not resolve without also
#    widening the mount and recreating the container. Inlining needs no
#    compose change and no container restart — just a graceful reload.
#
#  THE BUG THIS FIXES
#    nginx `add_header` does not merge across levels: a `location` that
#    declares any add_header REPLACES all inherited ones. `location /`
#    serves the SPA via try_files -> internal redirect into
#    `location = /index.html`, which declares `add_header Cache-Control`.
#    Result: every server-level security header is dropped on real page
#    responses. `curl -I https://yalataxi.live` currently shows NONE.
# =============================================================================
set -euo pipefail

CONF="/opt/yala/nginx/nginx.conf"
CONTAINER="yala-nginx-1"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP="/opt/yala/nginx/nginx.conf.bak-${STAMP}"
CAND="/tmp/nginx.conf.candidate.${STAMP}"
APPLY=0
[[ "${1:-}" == "--apply" ]] && APPLY=1

echo "=============================================================="
echo " YALA nginx security headers ($([[ $APPLY == 1 ]] && echo APPLY || echo DRY-RUN))"
echo "=============================================================="

[[ -f "$CONF" ]] || { echo "FATAL: $CONF not found"; exit 1; }

echo
echo "[1/6] backup"
cp -a "$CONF" "$BACKUP"
echo "      -> $BACKUP"
echo "      sha256(before) = $(sha256sum "$CONF" | cut -d' ' -f1)"

echo
echo "[2/6] patching a candidate copy (live file untouched)"
python3 - "$CONF" "$CAND" <<'PY'
import re, sys

src, dst = sys.argv[1], sys.argv[2]
# newline="" on both sides: read and write bytes verbatim so nginx.conf keeps
# its original LF endings regardless of the platform running this script.
conf = open(src, encoding="utf-8", newline="").read()

HEADERS = """\
            # YALA-SECURITY-HEADERS (added by apply-nginx-security-headers.sh)
            add_header X-Frame-Options "DENY" always;
            add_header X-Content-Type-Options "nosniff" always;
            add_header X-XSS-Protection "1; mode=block" always;
            add_header Referrer-Policy "strict-origin-when-cross-origin" always;
            add_header Permissions-Policy "geolocation=(self), camera=(), microphone=(), payment=(self)" always;
            add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
            add_header Cross-Origin-Opener-Policy "same-origin" always;
            add_header Cross-Origin-Resource-Policy "same-origin" always;
"""

# Idempotency guard. NOTE: do NOT test for "add_header X-Frame-Options" —
# the unpatched nginx.conf ALREADY has those at http{} level (lines 21-25);
# the bug is that location blocks wipe them. Use an explicit marker instead.
if "YALA-SECURITY-HEADERS" in conf:
    print("      already patched - refusing to double-apply")
    sys.exit(3)

pat = re.compile(r'(?P<indent>[ \t]*)add_header[ \t]+Cache-Control[^;]*;(?P<nl>\r?\n)')
count = 0

def repl(m):
    global count
    count += 1
    indented = HEADERS.replace("\n            ", "\n" + m.group("indent"))
    return m.group(0) + indented

conf = pat.sub(repl, conf)
print(f"      patched {count} location(s) that declared add_header")

# --- add the CSP at server level for yalataxi.live -------------------------
CSP = (
    "        add_header Content-Security-Policy \""
    "default-src 'self'; "
    "script-src 'self' 'unsafe-inline' https://maps.googleapis.com https://js.stripe.com; "
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
    "font-src 'self' https://fonts.gstatic.com data:; "
    "img-src 'self' data: blob: https:; "
    "connect-src 'self' https://yalataxi.live https://www.yalataxi.live "
    "https://api.yalataxi.live wss://yalataxi.live wss://www.yalataxi.live "
    "wss://api.yalataxi.live https://api.stripe.com https://router.project-osrm.org; "
    "frame-src 'self' https://js.stripe.com https://hooks.stripe.com; "
    "worker-src 'self' blob:; object-src 'none'; base-uri 'self'; "
    "form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests;\n"
    "\" always;\n"
)

idx = conf.find("server_name yalataxi.live")
if idx == -1:
    print("      WARN: yalataxi.live server block not found; CSP not added")
else:
    # 1. REMOVE the existing (incompatible) CSP in this server block.
    #    Browsers INTERSECT multiple CSP headers, so leaving the old one in
    #    place would keep blocking Google Fonts and the www/apex API hosts
    #    even though the new policy allows them.
    before = conf
    conf = re.sub(
        r'[ \t]*add_header[ \t]+Content-Security-Policy[ \t]+"[^"]*"[ \t]*always;[ \t]*\r?\n',
        "",
        conf,
        count=0,
    )
    if conf != before:
        print("      removed the previous incompatible CSP")

    # 2. insert the new CSP right after the server-level HSTS line
    hsts = conf.find("add_header Strict-Transport-Security", conf.find("server_name yalataxi.live"))
    eol = conf.find("\n", hsts) if hsts != -1 else -1
    if eol != -1:
        conf = conf[: eol + 1] + CSP + conf[eol + 1 :]
        print("      CSP added at server level for yalataxi.live")
    else:
        print("      WARN: HSTS anchor not found; CSP not added")

open(dst, "w", encoding="utf-8", newline="").write(conf)
PY

echo
echo "[3/6] diff (live -> candidate)"
diff -u "$CONF" "$CAND" | head -80 || true

echo
echo "[4/6] syntax check inside the real container (no reload)"
docker cp "$CAND" "${CONTAINER}:/tmp/nginx.conf.candidate" >/dev/null
if docker exec "$CONTAINER" nginx -t -c /tmp/nginx.conf.candidate 2>&1 | sed 's/^/      /'; then
  echo "      SYNTAX OK"
else
  echo "      SYNTAX FAILED - aborting, live config untouched"
  exit 1
fi

if [[ $APPLY -ne 1 ]]; then
  echo
  echo "[5/6] DRY-RUN - nothing written, nginx not reloaded."
  echo "      Re-run with --apply to deploy."
  echo "      Candidate left at: $CAND"
  exit 0
fi

echo
echo "[5/6] writing + graceful reload"
install -m 644 "$CAND" "$CONF"
if ! docker exec "$CONTAINER" nginx -t 2>&1 | sed 's/^/      /'; then
  echo "      live config invalid -> ROLLING BACK"
  cp -a "$BACKUP" "$CONF"
  docker exec "$CONTAINER" nginx -s reload || true
  echo "      rolled back to $BACKUP"
  exit 1
fi
docker exec "$CONTAINER" nginx -s reload
sleep 2

echo
echo "[6/6] verify headers on real responses"
ok=1
for u in "https://yalataxi.live/" "https://yalataxi.live/index.html" \
         "https://yalataxi.live/static/js/main.43a7c7db.js" \
         "https://yalataxi.live/rider" "https://yalataxi.live/privacy"; do
  echo "      --- $u"
  hdr="$(curl -sSI "$u")"
  for h in Strict-Transport-Security X-Frame-Options X-Content-Type-Options Content-Security-Policy; do
    if grep -qi "^${h}:" <<<"$hdr"; then echo "          OK    $h"; else echo "          MISS  $h"; ok=0; fi
  done
done

echo
if [[ $ok -eq 1 ]]; then
  echo "SUCCESS - security headers now present on all responses."
  echo "ROLLBACK:  cp -a $BACKUP $CONF && docker exec $CONTAINER nginx -s reload"
else
  echo "WARNING - headers still missing. Rolling back automatically."
  cp -a "$BACKUP" "$CONF"
  docker exec "$CONTAINER" nginx -s reload || true
  echo "rolled back to $BACKUP"
  exit 1
fi


