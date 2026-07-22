# YALA — API Catalog

**Document ID:** YALA-ENG-API-002  
**Version:** 1.0.0  
**Effective:** 2026-07-21  
**Base URL:** `https://api.yalataxi.live`

---

## 1. Global conventions

### Authentication

| Method | Header / mechanism | Used by |
|--------|-------------------|---------|
| JWT Bearer | `Authorization: Bearer <access_token>` | Mobile apps, admin SPA |
| JWT refresh | `POST /auth/token/refresh/` | Token renewal |
| WebSocket JWT | `?token=<access_token>` on WS URL | Real-time clients |
| API Key | `X-API-Key` + HMAC (partner gateway) | `/api-gateway/v1/partner/` |
| Django admin session | Cookie (Django admin only) | `/admin/` (Django admin site) |

**Default permission:** `IsAuthenticated` on all DRF views unless noted.

### Common request headers

| Header | Value | Required |
|--------|-------|----------|
| `Authorization` | `Bearer <token>` | Authenticated endpoints |
| `Content-Type` | `application/json` | POST/PATCH/PUT bodies |
| `Accept` | `application/json` | Recommended |
| `x-app-type` | `rider` / `driver` / `delivery` / `admin` | Optional; CORS allowed |

### Standard error response

```json
{
  "detail": "Human-readable error message"
}
```

Validation errors (400):

```json
{
  "field_name": ["Error message"],
  "non_field_errors": ["Cross-field error"]
}
```

### HTTP status codes

| Code | Meaning | Typical cause |
|------|---------|---------------|
| 200 | OK | Successful GET/PATCH |
| 201 | Created | Successful POST create |
| 204 | No Content | Successful DELETE |
| 400 | Bad Request | Validation failure |
| 401 | Unauthorized | Missing/invalid JWT |
| 403 | Forbidden | Insufficient role/permission |
| 404 | Not Found | Resource does not exist |
| 409 | Conflict | Duplicate, state conflict |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Server Error | Unhandled server error |
| 503 | Service Unavailable | Maintenance / dependency down |

### Rate limits

| Layer | Limit |
|-------|-------|
| DRF anonymous | 60/min |
| DRF authenticated | 300/min |
| nginx auth routes | 10/min |
| nginx general API | 3000/min |
| Partner API key | Configurable per app (default 100/min) |

---

## 2. Authentication

### Core auth endpoints

| URL | Method | Auth | Description |
|-----|--------|------|-------------|
| `/auth/register/` | POST | AllowAny | Register new user |
| `/auth/login/` | POST | AllowAny | Login, returns JWT pair |
| `/auth/token/refresh/` | POST | AllowAny | Refresh access token |
| `/auth/me/` | GET | JWT | Current user profile |
| `/auth/identity/update/` | POST, PATCH | JWT | Update identity fields |
| `/auth/logout-all-devices/` | POST | JWT | Revoke all device sessions |
| `/auth/devices/` | GET | JWT | List active devices |
| `/auth/phone/request-code/` | POST | JWT | Request phone OTP |
| `/auth/phone/verify/` | POST | JWT | Verify phone OTP |
| `/auth/forgot-password/` | POST | AllowAny | Initiate password reset |
| `/auth/reset-password/` | POST | AllowAny | Complete password reset |
| `/auth/users/<user_id>/block/` | POST | Admin | Block user |
| `/auth/users/<user_id>/unblock/` | POST | Admin | Unblock user |
| `/merchants/register/` | POST | AllowAny | Merchant registration |
| `/merchants/login/` | POST | AllowAny | Merchant login |

#### `POST /auth/login/`

**Request:**
```json
{
  "email": "rider@example.com",
  "password": "securepassword"
}
```

**Response (200):**
```json
{
  "access": "<access_token>",
  "refresh": "<refresh_token>",
  "user": {
    "id": 1,
    "email": "rider@example.com",
    "user_type": "rider",
    "phone_verified": true
  }
}
```

