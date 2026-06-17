# Requirements Document

## Introduction

This specification addresses 10 critical launch-blocking issues for the Yala taxi-booking platform deployed on DigitalOcean (142.93.99.142). The fixes span production API stability, secret rotation, WebSocket security, domain canonicalization, HTTPS configuration, automated backups, health monitoring, SMS OTP delivery via Twilio, Android keystore credential security, and REST Framework permission hardening. The canonical domain is yalataxi.live / api.yalataxi.live.

## Glossary

- **Platform**: The Yala taxi-booking backend system composed of Django 4.2+, DRF, Daphne ASGI, Django Channels, PostgreSQL 15, Redis 7, Nginx, and Docker Compose running on a DigitalOcean droplet.
- **API_Gateway**: The Nginx reverse proxy that terminates HTTP/HTTPS connections and forwards traffic to the Django/Daphne upstream.
- **App_Server**: The Daphne ASGI process serving Django HTTP and WebSocket requests.
- **Database**: The PostgreSQL 15 instance storing application data.
- **Cache**: The Redis 7 instance used for channel layers, caching, and session support.
- **Backup_Agent**: The automated script and cron job responsible for database backup, upload, and alerting.
- **Backup_Storage**: DigitalOcean Spaces (S3-compatible object storage) used as the offsite backup destination.
- **SMS_Provider**: The Twilio service used to deliver OTP codes via SMS to users in Mauritania.
- **Health_Endpoint**: The /api/health/ HTTP endpoint exposing liveness and readiness probes.
- **WebSocket_Middleware**: The ASGI middleware layer that authenticates WebSocket upgrade requests using JWT tokens.
- **Build_System**: The Gradle-based Android build pipeline for rider-app and driver-app Capacitor projects.
- **Secret_Store**: The combination of environment variables, .gitignore rules, and credential files that protect sensitive values from version control exposure.

## Requirements

### Requirement 1: Production API Stability

**User Story:** As a rider or driver, I want the production API to respond reliably, so that the mobile apps function without 502 errors.

#### Acceptance Criteria

1. WHEN the Platform receives an HTTP request on api.yalataxi.live, THE App_Server SHALL return a valid HTTP response within 30 seconds.
2. WHEN the App_Server starts, THE App_Server SHALL verify connectivity to the Database and the Cache before accepting traffic.
3. IF the Database connection fails during startup, THEN THE App_Server SHALL log the error with timestamp and connection details and exit with a non-zero status code.
4. IF the Cache connection fails during startup, THEN THE App_Server SHALL log the error with timestamp and connection details and exit with a non-zero status code.
5. WHEN Docker Compose starts the django service, THE Platform SHALL execute database migrations before the App_Server begins listening on port 8000.
6. WHEN the App_Server is running, THE API_Gateway SHALL proxy requests to the App_Server upstream without returning 502 errors under normal operating conditions.

### Requirement 2: Secret Rotation and Repository Hygiene

**User Story:** As a platform operator, I want all exposed secrets removed from version control and rotated, so that compromised credentials cannot be exploited.

#### Acceptance Criteria

1. THE Secret_Store SHALL exclude the file backend/taxi/.env.production from version control via .gitignore rules.
2. WHEN the .gitignore update is applied, THE Secret_Store SHALL remove backend/taxi/.env.production from git tracking history using BFG or git filter-repo.
3. THE Platform SHALL use a newly generated DJANGO_SECRET_KEY value that differs from any value previously committed to the repository.
4. THE Platform SHALL use a newly generated POSTGRES_PASSWORD value that differs from any value previously committed to the repository.
5. THE Platform SHALL use newly generated STRIPE_SECRET_KEY and STRIPE_PUBLIC_KEY values that differ from any values previously committed to the repository.
6. WHEN credentials are rotated, THE Platform SHALL update the .env.production.template file with placeholder instructions for each rotated secret.

### Requirement 3: WebSocket Authentication Security

**User Story:** As a platform operator, I want WebSocket connections authenticated with JWT tokens, so that only verified users receive real-time ride updates.

#### Acceptance Criteria

1. WHEN a WebSocket upgrade request is received, THE WebSocket_Middleware SHALL extract the JWT access token from the query string or first message payload.
2. IF the JWT token is missing from a WebSocket upgrade request, THEN THE WebSocket_Middleware SHALL reject the connection with WebSocket close code 4001.
3. IF the JWT token is expired or invalid, THEN THE WebSocket_Middleware SHALL reject the connection with WebSocket close code 4003.
4. WHEN a valid JWT token is provided, THE WebSocket_Middleware SHALL attach the authenticated user to the connection scope.
5. WHEN a user subscribes to ride updates, THE Platform SHALL verify that the authenticated user is either the rider or the assigned driver for the requested ride.
6. IF the authenticated user does not own or is not assigned to the ride, THEN THE Platform SHALL reject the subscription with WebSocket close code 4403.

### Requirement 4: Domain Canonicalization

**User Story:** As a platform operator, I want all backend configuration to reference yalataxi.live, so that SSL certificates, CORS, and API routing work correctly.

#### Acceptance Criteria

1. THE Platform SHALL set DJANGO_ALLOWED_HOSTS to include yalataxi.live, www.yalataxi.live, and api.yalataxi.live.
2. THE Platform SHALL set CORS_ALLOWED_ORIGINS to include https://yalataxi.live and https://www.yalataxi.live.
3. THE Platform SHALL set CSRF_TRUSTED_ORIGINS to include https://yalataxi.live, https://www.yalataxi.live, and https://api.yalataxi.live.
4. THE Platform SHALL set FRONTEND_URL to https://yalataxi.live.
5. THE Platform SHALL set DEFAULT_FROM_EMAIL sender domain to yalataxi.live.
6. THE Platform SHALL set PUSH_CLAIMS_EMAIL domain to yalataxi.live.
7. THE Platform SHALL remove all references to yala.mr from backend configuration files.

