# YALA API Gateway — Webhook Guide

## Overview

Partners subscribe to platform events via webhook URLs. Events are delivered as signed JSON POST requests via Celery with exponential backoff retries.

## Supported Events

| Event | Trigger |
|-------|---------|
| `ride.accepted` | Driver assigned to ride |
| `ride.completed` | Ride completed |
| `order.created` | Delivery or merchant order created |
| `order.delivered` | Delivery delivered |
| `payment.received` | Payment completed |
| `withdrawal.completed` | Driver withdrawal completed |
| `merchant.approved` | Merchant approved |
| `driver.approved` | Driver profile approved |

## Subscription

Create via Developer Portal or API:

```http
POST /api-gateway/developer/webhooks/
{
  "application": 1,
  "url": "https://partner.example.com/webhooks/yala",
  "events": ["ride.completed", "payment.received"]
}
```

Each subscription receives a unique signing secret.

## Payload Format

```json
{
  "event_type": "ride.completed",
  "timestamp": "2026-07-21T12:00:00+00:00",
  "data": {
    "ride_id": 42,
    "status": "completed"
  }
}
```

## Signature Verification

Verify the `X-Webhook-Signature` header:

```
sha256=<hmac-sha256-hex of raw JSON body using subscription secret>
```

Also check `X-Webhook-Event` matches the payload `event_type`.

## Retries

Failed deliveries retry up to 5 times with exponential backoff (max 10 minutes between attempts).

## Testing

Platform admins can manually trigger events via the Analytics tab or:

```http
POST /api-gateway/admin/webhooks/trigger/
{"event_type": "ride.completed", "payload": {"ride_id": 1}}
```
