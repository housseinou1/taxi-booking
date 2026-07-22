# YALA Version 2.0 Backlog

**Document ID:** PM-05  
**Version:** 1.0.0  
**Last updated:** 2026-07-21  
**Synchronized with:** `01_PROJECT_PORTFOLIO.md` · `04_BUG_AND_TECH_DEBT.md` · `06_PROJECT_DASHBOARD.md`

---

## Backlog summary

| Priority | Items | Total estimated effort |
|:--------:|:-----:|:---------------------:|
| P0 (v1.0.x blockers) | 4 | 6–8 weeks |
| P1 (v1.1) | 14 | 16–24 weeks |
| P2 (v1.2–v2.0) | 12 | 20+ weeks |

**Note:** Items marked **Delivered in v1.0** were built during Closed Beta (Phases 29–37) but are listed here for roadmap continuity and v2 enhancement scope.

---

## v1.0.x — Must close before public launch

| ID | Item | Business value | Effort | Priority | Dependencies | Recommended release | Status |
|----|------|----------------|:------:|:--------:|--------------|:-------------------:|--------|
| V2-001 | Physical device QA sign-off (Rider/Driver/Delivery) | Launch confidence; prevent bad reviews | S | P0 | QA devices, prod APKs | v1.0.0 Production | Open |
| V2-002 | Offsite encrypted backup + restore drill | DR compliance; investor confidence | M | P0 | DO Spaces / S3 credentials | v1.0.0 Production | Open |
| V2-003 | Deploy RC3 backend + mobile rebuild | Realizes perf & reliability fixes | S | P0 | DevOps pipeline | v1.0.0 Production | Open |
| V2-004 | Staging environment mirroring production | Safe pre-prod validation | L | P0 | Infra budget | v1.0.0 Production | Open |

---

## v1.1 — Growth & polish (0–6 months post-launch)

| ID | Item | Business value | Effort | Priority | Dependencies | Recommended release | Status |
|----|------|----------------|:------:|:--------:|--------------|:-------------------:|--------|
| V2-010 | **Referral program consolidation** | Single referral system; accurate payouts | M | P1 | Referrals app, ride payment hook | v1.1 | Partial — backend built |
| V2-011 | **Rider loyalty mobile UI** | Retention; visible points & tiers | M | P1 | Loyalty API (Phase 33) | v1.1 | Backend done |
| V2-012 | Wire referral signup to auth registration | Capture referrals at signup | S | P1 | Auth app | v1.1 | Open |
| V2-013 | Wire referral credits to checkout | Real fare discounts | M | P1 | Payments, rides | v1.1 | Open |
| V2-014 | Referral & loyalty push notifications | Engagement; expiry reminders | S | P1 | FCM, notifications | v1.1 | Open |
| V2-015 | **Apple App Store submission (Rider first)** | iOS market access | L | P1 | iOS build pipeline | v1.1 | Open |
| V2-016 | Apple App Store (Driver + Delivery) | Full iOS ecosystem | L | P1 | Rider iOS live | v1.2 | Planned |
| V2-017 | PgBouncer + connection pooling | Scale under launch traffic | M | P1 | DevOps | v1.1 | Open |
| V2-018 | Redis instance / DB separation | Stability under load | M | P1 | DevOps | v1.1 | Open |
| V2-019 | Play Integrity enforcement | Reduce fraud | S | P1 | Google Play config | v1.1 | Open |
| V2-020 | Fix core unit test suite (7 failures) | CI gate; regression safety | M | P1 | Engineering | v1.1 | Open |
| V2-021 | Partner self-service web portal | Reduce ops overhead for franchises | M | P1 | Partner Platform (Phase 32) | v1.1 | API only |
| V2-022 | Merchant portal: variants/extras UI | Restaurant menu completeness | M | P1 | Merchant Platform (Phase 31) | v1.1 | Partial |
| V2-023 | French & Arabic privacy/terms localization | Store compliance; local trust | M | P1 | Legal | v1.1 | Open |

---

## v1.2 — Revenue expansion (6–12 months)

| ID | Item | Business value | Effort | Priority | Dependencies | Recommended release | Status |
|----|------|----------------|:------:|:--------:|--------------|:-------------------:|--------|
| V2-030 | **Corporate accounts enhancement** | B2B revenue; ride policies & billing | L | P1 | Features app, Business Ops | v1.2 | Partial — v1.0 base |
| V2-031 | Corporate invoicing automation | Faster B2B sales cycle | M | P1 | Corporate accounts | v1.2 | Partial |
| V2-032 | **Airport integration** | High-value trips; tourism | L | P1 | Features/AirportLocation, dispatch | v1.2 | Planned |
| V2-033 | Airport pickup pricing & queue management | Airport revenue optimization | M | P2 | Airport integration | v1.2 | Planned |
| V2-034 | **Dynamic pricing improvements** | Margin optimization; driver supply | M | P1 | Smart Pricing (Phase 28) | v1.2 | Partial |
| V2-035 | ML-based demand forecasting | Proactive surge & driver positioning | L | P2 | AI Ops, historical data | v1.2 | Planned |
| V2-036 | Marketing campaign execution engine | Automated push/email/promo blasts | L | P1 | MarketingCampaign model | v1.2 | CRUD only today |
| V2-037 | Subscription / rider pass program | Predictable rider revenue | L | P2 | Payments, loyalty | v1.2 | Planned |
| V2-038 | Multi-language admin & ops (FR/AR) | Local ops team efficiency | M | P2 | i18n framework | v1.2 | Planned |

---

