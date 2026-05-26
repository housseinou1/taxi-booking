# Sakho Express Taxi Platform

Sakho Express is a Django and React taxi-booking platform for Mauritania with separate Rider, Driver, and Admin experiences.

## Current Features

- Rider app: request rides, automatic distance, live route preview, payment, tips, ratings, National ID upload, and accepted-driver details.
- Driver app: map-first dashboard, go online/offline, sound alerts, ride acceptance, driver photo, vehicle information, document uploads, document expiration checks, National ID, payout methods, and withdrawal requests.
- Admin app: driver verification, riders and drivers separated alphabetically, block/unblock, driver reintegration, driver categories, ratings, payments, owner commission, owner payout method, and driver withdrawal approval.
- Market setup: Mauritania cities including Nouakchott, Nouadhibou, Kaedi, Selibaby, Rosso, and Nouakchott-area locations.
- Platform commission: owner/app fee is set to 30%.
- PWA: the app can be opened and installed from a phone browser while testing.

## Local Development

Backend:

```bash
cd backend/taxi
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver 0.0.0.0:8000
```

Frontend:

```bash
cd frontend
npm install
npm start
```

Use the computer IP address on the same Wi-Fi to test from a phone, for example:

```text
http://192.168.12.138:3000/driver
http://192.168.12.138:3000/rider-dashboard
http://192.168.12.138:3000/admin
```

## Important Pages

- `/` Home
- `/login` Login
- `/register` Register
- `/rider-dashboard` Rider dashboard
- `/driver` Driver app
- `/admin` Admin dashboard
- `/terms` Terms and Conditions
- `/privacy` Privacy Policy
- `/support` Support and Safety

## Production Notes

See `DEPLOYMENT.md` for the launch checklist. Public launch still requires hosting, domain, HTTPS, production database, real Bankily/Masravi/Seddad credentials, bank payout setup, and final legal review.
