"""Moosyl aggregator adapter — Bankily, Sedad, Masrvi, BimBank, BCI Pay, Amanty.

WHY AN ADAPTER RATHER THAN A DIRECT BANK INTEGRATION
----------------------------------------------------
Mauritanian banks publish no merchant/developer API. Moosyl is the authorized
aggregator that exposes them behind one API — the route already recorded in
``unconfigured.py`` and in ``.agents/tasks/payments-real-money-readiness-report.md``.

DOCUMENTED CONTRACT (docs.moosyl.com, retrieved 2026-11-06)
----------------------------------------------------------
* Base URL ``https://api.moosyl.com`` for **both** sandbox and production. The API key
  decides which environment answers; there is no separate sandbox host.
* Auth: ``Authorization: <KEY>`` — explicitly **no** ``Bearer`` prefix.
* ``POST /payment-request`` ``{transactionId, amount}`` -> ``{data: {id, transactionId}}``.
  **Not idempotent**: a second call with the same ``transactionId`` returns 409, so a
  timed-out create is recovered with ``GET /payment-request/by-transaction/{id}``.
* ``POST /checkout-session`` -> ``{data: {...}, checkoutUrl}``.
* ``POST /payment`` with ``{transactionId, configurationId, phoneNumber}`` after a
  ``payment-request`` exists — selects the bank app (Bankily / Masrvi / Sedad) and
  returns ``{id, status, metadata}`` (sandbox sets ``metadata.isSandbox``).
* ``GET /configuration`` -> payment methods enabled for the key's environment.
* ``POST /payment/{paymentId}/simulate-transfer`` — sandbox only (BCI Pay, Amanty and
  Bankily transfer-flow accounts stay ``pending`` until this is called).
* Webhook: ``POST`` JSON ``{event, data}`` with headers
  ``x-webhook-signature: sha256=<hex HMAC-SHA256 of the RAW body>``,
  ``x-webhook-event`` and ``x-webhook-delivery-id`` (stable across retries).
* Events: ``payment-created``, ``payment-updated``, ``payment-request-created``,
  ``payment-request-updated``, ``subscription-created``, ``subscription-updated``.
* Statuses: ``pending | completed | failed | cancelled``. **Only ``completed`` is paid.**
* Amounts are whole MRU. Errors are plain text (422 is JSON); 500/502/timeout are
  retryable, 400/401/403/404/409/422 are not.

MONEY FLOW — THE POINT THAT MUST NOT BE ASSUMED
-----------------------------------------------
Moosyl pays out **every completed payment to Yala's own bank account (IBAN)** and charges
**1% per successful payment**. It is *not* a third-party disbursement API ("Payments are
paid out to the bank account in your payout settings"), and refunds are unavailable
through the API. So Moosyl can never pay a driver or courier directly: this adapter
declares ``payouts=False``, and driver/courier earnings are computed by Yala in
``payments.moosyl_settlement`` and paid out through Yala's own withdrawal flow.
"""

from __future__ import annotations

import json
import logging
import urllib.error
import urllib.request

from .base import (
    MODE_LIVE,
    MODE_SANDBOX,
    MODE_UNCONFIGURED,
    PaymentProvider,
    ProviderCapabilities,
    ProviderError,
    ProviderNotConfigured,
    ProviderResult,
    WebhookVerification,
)

logger = logging.getLogger("yala.payments.moosyl")

# The documented Moosyl event catalogue.
MOOSYL_EVENTS = (
    "payment-created",
    "payment-updated",
    "payment-request-created",
    "payment-request-updated",
    "subscription-created",
    "subscription-updated",
)

# Only these carry a payment, and therefore an amount and a status.
MOOSYL_PAYMENT_EVENTS = ("payment-created", "payment-updated")

# Provider status -> our normalised status.
_STATUS_MAP = {
    "pending": "pending",
    "completed": "succeeded",
    "failed": "failed",
    "cancelled": "rejected",
}

# Documented as retryable: 500, 502 and no answer / timeout.
RETRYABLE_STATUSES = frozenset({408, 429, 500, 502, 503, 504})

DEFAULT_BASE_URL = "https://api.moosyl.com"
DEFAULT_TIMEOUT_SECONDS = 20
# Moosyl's own request timeout is 60s and its webhook delivery timeout is 30s.
MAX_TIMEOUT_SECONDS = 30


