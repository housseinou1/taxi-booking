# Staging droplet — first boot (no production changes)

## Prerequisites

- New DigitalOcean droplet (not `142.93.99.142`)
- DNS A records: `staging.yalataxi.live`, `api-staging.yalataxi.live` → staging IP
- Release: `release/coordinated-admin-moosyl-rc1` @ `1c3bd8c7` (tag `coordinated-admin-moosyl-rc1.6`)

## 1. Server packages

```bash
apt update && apt install -y docker.io docker-compose-plugin git certbot
usermod -aG docker yala
```

## 2. Clone and env

```bash
sudo mkdir -p /opt/yala-staging && sudo chown yala:yala /opt/yala-staging
cd /opt/yala-staging
git clone -b release/coordinated-admin-moosyl-rc1 https://github.com/housseinou1/taxi-booking.git .
git checkout 1c3bd8c7

cp backend/taxi/env.staging.template backend/taxi/.env.staging
# Edit .env.staging from vault (sandbox Moosyl only)

cp .env.staging.compose.example .env
# Set POSTGRES_PASSWORD (new, not prod)
```

## 3. TLS (before HTTPS nginx)

```bash
docker compose -f docker-compose.staging.yml up -d nginx django postgres redis
# Temporarily use HTTP-only or certbot standalone:
certbot certonly --webroot -w ./certbot/www \
  -d staging.yalataxi.live -d www.staging.yalataxi.live
certbot certonly --webroot -w ./certbot/www \
  -d api-staging.yalataxi.live
docker compose -f docker-compose.staging.yml up -d --build
```

## 4. Frontend (operator laptop)

```powershell
$env:REACT_APP_API_URL='https://api-staging.yalataxi.live'
cd frontend
npm ci
npm run build:web
..\scripts\verify-web-build.ps1 -BuildDir .\build
..\scripts\deploy-staging-coordinated.ps1 -Remote 'yala@STAGING_IP' -BuildDir .\build
```

## 5. Pilot seed & smoke

```bash
docker compose -f docker-compose.staging.yml exec django python manage.py seed_pilot_uat --riders 10 --drivers 5 --couriers 3
curl -sS https://api-staging.yalataxi.live/api/health/ready/
```

## 6. Moosyl webhook (sandbox dashboard)

Register: `https://api-staging.yalataxi.live/payments/webhooks/moosyl/` with **sandbox** signing secret in `.env.staging`.

## Rollback

```bash
# Frontend: restore from /home/yala-staging/pre-website-deploy-*/
# DB: pg_dump before migrate; restore from dump if needed
```
