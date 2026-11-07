# Wallet migration `0022_wallet_tx_reference_unique` — safe resolution proposal

## Problem

Migration `0022` adds a partial unique constraint on `(wallet_id, reference)` for non-empty `reference` values.

**Local SQLite failure (observed):**

```
UNIQUE constraint failed: payments_wallettransaction.wallet_id, payments_wallettransaction.reference
```

**Root cause (local analysis):** duplicate rows sharing the same wallet and reference, e.g.:

| wallet_id | reference | count |
|-----------|-----------|------:|
| 6 | `challenge:4` | 3 |

Historical incentive/challenge postings reused the same reference string.

## Principles (per CEO policy)

1. **Do not delete** wallet transactions or alter monetary amounts.
2. **Do not** mass-update production without backup and audit trail.
3. Constraint is desirable for **Moosyl duplicate protection** — keep the end state.
4. Resolution must be **auditable** (who/when/why for each row change).

## Recommended approach (three steps)

### Step A — Inventory (read-only, all environments)

Run on a DB snapshot or maintenance window:

```sql
SELECT wallet_id, reference, COUNT(*) AS c,
       GROUP_CONCAT(id) AS ids
FROM payments_wallettransaction
WHERE reference != ''
GROUP BY wallet_id, reference
HAVING c > 1;
```

Export CSV to finance + attach to change ticket.

### Step B — Data repair migration `0023` (forward-only)

For each duplicate group, **keep the earliest row** (`MIN(id)`) unchanged. For each additional row:

- Set `reference` to `'{original}#dup{transaction_id}'` **or**
- Set `reference` to `''` only if business rules allow empty references for that tx type.

**Do not** change `amount`, `wallet_id`, or delete rows.

Optional: insert `AuditLog` / finance note per adjusted id.

### Step C — Apply `0022` constraint

If `0022` partially applied on some envs, use `migrate --fake` only after DBA confirms constraint presence. Otherwise run `0023` then `0022` on clean envs.

## Local dev shortcut (optional, dev DB only)

After CEO approval for **dev machines only**:

```python
# Django shell — example for challenge:4 duplicates
from payments.models import WalletTransaction
dupes = WalletTransaction.objects.filter(wallet_id=6, reference="challenge:4").order_by("id")
keep = dupes.first()
for extra in dupes[1:]:
    extra.reference = f"challenge:4#dup{extra.id}"
    extra.save(update_fields=["reference"])
```

Then: `python manage.py migrate payments`

## Production approval required before

- Running Step B migration on staging/production.
- Any script that modifies `reference` fields in bulk.

## Verification after fix

```bash
python manage.py migrate payments
python manage.py test payments --verbosity=1
```

Confirm Moosyl webhook idempotency tests still pass (`tests_moosyl_options`, webhook tests).

---

*Status: **PROPOSAL ONLY** — not applied to production.*
