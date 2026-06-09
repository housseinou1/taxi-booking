#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# YALA PRODUCTION DEPLOYMENT SCRIPT
# Server: 142.93.99.142 (DigitalOcean Ubuntu 22.04)
# ═══════════════════════════════════════════════════════════════════════════════

set -e

SERVER_IP="142.93.99.142"
DOMAIN="yala.mr"
API_DOMAIN="api.yala.mr"
APP_USER="yala"
APP_DIR="/home/yala/app"
VENV_DIR="/home/yala/venv"
REPO="https://github.com/housseinou1/taxi-booking.git"
DB_NAME="yala_db"
DB_USER="yala"
DB_PASS=$(openssl rand -base64 24 | tr -dc 'a-zA-Z0-9' | head -c 20)
SECRET_KEY=$(openssl rand -base64 50 | tr -dc 'a-zA-Z0-9' | head -c 50)

echo "═══════════════════════════════════════════════"
echo "  YALA DEPLOYMENT - $SERVER_IP"
echo "═══════════════════════════════════════════════"

# ─── 1. System packages ───────────────────────────────────────────────────────
echo "[1/10] Installing system packages..."
apt update && apt upgrade -y
apt install -y python3 python3-pip python3-venv python3-dev \
    postgresql postgresql-contrib \
    redis-server \
    nginx certbot python3-certbot-nginx \
    git curl ufw supervisor \
    libpq-dev gcc

# ─── 2. Firewall ──────────────────────────────────────────────────────────────
echo "[2/10] Configuring firewall..."
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable

# ─── 3. Create app user ───────────────────────────────────────────────────────
echo "[3/10] Creating app user..."
id -u $APP_USER &>/dev/null || useradd -m -s /bin/bash $APP_USER

# ─── 4. PostgreSQL ────────────────────────────────────────────────────────────
echo "[4/10] Setting up PostgreSQL..."
sudo -u postgres psql -c "CREATE USER $DB_USER WITH PASSWORD '$DB_PASS';" 2>/dev/null || true
sudo -u postgres psql -c "CREATE DATABASE $DB_NAME OWNER $DB_USER;" 2>/dev/null || true
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;"

# ─── 5. Redis ─────────────────────────────────────────────────────────────────
echo "[5/10] Starting Redis..."
systemctl enable redis-server
systemctl start redis-server

# ─── 6. Clone repo ────────────────────────────────────────────────────────────
echo "[6/10] Cloning repository..."
rm -rf $APP_DIR
sudo -u $APP_USER git clone $REPO $APP_DIR

# ─── 7. Backend setup ─────────────────────────────────────────────────────────
echo "[7/10] Setting up backend..."
sudo -u $APP_USER python3 -m venv $VENV_DIR
sudo -u $APP_USER $VENV_DIR/bin/pip install --upgrade pip
sudo -u $APP_USER $VENV_DIR/bin/pip install -r $APP_DIR/backend/taxi/requirements.txt
sudo -u $APP_USER $VENV_DIR/bin/pip install psycopg2-binary channels-redis gunicorn daphne

# Create .env
cat > $APP_DIR/backend/taxi/.env << EOF
DJANGO_DEBUG=False
DJANGO_SECRET_KEY=$SECRET_KEY
DJANGO_ALLOWED_HOSTS=$SERVER_IP,$DOMAIN,$API_DOMAIN
DATABASE_URL=postgres://$DB_USER:$DB_PASS@localhost:5432/$DB_NAME
REDIS_URL=redis://localhost:6379/0
CORS_ALLOW_ALL_ORIGINS=False
CORS_ALLOWED_ORIGINS=https://$DOMAIN,http://$DOMAIN,http://$SERVER_IP
CSRF_TRUSTED_ORIGINS=https://$DOMAIN,https://$API_DOMAIN,http://$SERVER_IP
FRONTEND_URL=https://$DOMAIN
SECURE_SSL_REDIRECT=False
APP_FEE_PERCENT=30
EOF

chown $APP_USER:$APP_USER $APP_DIR/backend/taxi/.env

# Migrate & collectstatic
cd $APP_DIR/backend/taxi
sudo -u $APP_USER $VENV_DIR/bin/python manage.py migrate --noinput
sudo -u $APP_USER $VENV_DIR/bin/python manage.py collectstatic --noinput

