# YALA Engineering Handbook

**Document set ID:** YALA-ENG-001  
**Version:** 1.0.0  
**Effective:** 2026-07-21  
**Production:** https://api.yalataxi.live · https://www.yalataxi.live/admin

---

## Purpose

Official engineering documentation for the Yala ecosystem — architecture, APIs, database, security, deployment, monitoring, coding standards, and onboarding.

**Constraint:** Documentation only. No application code changes.

---

## Document index

| # | Document | Audience |
|---|----------|----------|
| 01 | [System Architecture](./01_SYSTEM_ARCHITECTURE.md) | All engineers, architects |
| 02 | [API Catalog](./02_API_CATALOG.md) | Backend, mobile, frontend, integrators |
| 03 | [Database Reference](./03_DATABASE_REFERENCE.md) | Backend, DBA, analytics |
| 04 | [Security Architecture](./04_SECURITY_ARCHITECTURE.md) | Security, backend, DevOps |
| 05 | [Deployment Guide](./05_DEPLOYMENT_GUIDE.md) | DevOps, backend leads |
| 06 | [Monitoring Runbook](./06_MONITORING_RUNBOOK.md) | SRE, on-call engineers |
| 07 | [Coding Standards](./07_CODING_STANDARDS.md) | All engineers |
| 08 | [Engineering Onboarding](./08_ENGINEERING_ONBOARDING.md) | New hires |

---

## Related documentation

| Area | Location |
|------|----------|
| Operations SOPs | `operations/` |
| Deployment (legacy) | `DEPLOYMENT.md` |
| Environment register | `handover/04_ENVIRONMENT_REGISTER.md` |
| Dependency register | `handover/03_DEPENDENCY_REGISTER.md` |
| Disaster recovery | `handover/08_DISASTER_RECOVERY_SUMMARY.md` |
| Project tracker | `project-management/` |

---

## Quick reference

| Component | Technology |
|-----------|------------|
| Backend | Django 4.x + DRF + Daphne (ASGI) |
| Database | PostgreSQL 15 |
| Cache / broker | Redis 7 |
| Task queue | Celery + django-celery-beat |
| Real-time | Django Channels |
| Frontend | React SPA + Capacitor (Ionic) |
| Edge | nginx (TLS, rate limits, static) |
| Production host | DigitalOcean Droplet (`142.93.99.142`) |
