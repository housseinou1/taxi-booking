# YALA Enterprise v1.0 Support Playbook

**Document ID:** YALA-OPS-SUPPORT-001  
**Version:** 1.0.1  
**Effective date:** 2026-07-22  
**Primary queue:** https://www.yalataxi.live/admin/support  
**Launch coordination:** https://www.yalataxi.live/admin/launch  
**Pilot cohort cap:** ≤25 users — do not expand without CEO approval

## Purpose

This playbook defines launch-day support coverage, triage, escalation, response ownership, and communication paths for all YALA v1.0 audiences.

## Support Principles

1. Acknowledge first, investigate second.
2. Never promise refunds, payouts, or compensation before Finance approval.
3. Escalate safety, payment, data, and widespread outage reports immediately.
4. Link every support case to a rider, driver, courier, merchant, landlord, ride, delivery, payout, or incident ID when available.
5. Use approved launch messages only for public or broad-impact incidents.

## Launch Support Hours

| Window | Coverage |
| --- | --- |
| T-24 h to T-1 h | Support Lead on call, agents staged |
| Launch to +6 h | Live support bridge active |
| +6 h to +24 h | Extended live support with handoff |
| Day 2 to Day 7 | Twice-daily launch review plus normal queue |
| Day 8 to Day 30 | Daily launch operations review |

## Triage Matrix

| Category | First owner | Escalation | Target first response |
| --- | --- | --- | --- |
| Safety/SOS | Safety Manager | CEO, Operations Manager | Immediate |
| Payment/refund | Finance Support | Finance Manager | 15 minutes |
| Booking/ride | Customer Support | Operations Manager | 15 minutes |
| Driver app/account | Driver Support | Driver Ops Lead | 15 minutes |
| Merchant/order | Merchant Support | Merchant Ops Lead | 15 minutes |
| Courier/delivery | Courier Support | Delivery Ops Lead | 15 minutes |
| Landlord/property | Landlord Support | Operations Manager | 4 business hours |
| CEO escalation | Support Lead | CEO / Executive assistant | Immediate |

## Customer Support

### Common launch issues

| Issue | First response | Escalate when |
| --- | --- | --- |
| Cannot log in | Confirm email/phone, app type, network, screenshot | Multiple users report same issue |
| Cannot request ride | Capture pickup/destination, time, app version | API error, repeated failed bookings |
| Driver not moving | Check ride status, contact Operations | Safety concern or delay over threshold |
| Cancellation/refund | Record ride ID and reason | Payment captured or user requests refund |
| Rating/complaint | Capture complaint details | Safety, abuse, discrimination, fraud |

### Required notes

- Rider identifier.
- Ride ID or attempted booking time.
- Device/app type if available.
- Screenshot or exact error text.
- Action taken and escalation owner.

## Driver Support

### Common launch issues

| Issue | First response | Escalate when |
| --- | --- | --- |
| Cannot go online | Check approval, documents, signature, network | Multiple drivers affected or API 5xx |
| Earnings not loading | Confirm driver remains logged in, record error | Earnings endpoint returns 401/403/5xx |
| Ride request missed | Check online status, WebSocket/polling, location | Pattern across multiple drivers |
| App stuck on session check | Ask driver to wait 10 seconds and report version | Multiple devices stuck |
| Payout/withdrawal | Verify wallet status and payout method | Any money movement exception |

### Required notes

- Driver email/phone.
- Driver profile status.
- Online status at time of report.
- App version/build if known.
- Screenshot/error message.

## Merchant Support

### Common launch issues

| Issue | First response | Escalate when |
| --- | --- | --- |
| Merchant cannot log in | Confirm account and merchant status | Multiple merchants affected |
| Menu/catalog issue | Capture item/category and screenshot | Customer ordering blocked |
| Order not received | Check Merchant Platform and delivery queue | Orders visible to customer but not merchant |
| Settlement question | Record transaction/order IDs | Finance discrepancy |

