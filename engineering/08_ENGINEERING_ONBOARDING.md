# YALA — Engineering Onboarding

**Document ID:** YALA-ENG-ONB-008  
**Version:** 1.0.0  
**Effective:** 2026-07-21  
**Related:** `05_DEPLOYMENT_GUIDE.md` · `07_CODING_STANDARDS.md` · `operations/10_NEW_EMPLOYEE_ONBOARDING.md`

---

## 1. Welcome checklist

| # | Task | ☐ |
|---|------|:-:|
| 1 | Git repository access granted | ☐ |
| 2 | Read `engineering/README.md` and `01_SYSTEM_ARCHITECTURE.md` | ☐ |
| 3 | Complete local setup (§2) | ☐ |
| 4 | Run full test suite (§6) | ☐ |
| 5 | Log into admin portal (staff account) | ☐ |
| 6 | Join WhatsApp engineering group | ☐ |
| 7 | Review on-call rotation | ☐ |
| 8 | Shadow one production deploy (if applicable) | ☐ |

---

## 2. Local setup

### Prerequisites

| Tool | Version |
|------|---------|
| Python | 3.11+ |
| Node.js | 18+ |
| npm | 9+ |
| Docker Desktop | Latest (recommended) |
| Git | 2.x |
| IDE | VS Code / Cursor recommended |

### Clone repository

```bash
git clone <repository-url> taxi-booking
cd taxi-booking
```

### Option A — Docker (recommended)

```bash
# Build frontend
cd frontend
npm install
npm run build
cd ..

# Configure environment
cp backend/taxi/.env.production.template backend/taxi/.env.production
# For local dev, set:
#   DJANGO_DEBUG=True
#   DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1

# Start all services
docker compose up --build -d

# Initialize database
docker compose exec django python manage.py migrate
docker compose exec django python manage.py createsuperuser

# Verify
curl http://localhost:8000/health/
```

### Option B — Local Python (no Docker)

```bash
cd backend/taxi
python -m venv venv

# Windows
venv\Scripts\activate
# macOS/Linux
source venv/bin/activate

pip install -r requirements.txt

# Minimal env for SQLite dev
set DJANGO_DEBUG=True          # Windows
export DJANGO_DEBUG=True       # macOS/Linux
set DATABASE_URL=sqlite:///db.sqlite3

python manage.py migrate
python manage.py createsuperuser
python manage.py runserver
```

### Frontend dev server

```bash
cd frontend
npm install

# Create frontend/.env
echo REACT_APP_API_URL=http://localhost:8000 > .env

npm start
# Opens http://localhost:3000
```

### Mobile apps (optional)

```bash
# Rider app
cd rider-app
npm install
npx cap sync android

# Driver app
cd driver-app
npm install
npx cap sync android

# Delivery app
cd delivery-app
npm install
npx cap sync android
```

---

## 3. Environment variables

### Backend (development)

| Variable | Local value | Notes |
|----------|-------------|-------|
| `DJANGO_DEBUG` | `True` | Never True in production |
| `DJANGO_SECRET_KEY` | Any random string | Required |
| `DATABASE_URL` | `sqlite:///db.sqlite3` or postgres URL | SQLite for quick start |
| `REDIS_URL` | Optional | Falls back to in-memory cache |
| `CELERY_TASK_ALWAYS_EAGER` | `True` | Runs tasks synchronously in tests |

### Backend (production)

Full list: `backend/taxi/.env.production.template` and `handover/04_ENVIRONMENT_REGISTER.md`

Key production vars:

| Variable | Purpose |
|----------|---------|
| `DJANGO_SECRET_KEY` | Cryptographic signing |
| `DATABASE_URL` | PostgreSQL connection |
| `REDIS_URL` | Cache (DB /1) |
| `CELERY_BROKER_URL` | Task broker (DB /0) |
| `JWT_ACCESS_TOKEN_MINUTES` | Token lifetime (15) |
| `STRIPE_SECRET_KEY` | Card payments |
| `FIREBASE_CREDENTIALS_PATH` | Push notifications |
| `SENTRY_DSN` | Error tracking |

### Frontend

| Variable | Purpose | Example |
|----------|---------|---------|
| `REACT_APP_API_URL` | Backend base URL | `http://localhost:8000` |
| `REACT_APP_PUBLIC_URL` | Public path prefix | `/` |

---

## 4. Running services

### Docker services

| Service | Port | Purpose |
|---------|------|---------|
| nginx | 443 / 80 | Reverse proxy (production compose) |
| django | 8000 | API + WebSocket |
| postgres | 5432 | Database |
| redis | 6379 | Cache + broker |
| celery-worker | — | Background tasks |
| celery-beat | — | Scheduled tasks |

### Common commands

```bash
# All services
docker compose up -d

# Single service logs
docker compose logs django -f

# Django shell
docker compose exec django python manage.py shell

# Run migrations
docker compose exec django python manage.py migrate

# Celery worker (if running locally without Docker)
cd backend/taxi
celery -A taxi worker -l info
```

### Access points (local)

| Surface | URL |
|---------|-----|
| API | http://localhost:8000 |
| Health | http://localhost:8000/health/ |
| Django admin | http://localhost:8000/admin/ |
| React app | http://localhost:3000 |
| Admin dashboard | http://localhost:3000/admin |

---

## 5. Test data

### Create superuser

```bash
python manage.py createsuperuser
# Email-based login
```

### Assign staff groups (Django admin or shell)

