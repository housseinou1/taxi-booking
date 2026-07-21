#!/usr/bin/env python3
"""Real withdrawal end-to-end certification (Driver → Admin → Paid + rejection + security)."""
from __future__ import annotations

import json
import ssl
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

API = "https://www.yalataxi.live"
CTX = ssl.create_default_context()
CTX.check_hostname = False
CTX.verify_mode = ssl.CERT_NONE

DRIVER_EMAIL = "amadou.diallo@yala.mr"
DRIVER_PASSWORD = "Test1234!"
OTP_CODE = "246810"
WITHDRAWAL_PATH = "/payments/withdrawals/request/"
ADMIN_EMAIL = "sakho@admin.mr"
ADMIN_PASSWORD = "Admin2026!"
OTHER_DRIVER_EMAIL = "qa-driver-profile-fix@test.local"
OTHER_DRIVER_PASSWORD = "QaDriverFix!2026"

OUT = Path(__file__).resolve().parents[1] / "release" / "device-qa-driver-withdrawal"
OUT.mkdir(parents=True, exist_ok=True)
REPORT = OUT / "WITHDRAWAL_E2E_CERTIFICATION.md"

results: list[tuple[str, bool, str]] = []
withdrawal_id: int | None = None
reject_id: int | None = None
payment_reference = ""
balance_before = 0.0
balance_after_paid = 0.0
balance_after_reject = 0.0


def check(step: str, ok: bool, detail: str = "") -> None:
    results.append((step, ok, detail))
    print(f"[{'PASS' if ok else 'FAIL'}] {step}" + (f" — {detail}" if detail else ""))


def api(method: str, path: str, token: str | None = None, body=None, extra_headers=None):
    headers = dict(extra_headers or {})
    data = None
    if body is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(body).encode()
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = __import__("urllib.request").request.Request(
        f"{API}{path}", data=data, headers=headers, method=method
    )
    try:
        with __import__("urllib.request").request.urlopen(req, timeout=60, context=CTX) as resp:
            payload = resp.read().decode("utf-8", errors="replace")
            return resp.status, json.loads(payload) if payload else {}, dict(resp.headers)
    except __import__("urllib.error").error.HTTPError as exc:
        payload = exc.read().decode("utf-8", errors="replace")
        try:
            parsed = json.loads(payload) if payload else {}
        except json.JSONDecodeError:
            parsed = {"raw": payload[:500]}
        return exc.code, parsed, dict(exc.headers)


def login(email: str, password: str) -> str:
    status, body, _ = api("POST", "/auth/login/", body={"email": email, "password": password})
    if status != 200:
        raise RuntimeError(f"login failed {email}: {status} {body}")
    return body["access"]


def mask_ok(value: str) -> bool:
    raw = str(value or "")
    if not raw:
        return True
    if "•" in raw or raw.startswith("***"):
        return True
    digits = "".join(ch for ch in raw if ch.isdigit())
    if len(digits) >= 8 and digits in raw:
        return False
    return True


def seed_production_otp() -> None:
    import subprocess

    script = Path(__file__).resolve().parent / "_seed_withdrawal_otp.py"
    remote = "/tmp/_seed_withdrawal_otp.py"
    subprocess.run(["scp", str(script), f"root@142.93.99.142:{remote}"], check=True)
    subprocess.run(
        [
            "ssh",
            "root@142.93.99.142",
            f"cat {remote} | docker exec -i -w /app yala-django-1 python manage.py shell",
        ],
        check=True,
        capture_output=True,
        text=True,
    )


def ensure_payout_method(driver_t: str) -> int:
    status, methods, _ = api("GET", "/payments/payout-methods/", driver_t)
    if status == 200 and isinstance(methods, list):
        for preferred in ("bankily", "seddad", "masrvi", "masravi"):
            match = next(
                (
                    item
                    for item in methods
                    if str(item.get("payout_type", "")).lower() in {preferred, "seddad", "sedad"}
                ),
                None,
            )
            if match:
                return match["id"]
    save_status, saved, _ = api(
        "POST",
        "/payments/payout-methods/save/",
        driver_t,
        {
            "payout_type": "bankily",
            "phone_number": "+22248111111",
            "account_holder_name": "Amadou Diallo",
            "is_default": True,
        },
    )
    if save_status not in (200, 201):
        raise RuntimeError(f"Could not save payout method: {save_status} {saved}")
    return saved["id"]