**Errors:** `401` invalid credentials · `429` rate limited

#### `POST /auth/token/refresh/`

**Request:**
```json
{ "refresh": "<refresh_token>" }
```

**Response (200):**
```json
{
  "access": "<new_access_token>",
  "refresh": "<new_refresh_token>"
}
```

**Errors:** `401` token expired/blacklisted

---

## 3. Rider

| URL | Method | Auth | Description |
|-----|--------|------|-------------|
| `/rides/request/` | POST | JWT | Request immediate ride |
| `/rides/schedule/` | POST | JWT | Schedule future ride |
| `/rides/scheduled/` | GET | JWT | List scheduled rides |
| `/rides/active/` | GET | JWT | Current active ride |
| `/rides/history/` | GET | JWT | Ride history |
| `/rides/<ride_id>/` | GET | JWT | Ride detail |
| `/rides/cancel/<ride_id>/` | POST | JWT | Cancel ride |
| `/rides/rate/<ride_id>/` | POST | JWT | Rate driver |
| `/rides/<ride_id>/stops/` | POST | JWT | Add stop |
| `/promotions/validate/` | POST | JWT | Validate promo code |
| `/promotions/apply/` | POST | JWT | Apply promo to ride |
| `/loyalty/me/` | GET | JWT | Loyalty status |
| `/loyalty/redeem/` | POST | JWT | Redeem reward |
| `/referrals/rider/code/` | GET | JWT | Referral code |
| `/safety/sos/` | POST | JWT | Trigger SOS |
| `/safety/contacts/` | GET, POST | JWT | Emergency contacts |
| `/safety/trip-share/` | POST | JWT | Create trip share link |
| `/chat/<ride_id>/messages/` | GET | JWT | Ride chat messages |
| `/chat/<ride_id>/send/` | POST | JWT | Send chat message |

#### `POST /rides/request/`

**Request:**
```json
{
  "pickup_latitude": 18.0735,
  "pickup_longitude": -15.9582,
  "pickup_address": "Nouakchott, Mauritania",
  "destination_latitude": 18.0850,
  "destination_longitude": -15.9650,
  "destination_address": "Destination",
  "ride_type": "standard",
  "payment_method": "wallet"
}
```

**Response (201):**
```json
{
  "id": 1234,
  "status": "requested",
  "dispatch_status": "searching",
  "estimated_fare": 150.0,
  "currency": "MRU",
  "pickup_pin": "4829"
}
```

**Errors:** `400` invalid coords · `402` insufficient wallet · `409` active ride exists

---

## 4. Driver

| URL | Method | Auth | Description |
|-----|--------|------|-------------|
| `/drivers/register/` | POST | JWT | Register as driver |
| `/drivers/me/` | GET | JWT | Driver profile |
| `/drivers/availability/toggle/` | POST | JWT | Go online/offline |
| `/drivers/location/update/` | POST | JWT | Update GPS |
| `/drivers/me/earnings/` | GET | JWT | Earnings summary |
| `/drivers/me/documents/upload/` | POST | JWT | Upload document |
| `/rides/available/` | GET | JWT | Available ride offers |
| `/rides/accept/<ride_id>/` | POST | JWT | Accept ride |
| `/rides/decline/<ride_id>/` | POST | JWT | Decline ride |
| `/rides/arrived/<ride_id>/` | POST | JWT | Mark arrived |
| `/rides/verify-pin/<ride_id>/` | POST | JWT | Verify pickup PIN |
| `/rides/start/<ride_id>/` | POST | JWT | Start ride |
| `/rides/complete/<ride_id>/` | POST | JWT | Complete ride |
| `/rides/rate-rider/<ride_id>/` | POST | JWT | Rate rider |
| `/shifts/my-shifts/` | GET, POST | JWT | Manage shifts |
| `/incentives/my-progress/` | GET | JWT | Incentive progress |
| `/drivers/approve/<driver_id>/` | POST | Admin | Approve driver |