### Requirement 5: Nginx HTTPS Configuration

**User Story:** As a rider or driver, I want all API traffic encrypted with TLS, so that credentials and location data are protected in transit.

#### Acceptance Criteria

1. THE API_Gateway SHALL listen on port 443 with a valid TLS certificate for yalataxi.live and api.yalataxi.live.
2. WHEN an HTTP request arrives on port 80, THE API_Gateway SHALL respond with a 301 redirect to the equivalent HTTPS URL.
3. THE API_Gateway SHALL include the Strict-Transport-Security header with a max-age of at least 31536000 seconds on HTTPS responses.
4. THE API_Gateway SHALL include the X-Content-Type-Options header set to nosniff on all responses.
5. THE API_Gateway SHALL include the X-Frame-Options header set to DENY on all responses.
6. THE API_Gateway SHALL include the Referrer-Policy header set to strict-origin-when-cross-origin on all responses.
7. WHEN the TLS certificate is within 30 days of expiration, THE Platform SHALL support automated renewal via Certbot or an equivalent ACME client.

### Requirement 6: Automated Database Backups

**User Story:** As a platform operator, I want automated daily database backups stored offsite, so that data can be recovered after failures.

#### Acceptance Criteria

1. THE Backup_Agent SHALL execute a full PostgreSQL dump of the yala_db database at least once every 24 hours.
2. THE Backup_Agent SHALL compress the database dump using gzip before upload.
3. WHEN a backup is created, THE Backup_Agent SHALL upload the compressed dump to the Backup_Storage bucket with a timestamped filename.
4. THE Backup_Agent SHALL retain at least 7 daily backups in the Backup_Storage bucket.
5. IF a backup operation fails at any stage, THEN THE Backup_Agent SHALL send an alert notification to the platform operator.
6. THE Backup_Agent SHALL be scheduled via cron on the DigitalOcean droplet.
7. WHEN a backup is uploaded, THE Backup_Agent SHALL verify the upload by confirming the object exists in the Backup_Storage bucket.

### Requirement 7: Health Check Endpoints

**User Story:** As a platform operator, I want health check endpoints, so that monitoring tools can detect service degradation.

#### Acceptance Criteria

1. THE Platform SHALL expose a liveness probe at GET /api/health/live/ that returns HTTP 200 when the App_Server process is running.
2. THE Platform SHALL expose a readiness probe at GET /api/health/ready/ that returns HTTP 200 only when the Database and Cache connections are functional.
3. IF the Database connection is unavailable, THEN THE Health_Endpoint SHALL return HTTP 503 for the readiness probe with a JSON body indicating the failing component.
4. IF the Cache connection is unavailable, THEN THE Health_Endpoint SHALL return HTTP 503 for the readiness probe with a JSON body indicating the failing component.
5. THE Health_Endpoint SHALL respond to liveness and readiness probes within 5 seconds.
6. THE Health_Endpoint SHALL allow unauthenticated access to both liveness and readiness probes.

### Requirement 8: Twilio SMS Provider Configuration

**User Story:** As a rider or driver, I want to receive OTP codes via SMS, so that I can verify my phone number and log in.

#### Acceptance Criteria

1. WHEN YALA_SMS_PROVIDER is set to twilio, THE SMS_Provider SHALL send OTP messages using the Twilio REST API.
2. THE SMS_Provider SHALL use the TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM_NUMBER environment variables for authentication and sender identification.
3. WHEN an OTP is requested for a Mauritanian phone number (country code +222), THE SMS_Provider SHALL deliver the SMS within 60 seconds under normal network conditions.
4. IF the Twilio API returns an error response, THEN THE SMS_Provider SHALL log the error details including Twilio error code and message.
5. IF the Twilio API returns an error response, THEN THE SMS_Provider SHALL return a failure status to the calling code without exposing Twilio internals to the end user.
6. THE Platform SHALL set YALA_SMS_PROVIDER to twilio in the production environment configuration.

### Requirement 9: Secure Android Keystore Passwords

**User Story:** As a platform operator, I want keystore passwords removed from build.gradle, so that signing credentials are not exposed in version control.

#### Acceptance Criteria

1. THE Build_System SHALL read keystore storePassword, keyAlias, and keyPassword values from a gradle.properties file or environment variables.
2. THE Build_System SHALL not contain plaintext keystore passwords in any build.gradle file.
3. THE Secret_Store SHALL exclude gradle.properties files containing keystore passwords from version control via .gitignore rules.
4. WHEN a release build is executed, THE Build_System SHALL fail with a descriptive error if required keystore properties are missing.
5. THE Build_System SHALL apply secure keystore configuration to both the rider-app and driver-app Android projects.

### Requirement 10: REST Framework Default Permission

**User Story:** As a platform operator, I want the DRF default permission set to IsAuthenticated, so that API endpoints are secure by default.

#### Acceptance Criteria

1. THE Platform SHALL set the REST_FRAMEWORK DEFAULT_PERMISSION_CLASSES to rest_framework.permissions.IsAuthenticated.
2. WHEN an unauthenticated request reaches an endpoint without explicit permission overrides, THE Platform SHALL return HTTP 401 Unauthorized.
3. THE Platform SHALL add explicit AllowAny permission classes to public endpoints that require unauthenticated access, including authentication endpoints, health checks, and the API schema endpoint.
4. WHEN the permission default is changed, THE Platform SHALL verify that existing authenticated endpoints continue to function with valid JWT tokens.
