# Implementation Plan: Launch Blockers Fix

## Overview

This plan addresses 10 critical production launch blockers for the Yala taxi-booking platform. Tasks are ordered by priority: API stability first (getting the service running), then security hardening (secrets, auth, permissions), then infrastructure improvements (backups, health, TLS). Each task builds incrementally on previous work, ensuring the platform reaches a deployable state.

## Tasks

- [ ] 1. Fix Production API Stability
  - [ ] 1.1 Create startup health check script
    - Create `backend/taxi/startup_check.py` that verifies Database and Cache connectivity before accepting traffic
    - Log errors with timestamp and connection details on failure
    - Exit with non-zero status code (1 for DB failure, 2 for Cache failure)
    - _Requirements: 1.2, 1.3, 1.4_

  - [ ] 1.2 Update Docker Compose django service command
    - Modify `docker-compose.yml` to run migrations → startup_check.py → daphne sequentially
    - Ensure migrations complete before the App_Server begins listening on port 8000
    - Add proxy timeout of 30s in upstream configuration
    - _Requirements: 1.1, 1.5, 1.6_

  - [ ]* 1.3 Write unit tests for startup check
    - Test successful DB + Cache connectivity scenario
    - Test DB failure exits with code 1 and logs error
    - Test Cache failure exits with code 2 and logs error
    - _Requirements: 1.2, 1.3, 1.4_

- [ ] 2. Secret Rotation and Repository Hygiene
  - [ ] 2.1 Update .gitignore and remove tracked secrets
    - Add `backend/taxi/.env.production` to `backend/taxi/.gitignore`
    - Run `git rm --cached backend/taxi/.env.production` to stop tracking
    - Document `git filter-repo` command for full history purge (manual operator step)
    - _Requirements: 2.1, 2.2_

  - [ ] 2.2 Update .env.production.template with rotation instructions
    - Replace all `yala.mr` references with `yalataxi.live`
    - Add placeholder generation commands for DJANGO_SECRET_KEY, POSTGRES_PASSWORD
    - Add rotation instructions for STRIPE_SECRET_KEY and STRIPE_PUBLIC_KEY
    - Add Twilio environment variables (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER)
    - _Requirements: 2.3, 2.4, 2.5, 2.6_

- [ ] 3. Domain Canonicalization
  - [ ] 3.1 Update domain references from yala.mr to yalataxi.live
    - Update `DJANGO_ALLOWED_HOSTS` to include yalataxi.live, www.yalataxi.live, api.yalataxi.live
    - Update `CORS_ALLOWED_ORIGINS` to include https://yalataxi.live and https://www.yalataxi.live
    - Update `CSRF_TRUSTED_ORIGINS` to include all three yalataxi.live variants
    - Update `FRONTEND_URL`, `DEFAULT_FROM_EMAIL`, `PUSH_CLAIMS_EMAIL` defaults in settings.py
    - Remove all references to yala.mr from backend configuration files
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7_

- [ ] 4. Checkpoint - API & Configuration
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 5. WebSocket Authentication Security
  - [ ] 5.1 Create JWT WebSocket authentication middleware
    - Create `backend/taxi/taxi/middleware.py` with `JWTAuthMiddleware` class
    - Extract JWT token from `?token=` query parameter
    - Reject with close code 4001 if token is missing
    - Reject with close code 4003 if token is expired or invalid
    - Attach authenticated user to connection scope on valid token
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

  - [ ] 5.2 Update ASGI configuration to use JWTAuthMiddleware
    - Modify `backend/taxi/taxi/asgi.py` to replace `AuthMiddlewareStack` with `JWTAuthMiddleware`
    - Wrap `URLRouter(websocket_urlpatterns)` with the new middleware
    - _Requirements: 3.1, 3.4_

  - [ ] 5.3 Add ride ownership authorization check in WebSocket consumer
    - Add `_check_ride_authorization` method to the rides consumer
    - Verify user is either the rider or assigned driver before joining ride group
    - Reject with close code 4403 if user is not authorized
    - _Requirements: 3.5, 3.6_

  - [ ]* 5.4 Write property test for JWT token authentication (Property 1)
    - **Property 1: Valid JWT tokens authenticate to correct user**
    - Test that any valid JWT with a user_id claim results in scope["user"].id == user_id
    - **Validates: Requirements 3.1, 3.4**

  - [ ]* 5.5 Write property test for invalid JWT rejection (Property 2)
    - **Property 2: Invalid JWT tokens are rejected with close code 4003**
    - Test expired, malformed, and incorrectly-signed tokens all produce close code 4003
    - **Validates: Requirements 3.3**

  - [ ]* 5.6 Write property test for ride subscription authorization (Property 3)
    - **Property 3: Ride subscription authorization**
    - Test that only the rider or assigned driver can join a ride group; others get 4403
    - **Validates: Requirements 3.5, 3.6**