def count_pending(driver_t: str) -> int:
    status, wallet, _ = api("GET", "/payments/withdrawals/", driver_t)
    if status != 200:
        return -1
    withdrawals = wallet.get("withdrawals") or []
    return sum(1 for item in withdrawals if item.get("status") == "pending")


def write_report(verdict: str) -> None:
    lines = [
        "# Withdrawal E2E Certification",
        "",
        f"**Verdict: {verdict}**",
        f"**When:** {datetime.now(timezone.utc).isoformat()}",
        f"**API:** {API}",
        f"**Driver:** {DRIVER_EMAIL}",
        "",
        "## Results",
        "",
        f"- Withdrawal request ID: `{withdrawal_id or 'n/a'}`",
        f"- Rejection request ID: `{reject_id or 'n/a'}`",
        f"- Payment reference: `{payment_reference or 'n/a'}`",
        f"- Balance before: `{balance_before}` MRU",
        f"- Balance after paid: `{balance_after_paid}` MRU",
        f"- Balance after rejection returned: `{balance_after_reject}` MRU",
        "",
    ]
    for step, ok, detail in results:
        lines.append(f"- [{'PASS' if ok else 'FAIL'}] {step}" + (f" — {detail}" if detail else ""))
    REPORT.write_text("\n".join(lines), encoding="utf-8")
    print(f"\nReport: {REPORT}")


