# YALA Project Management — Master Index

**Version:** 1.0.0  
**Created:** 2026-07-21  
**Maintained by:** Yala Engineering & Program Management

---

## Purpose

This folder contains the **YALA Master Project Tracker** — synchronized documentation for portfolio management, feature tracking, release history, technical debt, future backlog, and executive KPIs.

**No application code lives here.** All documents are Markdown and cross-reference each other and the `release/` and `handover/` packages.

---

## Documents

| # | File | Audience | Update frequency |
|---|------|----------|:----------------:|
| 01 | [01_PROJECT_PORTFOLIO.md](./01_PROJECT_PORTFOLIO.md) | CEO, Product, Engineering | Monthly |
| 02 | [02_MASTER_FEATURE_MATRIX.md](./02_MASTER_FEATURE_MATRIX.md) | Engineering, QA, Product | Per feature ship |
| 03 | [03_RELEASE_HISTORY.md](./03_RELEASE_HISTORY.md) | All stakeholders | Per release tag |
| 04 | [04_BUG_AND_TECH_DEBT.md](./04_BUG_AND_TECH_DEBT.md) | Engineering, DevOps, QA | Weekly |
| 05 | [05_VERSION_2_BACKLOG.md](./05_VERSION_2_BACKLOG.md) | CEO, Product | Monthly |
| 06 | [06_PROJECT_DASHBOARD.md](./06_PROJECT_DASHBOARD.md) | CEO, Executive team | Weekly |

---

## Synchronization rules

1. **Completion %** in `01` must align with status counts in `02` and overall % in `06`.
2. **Release dates** in `03` must match deployment status in `06`.
3. **Open bugs** in `04` must match P0/P1 counts in `06` and known issues in `release/KNOWN_ISSUES_v1.0.0.md`.
4. **Future items** delivered in v1.0 (Phases 29–37) remain in `05` with "Delivered in v1.0" notation for v2 enhancement tracking.
5. When a feature moves to **Done** in `02`, update the corresponding platform row in `01`.

---

## Related packages

| Package | Path | Contents |
|---------|------|----------|
| Release docs | `release/` | RC certifications, launch decision, known issues, playbooks |
| Handover | `handover/` | Enterprise handover (10 documents) |
| Sprint 1 | `release/sprint1/` | Launch readiness, blockers, physical QA |

---

## Quick status (2026-07-21)

| Metric | Value |
|--------|------:|
| Overall completion | 94% |
| Launch score | 78 / 100 |
| Closed Beta | **GO** |
| Public launch | **NO-GO** |
| P0 blockers | 2 |

See [06_PROJECT_DASHBOARD.md](./06_PROJECT_DASHBOARD.md) for full KPIs.

---

*Documentation only — no code changes in this folder*
