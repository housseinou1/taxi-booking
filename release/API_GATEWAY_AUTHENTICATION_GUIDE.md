# YALA API Gateway — Authentication Guide

## Authentication Methods

### 1. API Keys (Primary)

Include your API key in every request:

```http
X-API-Key: yala_<your-key>
```

Keys are generated in the Developer Portal and shown **once** at creation. Store the key and signing secret securely.

### 2. JWT (Developer Portal)

Administrative portal endpoints (`/api-gateway/developer/`, `/api-gateway/admin/`) use standard YALA JWT authentication (same as the admin dashboard).

### 3. Request Signing (Optional, Recommended)

For write endpoints and sensitive reads, sign requests with HMAC-SHA256:

```http
X-API-Timestamp: 1720000000
X-API-Signature: <hex-digest>
```

**Message format:** `{timestamp}.{METHOD}.{path}.{body}`

The signature uses your API key secret. Timestamps must be within 5 minutes of server time.

### 4. IP Whitelisting

Configure allowed IPs/CIDR blocks per application in the Developer Portal. Requests from non-whitelisted IPs are rejected.

### 5. OAuth2

OAuth2 is planned for future releases. Currently disabled (`API_GATEWAY_OAUTH2_ENABLED = False`).

## Key Rotation

Rotate keys via `POST /api-gateway/developer/api-keys/{id}/rotate/`. The old key remains valid during a 7-day grace period.

## Scopes

Each application declares permitted scopes. Missing scope returns HTTP 403.

| Scope | Access |
|-------|--------|
| `rides:read` | Ride endpoints |
| `deliveries:read` | Delivery endpoints |
| `merchants:read` | Merchant order endpoints |
| `drivers:read` | Driver availability |
| `wallets:read` | Wallet endpoints |
| `payments:read` | Payment endpoints |
| `finance:read` | Invoice endpoints |
| `reports:read` | Report endpoints |
| `notifications:write` | Notification POST |

## Role Permissions

| Role | Access |
|------|--------|
| CEO | Full analytics + CEO dashboard |
| Platform Admin | Approve partners, analytics, logs |
| Developer Relations | Portal admin, analytics |
| Partner Admin | Own organization, apps, keys, webhooks |
