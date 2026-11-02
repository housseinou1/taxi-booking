# Driver Documents & Performance — Backend Integration Map

Scope: the admin frontend modules added in `feat/driver-documents-performance`.
Status: **no backend file was modified.** This documents what exists, what is
reused, and what is missing.

---

## 1. Endpoints reused (all pre-existing)

| Purpose | Endpoint | Auth | Notes |
|---|---|---|---|
| Document register | `GET /admin/approvals/drivers/` | admin | **Only** admin source of `DriverDocument` rows, including the `id` that approve/reject needs |
| Driver identity + review state | `GET /drivers/list/` | admin | `serialize_driver()` already spreads `**review_state` and `**performance_snapshot` |
| Performance summary | `GET /drivers/performance/` | `IsAdminUser` | Full scored summary; filters `status/under_review/risk/has_no_show/top/fraud` |
| Approve document | `POST /admin/documents/<id>/approve/` | `IsAdminUser` | Audited as `document_approval` |
| Reject document | `POST /admin/documents/<id>/reject/` | `IsAdminUser` | `reason` **required** (400 without); audited |
| Safety incidents | `GET /safety/admin/incidents/` | admin | Powers the safety KPI |
| Per-driver rides | `GET /drivers/<id>/history/` | admin | Loaded on demand in the profile dialog |
| Per-driver earnings | per-driver earnings endpoint (`driversApi.getDriverEarnings`) | admin | Loaded on demand; shown raw, never recomputed |

Routing verified in `backend/taxi/taxi/urls.py`: `admin/documents/` is mounted at
root (not under `/drivers/`), and `drivers/` mounts `taxi.drivers.urls`.

### Fields already provided by `GET /drivers/list/`

Document state (from `DocumentService.get_documents_review_state()`):
`all_required_documents_uploaded`, `documents_under_review`,
`missing_document_types[]`, `expired_document_types[]`, `expiring_soon_documents[]`,
`documents_alert_level` (`error` / `warning` / `null`), `documents_block_online`.

Per-document legacy fields: `license_file`, `license_expires_at`, `license_status`,
`vehicle_registration(_expires_at|_status)`, `insurance_document(_expires_at|_status)`,
`vignette_document(_expires_at|_status)`, `national_id_document`,
`has_national_id_document`, `driver_photo`, `expired_documents[]`,
`document_rejection_reason`.

Performance (from `get_driver_performance_snapshot()`): `performance_points`,
`driver_score`, `driver_score_tier`, `driver_score_label`, `acceptance_rate`,
`acceptance_rate_computed`,
`total_rides_received|accepted|missed|declined|cancelled|no_show`,
`cancellations_today`, `account_risk_flag`, `account_under_review`,
`account_risk_reason`, `cancellation_warning`, plus `total_rides_completed` and
`average_rating` added by the `driver_list` view.

---

## 2. Missing endpoints (NOT worked around with invented data)

### 2.1 No standalone admin document-list endpoint
`DriverDocumentListView` (`/drivers/me/documents/`) is `IsAuthenticated` and resolves
the **caller's own** profile (`resolve_driver_profile(request.user)`). It cannot list
other drivers' documents. Only `AdminDocumentApproveView` / `AdminDocumentRejectView`
exist for admins.

**Consequence:** document ids come from the approvals queue. If a driver's document
rows are not exposed there, the document cannot be actioned — which is why a
"missing" row renders with **no** Approve/Reject buttons and the text
"No uploaded file to review", rather than a disabled or fabricated action.

**Suggested endpoint (for review, not implemented):**
`GET /api/v1/admin/documents/?status=&type=&city=&expiring_before=&page=`
returning `DriverDocument` rows with `driver_id`, `driver_name`, `driver_photo`,
`phone_number`, `city`, `vehicle_type`, `submitted_at`. This would remove the
dependency on the approvals queue and make server-side pagination possible.

### 2.2 No document resubmission-request endpoint
The brief asks for "Request document resubmission". There is **no** endpoint for it:
approve and reject are the only admin document actions. Rejecting with a reason is the
closest existing mechanism (the reason is returned to the driver). No "request
resubmission" button was added, because it would have had no endpoint to call.

**Suggested endpoint:** `POST /admin/documents/<id>/request-resubmission/` with a
reason, setting status to `resubmission_required` (needs a model choice change).

### 2.3 No per-driver document-history endpoint
`approval_history` from the approvals queue is a **user-level** `ApprovalAction` list
(last 10), not a per-document verification history. The UI shows it as
"Verification history" and does not claim it is document-scoped.

### 2.4 No driver-ratings or complaints endpoint
`/drivers/me/feedback/*` are driver-self only. `operations/beta_feedback_*` is
beta/support feedback, not driver ratings. There is no admin endpoint listing driver
ratings or complaints across drivers.

**Consequence:** the Driver Ratings view shows `rating_average` and
`completed_rides` (the rating base) from the performance summary, plus
`account_risk_flag` / `account_under_review` / `account_risk_reason` as the
complaint/review indicator. It does **not** show individual customer comments,
because none are exposed.

**Suggested endpoints:** `GET /admin/drivers/<id>/ratings/` and
`GET /admin/drivers/ratings/?min_rating=&max_rating=&city=`.

### 2.5 No date-ranged driver analytics endpoint
The brief asks for daily / weekly / monthly trip charts and date-range filtering.
`/drivers/performance/` returns **current totals only** — no time series.

**Consequence:** **no charts were built.** Rendering one would have required
inventing the series. The date-range filter was also not added, since it would have
had nothing to filter. The modules present current-state KPIs and tables instead.

**Suggested endpoint:**
`GET /admin/drivers/analytics/?from=&to=&granularity=day|week|month` returning
completed trips, acceptance, cancellation and earnings series. Once it exists, charts
and the date-range picker can be added directly.

### 2.6 No driver-eligibility change required
Expired mandatory documents already flow through the existing eligibility rules
(`enforce_document_expiration`). The new pages **display** that state; they do not
create a competing approval or suspension system. Nothing in these modules suspends a
driver.

---

## 3. Security posture

* Every endpoint used is backend-authorised (`IsAdminUser` / admin permissions). The
  frontend guard (`AdminActionGuard`) is UX only.
* Approve/Reject are additionally gated on the real backend action key
  **`drivers.verify_documents`** (from `permissionActions.js`), so a user without it
  sees "Document verification permission required" instead of actionable buttons.
* Approve/reject are audited server-side (`document_approval`).
* Document links come from the backend's own `file_url`; the pages do not construct
  media URLs and render them as links rather than embedding them.
* No production database or live driver record was touched.

---

## 4. Coordination note

`backend/taxi/taxi/drivers/` (including `performance.py`, `urls.py`,
`document_service.py`, `views.py`) is owned by **PR #21 (`devin/backend-release`)**
and already carries local uncommitted changes in this working tree. **No file under
`backend/` was edited by this work.**
