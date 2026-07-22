# YALA API Gateway — Integration Guide

**Version:** 1.0  
**Base URL:** `/api-gateway/v1/partner/`

## Overview

The YALA Integration Platform lets approved third-party partners consume platform data through a secure API gateway. All partner endpoints are read-only wrappers over existing YALA services — no duplicate business logic.

## Getting Started

1. Register a **Partner Organization** via the Developer Portal (`/admin/api-gateway`).
2. Wait for Platform Admin approval.
3. Create an **Application** with required scopes.
4. Generate an **API Key** (returned once — store securely).
5. Call partner endpoints with the `X-API-Key` header.

## Partner API Endpoints

| Endpoint | Scope | Description |
|----------|-------|-------------|
| `GET /rides/` | `rides:read` | List recent rides |
| `GET /rides/{id}/` | `rides:read` | Ride status detail |
| `GET /deliveries/` | `deliveries:read` | Delivery orders |
| `GET /merchant-orders/` | `merchants:read` | Merchant orders |
| `GET /driver-availability/` | `drivers:read` | Driver availability snapshot |
| `GET /wallet/` | `wallets:read` | Wallet balances |
| `GET /payments/` | `payments:read` | Payment records |
| `GET /invoices/` | `finance:read` | Payouts and settlements |
| `GET /reports/` | `reports:read` | Aggregated platform reports |
| `POST /notifications/` | `notifications:write` | Send push notification |

## Versioning

Partner APIs are versioned under `/api-gateway/v1/partner/`. Breaking changes will increment the version prefix.

## Rate Limiting

Each application has a configurable rate limit (default 100 requests/minute). Exceeding the limit returns HTTP 429.

## Support

Contact Developer Relations for onboarding assistance.
