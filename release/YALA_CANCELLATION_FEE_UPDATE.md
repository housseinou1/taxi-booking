# YALA — Cancellation Fee Update

## New policy

| Scenario | Fee |
|---|---|
| Cancel within the free cancellation window (2 minutes after ride creation) | 0 MRU |
| Rider cancels after driver has accepted / is en route (`accepted`, `driver_arriving`) | 50 MRU |
| Rider cancels after driver has arrived and the free wait period has expired | 75 MRU |
| Driver marks a valid rider no-show | 75 MRU charged to rider, 75 MRU driver compensation |
| Driver-side standard cancellation penalty | 150 MRU (unchanged) |

## Files changed

| File | Change |
|---|---|
| `backend/taxi/taxi/market.py` | Updated no-show fees to 75/75 and added `cancellation` config block with free window, en route, arrived, and driver penalty values. |
| `backend/taxi/taxi/rides/views.py` | `cancel_ride` now applies tiered rider cancellation fees: 0 (2-min window), 50 (en route), 75 (arrived + free wait expired). No-show and driver-side logic unchanged. |
| `frontend/src/marketConfig.js` | Added `cancellation` object and updated `noShow` rider fee and driver compensation to 75. |
| `frontend/src/components/RideCancellationModal.js` | Dynamic fee text now reads from `MARKET` and reflects the 0/50/75 policy for riders and the 75 no-show fee for drivers. |
| `frontend/src/rider/components/RideTracker.js` | Updated the in-ride cancel modal fee text to reference the 2-minute free window and up to 75 MRU. |
| `frontend/src/locales/en/translation.json` | Updated rider cancel description to the new fee policy. |
| `frontend/src/locales/fr/translation.json` | Updated French rider cancel description to the new fee policy. |
| `backend/taxi/tests/rides/test_no_show_cancel.py` | Updated no-show fee and driver compensation assertions to 75 MRU. |

## What was preserved

- All cancellation state transitions (`cancelled`, `rider_no_show`).
- Driver GPS validation for no-show.
- Waiting timer (free: 3 min, max: 5 min).
- No-show unlock conditions (Arrived + max wait + near pickup).
- Driver cancellation penalty of 150 MRU.
- Admin cancellations remain free.

## Validation

- Targeted backend test: `python manage.py test taxi.tests.rides.test_no_show_cancel`
- Frontend build: `npm run build` in `driver-app` (which builds the `frontend` React app).
