# Release A — Employee ID Cards (production activation package)

**Branch:** `release/coordinated-admin-moosyl-rc1`  
**Production status (2026-11-07):** **NOT DEPLOYED** — UI gated (`REACT_APP_ID_CARD_ADMIN_UI_ENABLED=0`); backend routes/migration **not** on live API.  
**CEO authorization required:** **G1-ID-CARDS** (separate from Moosyl G2).

---

## 1. Completed functionality

| Requirement | Status | Evidence |
|-------------|--------|----------|
| Registration & profiles | ✅ | `StaffEmployee`, HR APIs, `EmployeeProfile.js` |
| Unique ID numbers | ✅ | `YALA-EMP-######`; legacy numbers preserved |
| Photos & job titles | ✅ | `photo_key`, serializers, profile UI |
| Department & employment status | ✅ | Model + dashboard `by_department` |
| Card design (green/gold) | ✅ | `card_pdf.py`, CR80 PDF, vector Mauritania flag |
| YALA logo + official flag | ✅ | `yala_logo.png`, `draw_mauritania_flag()` |
| QR generation | ✅ | `qrcode`, signed tokens (`verification_tokens.py`) |
| Public QR verify (minimal payload) | ✅ | `views_verification.py` — **404 until** `PUBLIC_QR_VERIFICATION_ENABLED` |
| Printable PDF | ✅ | `card_pdf` endpoint, HR-only, audited |
| Expiry & renewal | ✅ | `CardStatus`, renewal tests in `test_number_generation` |
| Lost / suspended / revoked | ✅ | Status enum + dashboard KPIs (`lost_cards`, `suspended_cards`) |
| Admin RBAC | ✅ | HR Staff / HR Manager / Administrator groups |
| Clock-in / break integration | ✅ | `test_attendance`, `test_scheduler`, verification hourly APIs |
| Admin dashboard | ✅ | `EmployeeIdCardDashboard.js`, `/employees/id-cards/dashboard/` |
| CEO signature on card back | ✅ | `IdCardOfficialSettings`, `CeoIdCardSignaturePanel` |

**Backend automated tests (executed 2026-11-07):** `python manage.py test employees.tests` → **320 passed**.

**Frontend automated tests:** Employee/Moosyl-related Jest → **99 passed**, **1 flaky** (`EmployeeProfile.test.js` under parallel workers; **passes in isolation**).

---

## 2. Remaining blockers

| Blocker | Owner |
|---------|--------|
| Production backend deploy (employees app + URLs) | Ops + **G1-ID-CARDS** |
| Production `migrate employees 0010` only | DBA + **G1-ID-CARDS** |
| Frontend build with `REACT_APP_ID_CARD_ADMIN_UI_ENABLED=1` (keep Moosyl UI off) | Release engineer |
| Staging browser QA (PDF print, QR scan, RBAC) | HR/CEO on staging |
| Staging host | Infra (not provisioned) |
| Policy: enable `PUBLIC_QR_VERIFICATION_ENABLED` on prod | CEO |

---

## 3. Required database migrations (Release A only)

| App | Migration | Prod impact |
|-----|-----------|-------------|
| `employees` | **`0010_idcardofficialsettings`** | New singleton settings table (CEO signature metadata). **No payment/wallet tables.** |

**Do not run `payments.0022` if activating ID cards only.**

Other coordinated migrations (`operations.0016`, `api_gateway.0003`) are **not required** for ID-card-only cut unless ops chooses a single backend image — scope separately.

---

## 4. Security verification

| Check | Result |
|-------|--------|
| Public verify off by default | ✅ `PUBLIC_QR_VERIFICATION_ENABLED=False` |
| Public payload redaction | ✅ Design + `test_card_verification_service`, token tests |
| PDF excludes DOB / national ID | ✅ `test_card_pdf_endpoint`, `test_dob_privacy` |
| HR-only PDF/QR endpoints | ✅ Permission classes on views |
| Rate limit on public verify | ✅ 10/min per IP when enabled |
| Audit on card/PDF access | ✅ `test_permissions_and_audit` |

---

## 5. Test results (this pass)

```text
employees.tests                           320 OK
payments (Moosyl slice, sanity)             70 OK  (not required for Release A)
wallet_reference_inventory (local)        0 duplicate groups
```

Log artifact: `engineering/verification-runs/phase4-20261107.txt` (after script run).

---

## 6. Deployment procedure (Release A)

1. **Freeze** commit on `release/coordinated-admin-moosyl-rc1`.  
2. **Production DB backup** (verified checksum) — G3 discipline.  
3. Deploy **backend** image/code containing `employees` views + `0010`.  
4. `python manage.py migrate employees` — **only through 0010**.  
5. Health: `GET /api/health/ready/` **200**.  
6. Build frontend:
   ```powershell
   $env:REACT_APP_PROD_LEGACY_BACKEND='1'
   $env:REACT_APP_ID_CARD_ADMIN_UI_ENABLED='1'
   $env:REACT_APP_MOOSYL_UI_ENABLED='0'
   npm run build:web
   ..\scripts\verify-web-build.ps1 -BuildDir .\build
   ```
7. `scripts/deploy-admin-redesign.ps1 -BuildDir .\build`  
8. Smoke (authenticated CEO/HR): `/admin/employees/id-cards`, dashboard API **200**, PDF download **200**.

**Do not** set `PAYMENTS_LIVE_MODE` or enable Moosyl rider methods in this release.

---

## 7. Backup and rollback

| Layer | Procedure |
|-------|-----------|
| Frontend | `scripts/rollback-admin-redesign.sh /home/yala/pre-website-deploy-<STAMP>` |
| Backend | Redeploy previous container/tag; `release/ROLLBACK_PLAN.md` |
| DB | **0010 is additive** — rollback is normally **revert app**, not drop table without DBA plan |

Pre-deploy frontend backup is automatic in `deploy-admin-redesign.ps1`.

---

## 8. Estimated activation time

| Scenario | Duration |
|----------|----------|
| Staging already running + CEO G1-ID-CARDS | **1–2 business days** |
| Staging must be built first | **1–2 weeks** |

---

## 9. GO / NO-GO recommendation

| Environment | Verdict |
|-------------|---------|
| **Local / RC code** | **GO** for staging validation |
| **Production** | **NO-GO** until G1-ID-CARDS + staging sign-off |

**Independent of Moosyl:** **Yes** — Release A does not require `payments.0022` or live settlement.
