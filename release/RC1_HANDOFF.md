# YALA Enterprise v1.0.0-rc1 — Beta Handoff Package

**Document ID:** RC1-HANDOFF-001  
**Date:** 2026-07-22  
**Release:** v1.0.0-rc1  
**Branch:** `release/v1.0-rc1`  
**Decision:** [GO WITH CONDITIONS](./RC1_GO_NO_GO.md)

---

## Package contents

| Deliverable | Status | Location |
|-------------|:------:|----------|
| Signed application packages | ⚠ Partial | See §1 below |
| Deployment instructions | ✅ | §2 |
| Rollback instructions | ✅ | §3 + [ROLLBACK_PLAN.md](./ROLLBACK_PLAN.md) |
| Release notes | ✅ | [RC1_RELEASE_NOTES.md](./RC1_RELEASE_NOTES.md) |
| Known issues list | ✅ | [KNOWN_ISSUES_v1.0.0.md](./KNOWN_ISSUES_v1.0.0.md) |
| Version freeze policy | ✅ | [VERSION_FREEZE_RC1.md](./VERSION_FREEZE_RC1.md) |
| GO/NO-GO record | ✅ | [RC1_GO_NO_GO.md](./RC1_GO_NO_GO.md) |
| Smoke test report | ✅ | [device-qa-rc/PLATFORM_RC1_SMOKE_REPORT.md](./device-qa-rc/PLATFORM_RC1_SMOKE_REPORT.md) |
| Defect log | ✅ | [UAT_DEFECT_LOG.md](./UAT_DEFECT_LOG.md) |

---

## 1. Application packages

### Android (signed)

**Recommended for RC1 beta** — latest builds prior to uncommitted RC1 fixes. **Rebuild from `release/v1.0-rc1` after commit** when signing credentials are available.

| App | Version | Package ID | APK | AAB |
|-----|---------|------------|-----|-----|
| Yala Rider | 1.2.7 (19) | `com.yala.rider.mr` | `release/android/yala-rider-1.2.7-19-20260720-203407.apk` | `release/android/yala-rider-1.2.7-19-20260720-203407.aab` |
| Yala Driver | 1.2.23 (38) | `com.yala.driver.mr` | `release/android/yala-driver-1.2.23-38-20260720-203407.apk` | `release/android/yala-driver-1.2.23-38-20260720-203407.aab` |
| Yala Delivery | 1.0.4 (6) | `com.yala.delivery.mr` | — | `release/android/yala-delivery-1.0.4-6-20260707-093848.aab` |

Alternate (newer driver build): `yala-driver-1.2.23-38-20260721-000235.{apk,aab}`

### Rebuild command (when credentials available)

```bash
# Copy signing/credentials.env from secure vault (see scripts/signing-credentials.env.example)
bash scripts/build-android-release.sh all
# Output: release/android/yala-*-<timestamp>.{apk,aab}
```

**Blocker:** `signing/credentials.env` not present in repo (by design). Contact DevOps for keystore access.

### Web admin / frontend

| Component | Location |
|-----------|----------|
| Production static build | `frontend/build/` |
| Deploy script | `scripts/deploy-production-frontend.sh` |

### iOS

**Not applicable** — iOS not in v1.0 scope (ISSUE-V1-P1-003).

---

## 2. Deployment instructions

### Pre-deploy checklist

- [ ] Checkout `release/v1.0-rc1` and commit RC1 snapshot
- [ ] Tag `v1.0.0-rc1`
- [ ] Backup production database (`BACKUP_RESTORE_GUIDE.md`)
- [ ] Document rollback SHA (previous production tag)
- [ ] Notify beta ops channel

### Backend (production)

Host: DigitalOcean · Compose project `yala` · Path `/opt/yala`

```bash
cd /opt/yala
git fetch origin
git checkout release/v1.0-rc1
git pull origin release/v1.0-rc1

docker compose -p yala build django celery-worker celery-beat
docker compose -p yala run --rm django python manage.py migrate --noinput
docker compose -p yala run --rm django python manage.py collectstatic --noinput
docker compose -p yala up -d

# Verify
curl -fsS https://api.yalataxi.live/api/health/ready/
python scripts/platform-rc1-smoke.py
```

**Critical migrations in this RC:**

- `payments 0020` — RC3 index sync
- `drivers 0023` — RC3 index sync
- `merchants 0005` — destination coordinates
- `incentives 0005` — choice sync
- `safety 0004` — choice sync
- Phases 29–39 app migrations (if not yet applied)

### Frontend

```bash
cd frontend
npm ci
npm run build
bash scripts/deploy-production-frontend.sh
```

Verify admin loads at production URL; hard-refresh cache.

### Android distribution (closed beta)

