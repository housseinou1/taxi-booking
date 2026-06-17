# Design Document: Launch Blockers Fix

## Overview

This design addresses 10 critical launch-blocking issues for the Yala taxi-booking platform. The fixes span across infrastructure (Nginx, Docker, cron), Django application code (middleware, views, settings), Android build configuration, and operational tooling (backups, health checks). The implementation follows a layered approach: infrastructure concerns are handled via configuration files, application logic via new Django modules, and security via secret rotation and gitignore hygiene.

## Architecture

### High-Level Component Interaction

```
┌─────────────────────────────────────────────────────────────────────┐
│  Mobile Apps (rider-app / driver-app)                               │
│  - Capacitor 6 + Gradle signing via gradle.properties               │
└───────────┬─────────────────────────────────┬───────────────────────┘
            │ HTTPS (443)                     │ WSS (443 → /ws/)
            ▼                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Nginx (API_Gateway)                                                │
│  - TLS termination (Let's Encrypt certs)                            │
│  - 80→443 redirect, security headers                                │
│  - Proxy to Daphne upstream                                         │
└───────────┬─────────────────────────────────┬───────────────────────┘
            │ HTTP :8000                      │ WS :8000
            ▼                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Daphne ASGI (App_Server)                                           │
│  ┌──────────────┐  ┌────────────────────┐  ┌────────────────────┐  │
│  │ Health App   │  │ JWTAuthMiddleware  │  │ DRF (IsAuth default)│  │
│  │ /api/health/ │  │ (WebSocket only)   │  │ + AllowAny public  │  │
│  └──────────────┘  └────────────────────┘  └────────────────────┘  │
│  ┌──────────────┐  ┌────────────────────┐                          │
│  │ Twilio SMS   │  │ Startup checks     │                          │
│  │ Provider     │  │ (DB + Redis)       │                          │
│  └──────────────┘  └────────────────────┘                          │
└───────────┬──────────────────┬──────────────────────────────────────┘
            │                  │
            ▼                  ▼
┌──────────────────┐  ┌──────────────────┐
│  PostgreSQL 15   │  │  Redis 7         │
└──────────────────┘  └──────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│  Backup Agent (cron on host)                                        │
│  - pg_dump → gzip → s3cmd upload → verify → prune old              │
│  - Alert on failure (webhook/email)                                 │
└──────────────────────────────────────────┬──────────────────────────┘
                                           ▼
                              ┌──────────────────────┐
                              │ DigitalOcean Spaces   │
                              └──────────────────────┘
```

## Components and Interfaces

### Component 1: Production API Stability (Req 1)

**Approach:** Add a startup health check script that runs before Daphne starts, verifying DB and Redis connectivity. Modify docker-compose command to run migrations → startup check → Daphne sequentially.

**Files Modified:**
- `backend/taxi/startup_check.py` (new) — Python script that attempts DB and Redis connections, exits non-zero on failure
- `docker-compose.yml` — Update django service command to include startup check

**Startup Check Script:**

```python
# backend/taxi/startup_check.py
import os
import sys
import time
import logging
from datetime import datetime

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("startup_check")

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "taxi.settings")

import django
django.setup()

from django.db import connections
from django.core.cache import cache


def check_database():
    try:
        conn = connections["default"]
        conn.ensure_connection()
        logger.info("Database connection OK")
        return True
    except Exception as e:
        logger.error("Database connection FAILED at %s: %s", datetime.utcnow().isoformat(), e)
        return False


def check_cache():
    try:
        cache.set("_startup_check", "ok", timeout=5)
        val = cache.get("_startup_check")
        if val == "ok":
            logger.info("Cache connection OK")
            return True
        raise RuntimeError("Cache set/get returned unexpected value")
    except Exception as e:
        logger.error("Cache connection FAILED at %s: %s", datetime.utcnow().isoformat(), e)
        return False


if __name__ == "__main__":
    if not check_database():
        sys.exit(1)
    if not check_cache():
        sys.exit(2)
    logger.info("All startup checks passed")
```

**Docker Compose Command Update:**

