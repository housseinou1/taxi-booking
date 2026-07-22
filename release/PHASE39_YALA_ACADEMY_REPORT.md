# Phase 39 — YALA Academy (Training & Certification) Report

**Date:** 2026-07-21  
**Status:** Complete  
**Route:** `/admin/academy`  
**API base:** `/academy/`

---

## Summary

Phase 39 delivers an internal Learning Management System (LMS) for training and certifying all platform participants. The implementation reuses existing JWT authentication, push notifications, and audit logging without modifying ride, payment, or delivery business logic.

---

## Section 1 — Course Management

12 audience types supported: Rider, Driver, Courier, Merchant, Customer Support, Operations, Finance, Supervisor, Collector, Landlord, Maintenance Staff, Executive.

Each course includes:

| Field | Support |
|-------|---------|
| Title / Description | Yes |
| Videos / PDFs / Slides | Module content types: `video`, `pdf`, `slides`, `text`, `quiz` |
| Quizzes | `Question` model with MC, T/F, scenario |
| Passing score | `passing_score` (default 70%) |
| Certificate | Auto-issued on pass; manual issue supported |
| Timed exams | `exam_duration_minutes` (0 = untimed) |
| Randomized questions | `randomize_questions` flag |

Admin CRUD: `/academy/admin/courses/`, `/modules/`, `/questions/`

---

## Section 2 — Learning Dashboard

**Endpoint:** `GET /academy/learning-dashboard/`

Displays:
- Assigned courses count
- Completed courses count
- Average progress %
- Certificates earned
- Upcoming renewals (certificates expiring within 30 days)
- Overdue assignments

Also available: `/academy/my-enrollments/`, `/academy/my-certificates/`

---

## Section 3 — Certification

`Certificate` model tracks:
- Issue date (`issue_date`)
- Expiration date (`expiration_date` from `validity_months`)
- Status: active / expired / suspended
- Unique certificate number

Auto-issued when assessment passed. Admin can manually issue or suspend.

Celery task: `academy.tasks.expire_academy_certificates` — marks expired certs and sends renewal reminders.

---

## Section 4 — Assessments

| Feature | Implementation |
|---------|----------------|
| Multiple choice | `question_type=mc` |
| True/False | `question_type=tf` |
| Scenario-based | `question_type=scenario` |
| Timed exams | `expires_at` on `AssessmentAttempt` |
| Randomized questions | Shuffled `question_ids` on start |
| Passing threshold | Course `passing_score` |

Flow: `start-assessment` → `submit-assessment` with auto-grading via `AssessmentAttempt.grade()`.

---

## Section 5 — Admin Portal

**Route:** Admin Portal tab in `AcademyCenter.js`

Administrators can:
- Create courses, modules, questions
- Assign courses to individual users
- Bulk assign by course audience
- Review assessment results
- Issue / suspend certificates
- View all certificates

Permissions: `IsAcademyAdminStaff` (CEO, HR, Training Manager, Operations, Support)

---

## Section 6 — CEO Dashboard

**Endpoint:** `GET /academy/dashboard/`

Displays:
- Training completion %
- Certified drivers / couriers / merchants
- Employees requiring retraining (expired/suspended certs + failed enrollments)
- Expiring soon count
- Enrollments by audience with completion breakdown

Permission: `IsAcademyReportStaff` (CEO + academy report groups)

---

## Section 7 — Reports

| Report | Endpoint |
|--------|----------|
| Training completion | `GET /academy/reports/training/` |
| Certification | `GET /academy/reports/certifications/` |
| Expired certifications | `GET /academy/reports/expired-certifications/` |
| Department progress | `GET /academy/reports/department-progress/` |

CSV export: `GET /academy/reports/training/?export_format=csv`

---

## Role Permissions

Defined in `operations/executive_permissions.py`:

| Role | Access |
|------|--------|
| CEO | Full dashboard + reports |
| HR | Admin portal + assignments |
| Training Manager | Admin portal |
| Operations | Admin portal |
| Finance | Reports |
| Support | Admin portal |

Learners access their own enrollments, courses (audience-filtered), and assessments.

---

## Audit & Notifications

| Event | Push | Audit |
|-------|------|-------|
| Course assignment | Yes | Yes |
| Assessment pass | Yes | Yes |
| Assessment fail | Yes | Yes |
| Certificate suspended | Yes | Yes |
| Module complete | No | Yes |
| Course/module/question CRUD | No | Yes |
| Certificate expiry reminder | Yes | — |
| Report CSV export | No | Yes |

---

## Key Fixes (Phase 39)

1. **`Enrollment.update_progress()`** — fixed to use `self.module_progress` instead of invalid `self.user.module_progress`
2. **Permissions centralized** in `executive_permissions.py`
3. **Service layer** added (`academy_service.py`) for dashboard, reports, assessments, bulk assign
4. **Audience filtering** for available courses based on user type and groups

---

## Tests

`backend/taxi/tests/academy/test_academy.py` — 11 tests:

- Role-based dashboard access
- Learning dashboard payload
- Module progress tracking
- Assessment pass → certificate
- Timed exam expiry
- Course assignment permissions
- Certificate suspend
- Department progress report
- CSV export

---

## Files

| Area | Path |
|------|------|
| Models | `backend/taxi/academy/models.py` |
| Service | `backend/taxi/academy/academy_service.py` |
| Views | `backend/taxi/academy/views.py` |
| Tasks | `backend/taxi/academy/tasks.py` |
| Permissions | `operations/executive_permissions.py` |
| Frontend | `frontend/src/admin/academy/` |
| Migration | `academy/migrations/0002_assessment_enhancements.py` |

---

## Verification

```bash
cd backend/taxi
python manage.py migrate academy
python manage.py test tests.academy.test_academy
```

Navigate to `/admin/academy` in the admin frontend.
