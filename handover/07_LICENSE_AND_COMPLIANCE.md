# Yala Enterprise Handover — License & Compliance

**Document ID:** HANDOVER-07  
**Version:** 1.1.0  
**Date:** 2026-07-21

---

## Open-source licenses

Yala relies on open-source frameworks and libraries. License files exist in respective `node_modules` and Python package directories.

### Backend (Python) — representative

| Dependency | Version | License |
|------------|:-------:|---------|
| Django | 4.2.7 | BSD-3-Clause |
| Django REST Framework | 3.17.1 | BSD-3-Clause |
| djangorestframework-simplejwt | 5.5.1 | MIT |
| Celery | 5.6.3 | BSD-3-Clause |
| Channels / Daphne | 4.x | BSD-3-Clause |
| pandas / numpy | 2.x | BSD-3-Clause |
| pillow | 10.4.0 | HPND |
| cryptography | 48.0.0 | Apache-2.0 / BSD |
| PyJWT | 2.12.1 | MIT |
| stripe | 15.1.0 | MIT |
| requests | 2.32.3 | Apache-2.0 |

### Frontend & mobile (JavaScript)

| Dependency | License |
|------------|---------|
| React | MIT |
| Ionic / Capacitor | MIT |
| Create React App tooling | MIT |

### Infrastructure

| Component | License |
|-----------|---------|
| PostgreSQL | PostgreSQL License |
| Redis | BSD-3-Clause |
| nginx | BSD-2-Clause |
| Docker | Apache-2.0 |

**Action before public launch:** Generate consolidated `THIRD_PARTY_LICENSES.txt` or SBOM using `pip-licenses` and `npm-license-crawler`.

**Reference:** `handover/03_DEPENDENCY_REGISTER.md`

---

## Privacy

### Privacy policy

| Item | Detail |
|------|--------|
| URL | https://www.yalataxi.live/privacy |
| Linked from | App stores, registration flows, admin portal |
| Must cover | Data collected, purpose, sharing, retention, user rights, contact |

### Data collected (summary)

| Category | Examples | Purpose |
|----------|----------|---------|
| Identity | Email, phone, name, national ID | Account, verification |
| Location | GPS during trips/deliveries | Matching, safety, ETA |
| Payment | Wallet, transaction history | Billing, payouts |
| Documents | License, insurance (drivers) | Compliance |
| Usage | Trip history, ratings | Service, analytics |

### Data minimization

- Collect only what is needed for the service
- Driver documents access restricted to authorized admins
- Location retained per operational and legal requirements

**Operations reference:** `operations/07_TRUST_AND_SAFETY_MANUAL.md` §6 (evidence handling)

---

## Terms of service

| Item | Detail |
|------|--------|
| URL | https://www.yalataxi.live/terms |
| Driver agreement | Version tracked via `legal.constants.DRIVER_AGREEMENT_VERSION` |
| E-signatures | `DriverProfile.driver_signature_image`, legal compliance logs |
| Merchant/courier agreements | `legal` app — e-sign endpoints per role |

---

## Google Play compliance

| Requirement | Status | Notes |
|-------------|--------|-------|
| Privacy Policy URL | ✅ Live | `https://www.yalataxi.live/privacy` |
| Data Safety form | ⚠️ Pending | Complete in Play Console |
| Account deletion | ⚠️ Pending attestation | In-app flow exists; verify and declare |
| App signing | ✅ | `yala-release.jks`, `yala-upload-key.jks` |
| Version codes | ✅ | Rider 19 / Driver 38 / Delivery 6 |
| Content rating | ✅ | Maps & Navigation |
| Store screenshots | ⚠️ | Copy in `store-listing.md`; upload pending |
| Target SDK | ⚠️ | Verify latest Play requirements |

**Apps:** Rider 1.2.7 · Driver 1.2.23 · Delivery 1.0.4 (closed testing tracks)

---

## Apple App Store compliance

| Requirement | Status | Notes |
|-------------|--------|-------|
| App metadata | ❌ | Not submitted |
| Screenshots | ❌ | Not created |
| Privacy nutrition labels | ❌ | Not submitted |
| Review information | ❌ | Not provided |
| Account deletion | ❌ | Must implement and declare |
| Sign in with Apple | ⚠️ | Evaluate if social login added |

**CI pipelines exist:** `.github/workflows/ios-*.yml` — builds not yet submitted.

**Decision required:** Include iOS in v1.0 or formally defer to v1.1.

---

## Data protection

| Topic | Implementation / recommendation |
|-------|--------------------------------|
| Lawful basis | Contract (service) + consent (marketing, location) |
| User consent | Phone verification; explicit terms/privacy acceptance at registration |
| Sensitive data | Driver ID, license — HTTPS in transit; encrypted storage at rest (host/provider) |
| Location | GPS during active trips; limited post-trip retention |
| Payments | Cards via Stripe — no raw card data in Yala DB |
| Audit trail | `security.AuditLog`, `SafetyResponseLog`, finance audit exports |
| Breach response | `operations/09_BUSINESS_CONTINUITY_PLAN.md` §6 (cyberattack) |
| Account deletion | In-app flow; cascade/anonymize ride, payment, document data |
| Compliance module | Phase 36 — `PolicyDocument`, `ComplianceAudit`, risk register |

### Recommended retention

| Data type | Retention |
|-----------|-----------|
| Admin audit logs | 7 years |
| Ride/delivery trip data | 5 years |
| Payment/financial records | 10 years |
| Driver documents | Account lifetime + 2 years |
| Server access logs | 1 year |

---

## Audit requirements

| System | Content | Export |
|--------|---------|--------|
| `security.AuditLog` | Admin, payment, status changes | Finance Ops audit tab |
| `legal.LegalComplianceLog` | E-signatures, acceptances | Legal admin |
| `safety.SafetyResponseLog` | SOS/incident actions | Trust & Safety reports |
| Finance transactions | Wallet, withdrawals, refunds | Finance Ops exports |
| Compliance module | Policy acknowledgements, audits | `/admin/compliance-governance` |

**Requirement:** All modifying admin actions logged via `security.services.audit_service.log_from_request`.

**Reference:** `engineering/04_SECURITY_ARCHITECTURE.md` §5

---

## Compliance checklist before public launch

- [ ] Generate SBOM / `THIRD_PARTY_LICENSES.txt`
- [ ] Finalize privacy policy (EN / FR / AR)
- [ ] Finalize terms of service (EN / FR / AR)
- [ ] Complete Google Play Data Safety form
- [ ] Verify account deletion on Android
- [ ] Submit Apple metadata (if iOS in scope)
- [ ] Document data retention and purge procedures
- [ ] PCI-DSS scoping review with Stripe
- [ ] SMS sender ID registration (if required locally)
- [ ] Legal review of Compliance & Governance policy documents
- [ ] Accessibility review for store requirements

---

## Cross-references

- Dependency register: `handover/03_DEPENDENCY_REGISTER.md`
- Risk register (compliance): `handover/05_RISK_REGISTER.md` § Compliance
- Compliance module report: `release/PHASE36_COMPLIANCE_GOVERNANCE_CENTER_REPORT.md`
- Store listing: `store-listing.md`
- Launch decision: `release/LAUNCH_DECISION.md`