```yaml
command: >
  sh -c "python manage.py migrate &&
         python manage.py collectstatic --noinput &&
         python startup_check.py &&
         daphne -b 0.0.0.0 -p 8000 taxi.asgi:application"
```

---

### Component 2: Secret Rotation and Repository Hygiene (Req 2)

**Approach:** 
1. Add `.env.production` to `.gitignore` (both root and backend-level)
2. Remove the file from git tracking with `git rm --cached`
3. Use `git filter-repo` to purge history (documented as a manual step)
4. Update `.env.production.template` with placeholder instructions and yalataxi.live domain references
5. All secrets read from environment variables (already the pattern in settings.py)

**Files Modified:**
- `backend/taxi/.gitignore` — Add `.env.production` entry
- `.gitignore` — Already has `.env.production` (confirmed)
- `backend/taxi/.env.production.template` — Update with yalataxi.live domain and rotation instructions

**Template Update:**

```dotenv
# ── Django ─────────────────────────────────────────────────────────────────────
DJANGO_SECRET_KEY=<GENERATE: python -c "import secrets; print(secrets.token_urlsafe(50))">
DJANGO_DEBUG=False
DJANGO_ALLOWED_HOSTS=yalataxi.live,www.yalataxi.live,api.yalataxi.live

# ── Database ──────────────────────────────────────────────────────────────────
DATABASE_URL=postgres://yala_user:<GENERATE: openssl rand -base64 32>@postgres:5432/yala_db
DATABASE_SSL_REQUIRE=False

# ── Stripe ────────────────────────────────────────────────────────────────────
STRIPE_SECRET_KEY=<ROTATE: Generate new key from Stripe Dashboard>
STRIPE_PUBLIC_KEY=<ROTATE: Generate new key from Stripe Dashboard>
```

---

### Component 3: WebSocket Authentication Security (Req 3)

**Approach:** Replace Django Channels' `AuthMiddlewareStack` (session-based) with a custom JWT authentication middleware. The middleware extracts the token from the `?token=` query parameter, validates it using `rest_framework_simplejwt`, and either attaches the user to scope or closes with appropriate error codes.

**Files Created/Modified:**
- `backend/taxi/taxi/middleware.py` (new) — JWT WebSocket middleware
- `backend/taxi/taxi/asgi.py` — Replace `AuthMiddlewareStack` with `JWTAuthMiddleware`
- `backend/taxi/taxi/rides/consumers.py` — Add ride ownership check on `join_ride`

**JWT WebSocket Middleware:**

```python
# backend/taxi/taxi/middleware.py
import logging
from urllib.parse import parse_qs

from channels.db import database_sync_to_async
from channels.middleware import BaseMiddleware
from django.contrib.auth import get_user_model
from django.contrib.auth.models import AnonymousUser
from rest_framework_simplejwt.tokens import AccessToken
from rest_framework_simplejwt.exceptions import TokenError

logger = logging.getLogger(__name__)
User = get_user_model()

# WebSocket close codes
WS_CLOSE_NO_TOKEN = 4001
WS_CLOSE_INVALID_TOKEN = 4003
WS_CLOSE_FORBIDDEN = 4403


class JWTAuthMiddleware(BaseMiddleware):
    """Authenticate WebSocket connections via JWT token in query string."""

    async def __call__(self, scope, receive, send):
        query_string = scope.get("query_string", b"").decode("utf-8")
        params = parse_qs(query_string)
        token_list = params.get("token", [])

        if not token_list:
            await send({"type": "websocket.close", "code": WS_CLOSE_NO_TOKEN})
            return

        token_str = token_list[0]

        try:
            access_token = AccessToken(token_str)
            user_id = access_token["user_id"]
            scope["user"] = await self._get_user(user_id)
        except (TokenError, KeyError, User.DoesNotExist):
            await send({"type": "websocket.close", "code": WS_CLOSE_INVALID_TOKEN})
            return

        return await super().__call__(scope, receive, send)

    @database_sync_to_async
    def _get_user(self, user_id):
        return User.objects.get(id=user_id)
```

