# YALA Enterprise — Changelog Template

**Document ID:** RELEASE-CHANGELOG-TEMPLATE-001  
**Version:** YALA Enterprise v1.0  
**Date:** 2026-07-22  
**Status:** Active  
**Format:** Based on [Keep a Changelog](https://keepachangelog.com/)  
**Related:** [RELEASE_CHECKLIST.md](./RELEASE_CHECKLIST.md) · [RELEASE_LIFECYCLE.md](./RELEASE_LIFECYCLE.md)

---

## Instructions

1. Copy this template to `release/CHANGELOG_vX.Y.Z.md` for each release.
2. Complete all sections before Release Candidate promotion.
3. Publish user-facing summary as `release/RELEASE_NOTES_vX.Y.Z.md` (subset of this document).
4. Cross-reference [QUALITY_GATES.md](../docs/QUALITY_GATES.md) Gate 9 (Documentation updated).
5. For v1.0 scope: confirm all items are approved per [ROADMAP_FREEZE_V1.md](../docs/ROADMAP_FREEZE_V1.md).

---

## Template

```markdown
# YALA Enterprise — Changelog

**Version:** [X.Y.Z]  
**Release date:** [YYYY-MM-DD]  
**Release type:** [Major | Minor | Patch | Hotfix | RC]  
**Status:** [Release Candidate | Closed Beta | Production]  
**Governance:** EXECUTION_POLICY.md · QUALITY_GATES.md

---

## Version

| Field | Value |
|-------|-------|
| **Version** | [X.Y.Z] |
| **Release date** | [YYYY-MM-DD] |
| **Previous version** | [X.Y.Z-1] |
| **Git tag** | [vX.Y.Z] |
| **Release owner** | [Name / Role] |
| **Affected modules** | [List from PLATFORM_INVENTORY.md] |

---

## Summary

[1–3 sentences describing the purpose of this release and primary user/operator impact.]

---

## Features

*New capabilities within approved v1.0 scope only. Link to work item IDs.*

### [Module name — e.g. Yala Rider]

- [Feature description] ([#work-item-id])

### [Module name — e.g. Finance Operations Center]

- [Feature description] ([#work-item-id])

---

## Bug Fixes

*Reference bug IDs from project-management/04_BUG_AND_TECH_DEBT.md.*

| ID | Module | Fix |
|----|--------|-----|
| [BUG-Px-xxx] | [Module] | [Description] |

### Details

- **[Module]:** [Fix description] ([#work-item-id])

---

## Security Fixes

*Reference SEC-xxx or security review findings.*

| ID | Module | Fix |
|----|--------|-----|
| [SEC-xxx] | [Module] | [Description] |

### Details

- **[Module]:** [Security fix description — do not expose exploit details in public notes]

---

## Performance Improvements

*Reference PERF-xxx where applicable.*

- **[Module]:** [Improvement — e.g. RC3 dashboard caching, index added on Payment.ride_id]

---

## Known Issues

*Issues intentionally deferred or discovered during release validation.*

| ID | Module | Issue | Workaround | Target fix |
|----|--------|-------|------------|:----------:|
| [KNOWN-xxx] | [Module] | [Description] | [Workaround or —] | [vX.Y.Z / v1.1] |

Full register: `release/KNOWN_ISSUES_v[X.Y.Z].md` or `project-management/04_BUG_AND_TECH_DEBT.md`

---

## Breaking Changes

*API contract changes, permission changes, migration-required behavior changes.*

| Change | Affected | Migration / Action required |
|--------|----------|----------------------------|
| [Change description] | [API / Admin / Mobile] | [Yes — describe / No] |

**If none:** _No breaking changes in this release._

---

## Migration Notes

### Database migrations

| App | Migration | Description | Maintenance window? |
|-----|-----------|-------------|:-------------------:|
| [app_name] | [000X_name] | [Description] | [Yes / No] |

**Pre-migration backup required:** Yes (see ROLLBACK_PLAN.md)

**Apply command:**
```bash
docker exec yala-django-1 python manage.py migrate --noinput
docker exec yala-django-1 python manage.py showmigrations [app]
```

### Configuration changes

| Variable | Old value | New value | Required? |
|----------|-----------|-----------|:---------:|
| [ENV_VAR] | [—] | [value] | [Yes / No] |

### Mobile build requirements

| App | Version | Build | Store action |
|-----|---------|-------|--------------|
| Yala Rider | [X.Y.Z] | [build N] | [Promote to closed testing / —] |
| Yala Driver | [X.Y.Z] | [build N] | [—] |
| Yala Delivery | [X.Y.Z] | [build N] | [—] |

**If no mobile changes:** _No mobile rebuild required._

---

## Deployment Notes

- **Target environment:** [Staging / Production / Closed Beta]
- **Deploy window:** [YYYY-MM-DD HH:MM UTC]
- **Rollback tag:** [vX.Y.Z-1]
- **Validation:** [RELEASE_CHECKLIST_vX.Y.Z.md link]
- **Rollback plan:** [ROLLBACK_PLAN.md]

---

## Quality Gate Summary

| Gate | Status | Evidence |
|------|:------:|----------|
| Unit tests | ☐ | [suite: N/N pass] |
| Integration tests | ☐ | [report link] |
| Mobile QA | ☐ / N/A | [checklist link] |
| Security review | ☐ | [reviewer + date] |
| Performance validation | ☐ / N/A | [p95: X ms] |
| CEO approval | ☐ / N/A | [UAT_EXECUTIVE_SIGNOFF.md] |

Reference: [QUALITY_GATES.md](../docs/QUALITY_GATES.md)

---

## Contributors

| Role | Name |
|------|------|
| Engineering Lead | |
| DevOps Lead | |
| QA Lead | |
| Security Lead | |
| Release owner | |

---

## References

- [EXECUTION_POLICY.md](../docs/EXECUTION_POLICY.md)
- [PROJECT_STATUS.md](../docs/PROJECT_STATUS.md)
- [Previous changelog](./CHANGELOG_v[PREV].md)
```

---

## Section Guidelines

### Version

Always include semantic version, release date, git tag, and affected modules. For release candidates use suffix: `1.0.0-rc3`.

### Features

- List by **module** (not by file or PR).
- Only include work approved under frozen v1.0 scope or explicitly approved change requests.
- Do not list Version 2.x backlog items.

### Bug Fixes

- Every fix must reference an affected module.
- Include bug ID from `project-management/04_BUG_AND_TECH_DEBT.md` when available.

### Security Fixes

- Document internally in full; public release notes may omit sensitive exploit detail.
- Always note affected module and user impact (e.g. "Partner API key rotation enforced").

### Known Issues

- Copy forward unresolved items from previous release.
- Add new issues discovered during RC validation.
- Sync with `KNOWN_ISSUES_vX.Y.Z.md`.

### Breaking Changes

- Document API payload changes, removed endpoints, permission group changes, required mobile minimum version.
- If breaking: require migration notes and CEO notification for executive modules.

### Migration Notes

- List every Django migration in release order.
- Document env var changes separately from schema migrations.
- Reference [ROLLBACK_PLAN.md](./ROLLBACK_PLAN.md) pre-migration backup requirement.

---

## Example Reference

See existing release changelog: `release/CHANGELOG_v1.0.0.md`

---

## Cross-references

| Document | Purpose |
|----------|---------|
| [RELEASE_CHECKLIST.md](./RELEASE_CHECKLIST.md) | Release notes required before promote |
| [RELEASE_LIFECYCLE.md](./RELEASE_LIFECYCLE.md) | Release Candidate stage |
| [ROLLBACK_PLAN.md](./ROLLBACK_PLAN.md) | Rollback tag in deployment notes |
| [EXECUTION_POLICY.md](../docs/EXECUTION_POLICY.md) | Stage 8 documentation |
| [QUALITY_GATES.md](../docs/QUALITY_GATES.md) | Gate 9 |

---

*Template effective 2026-07-22 · Copy per release · YALA Enterprise Program Office*
