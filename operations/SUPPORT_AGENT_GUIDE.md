# YALA Support Agent Guide — Operations Control Center

**Document ID:** YALA-OPS-SUPPORT-001  
**Version:** 1.0.0  
**Effective date:** 2026-07-22  
**Primary console:** Operations Control Center → Support Center (`/admin/ops-control`)  
**Full queue:** Support Center (`/admin/support`)

## Role

Customer support agents handle rider, driver, and delivery issues during live commercial operations. The OCC Support module provides search, refunds, promo credits, and quick links without replacing the full Support Center queue workflow.

## Daily workflow

### 1. Start of shift

1. Open `/admin/ops-control` → **Support Center**
2. Review open ticket count on KPI bar
3. Open **Task Board** module → take assigned tickets or pull from open queue
4. Check refund queue for pending requests

### 2. Handle incoming contact

For each rider/driver contact:

1. **Identify** — search by email, phone, trip ID, or ticket reference
2. **Verify** — confirm ride ID, time, and account email match
3. **Classify** — ride, payment, account, emergency, lost property
4. **Act** — refund, promo, escalate to incident, or resolve in Support Center
5. **Document** — update ticket status and assign owner in `/admin/support`

## Search procedures

### Search rider

1. Enter rider email or name in search box
2. Review matching support tickets (category `rider`, `ride`, `payment`)
3. Cross-check live trips if issue is active

### Search driver

1. Enter driver email or name
2. Review tickets with `app_type: driver`
3. Link to Fleet module for document/status context (`/admin/fleet`)

### Search trip

1. Enter numeric trip ID
2. Live trips appear if ride is active
3. For completed trips → Admin → Rides or rider history tools

API: client-side filter on `GET /operations/support/` + ops center trips

## Refund procedures

### When to refund

| Scenario | Action |
|----------|--------|
| Driver no-show (verified) | Full refund |
| Duplicate charge | Full refund of duplicate |
| Partial service failure | Partial refund — supervisor approval if > 2,000 MRU |
| Rider cancellation fee dispute | Review policy → refund or deny with note |

### How to process

1. Support Center → **Refund queue** in OCC Support module
2. Verify refund request status = `requested`
3. Click **Approve** or **Reject**
4. API: `POST /payments/admin/refunds/{id}/approve/` or `/reject/`

Always add context in admin note when rejecting.

### Escalation

- Refund > 5,000 MRU → Finance Operations (`/admin/finance-ops`)
- Suspected fraud → Trust & Safety + do not refund until review

## Promo credit procedures

Use promo credits for goodwill gestures (delayed ride, app issue):

1. Generate unique code (e.g. `SORRY-{DATE}-{INITIALS}`)
2. Set discount amount in MRU
3. Click **Create promo** in Support module
4. Communicate code to rider via approved channel

API: `POST /operations/customer-growth/promos/`

Limits:

- Max 1,000 MRU without supervisor approval
- Max 3 promo codes per rider per month (track manually until CRM rule exists)

## Ride & payment history

| Need | Location |
|------|----------|
| Active ride status | OCC Dispatch or Support search |
| Completed ride history | Admin → Rides |
| Payment records | `/admin/payments` |
| Withdrawal issues | Admin → Withdrawals or Finance Ops |

## Internal notes

1. Assign ticket to yourself: Support module → **Take ticket** or full Support Center
2. Update status: `open` → `assigned` → `waiting` → `resolved` → `closed`
3. Patch API: `PATCH /operations/support/{id}/` with `{ status, owner_id }`

For detailed notes, use Support Center ticket description thread and metadata fields.

## Emergency handling

If rider/driver reports immediate danger:

1. **Do not** mark as routine support ticket only
2. Open OCC → **Incidents** → create **Emergency event** (critical)
3. Notify dispatch via Operations channel
4. If active ride: Dispatch module → contact parties, escalate driver pause
5. Follow [INCIDENT_MANAGEMENT_GUIDE.md](./INCIDENT_MANAGEMENT_GUIDE.md)

## SLA targets

| Priority | First response | Resolution |
|----------|----------------|------------|
| P0 Emergency | 5 min | 1 hour |
| P1 High | 30 min | 4 hours |
| P2 Medium | 4 hours | 24 hours |
| P3 Low | 24 hours | 72 hours |

## Quality standards

- Use rider/driver name; remain professional in French/Arabic as needed
- Never share other users' personal data
- Confirm resolution with customer before closing
- Tag recurring issues for product/engineering review

## Quick links

| Tool | URL |
|------|-----|
| Operations Control Center | `/admin/ops-control` |
| Full Support Center | `/admin/support` |
| Incident guide | [INCIDENT_MANAGEMENT_GUIDE.md](./INCIDENT_MANAGEMENT_GUIDE.md) |
| Daily playbook | [DAILY_OPERATIONS_PLAYBOOK.md](./DAILY_OPERATIONS_PLAYBOOK.md) |