1. Upload AAB to Play Console **Closed testing** track (not production).
2. Add beta tester emails to closed testing list.
3. Distribute APK via secure internal link for sideload QA if needed.
4. Document build SHA in tester comms.

### Post-deploy validation

| Step | Command / action | Pass criteria |
|------|------------------|---------------|
| Health | `curl https://api.yalataxi.live/api/health/ready/` | HTTP 200, db+redis ok |
| Smoke | `python scripts/platform-rc1-smoke.py` | ≥38/40 PASS |
| Core tests | `python manage.py test tests.operations tests.academy tests.api_gateway` | All pass |
| Admin login | Manual | Dashboard loads |
| Device smoke | `DEVICE_QA_CHECKLIST.md` | Critical paths signed |

---

## 3. Rollback instructions

**Full procedure:** [ROLLBACK_PLAN.md](./ROLLBACK_PLAN.md)

### Quick backend rollback

```bash
cd /opt/yala
export PREVIOUS_TAG=<document-before-deploy>   # e.g. v1.0.0-rc2
git checkout $PREVIOUS_TAG
docker compose -p yala build django celery-worker celery-beat
docker compose -p yala up -d django celery-worker celery-beat
curl -fsS https://api.yalataxi.live/api/health/ready/
```

### Frontend rollback

Redeploy previous `frontend/build` artifact from backup or checkout previous tag and rebuild.

### Mobile rollback

- Halt Play Console rollout to closed testing
- Direct testers to previous APK version (document in `release/android/`)
- Do **not** force-uninstall unless signature changed

### Database rollback

**Avoid unless data corruption.** Migrations in RC1 are additive (new columns/indexes). Prefer forward-fix. If required, restore from pre-deploy backup per `BACKUP_RESTORE_GUIDE.md`.

**RTO targets:** Application rollback < 15 min · DB restore < 4 hours

---

## 4. Known issues (RC1 distribution)

See [KNOWN_ISSUES_v1.0.0.md](./KNOWN_ISSUES_v1.0.0.md). Highlights for beta testers:

| ID | Issue | User impact |
|----|-------|-------------|
| ISSUE-V1-P1-003 | No iOS app | Android only |
| ISSUE-V1-P1-005 | Delivery phone verify on prod | Delivery may fail until QA account fixed |
| ISSUE-V1-P1-001 | API latency | Slower responses under load |
| UAT-D-014 | Dual referral systems | Inconsistent referral credits |
| UAT-D-018 | Scheduled delivery WS | Do not use scheduled delivery in beta |
| UAT-D-019 | Referral share URL placeholder | Share links may not work |

Open P0 ops (not user-facing but block scale):

- UAT-D-003 — No staging
- UAT-D-004 — Offsite backups
- UAT-D-005 — Physical device QA unsigned
- UAT-D-006 — RC1 not yet deployed

---

## 5. Beta distribution workflow

### Cohort

- **Initial:** 25 users (riders, drivers, couriers, merchants per ops plan)
- **Cap:** Do not exceed 25 until GO/NO-GO re-convened with C1–C7 complete

### Distribution channels

| Audience | Channel |
|----------|---------|
| Riders / Drivers / Couriers | Play Closed Testing + optional APK sideload |
| Merchants | Admin-assisted onboarding |
| Internal ops | Web admin (existing accounts) |

### Support escalation

1. Tester reports issue → log in `UAT_DEFECT_LOG.md`
2. P0 → Engineering + DevOps immediate
3. P1 → Next business day triage
4. Daily standup: `BETA_OPERATIONS_RUNBOOK.md`

### Monitoring

- Health: `https://api.yalataxi.live/api/health/ready/`
- CEO daily: `CEO_DAILY_DASHBOARD_TEMPLATE.md`
- Metrics: `BETA_METRICS_DASHBOARD.md`

---

## 6. Git state (action required)

| Item | Current state | Required action |
|------|---------------|-----------------|
| Branch | `release/v1.0-rc1` exists | Checkout; merge/commit RC1 fixes |
| Working tree | Uncommitted changes on `main` | Commit to `release/v1.0-rc1` only |
| Tag | Not applied | `git tag -a v1.0.0-rc1 -m "YALA Enterprise v1.0 RC1"` |
| Push | Not pushed | `git push origin release/v1.0-rc1 --tags` |

**Rule:** Every post-freeze commit must reference an approved release blocker ID in the commit message.

---

## 7. Sign-off

| Role | Acknowledged | Date |
|------|:------------:|------|
| Release Manager | ⏳ | |
| DevOps Lead | ⏳ | |
| QA Lead | ⏳ | |
| Engineering Lead | ⏳ | |
| CEO | ⏳ | |

---

**Package prepared:** 2026-07-22  
**Next review:** After production deploy + smoke re-run (conditions C2–C3 in GO/NO-GO)
