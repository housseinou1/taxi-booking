# Phase 38 — YALA API Gateway & Integration Platform Design

**Date:** 2026-07-21  
**Status:** Design documented; lightweight implementation planned

---

## 1. Vision

Provide a secure integration platform that allows approved third-party partners to consume Yala services without modifying existing business logic. The platform supports partner registration, application management, API key lifecycle, webhook subscriptions, rate limiting, request logging, and analytics dashboards for administrators.

---

## 2. API Gateway

### Responsibilities
- **Authentication**: API key in `X-API-Key` header or signed request with HMAC.
- **Authorization**: Scopes attached to each application control access to ride, delivery, merchant, payment, etc. endpoints.
- **Versioning**: Partner API URLs include a version segment (`/api/v1/partner/...`).
- **Rate limiting**: Per-application token-bucket limits stored in Redis/Django cache.
- **Request validation**: DRF serializers validate incoming payloads.
- **API analytics**: `APIGatewayLog` records every partner request.
- **Logging**: All requests and responses logged; errors sent to audit service.

### Architecture
```
Partner Request
    │
    ▼
[Rate Limiting Middleware]
    │
    ▼
[API Key Authentication]
    │
    ▼
[Scope Authorization]
    │
    ▼
[Partner API View]
    │
    ▼
[Existing Internal Service / API]
```

---

## 3. Developer Portal

### Partner Lifecycle
1. **Partner Organization Registration** — manual or self-service with approval.
2. **Application Creation** — partner creates one or more applications.
3. **API Key Generation** — unique key + secret for request signing.
4. **Key Rotation** — generate new key, deprecate old key after grace period.
5. **Usage Viewing** — analytics from `APIGatewayLog`.
6. **Documentation Download** — OpenAPI spec and guides.

---

## 4. Partner APIs

All partner APIs are read-only or action wrappers that delegate to existing internal services/endpoints.

| API | Internal Source | Partner Capability |
|-----|----------------|--------------------|
| Ride Booking | Existing ride creation flow (future action wrapper) | Request ride on behalf of approved merchant |
| Ride Status | `Ride` model | Track ride status |
| Delivery Orders | `Delivery` model | Track delivery orders |
| Merchant Orders | `MerchantOrder` model | List/track orders |
| Driver Availability | `DriverProfile` | Count/availability snapshot |
| Wallet | `WalletAccount` | Balance/transaction queries |
| Payments | `PaymentRecord` | Payment status |
| Invoices | `MerchantPayout` / settlements | Invoice list |
| Reports | Operations dashboards | Aggregated reports |
| Notifications | Webhook subscriptions | Event push |

---

## 5. Webhooks

### Supported Events
- `ride.accepted`
- `ride.completed`
- `order.created`
- `order.delivered`
- `payment.received`
- `withdrawal.completed`
- `merchant.approved`
- `driver.approved`

### Subscription Model
- Each application registers webhook URLs and event types.
- A Celery task dispatches signed POST requests.
- Retries with exponential backoff.

---

## 6. API Security

| Control | Implementation |
|---------|---------------|
| OAuth2 | Placeholder for future authorization-server integration; API key + HMAC used initially |
| JWT | Existing JWT auth for admin/developer portal; API keys for partner machine clients |
| API Keys | `APIKey` model with hashed key and secret |
| IP Whitelisting | `allowed_ips` field per application |
| Request Signing | HMAC-SHA256 of timestamp + method + path + body using shared secret |
| Rate Limiting | Cache-based token bucket (Redis preferred, Django cache fallback) |
| Audit Logging | `APIGatewayLog` + `security.services.audit_service.log_from_request` |

---

## 7. API Analytics

Dashboard metrics:
- Active integrations (approved partners/applications)
- API calls (total, per endpoint, per application)
- Success rate (`2xx` / total)
- Errors (`4xx`, `5xx` counts)
- Latency (avg, p95, p99)
- Top consumers (by API calls)

---

## 8. Documentation

Deliverables:
- OpenAPI 3.0 spec auto-generated from DRF spectacular (`drf_spectacular`) for partner endpoints.
- `API_GATEWAY_INTEGRATION_GUIDE.md` — onboarding, auth, scopes, rate limits.
- `API_GATEWAY_AUTHENTICATION_GUIDE.md` — API key and HMAC signing.
- `API_GATEWAY_WEBHOOK_GUIDE.md` — subscriptions, payload format, retries, signature verification.
- SDK examples in Python and cURL.

---

## 9. CEO Dashboard

Sections:
- Total integrations (partners, applications)
- API revenue placeholder
- Partner activity (calls in last 24h/7d)
- Top integrators by call volume
- Platform usage by endpoint

---

## 10. Implementation Plan

1. Create `api_gateway` Django app.
2. Define models: `PartnerOrganization`, `PartnerApplication`, `APIKey`, `WebhookSubscription`, `APIGatewayLog`.
3. Register app and run migrations.
4. Implement permissions, rate limiting middleware, request logging decorator.
5. Implement developer portal admin endpoints (register, apps, keys, webhooks, usage).
6. Implement partner API endpoints delegating to existing services.
7. Implement webhook dispatch utility and Celery task.
8. Build React Developer Portal and API Gateway Analytics pages.
9. Wire routes and navigation.
10. Verify backend checks, tests, and frontend build.
11. Produce implementation report.

---

## 11. Roles & Permissions

| Role | Permissions |
|------|-------------|
| CEO | View analytics dashboard, approve partners, view all integrations |
| Platform Admin | Manage partners, applications, scopes, rate limits |
| Developer Relations | Review partner applications, view usage |
| Partner Admin | Manage own organization, applications, keys, webhooks, view own usage |
