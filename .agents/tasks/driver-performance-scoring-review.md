# Driver Performance Scoring — Review (YALA Technologies)

Status: **review for approval — no formula was changed**
Scope: `backend/taxi/taxi/drivers/performance.py`
Related: PR #21 (`devin/backend-release`) owns this file. Nothing here was modified.

---

## 1. What the existing formula is

`calculate_driver_performance()` (performance.py:101-180) computes:

```
score = min(acceptance_rate, 100)      * 0.25
      + max(0, 100 - cancellation_rate) * 0.20
      + rating_score                    * 0.25
      + completion_volume_score         * 0.15
      + on_time_rate                    * 0.15
```

| Component | Weight | Source |
|---|---|---|
| `acceptance_rate` | 25% | `DriverProfile.acceptance_rate_points` (DB field), default 100 |
| `cancellation_rate` | 20% | `cancelled_rides / accepted_rides * 100` |
| `rating_score` | 25% | `avg(Ride.rating) / 5 * 100` over completed rides |
| `completion_volume_score` | 15% | `min(completed_rides / 100 * 100, 100)` |
| `on_time_rate` | 15% | `on_time_arrivals / arrival_samples * 100` |

The score is then bucketed by `score_band(score)` and paired with
`score_recommendation(...)`. Weights are hardcoded; there is no configuration table.

**The UI does not reimplement any of this.** The admin pages render `score`,
`score_band`, `acceptance_rate`, `cancellation_rate`, `rating_average`,
`on_time_rate` and `recommendation` exactly as returned by
`GET /drivers/performance/`, so the dashboard can never disagree with the backend.

---

## 2. Findings requiring a decision

### 2.1 Customer cancellations DO penalise the driver — contradicts the requirement

`_ride_stats_for_profile()` (performance.py:38-56):

```python
assigned_rides  = Ride.objects.filter(driver=profile.user)
cancelled_rides = assigned_rides.filter(status="cancelled")
```

`cancelled_rides` counts **every** ride with `status="cancelled"` assigned to the
driver, regardless of who cancelled it. `Ride.cancelled_by` exists
(`rides/models/ride.py:235`) and is not used here.

Consequence: a rider cancelling a ride inflates the driver's `cancellation_rate`
and lowers the 20% cancellation component of their score.

The product requirement is explicit: *drivers must not be penalised for customer
cancellations.* **This is a real defect, not a preference.**

Suggested fix (backend, for approval — not applied):

```python
cancelled_rides = assigned_rides.filter(status="cancelled").exclude(
    cancelled_by="rider"   # exact value to be confirmed against the model choices
)
```

The same correction is needed in `bulk_driver_ride_stats()` (performance.py:80),
which uses `Count("id", filter=Q(status="cancelled"))`, or the two code paths will
disagree.

### 2.2 Missing data is scored as bad performance

* `on_time_rate` is `0` when `arrival_count == 0` (performance.py:133). A driver with
  no arrival samples loses the full 15% — indistinguishable from a driver who is
  always late.
* `completion_volume_score` caps at 100 completed rides (performance.py:131). A new
  driver with 10 completed rides scores `10/100` on a 15% component purely for having
  a short history.

The requirement is that *insufficient data is identified*. Today it is not: the
score silently absorbs it.

**Mitigation already applied in the UI (no formula change):** the admin tables render
"No data" instead of `0%` for on-time when `arrival_samples == 0`, and the driver
profile shows the sample size (`44/50 arrivals`) so an administrator can see the
denominator before trusting the number.

**Backend options for approval:** return `on_time_rate: null` (or an
`on_time_insufficient_data: true` flag) when `arrival_samples == 0`, and a
`score_confidence` / `insufficient_data` marker when the driver has fewer than N
completed rides.

### 2.3 Two independent scoring systems coexist

* `performance.py` → `score` / `score_band` (the 5-component formula above).
* `ride_performance_service.get_driver_performance_snapshot()` →
  `performance_points`, `driver_score`, `driver_score_tier`, `driver_score_label`
  (a points/tier model), also surfaced on `GET /drivers/list/`.

Both are displayed to administrators today. They can rank the same driver
differently. This should be resolved deliberately — either one is canonical, or the
admin UI labels them distinctly (currently the console shows the `performance.py`
score and the directory shows the tier).

### 2.4 Safety is correctly excluded from the score

Safety incidents are **not** an input to `score`. That satisfies the requirement to
separate operational performance from safety. Safety is instead surfaced separately
from `GET /safety/admin/incidents/`.

No automated suspension exists in either path. There is no code that suspends a
driver from a score, which matches the requirement that administrators must review
before acting.

---

## 3. What was NOT done