```python
from django.contrib.auth.models import Group
from authapp.models import User

user = User.objects.get(email="you@yalataxi.live")
user.is_staff = True
user.save()
Group.objects.get(name="Operations Manager").user_set.add(user)
# Groups: CEO, Super Admin, Operations Manager, Finance, Accountant, Supervisor
```

### Soft launch configuration (beta caps)

```bash
docker compose exec django python manage.py configure_soft_launch
```

Caps: 20 drivers · 10 couriers · 100 riders

### Sample data scripts

| Script | Purpose |
|--------|---------|
| `manage.py configure_soft_launch` | Beta caps and flags |
| `manage.py generate_soft_launch_reports` | Daily report generation |

For manual test rides, use mobile apps or API:

```bash
# Login
curl -X POST http://localhost:8000/auth/login/ \
  -H "Content-Type: application/json" \
  -d '{"email":"rider@test.com","password":"testpass"}'
```

---

## 6. Running tests

### Full suite

```bash
cd backend/taxi
python manage.py test -v 1
```

### By app / module

```bash
# Operations dashboards
python manage.py test tests.operations -v 1

# Finance
python manage.py test operations.tests.test_finance_operations -v 1

# Payments
python manage.py test payments -v 1

# Trust & Safety
python manage.py test tests.operations.test_trust_safety -v 1

# Launch command
python manage.py test tests.operations.test_launch_command -v 1
```

### With coverage (optional)

```bash
pip install coverage
coverage run manage.py test
coverage report
```

### Frontend build verification

```bash
cd frontend
npm run build
```

### Test environment notes

| Setting | Test value |
|---------|------------|
| Database | SQLite in-memory |
| Celery | Eager mode (synchronous) |
| Redis | Optional; tests use cache fallback |

---

## 7. Debugging

### Django

```bash
# Shell
python manage.py shell

# SQL logging (dev only)
# settings.py: LOGGING level DEBUG for django.db.backends

# pdb breakpoint
import pdb; pdb.set_trace()
```

### Docker logs

```bash
docker compose logs django --tail 200
docker compose logs celery-worker --tail 100
```

### Common issues

| Issue | Fix |
|-------|-----|
| Migration conflict | `python manage.py showmigrations`, resolve merge |
| Redis connection refused | Start redis container or unset `REDIS_URL` for dev |
| CORS error in frontend | Set `CORS_ALLOWED_ORIGINS` to include `http://localhost:3000` |
| 401 on admin API | Check JWT token expiry; re-login |
| WebSocket fail | Pass `?token=` query param with valid access token |
| Static files 404 | Run `collectstatic` or use dev server |

### API debugging

```bash
# Health check
curl -v http://localhost:8000/api/health/ready/

# Authenticated request
curl http://localhost:8000/auth/me/ \
  -H "Authorization: Bearer <access_token>"
```

### Frontend debugging

- React DevTools browser extension
- Network tab for API calls
- Check `REACT_APP_API_URL` in `.env`

---

## 8. Deployment process

### Who deploys

| Environment | Who | Method |
|-------------|-----|--------|
| Local | Any engineer | Docker or runserver |
| Production | Engineering Lead / on-call | SSH + Docker Compose |

### Production deploy summary

```bash
ssh root@142.93.99.142
cd /opt/yala
git pull
cd frontend && npm ci && npm run build && cd ..
docker compose -p yala up --build -d
docker compose -p yala exec django python manage.py migrate
curl -fsS https://api.yalataxi.live/api/health/ready/
```

Full guide: [05_DEPLOYMENT_GUIDE.md](./05_DEPLOYMENT_GUIDE.md)

### Pre-deploy checklist

- [ ] Tests pass
- [ ] Migrations reviewed
- [ ] Frontend built
- [ ] Backup confirmed
- [ ] Rollback tag identified

### Post-deploy verification

- [ ] `/api/health/ready/` → 200
- [ ] `/admin/status` all green
- [ ] Login to admin portal
- [ ] `scripts/launch-certification-prod.py` passes

---

## 9. Key documentation map

| Topic | Document |
|-------|----------|
| Architecture | `engineering/01_SYSTEM_ARCHITECTURE.md` |
| API reference | `engineering/02_API_CATALOG.md` |
| Database | `engineering/03_DATABASE_REFERENCE.md` |
| Security | `engineering/04_SECURITY_ARCHITECTURE.md` |
| Deployment | `engineering/05_DEPLOYMENT_GUIDE.md` |
| Monitoring | `engineering/06_MONITORING_RUNBOOK.md` |
| Coding standards | `engineering/07_CODING_STANDARDS.md` |
| Operations SOPs | `operations/` |
| Environment vars | `handover/04_ENVIRONMENT_REGISTER.md` |
| Dependencies | `handover/03_DEPENDENCY_REGISTER.md` |
| Disaster recovery | `handover/08_DISASTER_RECOVERY_SUMMARY.md` |

---

## 10. First-week learning path

| Day | Focus |
|-----|-------|
| 1 | Local setup, run tests, explore admin portal |
| 2 | Read architecture + API catalog; trace one ride flow |
| 3 | Explore `operations/` app — service + view pattern |
| 4 | Read security architecture; review permissions |
| 5 | Shadow monitoring runbook; review production status page |
| 6–7 | Pick a small bug or doc task; submit first PR |

---

## 11. Document control

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-07-21 | Initial engineering onboarding |

**Cross-references:** `operations/10_NEW_EMPLOYEE_ONBOARDING.md` · `handover/06_SUPPORT_MATRIX.md`
