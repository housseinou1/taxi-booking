# Staging verification checklist (coordinated release)

**Policy:** One release = **backend + `build:web` + migrations + Moosyl** (not frontend-only).  
**Mark PASS only after execution on staging** — this file is a template.

| # | Area | Executed | Result | Notes |
|---|------|:--------:|:------:|-------|
| 1 | CEO admin permissions | ☐ | | `admin-routes-auth.cjs` + manual |
| 2 | HR admin permissions | ☐ | | `hr@pilot.yala.test` or staging HR |
| 3 | Finance permissions | ☐ | | payments, approvals, Moosyl panel read-only |
| 4 | Operations permissions | ☐ | | fleet, drivers, cities |
| 5 | Employee ID card workflow | ☐ | | register → sign → CEO → PDF → QR |
| 6 | Rider book + pay (sandbox) | ☐ | | Moosyl simulate-transfer |
| 7 | Driver accept + wallet | ☐ | | no live payout |
| 8 | Delivery courier + pay | ☐ | | 80/20 on payment row |
| 9 | Moosyl webhook replay | ☐ | | idempotent duplicate |
| 10 | Failed payment ignored | ☐ | | |
| 11 | Finance reconciliation sample | ☐ | | |
| 12 | Migrations on staging clone | ☐ | | incl. payments 0022 dedupe |
| 13 | Rollback drill | ☐ | | G3 |
| 14 | Rider/Driver/Delivery smoke | ☐ | | `qa/_regress-smoke.cjs` on staging build |

## Local verification already run (2026-11-07)

| Check | Result |
|-------|--------|
| Django Moosyl + ID card + cities slice (61 tests) | **PASS** |
| `npm run build:web` | **PASS** |
| Mock CEO admin shell (100 routes) | **93/100** |
| Mock 4-role critical routes (15 paths) | **11/15** shell (see `/admin`, `/admin/classic`, security — session timing; fixes in progress) |
| Staging rows above | **NOT RUN** |
