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

## 4. Recommended approval path

1. Approve or reject the `cancelled_by` fix (§2.1) — highest impact, smallest change.
2. Decide how insufficient data is represented (§2.2).
3. Decide which scoring system is canonical (§2.3).
4. Only then consider exposing weights for configuration.