# ─── 8. Frontend build ─────────────────────────────────────────────────────────
echo "[8/10] Building frontend..."
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt install -y nodejs
cd $APP_DIR/frontend
sudo -u $APP_USER npm ci --legacy-peer-deps
sudo -u $APP_USER REACT_APP_API_URL=http://$SERVER_IP:8000 npm run build

# ─── 9. Systemd services ──────────────────────────────────────────────────────
echo "[9/10] Creating systemd services..."

# Backend (Daphne for HTTP + WebSocket)
cat > /etc/systemd/system/yala-backend.service << EOF
[Unit]
Description=Yala Backend (Daphne)
After=network.target postgresql.service redis-server.service

[Service]
User=$APP_USER
Group=$APP_USER
WorkingDirectory=$APP_DIR/backend/taxi
Environment="PATH=$VENV_DIR/bin"
ExecStart=$VENV_DIR/bin/daphne -b 127.0.0.1 -p 8000 taxi.asgi:application
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable yala-backend
systemctl start yala-backend

# ─── 10. Nginx ─────────────────────────────────────────────────────────────────
echo "[10/10] Configuring Nginx..."

cat > /etc/nginx/sites-available/yala << EOF
server {
    listen 80;
    server_name $SERVER_IP $DOMAIN $API_DOMAIN;

    client_max_body_size 10M;

    # Frontend (React build)
    location / {
        root $APP_DIR/frontend/build;
        index index.html;
        try_files \$uri \$uri/ /index.html;
    }

    # API proxy
    location /auth/ { proxy_pass http://127.0.0.1:8000; include proxy_params; }
    location /rides/ { proxy_pass http://127.0.0.1:8000; include proxy_params; }
    location /drivers/ { proxy_pass http://127.0.0.1:8000; include proxy_params; }
    location /payments/ { proxy_pass http://127.0.0.1:8000; include proxy_params; }
    location /notifications/ { proxy_pass http://127.0.0.1:8000; include proxy_params; }
    location /chat/ { proxy_pass http://127.0.0.1:8000; include proxy_params; }
    location /cities/ { proxy_pass http://127.0.0.1:8000; include proxy_params; }
    location /features/ { proxy_pass http://127.0.0.1:8000; include proxy_params; }
    location /intercity/ { proxy_pass http://127.0.0.1:8000; include proxy_params; }
    location /shifts/ { proxy_pass http://127.0.0.1:8000; include proxy_params; }
    location /incentives/ { proxy_pass http://127.0.0.1:8000; include proxy_params; }
    location /promotions/ { proxy_pass http://127.0.0.1:8000; include proxy_params; }
    location /safety/ { proxy_pass http://127.0.0.1:8000; include proxy_params; }
    location /locations/ { proxy_pass http://127.0.0.1:8000; include proxy_params; }
    location /deliveries/ { proxy_pass http://127.0.0.1:8000; include proxy_params; }
    location /admin/ { proxy_pass http://127.0.0.1:8000; include proxy_params; }

    # Media files
    location /media/ {
        alias $APP_DIR/backend/taxi/media/;
    }

    # Static files
    location /static/ {
        alias $APP_DIR/backend/taxi/staticfiles/;
    }

    # WebSocket
    location /ws/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
    }
}
EOF

# Create proxy_params if missing
cat > /etc/nginx/proxy_params << 'EOF'
proxy_set_header Host $host;
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
EOF

rm -f /etc/nginx/sites-enabled/default
ln -sf /etc/nginx/sites-available/yala /etc/nginx/sites-enabled/yala
nginx -t && systemctl restart nginx

# ─── Done! ─────────────────────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════"
echo "  ✅ YALA DEPLOYED SUCCESSFULLY!"
echo "═══════════════════════════════════════════════"
echo ""
echo "  🌐 App:      http://$SERVER_IP"
echo "  🔌 API:      http://$SERVER_IP/auth/login/"
echo "  🗄️  Database: $DB_NAME (user: $DB_USER)"
echo "  🔑 DB Pass:  $DB_PASS"
echo "  🔐 Secret:   $SECRET_KEY"
echo ""
echo "  Next steps:"
echo "  1. Point domain $DOMAIN to $SERVER_IP"
echo "  2. Run: certbot --nginx -d $DOMAIN -d $API_DOMAIN"
echo "  3. Create admin: cd $APP_DIR/backend/taxi && $VENV_DIR/bin/python manage.py shell"
echo ""
echo "  Services:"
echo "  systemctl status yala-backend"
echo "  systemctl restart yala-backend"
echo "  journalctl -u yala-backend -f"
echo "═══════════════════════════════════════════════"
