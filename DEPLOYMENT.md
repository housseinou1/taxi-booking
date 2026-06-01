# Yala — Production Deployment Guide

This guide covers deploying the Yala taxi-booking platform to various cloud providers.

---

## Architecture Overview

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Nginx     │────▶│   Django    │────▶│  PostgreSQL │
│  (reverse   │     │  (Daphne/   │     │             │
│   proxy)    │     │   ASGI)     │     └─────────────┘
└─────────────┘     └─────────────┘
       │                    │
       │                    ▼
       │            ┌─────────────┐
       │            │    Redis    │
       │            │ (cache/ws)  │
       ▼            └─────────────┘
┌─────────────┐
│  React SPA  │
│  (static)   │
└─────────────┘
```

---

## Prerequisites (All Providers)

1. **Domain**: `yala.mr` (or your domain) with DNS configured
2. **Docker & Docker Compose** installed locally for testing
3. **Frontend build**: Run `cd frontend && npm run build` before deploying
4. **Environment variables**: Copy `.env.production` and fill in real values
5. **Generate a secret key**:
   ```bash
   python -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"
   ```

---

## Local Testing with Docker Compose

```bash
# Build the frontend
cd frontend && npm install && npm run build && cd ..

# Start all services
docker-compose up --build -d

# Check logs
docker-compose logs -f django

# Run migrations manually (if needed)
docker-compose exec django python manage.py migrate

# Create superuser
docker-compose exec django python manage.py createsuperuser