#### `POST /rides/accept/<ride_id>/`

**Request:** `{}` (empty body)

**Response (200):**
```json
{
  "id": 1234,
  "status": "accepted",
  "rider": { "id": 10, "phone": "+222..." },
  "pickup_latitude": 18.0735,
  "pickup_longitude": -15.9582
}
```

**Errors:** `403` not offered to driver · `409` already accepted · `410` offer expired

---

## 5. Delivery

| URL | Method | Auth | Description |
|-----|--------|------|-------------|
| `/deliveries/estimate/` | POST | JWT | Fare estimate |
| `/deliveries/request/` | POST | JWT | Request delivery |
| `/deliveries/mine/` | GET | JWT | Customer deliveries |
| `/deliveries/<delivery_id>/` | GET | JWT | Delivery detail |
| `/deliveries/<delivery_id>/tracking/` | GET | JWT | Tracking info |
| `/deliveries/<delivery_id>/cancel/` | POST | JWT | Cancel delivery |
| `/deliveries/<delivery_id>/pay/` | POST | JWT | Pay for delivery |
| `/deliveries/available/` | GET | JWT | Courier available list |
| `/deliveries/<delivery_id>/accept/` | POST | JWT | Accept delivery |
| `/deliveries/<delivery_id>/pickup/` | POST | JWT | Confirm pickup |
| `/deliveries/<delivery_id>/confirm/` | POST | JWT | Confirm delivery |
| `/deliveries/courier/onboarding/` | GET | JWT | Courier onboarding status |
| `/deliveries/courier/location/` | POST | JWT | Update courier GPS |
| `/deliveries/courier/earnings/` | GET | JWT | Courier earnings |

#### `POST /deliveries/request/`

**Request:**
```json
{
  "pickup_address": "Merchant address",
  "pickup_latitude": 18.07,
  "pickup_longitude": -15.96,
  "destination_address": "Customer address",
  "destination_latitude": 18.08,
  "destination_longitude": -15.97,
  "service_category": "food",
  "payment_method": "cod"
}
```

**Response (201):**
```json
{
  "id": 567,
  "status": "requested",
  "estimated_fare": 80.0,
  "currency": "MRU"
}
```

---

## 6. Merchant

| URL | Method | Auth | Description |
|-----|--------|------|-------------|
| `/merchants/me/` | GET, PATCH | MerchantOwner | Merchant profile |
| `/merchants/stores/` | GET | AllowAny | Public store list |
| `/merchants/products/` | GET, POST | ApprovedMerchant | Product CRUD |
| `/merchants/menu/categories/` | GET, POST | ApprovedMerchant | Menu categories |
| `/merchants/cart/checkout/` | POST | JWT | Checkout cart |
| `/merchants/orders/` | GET | ApprovedMerchant | Merchant orders |
| `/merchants/orders/<order_id>/action/` | POST | ApprovedMerchant | Accept/reject order |
| `/merchants/settlements/` | GET | MerchantOwner | Settlement history |
| `/merchants/dashboard/analytics/` | GET | MerchantOwner | Analytics |

**Permission classes:** `IsMerchantOwner`, `IsApprovedMerchant` (`merchants/permissions.py`)

#### `POST /merchants/cart/checkout/`

**Request:**
```json
{
  "merchant_id": 5,
  "delivery_address": "Customer address",
  "payment_method": "wallet"
}
```

**Response (201):**
```json
{
  "order_id": 89,
  "status": "pending",
  "total": 450.0,
  "delivery_id": 567
}
```

---

## 7. Wallet