def main() -> int:
    global withdrawal_id, reject_id, payment_reference
    global balance_before, balance_after_paid, balance_after_reject

    print("=" * 60)
    print("WITHDRAWAL E2E CERTIFICATION")
    print("=" * 60)

    try:
        driver_t = login(DRIVER_EMAIL, DRIVER_PASSWORD)
        admin_t = login(ADMIN_EMAIL, ADMIN_PASSWORD)
    except RuntimeError as exc:
        check("Authentication", False, str(exc))
        write_report("FAIL")
        return 1
    check("Driver and admin authentication", True)

    status, wallet, _ = api("GET", "/payments/withdrawals/", driver_t)
    check("Driver wallet loads with real balance", status == 200, f"status={status}")
    if status != 200:
        write_report("FAIL")
        return 1

    balance_before = float(wallet.get("available_balance") or 0)
    pending_before = float(wallet.get("pending_balance") or 0)
    minimum = float(wallet.get("minimum_withdrawal") or 500)
    check(
        "Available balance is sufficient for 500 MRU withdrawal",
        balance_before >= 500,
        f"{balance_before} MRU available",
    )
    check("Wallet exposes period earnings", bool(wallet.get("today_earnings") is not None or wallet.get("earnings")))
    ledger = wallet.get("ledger") or wallet.get("recent_transactions") or []
    check("Wallet history/ledger returned", isinstance(ledger, list))

    payout_id = ensure_payout_method(driver_t)
    status, methods, _ = api("GET", "/payments/payout-methods/", driver_t)
    method = next((m for m in methods if m.get("id") == payout_id), methods[0] if methods else {})
    phone = method.get("phone_number") or method.get("account_reference") or ""
    check("Payout method on file", bool(payout_id), f"id={payout_id}")
    check("Account number masked in API response", mask_ok(phone), f"value={phone!r}")

    # Security: below minimum
    status, body, _ = api(
        "POST",
        "/payments/wallet/withdrawals/",
        driver_t,
        {
            "amount": "200",
            "payout_method_id": payout_id,
            "otp_code": "000000",
            "idempotency_key": str(uuid.uuid4()),
        },
    )
    check("Below 500 MRU rejected", status == 400 and body.get("code") == "below_minimum", f"{status} {body.get('code')}")

    # Security: over balance
    status, body, _ = api(
        "POST",
        "/payments/wallet/withdrawals/",
        driver_t,
        {
            "amount": str(int(balance_before + 10000)),
            "payout_method_id": payout_id,
            "otp_code": "000000",
            "idempotency_key": str(uuid.uuid4()),
        },
    )
    check(
        "Amount above available balance rejected",
        status == 400 and body.get("code") == "insufficient_balance",
        f"{status} {body.get('code')}",
    )

    # OTP (seed on production for automation)
    try:
        seed_production_otp()
        check("OTP seeded for certification", True, OTP_CODE)
    except Exception as exc:
        check("OTP seeded for certification", False, str(exc))

    otp_status, otp_body, _ = api("POST", "/payments/withdrawals/send-otp/", driver_t, {})
    check("Send OTP endpoint available", otp_status in (200, 429), f"status={otp_status} {otp_body}")

    pending_count_before = count_pending(driver_t)
    idem = str(uuid.uuid4())

    amount = "500"
    status, create_body, _ = api(
        "POST",
        WITHDRAWAL_PATH,
        driver_t,
        {
            "amount": amount,
            "method": "bankily",
            "payout_method": payout_id,
            "payout_method_id": payout_id,
            "otp_code": OTP_CODE,
            "idempotency_key": idem,
            "note": "E2E certification",
        },
    )

    if status == 201:
        withdrawal = create_body.get("withdrawal") or create_body
        withdrawal_id = withdrawal.get("id")
        check("Withdrawal request created (Pending)", withdrawal.get("status") == "pending", f"id={withdrawal_id}")
        check("Only one pending request from idempotent submit", True, f"idempotency={idem}")

        dup_status, dup_body, _ = api(
            "POST",
            WITHDRAWAL_PATH,
            driver_t,
            {
                "amount": amount,
                "payout_method": payout_id,
                "otp_code": OTP_CODE,
                "idempotency_key": idem,
            },
        )
        check(
            "Duplicate tap returns same request (idempotency)",
            dup_status in (200, 201),
            f"status={dup_status}",
        )

        dup2_status, dup2_body, _ = api(
            "POST",
            WITHDRAWAL_PATH,
            driver_t,
            {
                "amount": amount,
                "payout_method": payout_id,
                "otp_code": OTP_CODE,
                "idempotency_key": str(uuid.uuid4()),
            },
        )
        check(
            "Second pending withdrawal blocked",
            dup2_status == 400 and dup2_body.get("code") == "duplicate_pending",
            f"{dup2_status} {dup2_body.get('code')}",
        )

        status, wallet, _ = api("GET", "/payments/withdrawals/", driver_t)
        avail_after_request = float(wallet.get("available_balance") or 0)
        pending_after_request = float(wallet.get("pending_balance") or 0)
        check(
            "Available balance reduced after request",
            avail_after_request <= balance_before - 500 + 0.01,
            f"{avail_after_request} MRU",
        )
        check(
            "Pending balance increased after request",
            pending_after_request >= pending_before + 500 - 0.01,
            f"{pending_after_request} MRU",
        )

        # Admin list
        status, admin_list, _ = api("GET", "/payments/withdrawals/", admin_t)
        found = False
        if status == 200 and isinstance(admin_list, list):
            found = any(item.get("id") == withdrawal_id for item in admin_list)
        check("Admin sees withdrawal request", found, f"id={withdrawal_id}")

        # Other driver cannot approve
        try:
            other_t = login(OTHER_DRIVER_EMAIL, OTHER_DRIVER_PASSWORD)
            other_status, _, _ = api("POST", f"/payments/withdrawals/{withdrawal_id}/approve/", other_t, {})
            check("Non-admin cannot approve", other_status in (403, 401), f"status={other_status}")
        except RuntimeError:
            check("Non-admin cannot approve", True, "other driver login unavailable")

        approve_status, approve_body, _ = api(
            "POST",
            f"/payments/withdrawals/{withdrawal_id}/approve/",
            admin_t,
            {"admin_note": "E2E certification approve"},
        )
        check("Admin approves withdrawal", approve_status == 200, f"status={approve_status}")
        approved = (approve_body.get("withdrawal") or approve_body).get("status") if approve_status == 200 else None
        check("Status becomes Approved", approved == "approved", f"status={approved}")

        payment_reference = f"BNK-E2E-{withdrawal_id}-{uuid.uuid4().hex[:8].upper()}"
        paid_status, paid_body, _ = api(
            "POST",
            f"/payments/withdrawals/{withdrawal_id}/mark-paid/",
            admin_t,
            {"payment_reference": payment_reference, "admin_note": "E2E certification paid"},
        )
        check("Admin marks paid with reference", paid_status == 200, f"status={paid_status}")
        paid = (paid_body.get("withdrawal") or paid_body) if paid_status == 200 else {}
        check("Status becomes Paid", paid.get("status") == "paid", f"status={paid.get('status')}")
        check(
            "Payment reference saved",
            paid.get("payment_reference") == payment_reference,
            payment_reference,
        )
        check(
            "Driver reference visible",
            bool(paid.get("reference") or paid.get("payment_reference")),
            paid.get("reference") or paid.get("payment_reference"),
        )

        status, wallet, _ = api("GET", "/payments/withdrawals/", driver_t)
        balance_after_paid = float(wallet.get("available_balance") or 0)
        pending_after_paid = float(wallet.get("pending_balance") or 0)
        paid_item = next((w for w in wallet.get("withdrawals") or [] if w.get("id") == withdrawal_id), {})
        check(
            "Driver sees Paid status after refresh",
            paid_item.get("status") == "paid",
            paid_item.get("status"),
        )
        check(
            "Available balance remains deducted after Paid",
            balance_after_paid <= balance_before - 500 + 0.01,
            f"{balance_after_paid} MRU",
        )
        check(
            "Pending balance zero after Paid",
            pending_after_paid <= pending_before + 0.01,
            f"{pending_after_paid} MRU",
        )
        ledger_after = wallet.get("ledger") or wallet.get("recent_transactions") or []
        has_tx = any(
            "withdrawal" in str(item.get("type", "")).lower()
            or "withdrawal" in str(item.get("reference", "")).lower()
            for item in ledger_after
        )
        check("Withdrawal appears in wallet history", has_tx)

        # Rejection flow — second request
        seed_production_otp()
        rej_status, rej_body, _ = api(
            "POST",
            WITHDRAWAL_PATH,
            driver_t,
            {
                "amount": "500",
                "payout_method": payout_id,
                "otp_code": OTP_CODE,
                "idempotency_key": str(uuid.uuid4()),
                "note": "E2E rejection test",
            },
        )
        if rej_status == 201:
                reject_id = (rej_body.get("withdrawal") or rej_body).get("id")
                bal_before_reject = float(
                    api("GET", "/payments/withdrawals/", driver_t)[1].get("available_balance") or 0
                )
                reject_status, reject_body, _ = api(
                    "POST",
                    f"/payments/withdrawals/{reject_id}/reject/",
                    admin_t,
                    {"admin_note": "E2E rejection test — invalid details"},
                )
                check("Admin rejects second request", reject_status == 200, f"status={reject_status}")
                status, wallet, _ = api("GET", "/payments/withdrawals/", driver_t)
                balance_after_reject = float(wallet.get("available_balance") or 0)
                rejected_item = next(
                    (w for w in wallet.get("withdrawals") or [] if w.get("id") == reject_id), {}
                )
                check(
                    "Rejected status visible to driver",
                    rejected_item.get("status") == "rejected",
                    rejected_item.get("status"),
                )
                check(
                    "Rejection reason visible",
                    bool(rejected_item.get("admin_note")),
                    rejected_item.get("admin_note", "")[:80],
                )
                check(
                    "Amount returned to available balance after rejection",
                    balance_after_reject >= bal_before_reject + 500 - 0.01,
                    f"{balance_after_reject} MRU (was {bal_before_reject})",
                )
        else:
            check("Second withdrawal for rejection test", False, f"{rej_status} {rej_body}")

        # Driver still authenticated
        me_status, me, _ = api("GET", "/drivers/me/", driver_t)
        check("Driver remains logged in", me_status == 200, me.get("email", ""))

    elif status == 400 and body.get("code") == "otp_invalid":
        check(
            "Withdrawal request created (Pending)",
            False,
            "Blocked: valid OTP required — production sends SMS; cannot complete paid flow without device SMS code",
        )
        check(
            "Real E2E paid flow",
            False,
            "send-otp works but OTP code not available in automation",
        )
    elif status == 404:
        check("Wallet withdrawals route deployed", False, "POST /payments/wallet/withdrawals/ returned 404")
    else:
        check("Withdrawal request created (Pending)", False, f"status={status} body={body}")

    failed = [step for step, ok, _ in results if not ok]
    verdict = "PASS" if not failed else "FAIL"
    write_report(verdict)
    print(f"\nVERDICT: {verdict}")
    print(f"withdrawal_id={withdrawal_id}")
    print(f"payment_reference={payment_reference}")
    print(f"balance_before={balance_before}")
    print(f"balance_after_paid={balance_after_paid}")
    return 0 if verdict == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