* No weight was changed, added, or made configurable.
* No new scoring formula was introduced.
* No migration, model field or endpoint was added.
* `backend/taxi/taxi/drivers/performance.py` was not edited (PR #21 owns it).

## 4. Recommendations (prepared for approval — NOT applied)

These are proposals only. No weight, formula, field or migration was changed.

### R1 — Stop penalising drivers for customer cancellations (highest priority)

**Recommendation:** exclude rider-initiated cancellations from the driver's
cancellation count.

```python
# backend/taxi/taxi/drivers/performance.py — _ride_stats_for_profile()
# PROPOSED, not applied:
cancelled_rides = assigned_rides.filter(status="cancelled").exclude(
    cancelled_by="rider"          # confirm the exact value against Ride.cancelled_by choices
)
```

and the same correction in `bulk_driver_ride_stats()`:

```python
cancelled=Count("id", filter=Q(status="cancelled") & ~Q(cancelled_by="rider")),
```

**Prerequisite:** read `Ride.cancelled_by`'s `choices` first. If the column is a
free-text or inconsistent field, backfill/validate it before relying on it, and
decide how legacy rows with an empty `cancelled_by` are treated (recommendation:
treat unknown as *not* the driver's fault, i.e. exclude it, so drivers are never
penalised by missing data).

**Expected effect:** `cancellation_rate` becomes a genuine driver-behaviour metric,
which raises the 20% cancellation component for drivers who only ever had riders
cancel. Scores will move — hence the need for explicit approval before shipping.

### R2 — Represent "insufficient data" instead of scoring it as poor performance

**Recommendation:** return an explicit marker rather than a misleading 0, and let
the UI keep showing "No data".

```python
# PROPOSED, not applied:
"on_time_rate": float(percent(on_time_rate)) if arrival_count else None,
"on_time_insufficient_data": arrival_count == 0,
"score_confidence": "low" if completed_count < MIN_SCORED_RIDES else "normal",
```

Where `MIN_SCORED_RIDES` should be an agreed setting (e.g.
`YALA_PERFORMANCE_MIN_RIDES = 20`), not a hardcoded number.

Two specific cases today:

| Case | Current behaviour | Proposed |
|---|---|---|
| `arrival_samples == 0` | `on_time_rate = 0` → loses the full 15% | `null` + `insufficient_data` flag; UI shows "No data" |
| `completed_rides < 100` | `completion_volume_score = completed/100*100` → a new driver scores near 0 on a 15% component | gate on `MIN_SCORED_RIDES`, and/or normalise volume against the fleet median instead of a fixed 100 |

**Interim mitigation already shipped in the UI (no backend change):** the
performance table renders "No data" rather than `0%` when `arrival_samples == 0`,
and the driver profile prints the denominator (`44/50 arrivals`), so an
administrator can judge the sample size before trusting the number.

### R3 — Reconcile the two scoring systems

Two independent scores are surfaced to administrators today and can rank the same
driver differently:

| System | Source | Fields | Shape |
|---|---|---|---|
| A | `drivers/performance.py` → `calculate_driver_performance` | `score`, `score_band`, `recommendation` | 5 weighted components → 0-100 |
| B | `ride_performance_service.get_driver_performance_snapshot` | `performance_points`, `driver_score`, `driver_score_tier`, `driver_score_label` | points/tier model, also on `/drivers/list/` |

**Recommendation:** pick one of these two outcomes and record the decision:

1. **One canonical score.** Compute B from A (or delete B), so
   `/drivers/performance/` and `/drivers/list/` cannot disagree.
2. **Both retained, clearly labelled.** Keep them, but name them distinctly in the
   UI and document what each is for (e.g. "Performance score" vs "Reward tier"),
   so no administrator compares two numbers that measure different things.

Either way, this is a product decision, not a refactor — the fields are already
persisted and used elsewhere.

### R4 — Keep safety out of the score (already satisfied)

Safety incidents are correctly **not** an input to `score`, and nothing in either
system suspends a driver automatically. Recommendation: keep it that way, and keep
safety as a separate, human-reviewed signal surfaced from
`/safety/admin/incidents/`.

### R5 — Do not expose weights for configuration yet

Making the weights configurable before R1-R3 are settled would let two
administrators produce two different scores for the same driver, and would make
the audit trail harder to reason about. Recommendation: defer until the model is
stable and a versioning story exists.

### Suggested sequence

1. Approve/reject **R1** — smallest change, highest impact, directly fixes an
   unfair penalty.
2. Decide **R2** and set `MIN_SCORED_RIDES`.
3. Decide **R3** (canonical vs co-existing).
4. Revisit **R5** only afterwards.

All of the above is a change to `backend/taxi/taxi/drivers/performance.py`, which is
owned by **PR #21 (`devin/backend-release`)**. **Nothing here was applied**, and no
file under `backend/` was edited by this work.