| URL | Method | Auth | Description |
|-----|--------|------|-------------|
| `/payments/wallet/` | GET | JWT | Wallet balance |
| `/payments/wallet/top-up/` | POST | JWT | Top up wallet |
| `/payments/wallet/history/` | GET | JWT | Transaction history |
| `/payments/wallet/pay-ride/<ride_id>/` | POST | JWT | Pay ride from wallet |
| `/payments/wallet/pay-delivery/<delivery_id>/` | POST | JWT | Pay delivery |
| `/payments/wallet/pay-merchant-order/<order_id>/` | POST | JWT | Pay merchant order |
| `/payments/wallet/withdrawals/` | POST | JWT | Request withdrawal |
| `/payments/courier/summary/` | GET | JWT | Courier wallet |
| `/payments/merchant/summary/` | GET | MerchantOwner | Merchant wallet |

#### `GET /payments/wallet/`

**Response (200):**
```json
{
  "balance": 1250.50,
  "currency": "MRU",
  "available_balance": 1200.50,
  "pending_withdrawals": 50.0
}
```

---

## 8. Payments

| URL | Method | Auth | Description |
|-----|--------|------|-------------|
| `/payments/methods/` | GET | JWT | Saved payment methods |
| `/payments/methods/save/` | POST | JWT | Save method |
| `/payments/create/` | POST | JWT | Create payment |
| `/payments/my-payments/` | GET | JWT | Payment history |
| `/payments/withdrawals/request/` | POST | JWT | Withdrawal request |
| `/payments/withdrawals/<id>/approve/` | POST | Admin | Approve withdrawal |
| `/payments/withdrawals/<id>/mark-paid/` | POST | Admin | Mark paid |
| `/payments/refunds/request/` | POST | JWT | Request refund |
| `/payments/admin/refunds/<id>/approve/` | POST | Admin | Approve refund |
| `/payments/webhooks/stripe/` | POST | AllowAny | Stripe webhook |

#### `POST /payments/withdrawals/request/`

**Request:**
```json
{
  "amount": 5000.0,
  "payout_method_id": 3,
  "idempotency_key": "uuid-v4"
}
```

**Response (201):**
```json
{
  "id": 42,
  "status": "pending",
  "amount": 5000.0
}
```

**Errors:** `400` below minimum · `403` fraud hold · `409` duplicate idempotency key

---

## 9. Finance (Operations)

**Prefix:** `/operations/business/finance/operations/`  
**Permission:** `IsFinanceStaff` (CEO, Super Admin, Accountant, Finance)

| URL | Method | Auth | Description |
|-----|--------|------|-------------|
| `/operations/business/finance/operations/` | GET | FinanceStaff | Dashboard aggregate |
| `.../reconciliation/` | GET | FinanceStaff | Daily reconciliation |
| `.../providers/` | GET | FinanceStaff | Payment provider breakdown |
| `.../withdrawals/` | GET | FinanceStaff | Withdrawal queue |
| `.../revenue/` | GET | FinanceStaff | Revenue analytics |
| `.../accounting/` | GET | FinanceStaff | Accounting reports |
| `.../audit/` | GET | FinanceStaff | Finance audit trail |
| `.../export/` | GET | FinanceStaff | CSV/XLSX/PDF export |
| `/operations/incentive-engine/finance/` | GET | FinanceStaff | Incentive payouts |
| `/operations/merchant-platform/settlements/<id>/approve/` | POST | FinanceStaff | Approve merchant settlement |
| `/operations/partner-platform/settlements/<id>/approve/` | POST | PartnerFinance | Approve partner settlement |
| `/partners/settlements/` | GET | PartnerPortal | Partner portal settlements |

#### `GET /operations/business/finance/operations/reconciliation/?date=2026-07-21`

**Response (200):**
```json
{
  "date": "2026-07-21",
  "status": "balanced",
  "ride_revenue": 45000.0,
  "delivery_revenue": 12000.0,
  "commission": 17100.0,
  "wallet_deposits": 8000.0,
  "wallet_withdrawals": 15000.0,
  "failed_payments": 3,
  "refunds": 500.0
}
```

---

## 10. Operations

