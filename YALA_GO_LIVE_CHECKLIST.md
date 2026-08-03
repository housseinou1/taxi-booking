# YALA Go-Live Checklist

**Mission LP-3**
**Date:** 2026-08-03

---

## Stage 1: Internal Testing (Current)

| # | Task | Owner | Done |
|---|------|-------|------|
| 1 | Complete Play Console app listings | Product | ⬜ |
| 2 | Upload 3 AABs to Internal Testing | Dev | ⬜ |
| 3 | Add internal testers (email group) | Product | ⬜ |
| 4 | Complete Data Safety questionnaire | Product | ⬜ |
| 5 | Declare Background Location | Dev/Product | ⬜ |
| 6 | Complete content rating | Product | ⬜ |
| 7 | Upload screenshots (2+ per app) | Design | ⬜ |
| 8 | Upload feature graphic (1024×500) | Design | ⬜ |
| 9 | Create approved test accounts on prod | Backend | ⬜ |
| 10 | Distribute Internal Testing links | QA | ⬜ |

---

## Stage 2: QA Sign-Off

| # | Task | Owner | Done |
|---|------|-------|------|
| 1 | Execute Ride flow (Suite 1) — all 19 steps pass | QA | ⬜ |
| 2 | Execute Cancellation (Suite 2) — 3 tests | QA | ⬜ |
| 3 | Execute Delivery flow (Suite 3) — 10 steps | QA | ⬜ |
| 4 | Execute Executive Dashboard (Suite 4) — 5 steps | QA | ⬜ |
| 5 | Verify 0 crashes | QA | ⬜ |
| 6 | Verify 0 ANR | QA | ⬜ |
| 7 | Verify push notifications delivered | QA | ⬜ |
| 8 | Verify GPS tracking accuracy | QA | ⬜ |
| 9 | Verify earnings consistency | QA | ⬜ |
| 10 | Sign QA approval | QA Lead | ⬜ |

---

## Stage 3: Closed Beta

| # | Task | Owner | Done |
|---|------|-------|------|
| 1 | Promote to Closed Testing track | Dev | ⬜ |
| 2 | Add beta tester group (10-50 users) | Product | ⬜ |
| 3 | Monitor crash rate (<1%) | Dev | ⬜ |
| 4 | Monitor ANR rate (<0.5%) | Dev | ⬜ |
| 5 | Collect beta feedback | Product | ⬜ |
| 6 | Fix any P0/P1 from beta | Dev | ⬜ |
| 7 | Achieve 50+ successful trips | QA | ⬜ |
| 8 | CEO sign-off | CEO | ⬜ |

---

## Stage 4: Production Launch

| # | Task | Owner | Done |
|---|------|-------|------|
| 1 | Promote to Production track | Dev | ⬜ |
| 2 | Set rollout percentage (10% staged) | Product | ⬜ |
| 3 | Monitor vitals for 24h | Dev | ⬜ |
| 4 | Increase to 50% if stable | Product | ⬜ |
| 5 | Full 100% rollout | Product | ⬜ |
| 6 | Publish marketing announcement | Marketing | ⬜ |
| 7 | Enable Sentry production alerts | Dev | ⬜ |
| 8 | Configure database backup schedule | Ops | ⬜ |
| 9 | Set up uptime monitoring | Ops | ⬜ |
| 10 | Document runbook for on-call | Ops | ⬜ |

---

## Critical Launch Day Contacts

| Role | Name | Responsibility |
|------|------|---------------|
| CEO | — | Final go/no-go decision |
| CTO/Dev Lead | — | Backend + app deployment |
| Product | — | Play Console + marketing |
| QA Lead | — | Test certification sign-off |
| Ops | — | Server monitoring + alerts |

---

## Rollback Plan

If a critical issue is discovered post-launch:

1. **App:** Halt staged rollout in Play Console (immediate)
2. **Backend:** Revert to previous Docker image / git tag
3. **Database:** Do NOT rollback migrations (forward-fix only)
4. **Communication:** Post incident notice to beta testers
5. **Fix:** Hotfix on release branch → rebuild AAB → expedited review

---

## Current Status

```
┌─────────────────────────────────────────┐
│  Internal Testing    ← WE ARE HERE      │
├─────────────────────────────────────────┤
│  QA Sign-Off         (next)             │
├─────────────────────────────────────────┤
│  Closed Beta         (after QA)         │
├─────────────────────────────────────────┤
│  Production Launch   (after beta)       │
└─────────────────────────────────────────┘
```
