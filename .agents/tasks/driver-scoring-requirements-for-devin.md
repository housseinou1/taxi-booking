# Driver Performance Scoring — Approved Business Rules (for Devin)

Status: **approved by the owner.** These are requirements, not proposals.
Owner instruction: *"Do not modify the backend scoring system while Devin is
completing PR #21."* → **nothing in `backend/` was changed by this work.**

Implementation owner: **Devin, PR #21 (`devin/backend-release`)**, which owns
`backend/taxi/taxi/drivers/performance.py` and
`backend/taxi/taxi/drivers/services/ride_performance_service.py`.

---

## The four approved rules

### RULE 1 — Customer cancellations must not negatively affect a driver's score

**Requirement.** A ride cancelled by the **rider** must not reduce the driver's
performance score, directly or indirectly.

**Current behaviour (does not satisfy the rule).**
`_ride_stats_for_profile()` in `performance.py`:

```python
cancelled_rides = assigned_rides.filter(status="cancelled")
```

This counts **every** cancelled ride assigned to the driver, whoever cancelled it.
`cancellation_rate = cancelled_rides / accepted_rides * 100` then feeds the 20%
cancellation component of `score`. A rider cancelling therefore lowers the driver's
score.

`Ride.cancelled_by` already exists (`rides/models/ride.py:235`) and is unused here.

**Acceptance criteria.**
1. `cancelled_rides` counts only cancellations attributable to the driver.
2. `bulk_driver_ride_stats()` applies the **same** rule, or the two code paths will
   disagree.
3. A test proves a rider-cancelled ride does not change the driver's
   `cancellation_rate` or `score`.
4. Handling of legacy rows with an empty/unknown `cancelled_by` is decided
   explicitly. **Recommendation: treat unknown as not the driver's fault** (exclude),
   so missing data can never penalise a driver.
5. **Prerequisite:** confirm `Ride.cancelled_by`'s actual `choices` before filtering.
   If the column is free-text or inconsistent, validate/backfill it first.

### RULE 2 — Missing or insufficient data must not automatically produce a poor score

**Requirement.** A driver with too little history must not be scored as though they
perform badly. Insufficient data must be **identifiable** as such.

**Current behaviour (does not satisfy the rule).**

| Case | Today | Effect |
|---|---|---|
| `arrival_samples == 0` | `on_time_rate = 0` (`performance.py:133`) | loses the full 15% on-time weight for having no samples |
| `completed_rides < 100` | `completion_volume_score = min(completed/100*100, 100)` (`:131`) | a new driver with 10 rides scores 10/100 on a 15% component — a **volume** penalty, not a performance one |

**Acceptance criteria.**
1. `on_time_rate` is `null` (not `0`) when `arrival_samples == 0`, plus an explicit
   `on_time_insufficient_data` (or equivalent) flag.
2. A documented minimum-sample threshold (e.g. `YALA_PERFORMANCE_MIN_RIDES`) is
   configured, not hardcoded, and drivers below it are marked low-confidence rather
   than scored as poor.
3. The volume component is normalised (e.g. against a fleet median) or gated on the
   threshold, so a short history is not read as bad performance.
4. A test proves a driver with one completed ride is **not** scored as if failing.

**Already mitigated in the UI (no backend change needed):** the performance table
renders "No data" instead of `0%` when `arrival_samples == 0`, and the profile prints
the denominator (`44/50 arrivals`).

### RULE 3 — Scoring must be transparent and consistent across the platform

**Requirement.** One score an administrator sees must not contradict another.

**Current behaviour (does not satisfy the rule).** Two independent scores are
surfaced today:

| | System A | System B |
|---|---|---|
| Source | `drivers/performance.py` → `calculate_driver_performance` | `ride_performance_service.get_driver_performance_snapshot` |
| Fields | `score`, `score_band`, `recommendation` | `performance_points`, `driver_score`, `driver_score_tier`, `driver_score_label` |
| Endpoint | `GET /drivers/performance/` | `GET /drivers/list/` (via `serialize_driver`) |
| Shape | 5 weighted components → 0-100 | points/tier model |

They can rank the same driver differently.

**Acceptance criteria.**
1. Either one canonical score (B derived from A, or B removed), **or** both retained
   and explicitly named/documented as measuring different things.
2. The formula and its weights are documented where administrators can reach them.
3. A single driver's score is identical across every endpoint that reports it.

**Note:** the admin UI deliberately does **not** recompute any score — it renders
backend values verbatim — so it cannot introduce a third inconsistency.

### RULE 4 — Performance alerts must support administrative review, never auto-penalise

**Requirement.** Alerts are signals for a human. No automatic suspension or penalty
may follow from a score or an incomplete signal.

**Current behaviour (already satisfies the rule).**
Nothing in the scoring path suspends or penalises a driver. Safety is **not** an
input to `score`; safety incidents surface separately from
`GET /safety/admin/incidents/`.

**Acceptance criteria (keep this property).**
1. No code path suspends, blocks, deactivates or reduces pay from a score alone.
2. Safety stays out of the operational score, reviewed separately by a human.
3. Any future alerting surfaces evidence and a review affordance, not an action.

---

## Mapping to the code

| Rule | File | Line(s) |
|---|---|---|
| 1 | `backend/taxi/taxi/drivers/performance.py` | `_ride_stats_for_profile` :38-56; `bulk_driver_ride_stats` :80 |
| 2 | same | `on_time_rate` :133; `completion_volume_score` :131 |
| 3 | same + `services/ride_performance_service.py` | `calculate_driver_performance` :101-180; `get_driver_performance_snapshot` :310-337 |
| 4 | same | no suspension path exists (verified) |

## Suggested sequence

1. **Rule 1** first — smallest change, highest impact, removes a demonstrable
   unfairness.
2. **Rule 2** — decide the threshold and the null semantics.
3. **Rule 3** — product decision (canonical vs co-existing).
4. **Rule 4** — no change needed; guard it against regression.

## Boundary

* No file under `backend/` was edited by this work.
* `devin/backend-release` (#21) was not modified.
* No migration, model field, weight or formula was changed.
* `.agents/tasks/driver-performance-scoring-review.md` holds the detailed analysis
  and proposed patches; this document records the **approved requirements**.