**Ride Ownership Check (in consumer's `_handle_join_ride`):**

```python
async def _handle_join_ride(self, data):
    ride_id = data.get("ride_id")
    if not ride_id:
        await self.send(text_data=json.dumps({"error": "join_ride requires 'ride_id'"}))
        return

    if not self.user or not self.user.is_authenticated:
        await self.close(code=4001)
        return

    # Verify the user is rider or assigned driver
    is_authorized = await self._check_ride_authorization(ride_id, self.user.id)
    if not is_authorized:
        await self.close(code=4403)
        return

    ride_group = f"ride_{ride_id}"
    await self.channel_layer.group_add(ride_group, self.channel_name)
    self.ride_groups.add(ride_group)
    await self.send(text_data=json.dumps({"type": "joined_ride", "ride_id": ride_id}))

@database_sync_to_async
def _check_ride_authorization(self, ride_id, user_id):
    from taxi.rides.models import Ride
    return Ride.objects.filter(
        id=ride_id
    ).filter(
        Q(rider_id=user_id) | Q(driver__user_id=user_id)
    ).exists()
```

**ASGI Update:**

```python
# backend/taxi/taxi/asgi.py
from taxi.middleware import JWTAuthMiddleware

application = ProtocolTypeRouter({
    "http": django_asgi_app,
    "websocket": JWTAuthMiddleware(
        URLRouter(websocket_urlpatterns)
    ),
})
```

---

### Component 4: Domain Canonicalization (Req 4)

**Approach:** Update `.env.production` and `.env.production.template` to replace all `yala.mr` references with `yalataxi.live`. Settings.py already reads these from environment variables, so no code changes are needed — only environment file updates.

**Changes in `.env.production.template`:**
- `DJANGO_ALLOWED_HOSTS=yalataxi.live,www.yalataxi.live,api.yalataxi.live`
- `CORS_ALLOWED_ORIGINS=https://yalataxi.live,https://www.yalataxi.live`
- `CSRF_TRUSTED_ORIGINS=https://yalataxi.live,https://www.yalataxi.live,https://api.yalataxi.live`
- `FRONTEND_URL=https://yalataxi.live`
- `DEFAULT_FROM_EMAIL=Yala <noreply@yalataxi.live>`
- `PUSH_CLAIMS_EMAIL=mailto:admin@yalataxi.live`

**Defaults in settings.py to update:**
- `DEFAULT_FROM_EMAIL` default: change `yala.mr` → `yalataxi.live`
- `PUSH_CLAIMS_EMAIL` default: change `yala.mr` → `yalataxi.live`

---

### Component 5: Nginx HTTPS Configuration (Req 5)

**Approach:** Rewrite `nginx/nginx.conf` with a proper TLS configuration using Let's Encrypt certificates obtained via Certbot. Add security headers, HTTP→HTTPS redirect, and WebSocket proxy with TLS.

**Files Modified:**
- `nginx/nginx.conf` — Full rewrite with dual server blocks (80 redirect + 443 TLS)
- `docker-compose.yml` — Already mounts certbot volumes (confirmed)

**Nginx Configuration:**

```nginx
events {
    worker_connections 1024;
}

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    access_log /var/log/nginx/access.log;
    error_log /var/log/nginx/error.log;

    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml;
    gzip_min_length 256;

    upstream django {
        server django:8000;
    }

    # HTTP → HTTPS redirect
    server {
        listen 80;
        server_name yalataxi.live www.yalataxi.live api.yalataxi.live;

        # Allow ACME challenges for cert renewal
        location /.well-known/acme-challenge/ {
            root /var/www/certbot;
        }

        location / {
            return 301 https://$host$request_uri;
        }
    }

    # HTTPS server
    server {
        listen 443 ssl;
        server_name yalataxi.live www.yalataxi.live api.yalataxi.live;

        ssl_certificate /etc/letsencrypt/live/yalataxi.live/fullchain.pem;
        ssl_certificate_key /etc/letsencrypt/live/yalataxi.live/privkey.pem;
        ssl_protocols TLSv1.2 TLSv1.3;
        ssl_ciphers HIGH:!aNULL:!MD5;

        # Security headers
        add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
        add_header X-Content-Type-Options "nosniff" always;
        add_header X-Frame-Options "DENY" always;
        add_header Referrer-Policy "strict-origin-when-cross-origin" always;

        location /api/ {
            proxy_pass http://django;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto https;
            proxy_read_timeout 30s;
        }

        location /ws/ {
            proxy_pass http://django;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto https;
            proxy_read_timeout 86400;
        }

        location /static/ {
            alias /usr/share/nginx/static/;
            expires 30d;
        }

        location /media/ {
            alias /usr/share/nginx/media/;
            expires 7d;
        }

        location / {
            root /usr/share/nginx/html;
            try_files $uri $uri/ /index.html;
        }
    }
}
```

**Certbot Renewal (cron or Docker service):**
A cron job or certbot container handles renewal:
```bash
0 3 * * * certbot renew --quiet --deploy-hook "docker exec yala-nginx nginx -s reload"
```

---

### Component 6: Automated Database Backups (Req 6)

**Approach:** Create a shell script `scripts/backup_db.sh` that performs dump → compress → upload → verify → prune. Schedule via cron on the DigitalOcean droplet.

**Files Created:**
- `scripts/backup_db.sh` (new) — The backup script
- `scripts/backup_cron` (new) — Cron entry file

**Backup Script:**

```bash
#!/usr/bin/env bash
set -euo pipefail

# Configuration (sourced from environment or defaults)
DB_NAME="${POSTGRES_DB:-yala_db}"
DB_USER="${POSTGRES_USER:-yala_user}"
DB_HOST="${POSTGRES_HOST:-localhost}"
DB_PORT="${POSTGRES_PORT:-5432}"
BUCKET="${BACKUP_BUCKET:-yala-backups}"
ENDPOINT="${SPACES_ENDPOINT:-nyc3.digitaloceanspaces.com}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-7}"
ALERT_WEBHOOK="${BACKUP_ALERT_WEBHOOK:-}"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
FILENAME="yala_db_${TIMESTAMP}.sql.gz"
TMPFILE="/tmp/${FILENAME}"

alert_failure() {
    local msg="$1"
    echo "BACKUP FAILED: ${msg}" >&2
    if [ -n "${ALERT_WEBHOOK}" ]; then
        curl -sf -X POST "${ALERT_WEBHOOK}" \
            -H "Content-Type: application/json" \
            -d "{\"text\": \"🚨 Backup failed: ${msg}\"}" || true
    fi
    exit 1
}

# Step 1: Dump
echo "Starting backup of ${DB_NAME}..."
docker exec yala-postgres pg_dump -U "${DB_USER}" "${DB_NAME}" | gzip > "${TMPFILE}" \
    || alert_failure "pg_dump failed"

# Step 2: Upload
s3cmd put "${TMPFILE}" "s3://${BUCKET}/${FILENAME}" \
    --host="${ENDPOINT}" --host-bucket="%(bucket)s.${ENDPOINT}" \
    || alert_failure "Upload to Spaces failed"

# Step 3: Verify
s3cmd info "s3://${BUCKET}/${FILENAME}" \
    --host="${ENDPOINT}" --host-bucket="%(bucket)s.${ENDPOINT}" > /dev/null \
    || alert_failure "Upload verification failed"

# Step 4: Cleanup local
rm -f "${TMPFILE}"

# Step 5: Prune old backups (keep last RETENTION_DAYS)
CUTOFF_DATE=$(date -d "-${RETENTION_DAYS} days" +%Y%m%d)
s3cmd ls "s3://${BUCKET}/yala_db_" \
    --host="${ENDPOINT}" --host-bucket="%(bucket)s.${ENDPOINT}" \
    | awk '{print $4}' \
    | while read -r obj; do
        obj_date=$(echo "${obj}" | grep -oP '\d{8}(?=-)')
        if [ "${obj_date}" \< "${CUTOFF_DATE}" ]; then
            s3cmd del "${obj}" --host="${ENDPOINT}" --host-bucket="%(bucket)s.${ENDPOINT}"
        fi
    done

echo "Backup completed: ${FILENAME}"
```

**Cron Entry:**
```
0 2 * * * /opt/yala/scripts/backup_db.sh >> /var/log/yala-backup.log 2>&1
```

---

### Component 7: Health Check Endpoints (Req 7)

**Approach:** Create a new `health` Django app with two views: `/api/health/live/` (liveness) and `/api/health/ready/` (readiness). Both are unauthenticated (explicit `AllowAny`). The readiness probe checks DB and Redis connectivity.

**Files Created:**
- `backend/taxi/health/__init__.py` (new)
- `backend/taxi/health/views.py` (new)
- `backend/taxi/health/urls.py` (new)

**Health Views:**

```python
# backend/taxi/health/views.py
from django.db import connections
from django.core.cache import cache
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework import status


@api_view(["GET"])
@permission_classes([AllowAny])
def liveness(request):
    """Liveness probe — returns 200 if the process is running."""
    return Response({"status": "ok"})


@api_view(["GET"])
@permission_classes([AllowAny])
def readiness(request):
    """Readiness probe — returns 200 only if DB and Cache are reachable."""
    errors = {}

    # Check database
    try:
        conn = connections["default"]
        conn.ensure_connection()
    except Exception as e:
        errors["database"] = str(e)

    # Check cache (Redis)
    try:
        cache.set("_health_check", "1", timeout=5)
        if cache.get("_health_check") != "1":
            raise RuntimeError("Cache get returned unexpected value")
    except Exception as e:
        errors["cache"] = str(e)

    if errors:
        return Response(
            {"status": "unavailable", "errors": errors},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )

    return Response({"status": "ok"})
```

```python
# backend/taxi/health/urls.py
from django.urls import path
from . import views

urlpatterns = [
    path("live/", views.liveness, name="health-live"),
    path("ready/", views.readiness, name="health-ready"),
]
```

**Registration in `taxi/urls.py`:**
```python
path("api/health/", include("health.urls")),
```

---

### Component 8: Twilio SMS Provider Configuration (Req 8)

**Approach:** Extend the existing `send_sms` function in `authapp/phone_views.py` with a `twilio` provider branch that uses the `twilio` Python package. Add environment variables for Twilio credentials.

**Files Modified:**
- `backend/taxi/authapp/phone_views.py` — Add twilio provider branch
- `backend/taxi/taxi/settings.py` — Add Twilio settings
- `backend/taxi/requirements.txt` — Add `twilio` package

**Settings additions:**

```python
# ── Twilio ────────────────────────────────────────────────────────────────────
TWILIO_ACCOUNT_SID = os.getenv("TWILIO_ACCOUNT_SID", "")
TWILIO_AUTH_TOKEN = os.getenv("TWILIO_AUTH_TOKEN", "")
TWILIO_FROM_NUMBER = os.getenv("TWILIO_FROM_NUMBER", "")
```

**Updated send_sms function:**

```python
def send_sms(phone_number, message):
    provider = settings.YALA_SMS_PROVIDER

    if provider == "console":
        logger.warning("Yala SMS to %s: %s", phone_number, message)
        return

    if provider == "twilio":
        _send_twilio_sms(phone_number, message)
        return

    if provider == "http" and settings.YALA_SMS_API_URL and settings.YALA_SMS_API_KEY:
        # ... existing http provider code ...
        return

    raise RuntimeError("SMS provider is not configured.")


def _send_twilio_sms(phone_number, message):
    from twilio.rest import Client
    from twilio.base.exceptions import TwilioRestException

    try:
        client = Client(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)
        client.messages.create(
            body=message,
            from_=settings.TWILIO_FROM_NUMBER,
            to=phone_number,
        )
    except TwilioRestException as e:
        logger.error(
            "Twilio SMS failed: code=%s message=%s to=%s",
            e.code, e.msg, phone_number,
        )
        raise RuntimeError("SMS delivery failed.") from None
    except Exception as e:
        logger.error("Twilio SMS unexpected error: %s to=%s", e, phone_number)
        raise RuntimeError("SMS delivery failed.") from None
```

---

### Component 9: Secure Android Keystore Passwords (Req 9)

**Approach:** Replace hardcoded passwords in both `build.gradle` files with references to `gradle.properties` (or environment variables as fallback). Add `gradle.properties` to `.gitignore` in both app directories. Add validation that fails the build if properties are missing.

**Files Modified:**
- `rider-app/android/app/build.gradle` — Reference properties
- `driver-app/android/app/build.gradle` — Reference properties
- `rider-app/android/.gitignore` (new or append) — Add `gradle.properties`
- `driver-app/android/.gitignore` (new or append) — Add `gradle.properties`
- `rider-app/android/gradle.properties` (new, gitignored) — Actual passwords
- `driver-app/android/gradle.properties` (new, gitignored) — Actual passwords

**Updated signing config (both apps):**

```groovy
signingConfigs {
    release {
        def keystorePropsFile = rootProject.file("gradle.properties")
        if (keystorePropsFile.exists()) {
            def keystoreProps = new Properties()
            keystoreProps.load(new FileInputStream(keystorePropsFile))
            storeFile file(keystoreProps['YALA_KEYSTORE_PATH'] ?: '')
            storePassword keystoreProps['YALA_KEYSTORE_PASSWORD'] ?: ''
            keyAlias keystoreProps['YALA_KEY_ALIAS'] ?: ''
            keyPassword keystoreProps['YALA_KEY_PASSWORD'] ?: ''
        } else {
            // Fallback to environment variables
            storeFile file(System.getenv('YALA_KEYSTORE_PATH') ?: '')
            storePassword System.getenv('YALA_KEYSTORE_PASSWORD') ?: ''
            keyAlias System.getenv('YALA_KEY_ALIAS') ?: ''
            keyPassword System.getenv('YALA_KEY_PASSWORD') ?: ''
        }
    }
}

// Fail the build with descriptive error if signing is misconfigured
android.applicationVariants.all { variant ->
    if (variant.buildType.name == "release") {
        variant.assemble.doFirst {
            def sc = variant.signingConfig
            if (!sc || !sc.storeFile || !sc.storeFile.exists()) {
                throw new GradleException(
                    "Release signing not configured. Create gradle.properties with " +
                    "YALA_KEYSTORE_PATH, YALA_KEYSTORE_PASSWORD, YALA_KEY_ALIAS, YALA_KEY_PASSWORD"
                )
            }
        }
    }
}
```

---

### Component 10: REST Framework Default Permission (Req 10)

**Approach:** Change `DEFAULT_PERMISSION_CLASSES` from `AllowAny` to `IsAuthenticated` in settings. Add explicit `@permission_classes([AllowAny])` to public endpoints that must remain accessible without authentication.

**Files Modified:**
- `backend/taxi/taxi/settings.py` — Change default permission
- `backend/taxi/authapp/phone_views.py` — Already has `@permission_classes`
- `backend/taxi/authapp/api/views.py` (or similar auth views) — Add explicit `AllowAny`
- `backend/taxi/health/views.py` — Already uses `AllowAny`

**Settings Change:**

```python
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": (
        "rest_framework.permissions.IsAuthenticated",
    ),
    # ... rest unchanged
}
```

**Public endpoints requiring explicit AllowAny:**
- `/api/auth/login/` — Token obtain
- `/api/auth/register/` — User registration
- `/api/auth/token/refresh/` — Token refresh
- `/api/auth/token/verify/` — Token verification
- `/api/health/live/` — Liveness probe
- `/api/health/ready/` — Readiness probe
- `/api/schema/` — OpenAPI schema (drf-spectacular)

---

## Data Models

No new database models are introduced. The existing `Ride` model (with `rider` and `driver` foreign keys) is used for WebSocket authorization checks. The `PhoneVerificationCode` model continues to be used for OTP flows.

## Error Handling

| Component | Error Condition | Behavior |
|-----------|----------------|----------|
| Startup Check | DB unreachable | Log error with timestamp, exit code 1 |
| Startup Check | Redis unreachable | Log error with timestamp, exit code 2 |
| WebSocket Auth | Missing token | Close with code 4001 |
| WebSocket Auth | Invalid/expired token | Close with code 4003 |
| WebSocket Auth | Unauthorized ride access | Close with code 4403 |
| Health Readiness | DB down | HTTP 503 + JSON `{"errors": {"database": "..."}}` |
| Health Readiness | Cache down | HTTP 503 + JSON `{"errors": {"cache": "..."}}` |
| Twilio SMS | API error | Log Twilio error code/message, raise generic RuntimeError |
| Backup Agent | Any stage failure | Log error, send webhook alert, exit non-zero |
| DRF Permissions | Unauthenticated request | HTTP 401 Unauthorized |
| Gradle Build | Missing keystore props | GradleException with descriptive message |

## Testing Strategy

**Unit Tests (example-based):**
- Startup check with mocked DB/Redis failures
- Health endpoint responses for healthy/unhealthy states
- Twilio provider initialization and error handling
- DRF permission enforcement on protected endpoints
- AllowAny on public endpoints

**Integration Tests:**
- Full HTTP request through Nginx → Daphne → response
- WebSocket connection lifecycle (connect, auth, subscribe, disconnect)
- Backup script execution with mocked s3cmd

**Property Tests:**
- WebSocket JWT validation (varied token formats)
- Ride authorization (varied user/ride combinations)
- Backup filename generation (varied timestamps)
- Twilio error encapsulation (varied error responses)
- Permission enforcement (varied endpoints)

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Valid JWT tokens authenticate to correct user

*For any* valid JWT access token encoding a `user_id` claim, when the WebSocket middleware processes that token, the resulting `scope["user"]` SHALL have an `id` equal to the token's `user_id` claim.

**Validates: Requirements 3.1, 3.4**

### Property 2: Invalid JWT tokens are rejected with close code 4003

*For any* JWT string that is expired, malformed, or signed with an incorrect key, the WebSocket middleware SHALL reject the connection with close code 4003.

**Validates: Requirements 3.3**

### Property 3: Ride subscription authorization

*For any* ride and any authenticated user, the user SHALL be allowed to join the ride group if and only if the user is the rider or the assigned driver for that ride. Unauthorized users SHALL receive close code 4403.

**Validates: Requirements 3.5, 3.6**

### Property 4: HTTP to HTTPS redirect preserves request path

*For any* valid HTTP request path, when the request arrives on port 80, the 301 redirect Location header SHALL be the same path prefixed with `https://` and the original `Host` header.

**Validates: Requirements 5.2**

### Property 5: Backup filename timestamp format

*For any* backup execution timestamp, the generated backup filename SHALL match the pattern `yala_db_YYYYMMDD-HHMMSS.sql.gz` where the date-time components correspond to the execution time.

**Validates: Requirements 6.3**

### Property 6: Backup retention preserves at least 7 entries

*For any* set of existing backups in the storage bucket, after the pruning operation executes, at least 7 backups SHALL remain (or all backups remain if fewer than 7 exist).

**Validates: Requirements 6.4**

### Property 7: Twilio error handling encapsulation

*For any* Twilio REST API error response (with any error code and message), the SMS provider SHALL log both the Twilio error code and message, AND the exception raised to calling code SHALL NOT contain Twilio-specific details (account SID, error codes, or internal URLs).

**Validates: Requirements 8.4, 8.5**

### Property 8: No plaintext passwords in build.gradle files

*For any* `build.gradle` file in the rider-app or driver-app Android projects, the file content SHALL NOT contain string literals that match keystore password patterns (quoted strings in `storePassword` or `keyPassword` assignments).

**Validates: Requirements 9.2**

### Property 9: Default permission enforcement

*For any* DRF API endpoint that does not declare an explicit `permission_classes` override, an unauthenticated request (no Authorization header) SHALL receive an HTTP 401 response.

**Validates: Requirements 10.2**
