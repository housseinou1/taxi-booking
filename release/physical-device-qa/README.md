# Physical Device QA Package — RC2

Manual QA materials for **production physical Android testing**. No emulator sign-off.

## Documents

| File | Purpose |
|------|---------|
| [PHYSICAL_DEVICE_QA_CHECKLIST.md](./PHYSICAL_DEVICE_QA_CHECKLIST.md) | **Printable master checklist** — all tests with preconditions, steps, expected results, Pass/Fail, screenshot flags |
| [BUG_REPORT_TEMPLATE.md](./BUG_REPORT_TEMPLATE.md) | **Per-bug report form** + session bug log rollup |

## Builds

| App | Version | Package |
|-----|---------|---------|
| Rider | **1.2.7** (19) | `com.yala.rider.mr` |
| Driver | **1.2.23** (38) | `com.yala.driver.mr` |
| Delivery | **1.0.4** (6) | `com.yala.delivery.mr` |

## Test counts

| App | Tests |
|-----|:-----:|
| Rider | 31 |
| Driver | 27 |
| Delivery | 18 |
| Cross-app paired | 4 |

## Before you start

1. Run `python scripts/rc2-mobile-api-smoke.py` on production API.
2. Install release/internal-track APKs on **physical** devices.
3. Create screenshot folder: `release/physical-device-qa/screenshots/<YYYY-MM-DD>/`
4. Use two devices for paired ride tests (Rider + Driver).

## Print

Open `PHYSICAL_DEVICE_QA_CHECKLIST.md` → **Print / Save as PDF** (disable headers/footers for clean pages).

## Sign-off

Complete checklist summaries and final certification table in Part D of the checklist. File P0 bugs immediately using the bug template.