## v2.0 — Platform scale (12–24 months)

| ID | Item | Business value | Effort | Priority | Dependencies | Recommended release | Status |
|----|------|----------------|:------:|:--------:|--------------|:-------------------:|--------|
| V2-040 | **Franchise platform v2** (partner payouts automation) | National expansion via local operators | L | P1 | Partner Platform (Phase 32) | v2.0 | v1.0 base delivered |
| V2-041 | **Predictive AI operations** | Reduce ops headcount; faster incident response | XL | P1 | AI Ops, BI warehouse | v2.0 | Partial |
| V2-042 | **Full BI data warehouse + ETL** | Self-service analytics; board reporting | XL | P1 | Phase 37 design | v2.0 | Design done |
| V2-043 | Real-time ETL pipeline (rides/deliveries/payments) | Live executive dashboards | L | P1 | BI warehouse | v2.0 | Planned |
| V2-044 | **Intercity / long-distance rides** | New revenue vertical | XL | P2 | Intercity app, pricing | v2.0 | Partial model exists |
| V2-045 | **Intercity delivery / freight** | B2B logistics revenue | XL | P2 | Delivery, partners | v2.1 | Planned |
| V2-046 | White-label partner apps | Franchise brand customization | XL | P2 | Partner platform | v2.1 | Planned |
| V2-047 | Open API / developer platform | Ecosystem integrations | XL | P2 | API gateway, docs | v2.1 | Planned |
| V2-048 | Advanced fraud ML scoring | Reduce promo/referral abuse | L | P2 | Trust & Safety, BI | v2.0 | Planned |
| V2-049 | In-app chat translation (FR/AR) | Cross-language support | M | P2 | Chat app | v2.0 | Planned |
| V2-050 | Carbon / sustainability reporting | ESG investor narrative | M | P3 | BI warehouse | v2.1 | Planned |

---

## Delivered in v1.0 (Closed Beta build) — v2 enhancements tracked above

These items appeared on the original v2 roadmap but were **accelerated into v1.0 Closed Beta**:

| Original v2 theme | v1.0 delivery | Phase | v2 enhancement |
|-------------------|---------------|:-----:|------------------|
| Referral program | Modern `referrals` app + admin analytics | 33 | Consolidate + mobile UX (V2-010–014) |
| Loyalty program | Bronze–Platinum tiers + earn/redeem API | 33 | Rider mobile UI (V2-011) |
| Franchise / partner platform | Partner Platform admin + settlements | 32 | Self-service portal (V2-021, V2-040) |
| Corporate accounts | Business Accounts center | 20 | Invoicing automation (V2-030–031) |
| Trust & Safety center | Full ops center | 29 | ML fraud (V2-048) |
| Driver incentives | Campaign engine + finance payouts | 30 | ROI analytics in BI (V2-042) |
| Merchant platform | Full merchant ops | 31 | Portal UI completeness (V2-022) |
| CEO unified dashboard | CEO Master Command Center | 34 | Predictive AI layer (V2-041) |
| Board reporting | Board & Investor Reporting Suite | 35 | Automated warehouse feeds (V2-042) |
| Compliance center | Compliance & Governance | 36 | Policy automation (ongoing) |
| BI / analytics | Unified analytics layer design | 37 | Full ETL warehouse (V2-042–043) |
| Dynamic pricing | Smart Pricing & Dispatch Engine | 28 | ML forecasting (V2-035) |
| Multi-city expansion | Multi-City Operations Platform | 27 | Franchise city rollout (V2-040) |

---

## Future integrations backlog

| ID | Integration | Business value | Effort | Priority | Recommended release |
|----|-------------|----------------|:------:|:--------:|:-------------------:|
| INT-001 | Bankily / Masravi / Sedad deep reconciliation | Payment accuracy | M | P1 | v1.1 |
| INT-002 | SMS gateway (local telecom sender ID) | OTP reliability | S | P1 | v1.1 |
| INT-003 | Google Maps Platform billing optimization | Cost control | S | P2 | v1.1 |
| INT-004 | Accounting export (QuickBooks / Xero) | Finance ops efficiency | M | P2 | v1.2 |
| INT-005 | Government ride-hailing registry (if required) | Regulatory compliance | L | P1 | TBD |
| INT-006 | Stripe Connect for international cards | Tourist payments | M | P2 | v1.2 |
| INT-007 | WhatsApp Business API for support | Support scale | M | P2 | v1.2 |
| INT-008 | Power BI / Looker connector for BI warehouse | Investor reporting | M | P2 | v2.0 |

---

## Prioritization framework

| Priority | Criteria |
|:--------:|----------|
| **P0** | Blocks public launch or causes data loss / security breach |
| **P1** | Significant revenue, retention, or compliance impact within 6 months |
| **P2** | Important for scale or differentiation within 12 months |
| **P3** | Nice-to-have; strategic but not urgent |

---

## Cross-references

| Document | Link |
|----------|------|
| Portfolio | [01_PROJECT_PORTFOLIO.md](./01_PROJECT_PORTFOLIO.md) |
| Tech debt | [04_BUG_AND_TECH_DEBT.md](./04_BUG_AND_TECH_DEBT.md) |
| Dashboard | [06_PROJECT_DASHBOARD.md](./06_PROJECT_DASHBOARD.md) |
| Handover roadmap | `handover/01_EXECUTIVE_SUMMARY.md` |
| Closeout outstanding work | `handover/10_PROJECT_CLOSEOUT_REPORT.md` |

---

*Review monthly with CEO · Re-prioritize after Closed Beta exit criteria met*
