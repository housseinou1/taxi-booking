# YALA Enterprise v1.0.0 — Golden Release Version Lock

**Document ID:** GOLDEN-LOCK-001  
**Date:** 2026-07-22  
**Target tag:** `v1.0.0-rc-final`  
**Platform version:** YALA Enterprise **1.0.0**  
**Status:** **PENDING COMMIT** — large uncommitted working tree

---

## Version lock policy

| Rule | Status |
|------|:------:|
| No new features | ✅ Enforced |
| No UI redesign | ✅ Enforced |
| No database redesign | ✅ Enforced |
| No Version 2 work | ✅ Enforced |
| Only Critical/High fixes may delay release | ✅ Per golden release rules |

---

## Verification checklist (2026-07-22)

| Check | Result | Evidence |
|-------|:------:|----------|
| All migrations committed | ❌ | Uncommitted model/migration changes on `main` |
| `makemigrations --check` | ✅ PASS | No changes detected |
| No untracked production secrets | ✅ | `.env.production` gitignored |
| Debug configuration | ✅ | `DJANGO_DEBUG=False` in `.env.production.template` |
| Production environment | ⚠ | Health 200; LC1 not deployed |
| Tag `v1.0.0-rc-final` applied | ❌ | Blocked until commit |
| Branch | `main` (uncommitted) | `release/v1.0-rc1` exists |

---

## Version matrix

| Component | Enterprise version | Build version | Package |
|-----------|-------------------|---------------|---------|
| Backend API | **1.0.0** | Docker image | `backend/taxi/Dockerfile` |
| Frontend SPA | **1.0.0** | Static build | `frontend/build/` |
| Yala Rider | **1.0.0** bundle* | 1.2.7 (19) | `com.yala.rider.mr` |
| Yala Driver | **1.0.0** bundle* | 1.2.23 (38) | `com.yala.driver.mr` |
| Yala Delivery | **1.0.0** bundle* | 1.0.4 (6) | `com.yala.delivery.mr` |

\*Mobile apps use independent `versionName` for Play Store continuity. They are included in the **YALA Enterprise v1.0.0 Golden Release bundle** without downgrading store version codes.

---

## Tag procedure (execute after commit)

```bash
git checkout release/v1.0-rc1   # or main after merge
git add -A
git commit -m "release: YALA Enterprise v1.0.0 golden release candidate"
git tag -a v1.0.0-rc-final -m "YALA Enterprise v1.0.0 Golden Release"
git push origin release/v1.0-rc1 --tags
```

**Current HEAD (pre-golden):** `3c7d2083` — docs(release): add RC2 certification reports

---

## Related

- [GOLDEN_RELEASE_REPORT.md](./GOLDEN_RELEASE_REPORT.md)
- [V1_FINAL_CERTIFICATION.md](./V1_FINAL_CERTIFICATION.md)