- [ ] 6. REST Framework Default Permission Hardening
  - [ ] 6.1 Change DRF default permission to IsAuthenticated
    - Update `REST_FRAMEWORK["DEFAULT_PERMISSION_CLASSES"]` in `backend/taxi/taxi/settings.py`
    - Set to `("rest_framework.permissions.IsAuthenticated",)`
    - _Requirements: 10.1, 10.2_

  - [ ] 6.2 Add explicit AllowAny to public endpoints
    - Add `@permission_classes([AllowAny])` to auth endpoints (login, register, token refresh, token verify)
    - Verify health endpoints already have AllowAny
    - Add AllowAny to API schema endpoint if present
    - _Requirements: 10.3_

  - [ ]* 6.3 Write property test for default permission enforcement (Property 9)
    - **Property 9: Default permission enforcement**
    - Test that endpoints without explicit permission_classes return 401 for unauthenticated requests
    - **Validates: Requirements 10.2**

  - [ ]* 6.4 Write unit tests for permission changes
    - Test authenticated endpoints still work with valid JWT tokens
    - Test public endpoints remain accessible without authentication
    - _Requirements: 10.4_

- [ ] 7. Checkpoint - Security
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 8. Twilio SMS Provider Configuration
  - [ ] 8.1 Add Twilio settings and dependency
    - Add `twilio` package to `backend/taxi/requirements.txt`
    - Add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER settings in `taxi/settings.py`
    - Add YALA_SMS_PROVIDER setting defaulting to "console"
    - _Requirements: 8.2, 8.6_

  - [ ] 8.2 Implement Twilio SMS provider in phone_views.py
    - Add `_send_twilio_sms` function using Twilio REST Client
    - Update `send_sms` function to route to Twilio when `YALA_SMS_PROVIDER == "twilio"`
    - Log Twilio error code and message on failure
    - Raise generic RuntimeError without exposing Twilio internals to caller
    - _Requirements: 8.1, 8.3, 8.4, 8.5_

  - [ ]* 8.3 Write property test for Twilio error encapsulation (Property 7)
    - **Property 7: Twilio error handling encapsulation**
    - Test that for any TwilioRestException, the logged message contains error code/message but the raised exception does not contain account SID, error codes, or internal URLs
    - **Validates: Requirements 8.4, 8.5**

  - [ ]* 8.4 Write unit tests for SMS provider routing
    - Test console provider logs message
    - Test twilio provider calls Twilio client
    - Test error handling returns failure status
    - _Requirements: 8.1, 8.4, 8.5_

- [ ] 9. Health Check Endpoints
  - [ ] 9.1 Create health Django app with liveness and readiness views
    - Create `backend/taxi/health/__init__.py`, `views.py`, `urls.py`
    - Implement `/api/health/live/` returning 200 when process is running
    - Implement `/api/health/ready/` checking DB and Cache, returning 503 with JSON error body on failure
    - Both endpoints use explicit AllowAny permission
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_

  - [ ] 9.2 Register health app in Django project
    - Add `health` to INSTALLED_APPS in `taxi/settings.py`
    - Add `path("api/health/", include("health.urls"))` to `taxi/urls.py`
    - _Requirements: 7.1, 7.2_

  - [ ]* 9.3 Write unit tests for health endpoints
    - Test liveness returns 200 always
    - Test readiness returns 200 when DB and Cache are healthy
    - Test readiness returns 503 with database error JSON when DB is down
    - Test readiness returns 503 with cache error JSON when Cache is down
    - _Requirements: 7.2, 7.3, 7.4_

