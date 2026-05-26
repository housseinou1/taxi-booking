# Sakho Express Deployment Checklist

## What is prepared

- Django can now use production environment variables.
- React can point to a hosted backend with `REACT_APP_API_URL`.
- Static files are ready for production with WhiteNoise when installed.
- HTTPS security settings turn on automatically when `DJANGO_DEBUG=False`.

## Backend environment

Copy `backend/taxi/.env.example` to `.env` on the server and fill real values:

```env
DJANGO_DEBUG=False
DJANGO_SECRET_KEY=your-long-random-secret
DJANGO_ALLOWED_HOSTS=api.yourdomain.com
CORS_ALLOW_ALL_ORIGINS=False
CORS_ALLOWED_ORIGINS=https://yourdomain.com
CSRF_TRUSTED_ORIGINS=https://api.yourdomain.com,https://yourdomain.com
DATABASE_URL=postgres://USER:PASSWORD@HOST:5432/DBNAME
```

## Frontend environment

Copy `frontend/.env.production.example` to `frontend/.env.production` and set:

```env
REACT_APP_API_URL=https://api.yourdomain.com
REACT_APP_WS_URL=wss://api.yourdomain.com/ws/rides/
```

Then build:

```bash
cd frontend
npm install
npm run build
```

## Backend deploy commands

```bash
cd backend/taxi
pip install -r requirements.txt
python manage.py migrate
python manage.py collectstatic --noinput
daphne -b 0.0.0.0 -p 8000 taxi.asgi:application
```

## Still required before public launch

- Buy or connect a domain.
- Choose hosting for backend and database.
- Upload the React build to a static host.
- Put backend behind HTTPS.
- Add real payment provider credentials.
- Configure real push notifications for closed/background app alerts.