### Required notes

- Merchant name and ID.
- Order ID if available.
- Menu item/category if relevant.
- Screenshot and timestamp.

## Courier Support

### Common launch issues

| Issue | First response | Escalate when |
| --- | --- | --- |
| Cannot go online | Check courier account and delivery settings | Multiple couriers affected |
| Delivery offer missing | Check delivery queue and courier status | Dispatch issue affects multiple couriers |
| Navigation/address issue | Coordinate with merchant/customer support | Safety or wrong-address risk |
| Proof of delivery issue | Capture delivery ID and screenshot | Completion blocked |

### Required notes

- Courier account.
- Delivery ID/order ID.
- Current status.
- Location/address issue details.

## Landlord Support

**v1.0 scope:** Real Estate product modules (Tenant, Landlord, Rent collection) are **not in YALA Enterprise v1.0**. Landlord inquiries during pilot relate to **YALA Academy** landlord-audience training or general platform support only — not property management workflows.

### Common launch issues

| Issue | First response | Escalate when |
| --- | --- | --- |
| Academy course access | Verify account; route to admin Academy module | Multiple users blocked |
| General platform inquiry | Capture contact; route to Operations | Urgent operational impact |
| Property/rent payment request | Explain out-of-scope for v1.0; log for v2 backlog | User expects product feature |

### Required notes

- Contact identity and email.
- Inquiry type (Academy vs product expectation).
- Whether user was told Real Estate is not in v1.0.

## Finance Support

### Common launch issues

| Issue | First response | Escalate when |
| --- | --- | --- |
| Duplicate charge | Capture transaction ID, user, amount | Any confirmed duplicate |
| Refund request | Verify eligibility and route approval | Above support limit or disputed |
| Driver payout issue | Capture driver wallet and payout method | Ledger mismatch or failed payout |
| Revenue mismatch | Compare Launch Hub and finance dashboard | Any unreconciled difference |

### Required notes

- Transaction/payment ID.
- User or driver/courier/merchant account.
- Amount and currency.
- Timestamp.
- Finance owner.

## CEO Escalations

### Trigger CEO escalation immediately for:

- SEV-1 incident.
- Safety/SOS failure or serious safety event.
- Payment corruption or broad financial exposure.
- Public reputation risk.
- Legal/regulatory risk.
- Launch Go / Hold / Rollback decision.

### CEO escalation format

| Field | Value |
| --- | --- |
| Situation | |
| Impact | |
| Current owner | |
| User/business risk | |
| Recommended decision | Continue / Hold / Rollback / Communicate |
| Next update time | |

## Approved User Messages

### Service issue

We are aware of a service issue affecting some YALA users. Our launch operations team is working on it now. Your request has been recorded, and we will update you as soon as possible.

### Payment review

Thank you for reporting this payment issue. Our finance team is reviewing the transaction. Please do not retry the same payment until we confirm the status.

### Driver availability issue

We are checking your driver account and online status. Please stay in the app and do not log out unless support asks you to.

### Safety issue

Your report has been escalated to YALA Safety immediately. Please stay reachable by phone. If there is immediate danger, contact local emergency services first.

## Shift Handoff Template

| Field | Notes |
| --- | --- |
| Shift | |
| Support lead | |
| Open SEV-1/SEV-2 | |
| Open payment cases | |
| Open safety cases | |
| Highest-volume ticket category | |
| Driver/courier issues | |
| Merchant issues | |
| CEO escalations | |
| Next shift risks | |

## Related Documents

- `operations/04_CUSTOMER_SUPPORT_MANUAL.md`
- `operations/05_DRIVER_OPERATIONS_MANUAL.md`
- `operations/06_DELIVERY_OPERATIONS_MANUAL.md`
- `operations/07_TRUST_AND_SAFETY_MANUAL.md`
- `operations/03_FINANCE_OPERATIONS_MANUAL.md`
- `operations/INCIDENT_PLAYBOOK.md`