- [ ] 10. Nginx HTTPS Configuration
  - [ ] 10.1 Rewrite nginx.conf with TLS and security headers
    - Create port 80 server block with 301 redirect to HTTPS (preserve path)
    - Add ACME challenge location for Certbot renewal
    - Create port 443 server block with Let's Encrypt certificate paths
    - Add security headers: HSTS (31536000s), X-Content-Type-Options, X-Frame-Options, Referrer-Policy
    - Configure proxy_pass for /api/ and /ws/ (with WebSocket upgrade headers)
    - Configure static and media file serving
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

  - [ ] 10.2 Add Certbot auto-renewal cron job
    - Create renewal script or cron entry that runs certbot renew with nginx reload deploy hook
    - Ensure renewal triggers within 30 days of certificate expiration
    - _Requirements: 5.7_

  - [ ]* 10.3 Write property test for HTTP to HTTPS redirect path preservation (Property 4)
    - **Property 4: HTTP to HTTPS redirect preserves request path**
    - Test that for any valid request path on port 80, the 301 Location header equals https://{host}{path}
    - **Validates: Requirements 5.2**

- [ ] 11. Automated Database Backups
  - [ ] 11.1 Create backup shell script
    - Create `scripts/backup_db.sh` with pg_dump → gzip → s3cmd upload → verify → prune pipeline
    - Implement failure alerting via webhook on any stage failure
    - Add retention logic to keep at least 7 daily backups
    - Use timestamped filename pattern `yala_db_YYYYMMDD-HHMMSS.sql.gz`
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.7_

  - [ ] 11.2 Create cron entry for daily backup scheduling
    - Create `scripts/backup_cron` file with daily schedule (2 AM)
    - Document installation: `crontab scripts/backup_cron`
    - _Requirements: 6.6_

  - [ ]* 11.3 Write property test for backup filename format (Property 5)
    - **Property 5: Backup filename timestamp format**
    - Test that for any execution timestamp, the filename matches `yala_db_YYYYMMDD-HHMMSS.sql.gz`
    - **Validates: Requirements 6.3**

  - [ ]* 11.4 Write property test for backup retention (Property 6)
    - **Property 6: Backup retention preserves at least 7 entries**
    - Test that pruning never reduces backup count below 7 (or total if fewer than 7 exist)
    - **Validates: Requirements 6.4**

- [ ] 12. Secure Android Keystore Passwords
  - [ ] 12.1 Update rider-app build.gradle to use gradle.properties
    - Replace hardcoded passwords with references to gradle.properties or environment variables
    - Add build validation that fails with descriptive error if signing props are missing
    - Add `gradle.properties` to `rider-app/android/.gitignore`
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

  - [ ] 12.2 Update driver-app build.gradle to use gradle.properties
    - Apply same signing config pattern as rider-app
    - Add build validation for missing keystore properties
    - Add `gradle.properties` to `driver-app/android/.gitignore`
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

  - [ ]* 12.3 Write property test for no plaintext passwords in build.gradle (Property 8)
    - **Property 8: No plaintext passwords in build.gradle files**
    - Test that build.gradle files do not contain string literals in storePassword or keyPassword assignments
    - **Validates: Requirements 9.2**

- [ ] 13. Final Checkpoint
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- Priority ordering: API stability (1-2) → Security (3-7) → Infrastructure (8-12)
- The design uses Python/Django for backend, Groovy/Gradle for Android builds, Bash for scripts, and Nginx config for the API gateway

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1", "3.1"] },
    { "id": 1, "tasks": ["1.2", "2.2", "8.1", "12.1", "12.2"] },
    { "id": 2, "tasks": ["1.3", "5.1", "6.1", "9.1", "10.1", "11.1"] },
    { "id": 3, "tasks": ["5.2", "5.3", "6.2", "8.2", "9.2", "10.2", "11.2"] },
    { "id": 4, "tasks": ["5.4", "5.5", "5.6", "6.3", "6.4", "8.3", "8.4", "9.3", "10.3", "11.3", "11.4", "12.3"] }
  ]
}
```