**Prefix:** `/operations/` (~220 endpoints)  
**Permission:** Role-specific (`IsExecutiveStaff`, `IsLaunchCommandStaff`, `IsCeoStaff`, etc.)

### Operations Center (`IsExecutiveStaff`)

| URL | Method | Description |
|-----|--------|-------------|
| `/operations/center/dashboard/` | GET | Live dashboard |
| `/operations/center/fleet/` | GET | Fleet overview |
| `/operations/center/map/` | GET | Live map data |
| `/operations/center/trips/` | GET | Active trips |
| `/operations/center/deliveries/` | GET | Active deliveries |
| `/operations/center/emergency/` | GET | Emergency panel |
| `/operations/center/rides/<id>/force-assign/` | POST | Force assign driver |
| `/operations/center/rides/<id>/cancel/` | POST | Ops cancel ride |

### Launch Command (`IsLaunchCommandStaff`)

| URL | Method | Description |
|-----|--------|-------------|
| `/operations/command/` | GET | Command dashboard |
| `/operations/command/ceo/export/` | GET | CEO summary export |
| `/operations/command/incidents/` | GET, POST | Ops incidents |
| `/operations/command/onboarding/pause/` | GET, POST | Pause onboarding |
| `/operations/command/broadcast/` | POST | Broadcast message |

### Trust & Safety (`IsLaunchCommandStaff`)

| URL | Method | Description |
|-----|--------|-------------|
| `/operations/trust-safety/` | GET | T&S dashboard |
| `/operations/trust-safety/incidents/` | GET | Incident queue |
| `/operations/trust-safety/incidents/<id>/` | GET, PATCH | Manage incident |
| `/operations/trust-safety/monitoring/` | POST | Run safety scan |
| `/operations/trust-safety/drivers/<user_id>/` | GET | Driver safety profile |
| `/operations/trust-safety/ceo/` | GET | CEO safety metrics |

### CEO Master (`IsCeoStaff`)

| URL | Method | Description |
|-----|--------|-------------|
| `/operations/ceo-master/` | GET | Master dashboard |
| `/operations/ceo-master/finance/` | GET | CEO finance view |
| `/operations/ceo-master/actions/approve-payout/` | POST | CEO payout approval |
| `/operations/ceo-master/actions/freeze/` | POST | Platform freeze |

### Other operations modules

| Prefix | Permission | Purpose |
|--------|------------|---------|
| `/operations/executive/` | ExecutiveStaff | Executive dashboard |
| `/operations/launch/` | ExecutiveStaff | Launch hub |
| `/operations/fleet/` | FleetStaff | Fleet performance |
| `/operations/growth/` | CeoStaff | Growth expansion |
| `/operations/multi-city/` | MultiCityStaff | Multi-city ops |
| `/operations/smart-engine/` | LaunchCommandStaff | Pricing & dispatch |
| `/operations/incentive-engine/` | LaunchCommandStaff | Driver incentives |
| `/operations/merchant-platform/` | Staff roles | Merchant admin |
| `/operations/partner-platform/` | Staff roles | Partner admin |
| `/operations/customer-growth/` | Staff roles | Loyalty & promos |
| `/operations/compliance-governance/` | ComplianceOrCeo | Compliance center |
| `/operations/board-reports/` | BoardOrCeo | Board reporting |
| `/operations/bi/` | AnalyticsStaff | Business intelligence |

---

## 11. Reports

| URL | Method | Auth | Description |
|-----|--------|------|-------------|
| `/operations/board-reports/` | GET | BoardOrCeo | Board suite |
| `/operations/board-reports/financial/` | GET | BoardOrCeo | Financial report |
| `/operations/board-reports/<type>/export/` | GET | BoardOrCeo | Export PDF/CSV |
| `/operations/bi/executive-analytics/` | GET | AnalyticsStaff | BI analytics |
| `/operations/bi/reports/<type>/export/` | GET | AnalyticsStaff | BI export |
| `/operations/fleet/reports/export/` | GET | FleetStaff | Fleet export |
| `/operations/trust-safety/reports/?type=daily` | GET | LaunchCommandStaff | Safety reports |
| `/operations/beta/ceo-report/` | GET | ExecutiveStaff | Beta CEO report |
| `/operations/command/ceo/export/` | GET | LaunchCommandStaff | CEO daily export |

