# YALA Enterprise v1.0 — RC1 Version Freeze

**Document ID:** RC1-FREEZE-001  
**Date:** 2026-07-22  
**Release branch:** `release/v1.0-rc1`  
**Tag (target):** `v1.0.0-rc1`  
**Status:** **ACTIVE — Feature freeze in effect**

---

## Branch

```bash
git checkout release/v1.0-rc1
```

Branch `release/v1.0-rc1` was created from `main` on **2026-07-22**. All v1.0 core development and RC3 stabilization fixes are included in the working tree.

**Note:** Working tree contains uncommitted changes. RC1 tag should be applied only after Engineering Lead commits the frozen snapshot and CI passes.

---

## Freeze policy

### Allowed on `release/v1.0-rc1`

| Change type | Allowed | Requires |
|-------------|:-------:|----------|
| P0 / release-blocker bug fixes | ✅ | Entry in `UAT_DEFECT_LOG.md` |
| Security fixes | ✅ | Security review |
| Crash fixes (mobile) | ✅ | QA reproduction |
| Migration fixes (drift) | ✅ | `makemigrations --check` clean |
| Documentation / release artifacts | ✅ | — |

### Rejected

| Change type | Status |
|-------------|:------:|
| New features | ❌ REJECTED |
| UI redesign | ❌ REJECTED |
| Version 2 modules | ❌ REJECTED |
| Refactors without blocker ID | ❌ REJECTED |
| New dependencies (unless security) | ❌ REJECTED |

---

## Approval process for post-freeze commits

1. Defect must have ID in `release/UAT_DEFECT_LOG.md` with severity **P0** or approved **P1** release blocker.
2. Engineering Lead + QA Lead acknowledge in commit message: `fix(release): UAT-D-XXX description`.
3. Re-run core test suite (235 tests) before merge to `release/v1.0-rc1`.
4. Update `release/RC1_RELEASE_NOTES.md` if user-visible.

---

## Baseline verification at freeze

| Check | Result | Date |
|-------|:------:|------|
| Core tests 235/235 | ✅ PASS | 2026-07-22 |
| `makemigrations --check` | ✅ PASS | 2026-07-22 |
| Frontend production build | ✅ PASS | 2026-07-22 |
| P0 code blockers | ✅ 0 open | 2026-07-22 |

---

## Related documents

- [RC1_RELEASE_NOTES.md](./RC1_RELEASE_NOTES.md)
- [RC1_GO_NO_GO.md](./RC1_GO_NO_GO.md)
- [RC1_HANDOFF.md](./RC1_HANDOFF.md)
- [UAT_DEFECT_LOG.md](./UAT_DEFECT_LOG.md)
