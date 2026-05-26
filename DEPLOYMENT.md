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
APP_FEE_PERCENT=30
BANKILY_MERCHANT_ID=provided-by-bankily
BANKILY_API_KEY=provided-by-bankily
MASRAVI_MERCHANT_ID=provided-by-masravi
MASRAVI_API_KEY=provided-by-masravi
SEDDAD_MERCHANT_ID=provided-by-seddad
SEDDAD_API_KEY=provided-by-seddad
GOOGLE_MAPS_API_KEY=optional-production-key
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
- Add real Bankily, Masravi, Seddad, and bank payout provider credentials.
- Ask each payment provider for API documentation, webhook signing secrets, test credentials, and production approval.
- Configure real push notifications for closed/background app alerts.
- Create final company legal text for Terms, Privacy, and driver agreement before publishing to the public.
- Test every role on a real phone: rider request, driver accept, payment, tip, rating, withdrawal, block/reintegrate, and expired document rejection.

## Current local readiness

- Rider, Driver, and Admin apps are working locally and over same Wi-Fi.
- Owner commission is configured at 30%.
- Owner payout method can be saved in Admin Payments.
- Driver withdrawals can be requested and approved.
- Legal/support screens exist at `/terms`, `/privacy`, and `/support`.
- Terms now include rider terms, driver agreement, payment rules, ratings/disputes, and emergency/support use.
- Privacy now includes data protection rules, access control, retention/correction, and production security requirements.
- Support now includes emergency process, rider support, driver support, admin support, and payment/payout support.
- The app can be installed as a PWA from the browser.

## Security and legal launch checklist

- Confirm final company name, owner name, physical address, support phone, and support email.
- Have a local legal professional review the rider terms, driver agreement, privacy policy, data retention rules, and payout/payment process.
- Create an admin operating procedure for emergency reports, rider complaints, driver complaints, document review, blocked accounts, and reintegration.
- Limit admin access to trusted people only.
- Use HTTPS, strong passwords, private API keys, database backups, and provider webhook verification in production.
- Keep National ID documents, driver documents, payment records, and payout information private and only accessible for verification, support, safety, accounting, or legal needs.

## External accounts still needed

- Hosting account for Django backend.
- PostgreSQL database.
- Static frontend hosting.
- Domain and SSL/HTTPS.
- Bankily merchant/API account.
- Masravi merchant/API account.
- Seddad merchant/API account.
- Bank payout provider or manual bank transfer process.
- Google Maps API key if replacing OpenStreetMap/OSRM.
- Push notification provider if drivers must receive alerts when the app is closed.