---

## 12. Notifications

| URL | Method | Auth | Description |
|-----|--------|------|-------------|
| `/notifications/fcm/register/` | POST | JWT | Register FCM token |
| `/notifications/fcm/unregister/` | POST | JWT | Unregister FCM |
| `/notifications/push/subscribe/` | POST | JWT | Web push subscribe |
| `/notifications/register-device/` | POST | JWT | Register device |
| `/notifications/history/` | GET | JWT | Notification history |
| `/notifications/read/` | POST | JWT | Mark as read |

#### `POST /notifications/fcm/register/`

**Request:**
```json
{
  "token": "fcm_device_token",
  "device_id": "unique-device-id",
  "platform": "android"
}
```

**Response (200):**
```json
{ "status": "registered" }
```

---

## 13. Health & system

| URL | Method | Auth | Description |
|-----|--------|------|-------------|
| `/health/` | GET, HEAD | AllowAny | Readiness (DB + Redis) |
| `/api/health/live/` | GET, HEAD | AllowAny | Liveness probe |
| `/api/health/ready/` | GET, HEAD | AllowAny | Readiness probe |
| `/api/health/status/` | GET | Admin | Full production status |

#### `GET /api/health/ready/`

**Response (200):**
```json
{
  "status": "ok",
  "database": "ok",
  "redis": "ok"
}
```

**Response (503):** dependency unhealthy

---

## 14. Partner API Gateway

**Prefix:** `/api-gateway/v1/partner/`  
**Auth:** `X-API-Key` + scope validation

| URL | Method | Scope | Description |
|-----|--------|-------|-------------|
| `/api-gateway/v1/partner/rides/` | GET | rides:read | List rides |
| `/api-gateway/v1/partner/deliveries/` | GET | deliveries:read | List deliveries |
| `/api-gateway/v1/partner/wallet/` | GET | wallet:read | Partner wallet |
| `/api-gateway/v1/partner/payments/` | GET | payments:read | Payments |
| `/api-gateway/v1/partner/reports/` | GET | reports:read | Reports |
| `/api-gateway/v1/partner/notifications/` | POST | notifications:write | Send notification |

**Developer portal:** `/api-gateway/developer/` (JWT-authenticated org/app/key management)

---

## 15. WebSocket API

| URL | Auth | Events |
|-----|------|--------|
| `wss://api.yalataxi.live/ws/rides/?token=<jwt>` | JWT query | `ride_offer`, `ride_status`, `location_update` |
| `wss://api.yalataxi.live/ws/deliveries/?token=<jwt>` | JWT query | `delivery_update`, `chat_message` |

**Error:** Connection closed with code 4001 if JWT invalid/expired.

---

## 16. Endpoint count summary

| Category | Approx. endpoints |
|----------|-------------------|
| Authentication | 27 |
| Rider | 45 |
| Driver | 75 |
| Delivery | 55 |
| Merchant | 28 |
| Wallet | 14 |
| Payments | 28 |
| Finance | 25 |
| Operations | 220 |
| Reports | 30 |
| Notifications | 8 |
| System / Health | 15 |
| **Total** | **550+** |

**Source files:**
- Root: `backend/taxi/taxi/urls.py`
- Operations: `backend/taxi/operations/urls.py`
- Per-app: `backend/taxi/<app>/urls.py`

---

## 17. Document control

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-07-21 | Initial API catalog |

For OpenAPI/Swagger generation, consider adding `drf-spectacular` in a future release. Current catalog is derived from URL routing and view permissions.