class MoosylError(ProviderError):
    code = "moosyl_error"


def _to_whole_mru(value) -> int:
    """Moosyl takes whole MRU. Reject fractional amounts instead of silently rounding."""
    from decimal import Decimal, InvalidOperation

    try:
        amount = Decimal(str(value if value is not None else 0))
    except (InvalidOperation, TypeError, ValueError) as exc:
        raise MoosylError(f"Unparsable amount: {value!r}") from exc
    if amount != amount.to_integral_value():
        raise MoosylError(f"Moosyl accepts whole MRU only; got {amount}.")
    return int(amount)


class MoosylProvider(PaymentProvider):
    """Real Moosyl adapter (sandbox or production, decided by the configured key)."""

    code = "moosyl"
    display_name = "Moosyl (Bankily, Sedad, Masrvi, BimBank, BCI Pay, Amanty)"
    is_mock = False
    # Moosyl settles to Yala's IBAN only; it never disburses to drivers/couriers.
    capabilities = ProviderCapabilities(
        collections=True,
        payouts=False,
        webhooks=True,
        refunds=False,
        reconciliation=True,
    )
    # Moosyl signs the raw body with HMAC-SHA256 and wraps the digest in a scheme prefix.
    signature_headers = ("X-Webhook-Signature",)
    # Mirrors the other real adapters so the readiness report has one consistent shape.
    # All of these were obtained from docs.moosyl.com (retrieved 2026-11-06).
    docs_required = (
        "Moosyl API reference: base URL, Authorization header, endpoints",
        "Moosyl webhook event catalogue + x-webhook-signature scheme",
        "Moosyl sandbox test phone numbers and simulate-transfer flow",
        "Moosyl error and status model for safe retries",
        "confirmation that Moosyl pays out to Yala's own IBAN only (no third-party disbursement)",
        "Moosyl fee terms (1% per successful payment)",
    )

    def parse_signature(self, raw_value: str) -> str:
        """Return the hex digest from Moosyl's documented ``sha256=<hex>`` header.

        The scheme prefix is REQUIRED: anything that is not ``sha256=<hex>`` yields an
        empty string, which can never match the expected digest and therefore fails
        closed. Accepting a bare digest would leave the algorithm unspecified, so a
        future provider scheme change could be silently treated as hex.
        """
        value = str(raw_value or "").strip()
        prefix = "sha256="
        if not value.startswith(prefix):
            return ""
        return value[len(prefix):].strip()

    # ── configuration ────────────────────────────────────────────────────────
    def required_config(self) -> tuple[str, ...]:
        return (
            "MOOSYL_API_BASE_URL",
            "MOOSYL_SECRET_KEY",
            "MOOSYL_WEBHOOK_SECRET",
        )

    @property
    def base_url(self) -> str:
        return str(self.config.get("MOOSYL_API_BASE_URL") or DEFAULT_BASE_URL).rstrip("/")

    @property
    def secret_key(self) -> str:
        return str(self.config.get("MOOSYL_SECRET_KEY") or "")

    @property
    def environment(self) -> str:
        """'sandbox' or 'production' — which Moosyl environment the key belongs to.

        Declared by configuration and never inferred from the payload: an attacker must
        not be able to make a production deployment treat an event as sandbox (or the
        reverse) simply by choosing what to send.
        """
        value = str(self.config.get("MOOSYL_ENVIRONMENT") or "sandbox").strip().lower()
        return "production" if value in {"production", "live", "prod"} else "sandbox"

    @property
    def is_sandbox(self) -> bool:
        return self.environment == "sandbox"

    def _live_mode_enabled(self) -> bool:
        from django.conf import settings

        return bool(getattr(settings, "PAYMENTS_LIVE_MODE", False))

    def _sandbox_settlement_allowed(self) -> bool:
        from django.conf import settings

        return bool(getattr(settings, "MOOSYL_ALLOW_SANDBOX_SETTLEMENT", False))

    @property
    def mode(self) -> str:
        """unconfigured | sandbox | live."""
        if not self.is_configured():
            return MODE_UNCONFIGURED
        if self.is_sandbox:
            return MODE_SANDBOX
        return MODE_LIVE if self._live_mode_enabled() else MODE_UNCONFIGURED

    @property
    def may_settle(self) -> bool:
        """Whether a verified ``completed`` event from this adapter may move money.

        * production **and** ``PAYMENTS_LIVE_MODE`` -> yes (owner-authorized live traffic)
        * sandbox -> only when the owner explicitly enables sandbox settlement, so a
          sandbox key can never mutate real financial state by accident.
        """
        if self.mode == MODE_LIVE:
            return True
        if self.mode == MODE_SANDBOX:
            return self._sandbox_settlement_allowed()
        return False

    def readiness(self) -> dict:
        payload = super().readiness()
        payload.update(
            {
                "docs_required": list(self.docs_required),
                "environment": self.environment,
                "base_url": self.base_url,
                "sandbox_settlement_allowed": self._sandbox_settlement_allowed(),
                "may_settle": self.may_settle,
                "fee_percent": "1",
                "settles_to": "yala_iban",
                "third_party_disbursement": False,
                "refunds_via_api": False,
                "events": list(MOOSYL_EVENTS),
                "docs_source": "docs.moosyl.com",
                "live_activation_requirements": [
                    "sandbox end-to-end test completed (payment-created / payment-updated)",
                    "MOOSYL_SECRET_KEY provisioned as an environment variable",
                    "MOOSYL_WEBHOOK_SECRET provisioned as an environment variable",
                    "Moosyl organization verification approved (NIF + tax certificate)",
                    "Yala IBAN added under Settings -> Payout settings",
                    "PAYMENTS_LIVE_MODE explicitly enabled by the owner",
                ],
            }
        )
        return payload

    # ── HTTP plumbing ────────────────────────────────────────────────────────
    def _guard(self) -> None:
        if not self.is_configured():
            raise ProviderNotConfigured(
                "Moosyl is not configured: missing "
                f"{', '.join(self.missing_config()) or 'official credentials'}"
            )

    def _request(self, method: str, path: str, *, body: dict | None = None, timeout=None):
        """Call the Moosyl API.

        A non-2xx response is surfaced as :class:`MoosylError` carrying the provider's
        plain-text message. Retryability is decided by the caller (see
        :data:`RETRYABLE_STATUSES`); this method never retries on its own, so a retried
        request can never silently duplicate a payment request.
        """
        self._guard()
        url = f"{self.base_url}{path}"
        data = json.dumps(body).encode("utf-8") if body is not None else None
        request = urllib.request.Request(url, data=data, method=method)
        # Documented: the key goes in Authorization as-is, with no Bearer prefix.
        request.add_header("Authorization", self.secret_key)
        request.add_header("Accept", "application/json")
        request.add_header("User-Agent", "Yala/1.0")
        if data is not None:
            request.add_header("Content-Type", "application/json")

        effective = min(int(timeout or DEFAULT_TIMEOUT_SECONDS), MAX_TIMEOUT_SECONDS)
        try:
            with urllib.request.urlopen(request, timeout=effective) as response:
                raw = response.read().decode("utf-8", errors="replace")
                return json.loads(raw) if raw.strip() else {}
        except urllib.error.HTTPError as exc:
            try:
                text = exc.read().decode("utf-8", errors="replace")
            except Exception:  # pragma: no cover - defensive
                text = ""
            logger.warning(
                "Moosyl %s %s failed: HTTP %s retryable=%s",
                method,
                path,
                exc.code,
                exc.code in RETRYABLE_STATUSES,
            )
            raise MoosylError(
                f"Moosyl {method} {path} failed with HTTP {exc.code}: {text[:200]}"
            ) from exc
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            logger.warning("Moosyl %s %s unreachable: %s", method, path, exc)
            raise MoosylError(f"Moosyl {method} {path} unreachable: {exc}") from exc

    # ── money movement ───────────────────────────────────────────────────────
    def create_collection(
        self, *, amount, currency="MRU", reference="", customer=None
    ) -> ProviderResult:
        """Create a payment request.

        ``reference`` is Yala's own ``transactionId`` — the order/trip/delivery
        identifier — so Moosyl can never create two payment requests for one order.
        """
        self._guard()
        if str(currency or "MRU").upper() != "MRU":
            raise MoosylError(f"Moosyl settles MRU only; got {currency!r}.")
        whole_amount = _to_whole_mru(amount)
        if whole_amount <= 0:
            raise MoosylError("Amount must be a positive whole number of MRU.")

        payload = self._request(
            "POST",
            "/payment-request",
            body={"transactionId": str(reference), "amount": whole_amount},
        )
        data = payload.get("data") or {}
        return ProviderResult(
            provider=self.code,
            reference=str(data.get("id") or ""),
            status="created",
            # A create call is never a payment confirmation.
            verified=False,
            mode=self.mode,
            amount=str(whole_amount),
            currency="MRU",
            payload={"transaction_id": str(data.get("transactionId") or reference)},
        )

    @staticmethod
    def _unwrap_payment_payload(payload: dict) -> dict:
        """Moosyl may return ``{data: {...}}`` or a top-level payment object."""
        if isinstance(payload.get("data"), dict):
            return payload["data"]
        return payload if isinstance(payload, dict) else {}

    def create_bank_payment(
        self,
        *,
        transaction_id: str,
        configuration_id: str,
        phone_number: str = "22222222",
    ) -> ProviderResult:
        """Start a bank-app payment for an existing Moosyl payment-request.

        Requires a prior ``create_collection`` (``POST /payment-request``) for the same
        ``transactionId``. The ``configurationId`` comes from ``GET /configuration``
        (``type`` = ``bankily`` | ``masrivi`` | ``sedad``). Completing the payment still
        requires Moosyl webhooks — this call never settles Yala orders.
        """
        self._guard()
        if not str(transaction_id or "").strip():
            raise MoosylError("transactionId is required.")
        if not str(configuration_id or "").strip():
            raise MoosylError("configurationId is required.")
        payload = self._request(
            "POST",
            "/payment",
            body={
                "transactionId": str(transaction_id).strip(),
                "configurationId": str(configuration_id).strip(),
                "phoneNumber": str(phone_number or "").strip() or "22222222",
            },
        )
        data = self._unwrap_payment_payload(payload)
        status = _STATUS_MAP.get(str(data.get("status") or ""), str(data.get("status") or "pending"))
        return ProviderResult(
            provider=self.code,
            reference=str(data.get("id") or ""),
            status=status,
            verified=False,
            mode=self.mode,
            amount=str(data.get("amount") or ""),
            currency="MRU",
            payload=data,
        )

    def create_checkout_session(
        self,
        *,
        reference="",
        amount=None,
        phone_number=None,
        success_url="",
        cancel_url="",
        expires_in_minutes=None,
        payment_request_id="",
    ) -> ProviderResult:
        """Create a Moosyl hosted checkout session and return its ``checkoutUrl``.

        Documented: ``POST /checkout-session`` ->
        ``{data: {id, paymentRequestId, status, successUrl, cancelUrl, expiresAt}, checkoutUrl}``.
        Passing an existing ``paymentRequestId`` ignores the payment fields; passing
        ``transactionId`` + ``amount`` lets Moosyl create the payment request for us.

        Creating a session is **not** a payment confirmation: the result is always
        ``verified=False``, and only a signature-verified webhook may settle.
        """
        self._guard()
        body: dict = {}
        if payment_request_id:
            body["paymentRequestId"] = str(payment_request_id)
        else:
            if not reference:
                raise MoosylError(
                    "A transactionId (or an existing paymentRequestId) is required."
                )
            whole_amount = _to_whole_mru(amount)
            if whole_amount <= 0:
                raise MoosylError("Amount must be a positive whole number of MRU.")
            body["transactionId"] = str(reference)
            body["amount"] = whole_amount
            if phone_number:
                body["phoneNumber"] = str(phone_number)
        if success_url:
            body["successUrl"] = str(success_url)
        if cancel_url:
            body["cancelUrl"] = str(cancel_url)
        if expires_in_minutes:
            minutes = int(expires_in_minutes)
            # Documented bounds: 5..1440, defaulting to 30.
            body["expiresInMinutes"] = min(max(minutes, 5), 1440)

        payload = self._request("POST", "/checkout-session", body=body)
        data = payload.get("data") or {}
        return ProviderResult(
            provider=self.code,
            reference=str(data.get("id") or ""),
            status="created",
            verified=False,
            mode=self.mode,
            amount=str(body.get("amount") or ""),
            currency="MRU",
            payload={
                "checkout_url": str(payload.get("checkoutUrl") or ""),
                "session": data,
                "payment_request_id": str(data.get("paymentRequestId") or ""),
                "expires_at": str(data.get("expiresAt") or ""),
            },
        )

    def get_payment_request(self, transaction_id: str) -> ProviderResult | None:
        """Recover a payment request by Yala's transactionId.

        This is the documented recovery path after a timed-out create, because
        ``POST /payment-request`` answers 409 on a reused transactionId instead of
        being idempotent.
        """
        self._guard()
        try:
            payload = self._request(
                "GET", f"/payment-request/by-transaction/{transaction_id}"
            )
        except MoosylError as exc:
            if "404" in str(exc):
                return None
            raise
        data = payload.get("data") or {}
        return ProviderResult(
            provider=self.code,
            reference=str(data.get("id") or ""),
            status="created",
            verified=False,
            mode=self.mode,
            amount=str(data.get("amount") or ""),
            currency="MRU",
            payload=data,
        )

    def get_payment(self, payment_id: str) -> ProviderResult:
        """Fetch a payment. ``data`` has the same shape as the webhook payload."""
        self._guard()
        payload = self._request("GET", f"/payment/{payment_id}")
        data = payload.get("data") or payload
        status = str(data.get("status") or "")
        return ProviderResult(
            provider=self.code,
            reference=str(data.get("id") or payment_id),
            status=_STATUS_MAP.get(status, "pending"),
            # Only a signed webhook counts as confirmation; a poll does not.
            verified=False,
            mode=self.mode,
            amount=str(data.get("amount") or ""),
            currency="MRU",
            payload=data,
        )

    def list_payment_methods(self) -> dict:
        """GET /configuration — the bank apps enabled for this key's environment."""
        self._guard()
        return self._request("GET", "/configuration")

    def simulate_transfer(self, payment_id: str) -> ProviderResult:
        """Sandbox-only: complete a transfer-flow payment (Bankily transfer/BCI Pay/Amanty).

        Moosyl documents that these payments stay ``pending`` in the sandbox until the
        transfer is simulated, which is how a ``payment-updated -> completed`` event is
        produced for end-to-end testing.
        """
        self._guard()
        if not self.is_sandbox:
            raise MoosylError("simulate-transfer is only available in the Moosyl sandbox.")
        payload = self._request("POST", f"/payment/{payment_id}/simulate-transfer")
        return ProviderResult(
            provider=self.code,
            reference=payment_id,
            status="pending",
            verified=False,
            mode=self.mode,
            payload=payload,
        )

    # ── webhooks ─────────────────────────────────────────────────────────────
    def parse_webhook(self, *, body: bytes, headers: dict) -> WebhookVerification:
        """Parse and classify a Moosyl webhook.

        Signature verification has already happened in
        :func:`payments.provider_security.verify_webhook` against the **raw body**, so
        this method only interprets a payload that is already trusted.

        The configuration guard matches every other adapter: an unconfigured provider
        must never interpret a payload at all. ``verify_webhook`` converts the resulting
        :class:`ProviderNotConfigured` into a clean 403 rather than a 500.
        """
        self._guard()
        try:
            payload = json.loads(body.decode("utf-8"))
        except (UnicodeDecodeError, ValueError) as exc:
            return self._reject(f"Malformed JSON body: {exc}")

        if not isinstance(payload, dict):
            return self._reject("Webhook body is not a JSON object.")

        event = str(payload.get("event") or "")
        data = payload.get("data")

        if event not in MOOSYL_EVENTS:
            return self._reject(f"Unsupported Moosyl event: {event!r}", payload=payload)
        if not isinstance(data, dict):
            return self._reject(
                "Webhook 'data' must be an object.", payload=payload
            )

        status = str(data.get("status") or "")
        if event in MOOSYL_PAYMENT_EVENTS and status not in _STATUS_MAP:
            return self._reject(
                f"Unknown payment status: {status!r}", payload=payload
            )

        return WebhookVerification(
            provider=self.code,
            verified=True,
            mode=self.mode,
            environment=self.environment,
            reason=f"verified {event}",
            event=payload,
        )

    def _reject(self, reason: str, *, payload=None) -> WebhookVerification:
        """A verified-signature payload that is still not trustworthy."""
        logger.warning("Moosyl webhook rejected: %s", reason)
        return WebhookVerification(
            provider=self.code,
            verified=False,
            mode=self.mode,
            environment=self.environment,
            reason=reason,
            event=payload or {},
        )





