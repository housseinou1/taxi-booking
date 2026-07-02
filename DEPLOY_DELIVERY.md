# Yala Delivery — Final Deployment Checklist

## Step 1: Firebase Android Config

```powershell
# Download google-services.json from Firebase Console
# Project: Yala Delivery
# Package name: com.yala.delivery.mr
# Place at:
Copy-Item path\to\google-services.json delivery-app\android\app\google-services.json
```

**Verify file exists:**
```powershell
Test-Path delivery-app\android\app\google-services.json
```

---

## Step 2: Fill Backend Production Secrets

Edit `backend/taxi/.env.production` with real values:

```dotenv
# REQUIRED — Generate: python -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"
DJANGO_SECRET_KEY=YOUR_50_CHAR_RANDOM_KEY

DJANGO_DEBUG=False
DJANGO_ALLOWED_HOSTS=yalataxi.live,www.yalataxi.live,api.yalataxi.live

# Must match POSTGRES_PASSWORD in root .env
DATABASE_URL=postgres://yala_user:YOUR_STRONG_PASSWORD@postgres:5432/yala_db

REDIS_URL=redis://redis:6379/0

CORS_ALLOW_ALL_ORIGINS=False
CORS_ALLOWED_ORIGINS=https://yalataxi.live,https://www.yalataxi.live,https://api.yalataxi.live,capacitor://localhost,http://localhost
CSRF_TRUSTED_ORIGINS=https://yalataxi.live,https://www.yalataxi.live,https://api.yalataxi.live

SECURE_SSL_REDIRECT=True
SECURE_HSTS_SECONDS=31536000

# Email (for password reset, notifications)
EMAIL_HOST_USER=noreply@yala.mr
EMAIL_HOST_PASSWORD=YOUR_EMAIL_APP_PASSWORD

# Stripe
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PUBLIC_KEY=pk_live_...

# Push Notifications (VAPID)
PUSH_PRIVATE_KEY=YOUR_VAPID_PRIVATE_KEY
PUSH_PUBLIC_KEY=YOUR_VAPID_PUBLIC_KEY
PUSH_CLAIMS_EMAIL=mailto:admin@yalataxi.live

FRONTEND_URL=https://yalataxi.live
```

Also set root `.env`:
```dotenv
POSTGRES_PASSWORD=YOUR_STRONG_PASSWORD
```

---

## Step 3: Build Frontend

```powershell
cd frontend

# Copy delivery env for production build
Copy-Item .env.delivery .env.local -Force

# Build React app
npm run build
```

**Expected output:** `build/` directory created with `index.html`

---

## Step 4: Build Delivery Mobile App

```powershell
cd delivery-app

# Build (copies frontend build, stamps delivery app type)
npm run build

# Sync Capacitor native projects
npx cap sync
```

**Verify stamp:**
```powershell
Select-String "YALA_APP_TYPE" www\index.html
# Should show: window.__YALA_APP_TYPE__="delivery"
```

---

## Step 5: Build Docker

```powershell
cd C:\Users\Housseinou\Projects\Django\taxi-booking

docker-compose build
```

**Expected:** All 5 services build (nginx, django, postgres, celery-worker, celery-beat)

---

## Step 6: Start Production

```powershell
docker-compose up -d
```

**Expected:** All containers start without errors

---

## Step 7: Verify Services Running

```powershell
# Check all containers are up
docker-compose ps

# Check Django/Daphne
docker-compose logs django --tail=20

# Check Celery worker
docker-compose logs celery-worker --tail=20

# Check Celery beat
docker-compose logs celery-beat --tail=20

# Check Redis
docker-compose exec redis redis-cli ping
# Expected: PONG
```

---

## Step 8: Verify Endpoints

```powershell
# Health check
curl https://api.yalataxi.live/health/

# Delivery categories (public endpoint)
curl https://api.yalataxi.live/deliveries/categories/

# Admin panel
# Open: https://yalataxi.live/admin?section=deliveries

# Delivery courier app
# Open: https://yalataxi.live/delivery/courier
```

---

## Step 9: Verify WebSocket

```powershell
# Test WebSocket connection (requires wscat: npm install -g wscat)
wscat -c "wss://api.yalataxi.live/ws/rides/?token=YOUR_JWT_TOKEN"
```

---

## Step 10: Verify Media Uploads

```powershell
# Check media directory is writable
docker-compose exec django ls -la /app/media/

# Test upload via admin or courier document upload
# Open: https://yalataxi.live/delivery/documents
```

---

## Step 11: Verify Celery Tasks

```powershell
# Check registered tasks
docker-compose exec celery-worker celery -A taxi inspect registered

# Expected delivery tasks:
# - deliveries.tasks.check_offer_timeouts
# - deliveries.tasks.dispatch_scheduled_deliveries
# - deliveries.tasks.cleanup_stale_requests
# - deliveries.tasks.remind_cash_settlement

# Check beat schedule is running
docker-compose logs celery-beat --tail=5
# Expected: "beat: Starting..." with scheduled tasks listed
```

---

## Step 12: Final Visual Verification

| Check | URL | Expected |
|-------|-----|----------|
| Delivery courier app | `/delivery/courier` | Orange theme, "Yala Delivery" branding |
| Delivery profile | `/delivery/account` | Orange profile with Bronze Courier badge |
| Admin deliveries | `/admin?section=deliveries` | Delivery analytics, couriers, disputes |
| No green driver UI | All `/delivery/*` pages | Zero green, only orange |
| Mobile app (Android) | Build APK and install | Opens with "Yala Delivery", orange |

---

## Troubleshooting

| Issue | Command | Fix |
|-------|---------|-----|
| Django won't start | `docker-compose logs django` | Check DATABASE_URL and migrations |
| Celery not processing | `docker-compose logs celery-worker` | Check CELERY_BROKER_URL = REDIS_URL |
| WebSocket fails | `docker-compose logs django` | Verify REDIS_URL is set and Redis is running |
| Push not working | Check `google-services.json` exists | Re-download from Firebase Console |
| Media 404 | Check nginx config | Verify `/media/` alias points to correct path |
| CSS looks wrong | Hard refresh (Ctrl+Shift+R) | Clear browser cache, rebuild frontend |

---

## Architecture Summary

```
┌─────────────────────────────────────────────────┐
│                    NGINX                         │
│  Port 80/443 → SSL → Proxy                      │
│  /deliveries/* → Django (Daphne)                 │
│  /ws/* → WebSocket (Daphne)                      │
│  /media/* → File server                          │
│  /* → Frontend (React build)                     │
└───────────────────────┬─────────────────────────┘
                        │
        ┌───────────────┼───────────────┐
        ▼               ▼               ▼
┌──────────────┐ ┌─────────────┐ ┌─────────────┐
│   Django     │ │   Celery    │ │   Celery    │
│   (Daphne)   │ │   Worker    │ │   Beat      │
│   Port 8000  │ │             │ │             │
└──────┬───────┘ └──────┬──────┘ └──────┬──────┘
       │                │               │
       ▼                ▼               ▼
┌──────────────┐ ┌─────────────────────────────┐
│  PostgreSQL  │ │           Redis              │
│  Port 5432   │ │  Channels + Cache + Broker   │
└──────────────┘ └─────────────────────────────┘
```

---

**Status: Ready to deploy.** Run steps 1–12 in order. No new features needed.