# Stop services
docker-compose down
```

---

## Option 1: DigitalOcean (Docker Droplet)

### Prerequisites
- DigitalOcean account
- SSH key configured
- Domain pointing to Droplet IP

### Step-by-Step

1. **Create a Droplet**:
   - Image: Docker on Ubuntu 22.04
   - Size: 2GB RAM / 1 vCPU minimum (4GB recommended)
   - Region: closest to Mauritania (e.g., Frankfurt or London)

2. **SSH into the Droplet**:
   ```bash
   ssh root@YOUR_DROPLET_IP
   ```

3. **Clone the repository**:
   ```bash
   git clone https://github.com/YOUR_USERNAME/taxi-booking.git /opt/yala
   cd /opt/yala
   ```

4. **Configure environment**:
   ```bash
   cp backend/taxi/.env.production backend/taxi/.env
   nano backend/taxi/.env  # Fill in real values
   ```

5. **Build frontend**:
   ```bash
   cd frontend && npm install && npm run build && cd ..
   ```

6. **Deploy**:
   ```bash
   docker-compose up --build -d
   ```

7. **Set up SSL with Certbot**:
   ```bash
   # Install certbot
   apt install certbot python3-certbot-nginx -y

   # Get certificate (stop nginx first)
   docker-compose stop nginx
   certbot certonly --standalone -d yala.mr -d www.yala.mr -d api.yala.mr
   docker-compose start nginx
   ```

   Then update `nginx/nginx.conf` to enable the HTTPS server block and uncomment the HTTP redirect.

8. **Set up auto-renewal**:
   ```bash
   echo "0 0 * * * certbot renew --pre-hook 'docker-compose -f /opt/yala/docker-compose.yml stop nginx' --post-hook 'docker-compose -f /opt/yala/docker-compose.yml start nginx'" | crontab -
   ```

### Monitoring
- Use DigitalOcean Monitoring (built-in)
- Add UptimeRobot for endpoint monitoring
- Check logs: `docker-compose logs -f --tail=100 django`

---

## Option 2: AWS (EC2 + Docker)

### Prerequisites
- AWS account
- AWS CLI configured
- Security group allowing ports 80, 443, 22

### Step-by-Step

1. **Launch EC2 instance**:
   - AMI: Amazon Linux 2023 or Ubuntu 22.04
   - Instance type: t3.small minimum (t3.medium recommended)
   - Storage: 30GB gp3
   - Security group: Allow HTTP (80), HTTPS (443), SSH (22)

2. **Install Docker**:
   ```bash
   # Amazon Linux 2023
   sudo yum install docker -y
   sudo systemctl start docker
   sudo systemctl enable docker
   sudo usermod -aG docker ec2-user

   # Install Docker Compose
   sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
   sudo chmod +x /usr/local/bin/docker-compose
   ```

3. **Clone and configure** (same as DigitalOcean steps 3-5)

4. **Deploy**:
   ```bash
   docker-compose up --build -d
   ```

5. **SSL with Certbot**:
   ```bash
   sudo yum install certbot -y
   # Same certbot steps as DigitalOcean
   ```

6. **Optional: Use RDS for PostgreSQL**:
   - Create an RDS PostgreSQL 15 instance
   - Update `DATABASE_URL` in `.env`:
     ```
     DATABASE_URL=postgres://yala_user:PASSWORD@your-rds-endpoint.amazonaws.com:5432/yala_db
     DATABASE_SSL_REQUIRE=True
     ```
   - Remove the `postgres` service from `docker-compose.yml`

7. **Optional: Use ElastiCache for Redis**:
   - Create an ElastiCache Redis cluster
   - Update `REDIS_URL` in `.env`
   - Remove the `redis` service from `docker-compose.yml`

### Monitoring
- CloudWatch for metrics and alarms
- CloudWatch Logs for container logs
- Set up SNS alerts for high CPU/memory

---

## Option 3: Render

### Prerequisites
- Render account (https://render.com)
- GitHub repository connected

### Step-by-Step

1. **Create a PostgreSQL database**:
   - Go to Render Dashboard → New → PostgreSQL
   - Name: `yala-db`
   - Plan: Starter ($7/mo) or Standard
   - Copy the Internal Database URL

2. **Create a Redis instance**:
   - Go to Render Dashboard → New → Redis
   - Name: `yala-redis`
   - Plan: Starter ($10/mo)
   - Copy the Internal Redis URL

3. **Create a Web Service (Django)**:
   - Go to Render Dashboard → New → Web Service
   - Connect your GitHub repo
   - Root Directory: `backend/taxi`
   - Runtime: Docker
   - Plan: Starter ($7/mo) or Standard

4. **Set environment variables** in Render dashboard:
   ```
   DJANGO_SECRET_KEY=<generated-key>
   DJANGO_DEBUG=False
   DJANGO_ALLOWED_HOSTS=yala-api.onrender.com,yala.mr
   DATABASE_URL=<internal-database-url-from-step-1>
   REDIS_URL=<internal-redis-url-from-step-2>
   CORS_ALLOWED_ORIGINS=https://yala.mr,https://yala-frontend.onrender.com
   CSRF_TRUSTED_ORIGINS=https://yala.mr,https://yala-frontend.onrender.com
   SECURE_SSL_REDIRECT=False
   ```
   (Render handles SSL termination, so disable `SECURE_SSL_REDIRECT`)

5. **Create a Static Site (Frontend)**:
   - Go to Render Dashboard → New → Static Site
   - Root Directory: `frontend`
   - Build Command: `npm install && npm run build`
   - Publish Directory: `build`

6. **Add custom domain**:
   - In each service settings, add your custom domain
   - Configure DNS CNAME records as instructed by Render

### Monitoring
- Render provides built-in logging and metrics
- Set up health check endpoint: `/api/health/`
- Use Render notifications for deploy failures

---

## Option 4: Railway

### Prerequisites
- Railway account (https://railway.app)
- GitHub repository connected

### Step-by-Step

1. **Create a new project** on Railway

2. **Add services**:
   - Click "New Service" → "GitHub Repo" (select your repo)
   - Click "New Service" → "Database" → PostgreSQL
   - Click "New Service" → "Database" → Redis

3. **Configure the Django service**:
   - Root Directory: `backend/taxi`
   - Start Command: `sh -c "python manage.py migrate && python manage.py collectstatic --noinput && daphne -b 0.0.0.0 -p $PORT taxi.asgi:application"`

4. **Set environment variables**:
   ```
   DJANGO_SECRET_KEY=<generated-key>
   DJANGO_DEBUG=False
   DJANGO_ALLOWED_HOSTS=${{RAILWAY_PUBLIC_DOMAIN}},yala.mr
   DATABASE_URL=${{Postgres.DATABASE_URL}}
   REDIS_URL=${{Redis.REDIS_URL}}
   CORS_ALLOWED_ORIGINS=https://yala.mr
   CSRF_TRUSTED_ORIGINS=https://yala.mr
   SECURE_SSL_REDIRECT=False
   PORT=8000
   ```

5. **Deploy the frontend**:
   - Add another service from the same repo
   - Root Directory: `frontend`
   - Build Command: `npm install && npm run build`
   - Use Railway's static hosting or serve via Nginx

6. **Add custom domain**:
   - In service settings → Networking → Custom Domain
   - Add CNAME record in your DNS

### Monitoring
- Railway provides built-in observability
- View logs in real-time from the dashboard
- Set up deploy notifications via webhooks

---

## Post-Deployment Checklist

- [ ] Run migrations: `python manage.py migrate`
- [ ] Create superuser: `python manage.py createsuperuser`
- [ ] Verify static files are served correctly
- [ ] Test WebSocket connections (`/ws/`)
- [ ] Verify HTTPS is working (check certificate)
- [ ] Test email sending (password reset flow)
- [ ] Verify CORS is configured correctly (frontend can call API)
- [ ] Set up database backups (daily)
- [ ] Configure log rotation
- [ ] Set up uptime monitoring (UptimeRobot, Better Uptime, etc.)
- [ ] Load test with expected traffic patterns
- [ ] Verify rate limiting is working

---

## Database Backups

### Docker Compose (manual)
```bash
# Backup
docker-compose exec postgres pg_dump -U yala_user yala_db > backup_$(date +%Y%m%d).sql

# Restore
docker-compose exec -T postgres psql -U yala_user yala_db < backup_20240101.sql
```

### Automated backups (cron)
```bash
# Add to crontab
0 2 * * * docker-compose -f /opt/yala/docker-compose.yml exec -T postgres pg_dump -U yala_user yala_db | gzip > /opt/backups/yala_$(date +\%Y\%m\%d).sql.gz
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| 502 Bad Gateway | Check if Django container is running: `docker-compose ps` |
| Static files 404 | Run `collectstatic` and verify nginx volume mounts |
| WebSocket fails | Ensure nginx has `proxy_http_version 1.1` and upgrade headers |
| Database connection refused | Verify `DATABASE_URL` and that postgres container is healthy |
| CORS errors | Check `CORS_ALLOWED_ORIGINS` matches your frontend URL exactly |
| SSL redirect loop | Set `SECURE_SSL_REDIRECT=False` if proxy handles SSL |

---

## Scaling Considerations

- **Horizontal scaling**: Run multiple Django containers behind a load balancer
- **Database**: Move to managed PostgreSQL (RDS, Cloud SQL, Render Postgres)
- **Redis**: Move to managed Redis (ElastiCache, Upstash, Render Redis)
- **CDN**: Put Cloudflare or AWS CloudFront in front of nginx for static assets
- **Media storage**: Move to S3/Spaces with django-storages for user uploads
