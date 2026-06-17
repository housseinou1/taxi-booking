# Design Document: Yala Wallet

## Overview

Yala Wallet is a standalone Django app (`wallet`) that provides an in-app digital wallet for riders and drivers on the Yala platform. Riders top up via existing payment methods (Bankily, Masrvi, Seddad, Card) and pay for rides from their balance. Drivers receive earnings automatically credited after ride completion (fare minus 30% app fee, plus tips). All amounts are in MRU. The wallet coexists alongside existing payment methods as an optional choice.

## Architecture

Yala Wallet is a standalone Django app (`wallet`) integrated into the existing taxi-booking backend. It follows the same patterns as the existing `payments`, `referrals`, and `rides` apps: Django models for persistence, DRF serializers/viewsets for the REST API, Celery tasks for async processing, and Django signals for event-driven wallet provisioning.

```
┌─────────────────────────────────────────────────────────┐
│                      REST API Layer                       │
│  (DRF ViewSets: WalletViewSet, TransactionViewSet, etc.) │
└──────────────────────────┬──────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────┐
│                    Service Layer                          │
│  (wallet/services.py — business logic, balance ops)      │
└──────────────────────────┬──────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────┐
│                    Data Layer                             │
│  (Wallet, WalletTransaction models + DB constraints)     │
└──────────────────────────┬──────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────┐
│               Async Processing (Celery)                   │
│  (credit_driver_earning task with retry logic)           │
└─────────────────────────────────────────────────────────┘
```

## Components and Interfaces

### 1. Django App: `wallet`

A new top-level app at `backend/taxi/wallet/` with this structure:

```
wallet/
├── __init__.py
├── admin.py
├── apps.py
├── models.py
├── serializers.py
├── services.py
├── signals.py
├── tasks.py
├── urls.py
├── views.py
└── migrations/
    └── 0001_initial.py
```

### 2. Models (`wallet/models.py`)

```python
from decimal import Decimal

from django.conf import settings
from django.db import models
from django.core.validators import MinValueValidator


class Wallet(models.Model):
    """One-to-one digital wallet for each user (rider or driver)."""

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="wallet",
    )
    balance = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=Decimal("0.00"),
        validators=[MinValueValidator(Decimal("0.00"))],
    )
    currency = models.CharField(max_length=5, default="MRU")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.CheckConstraint(
                check=models.Q(balance__gte=Decimal("0.00")),
                name="wallet_non_negative_balance",
            ),
        ]

    def __str__(self):
        return f"Wallet({self.user.email}) — {self.balance} {self.currency}"


class WalletTransaction(models.Model):
    """Immutable ledger entry for every wallet balance change."""

    TRANSACTION_TYPES = [
        ("top_up", "Top Up"),
        ("ride_payment", "Ride Payment"),
        ("ride_earning", "Ride Earning"),
        ("withdrawal", "Withdrawal"),
    ]

    STATUS_CHOICES = [
        ("success", "Success"),
        ("failed", "Failed"),
        ("pending", "Pending"),
        ("refunded", "Refunded"),
    ]

    wallet = models.ForeignKey(
        Wallet,
        on_delete=models.CASCADE,
        related_name="transactions",
    )
    transaction_type = models.CharField(max_length=20, choices=TRANSACTION_TYPES)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="success")

    # References
    ride_id = models.IntegerField(null=True, blank=True)
    payment_method = models.CharField(max_length=30, blank=True, default="")
    payout_method_id = models.IntegerField(null=True, blank=True)

    # Earning breakdown (for ride_earning type)
    gross_fare = models.DecimalField(
        max_digits=12, decimal_places=2, null=True, blank=True
    )
    app_fee_deducted = models.DecimalField(
        max_digits=12, decimal_places=2, null=True, blank=True
    )
    tip_amount = models.DecimalField(
        max_digits=12, decimal_places=2, null=True, blank=True
    )

    # Failure info
    failure_reason = models.TextField(blank=True, default="")

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return (
            f"Txn({self.transaction_type}, {self.amount} MRU, "
            f"{self.status}) — {self.wallet.user.email}"
        )
```

### 3. Service Layer (`wallet/services.py`)

All balance-modifying logic is centralized here. Every operation uses `select_for_update()` and wraps the balance change + transaction creation in `transaction.atomic()`.

```python
from decimal import Decimal

from django.db import transaction

from wallet.models import Wallet, WalletTransaction


def get_or_create_wallet(user) -> Wallet:
    """Return existing wallet or create one with zero balance."""
    wallet, _ = Wallet.objects.get_or_create(user=user)
    return wallet


@transaction.atomic
def credit_wallet(wallet_id: int, amount: Decimal, **txn_kwargs) -> WalletTransaction:
    """Atomically credit a wallet and record the transaction."""
    wallet = Wallet.objects.select_for_update().get(id=wallet_id)
    wallet.balance += amount
    wallet.save(update_fields=["balance", "updated_at"])
    return WalletTransaction.objects.create(
        wallet=wallet,
        amount=amount,
        status="success",
        **txn_kwargs,
    )


@transaction.atomic
def debit_wallet(wallet_id: int, amount: Decimal, **txn_kwargs) -> WalletTransaction:
    """Atomically debit a wallet and record the transaction. Raises if insufficient."""
    wallet = Wallet.objects.select_for_update().get(id=wallet_id)
    if wallet.balance < amount:
        raise InsufficientFundsError(
            f"Balance {wallet.balance} < requested {amount}"
        )
    wallet.balance -= amount
    wallet.save(update_fields=["balance", "updated_at"])
    return WalletTransaction.objects.create(
        wallet=wallet,
        amount=amount,
        status="success",
        **txn_kwargs,
    )


@transaction.atomic
def refund_withdrawal(transaction_id: int) -> WalletTransaction:
    """Refund a pending withdrawal back to the driver wallet."""
    txn = WalletTransaction.objects.select_for_update().get(
        id=transaction_id, transaction_type="withdrawal", status="pending"
    )
    wallet = Wallet.objects.select_for_update().get(id=txn.wallet_id)
    wallet.balance += txn.amount
    wallet.save(update_fields=["balance", "updated_at"])
    txn.status = "refunded"
    txn.save(update_fields=["status"])
    return txn


def calculate_driver_earning(fare: Decimal, tip: Decimal) -> Decimal:
    """Calculate net driver earning: fare * 0.70 + tip."""
    app_fee_rate = Decimal("0.30")
    net_fare = fare * (Decimal("1.00") - app_fee_rate)
    return net_fare + tip


class InsufficientFundsError(Exception):
    pass
```

### 4. Signals (`wallet/signals.py`)

Auto-provision wallets on user creation:

```python
from django.conf import settings
from django.db.models.signals import post_save
from django.dispatch import receiver

from wallet.models import Wallet


@receiver(post_save, sender=settings.AUTH_USER_MODEL)
def create_wallet_on_user_creation(sender, instance, created, **kwargs):
    if created:
        Wallet.objects.get_or_create(user=instance)
```

### 5. Celery Tasks (`wallet/tasks.py`)

```python
from decimal import Decimal

from celery import shared_task

from wallet.services import credit_wallet, calculate_driver_earning, get_or_create_wallet


@shared_task(
    bind=True,
    max_retries=3,
    default_retry_delay=10,
    retry_backoff=True,
    retry_backoff_max=300,
)
def credit_driver_earning_task(self, driver_id: int, ride_id: int, fare: str, tip: str):
    """Async task to credit driver earnings after ride completion."""
    try:
        from authapp.models import User

        driver = User.objects.get(id=driver_id)
        wallet = get_or_create_wallet(driver)

        fare_decimal = Decimal(fare)
        tip_decimal = Decimal(tip)
        earning = calculate_driver_earning(fare_decimal, tip_decimal)
        app_fee = fare_decimal * Decimal("0.30")

        credit_wallet(
            wallet_id=wallet.id,
            amount=earning,
            transaction_type="ride_earning",
            ride_id=ride_id,
            gross_fare=fare_decimal,
            app_fee_deducted=app_fee,
            tip_amount=tip_decimal,
        )
    except Exception as exc:
        raise self.retry(exc=exc)
```

### 6. Serializers (`wallet/serializers.py`)

```python
from rest_framework import serializers

from wallet.models import Wallet, WalletTransaction


class WalletSerializer(serializers.ModelSerializer):
    class Meta:
        model = Wallet
        fields = ["id", "balance", "currency", "created_at", "updated_at"]
        read_only_fields = fields


class WalletTransactionSerializer(serializers.ModelSerializer):
    class Meta:
        model = WalletTransaction
        fields = [
            "id",
            "transaction_type",
            "amount",
            "status",
            "ride_id",
            "payment_method",
            "payout_method_id",
            "gross_fare",
            "app_fee_deducted",
            "tip_amount",
            "failure_reason",
            "created_at",
        ]
        read_only_fields = fields


class TopUpRequestSerializer(serializers.Serializer):
    amount = serializers.DecimalField(max_digits=12, decimal_places=2)
    payment_method = serializers.ChoiceField(
        choices=["bankily", "masrvi", "seddad", "card"]
    )

    def validate_amount(self, value):
        from decimal import Decimal

        if value <= Decimal("0"):
            raise serializers.ValidationError("Amount must be greater than zero.")
        return value


class WithdrawalRequestSerializer(serializers.Serializer):
    amount = serializers.DecimalField(max_digits=12, decimal_places=2)
    payout_method_id = serializers.IntegerField()

    def validate_amount(self, value):
        from decimal import Decimal

        if value <= Decimal("0"):
            raise serializers.ValidationError("Amount must be greater than zero.")
        return value
```

### 7. Views (`wallet/views.py`)

```python
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from wallet.models import WalletTransaction
from wallet.serializers import (
    TopUpRequestSerializer,
    WalletSerializer,
    WalletTransactionSerializer,
    WithdrawalRequestSerializer,
)
from wallet.services import (
    InsufficientFundsError,
    credit_wallet,
    debit_wallet,
    get_or_create_wallet,
)


class WalletViewSet(viewsets.GenericViewSet):
    permission_classes = [IsAuthenticated]

    @action(detail=False, methods=["get"])
    def balance(self, request):
        """GET /api/wallet/balance/ — return current user balance."""
        wallet = get_or_create_wallet(request.user)
        serializer = WalletSerializer(wallet)
        return Response(serializer.data)

    @action(detail=False, methods=["post"])
    def top_up(self, request):
        """POST /api/wallet/top_up/ — initiate a top-up."""
        serializer = TopUpRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        amount = serializer.validated_data["amount"]
        payment_method = serializer.validated_data["payment_method"]
        wallet = get_or_create_wallet(request.user)

        # Initiate external payment charge (mock/integration point)
        charge_success, failure_reason = self._charge_payment_method(
            request.user, amount, payment_method
        )

        if charge_success:
            txn = credit_wallet(
                wallet_id=wallet.id,
                amount=amount,
                transaction_type="top_up",
                payment_method=payment_method,
            )
            return Response(
                WalletTransactionSerializer(txn).data,
                status=status.HTTP_201_CREATED,
            )
        else:
            WalletTransaction.objects.create(
                wallet=wallet,
                transaction_type="top_up",
                amount=amount,
                status="failed",
                payment_method=payment_method,
                failure_reason=failure_reason,
            )
            return Response(
                {"detail": "Payment charge failed.", "reason": failure_reason},
                status=status.HTTP_402_PAYMENT_REQUIRED,
            )

    @action(detail=False, methods=["post"])
    def withdraw(self, request):
        """POST /api/wallet/withdraw/ — request a withdrawal (drivers only)."""
        if request.user.user_type != "driver":
            return Response(
                {"detail": "Only drivers can withdraw."},
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = WithdrawalRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        amount = serializer.validated_data["amount"]
        payout_method_id = serializer.validated_data["payout_method_id"]
        wallet = get_or_create_wallet(request.user)

        try:
            txn = debit_wallet(
                wallet_id=wallet.id,
                amount=amount,
                transaction_type="withdrawal",
                payout_method_id=payout_method_id,
                status="pending",
            )
            return Response(
                WalletTransactionSerializer(txn).data,
                status=status.HTTP_201_CREATED,
            )
        except InsufficientFundsError:
            return Response(
                {"detail": "Insufficient funds."},
                status=status.HTTP_400_BAD_REQUEST,
            )

    def _charge_payment_method(self, user, amount, method):
        """Integration point for external payment gateway. Returns (success, reason)."""
        # This would call Bankily/Masrvi/Seddad/Card APIs
        # For now, returns success; to be replaced with real integration.
        return True, ""


class TransactionViewSet(viewsets.ReadOnlyModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = WalletTransactionSerializer

    def get_queryset(self):
        wallet = get_or_create_wallet(self.request.user)
        qs = WalletTransaction.objects.filter(wallet=wallet)
        txn_type = self.request.query_params.get("type")
        if txn_type:
            qs = qs.filter(transaction_type=txn_type)
        return qs
```

### 8. URL Configuration (`wallet/urls.py`)

```python
from django.urls import include, path
from rest_framework.routers import DefaultRouter

from wallet.views import TransactionViewSet, WalletViewSet

router = DefaultRouter()
router.register("wallet", WalletViewSet, basename="wallet")
router.register("wallet/transactions", TransactionViewSet, basename="wallet-transactions")

urlpatterns = [
    path("", include(router.urls)),
]
```

### 9. Admin (`wallet/admin.py`)

```python
from django.contrib import admin

from wallet.models import Wallet, WalletTransaction


@admin.register(Wallet)
class WalletAdmin(admin.ModelAdmin):
    list_display = ["user", "balance", "currency", "created_at"]
    search_fields = ["user__email"]
    readonly_fields = ["balance", "created_at", "updated_at"]


@admin.register(WalletTransaction)
class WalletTransactionAdmin(admin.ModelAdmin):
    list_display = [
        "id",
        "wallet",
        "transaction_type",
        "amount",
        "status",
        "created_at",
    ]
    list_filter = ["transaction_type", "status"]
    search_fields = ["wallet__user__email"]
    readonly_fields = [
        "wallet",
        "transaction_type",
        "amount",
        "status",
        "ride_id",
        "payment_method",
        "payout_method_id",
        "gross_fare",
        "app_fee_deducted",
        "tip_amount",
        "failure_reason",
        "created_at",
    ]
```

## Data Models

### Entity Relationship

```
User (authapp.User)
  │
  └──── 1:1 ──── Wallet
                    │
                    └──── 1:N ──── WalletTransaction
```

### Wallet Fields

| Field      | Type              | Constraints                              |
|------------|-------------------|------------------------------------------|
| id         | BigAutoField      | PK                                       |
| user       | OneToOneField     | FK → User, unique                        |
| balance    | Decimal(12,2)     | default=0.00, CHECK >= 0                 |
| currency   | CharField(5)      | default="MRU"                            |
| created_at | DateTimeField     | auto_now_add                             |
| updated_at | DateTimeField     | auto_now                                 |

### WalletTransaction Fields

| Field            | Type            | Constraints                         |
|------------------|-----------------|-------------------------------------|
| id               | BigAutoField    | PK                                  |
| wallet           | ForeignKey      | FK → Wallet                         |
| transaction_type | CharField(20)   | choices: top_up, ride_payment, ride_earning, withdrawal |
| amount           | Decimal(12,2)   |                                     |
| status           | CharField(20)   | choices: success, failed, pending, refunded |
| ride_id          | Integer         | nullable                            |
| payment_method   | CharField(30)   | blank                               |
| payout_method_id | Integer         | nullable                            |
| gross_fare       | Decimal(12,2)   | nullable (for ride_earning)         |
| app_fee_deducted | Decimal(12,2)   | nullable (for ride_earning)         |
| tip_amount       | Decimal(12,2)   | nullable (for ride_earning)         |
| failure_reason   | TextField       | blank                               |
| created_at       | DateTimeField   | auto_now_add                        |

## Interfaces

### REST API Endpoints

| Method | Endpoint                      | Auth     | Description                         |
|--------|-------------------------------|----------|-------------------------------------|
| GET    | `/api/wallet/balance/`        | JWT      | Get current wallet balance          |
| POST   | `/api/wallet/top_up/`         | JWT      | Top up wallet (riders)              |
| POST   | `/api/wallet/withdraw/`       | JWT      | Request withdrawal (drivers)        |
| GET    | `/api/wallet/transactions/`   | JWT      | List transactions (paginated)       |
| GET    | `/api/wallet/transactions/?type=X` | JWT | Filter transactions by type         |

### Internal Service Functions

| Function                  | Input                                    | Output             |
|---------------------------|------------------------------------------|--------------------|
| `get_or_create_wallet`    | `user: User`                             | `Wallet`           |
| `credit_wallet`           | `wallet_id, amount, **txn_kwargs`        | `WalletTransaction`|
| `debit_wallet`            | `wallet_id, amount, **txn_kwargs`        | `WalletTransaction`|
| `refund_withdrawal`       | `transaction_id`                         | `WalletTransaction`|
| `calculate_driver_earning`| `fare: Decimal, tip: Decimal`            | `Decimal`          |

### Celery Tasks

| Task                          | Trigger              | Retry Policy              |
|-------------------------------|----------------------|---------------------------|
| `credit_driver_earning_task`  | Ride completion      | 3 retries, exponential backoff |

## Error Handling

| Scenario                      | Behavior                                                    |
|-------------------------------|-------------------------------------------------------------|
| Insufficient balance (debit)  | Raise `InsufficientFundsError`, return 400 to client        |
| External payment charge fails | Record failed transaction, return 402 to client             |
| DB transaction failure        | Atomic rollback, no partial state, return 500               |
| Invalid amount (≤ 0)          | Serializer validation error, return 400                     |
| Non-driver withdrawal attempt | Return 403 Forbidden                                        |
| Celery task failure           | Retry up to 3 times with exponential backoff                |
| Concurrent balance access     | `select_for_update` ensures serialized access               |

## Integration Points

1. **User Creation Signal**: `post_save` on `AUTH_USER_MODEL` triggers wallet provisioning.
2. **Ride Completion**: The ride completion flow dispatches `credit_driver_earning_task` with ride details.
3. **Payment Gateway**: `_charge_payment_method` is the integration seam for Bankily/Masrvi/Seddad/Card APIs.
4. **Admin Withdrawal Rejection**: Admin action calls `refund_withdrawal` to restore driver balance.
5. **Settings Integration**: Add `"wallet"` to `INSTALLED_APPS` in `taxi/settings.py`.
6. **URL Integration**: Include `wallet.urls` in the root `taxi/urls.py`.

## Testing Strategy

- **Property-based tests** (Hypothesis): Validate universal invariants (balance correctness, idempotence, ordering) by generating random amounts, user states, and operation sequences. Minimum 100 examples per property.
- **Unit tests** (pytest + Django TestCase): Verify specific scenarios like successful top-up flow, failed payment handling, and admin rejection refunds. Use mocked external payment gateway.
- **Integration tests**: Verify Celery task dispatch and retry behavior, signal-based wallet provisioning, and API authentication enforcement.
- **Database constraint tests**: Confirm the CHECK constraint prevents negative balances at the DB level.

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Wallet creation idempotence

*For any* user, calling `get_or_create_wallet` any number of times SHALL always return the same wallet instance with the initial balance of zero MRU, and the total number of wallets for that user SHALL always be exactly one.

**Validates: Requirements 1.1, 1.2, 1.3**

### Property 2: Successful top-up increases balance

*For any* positive amount and any wallet with balance B, after a successful top-up of that amount, the wallet balance SHALL equal B + amount, and a WalletTransaction of type "top_up" with status "success" and the credited amount SHALL exist.

**Validates: Requirements 3.2, 3.3**

### Property 3: Failed top-up preserves balance

*For any* top-up attempt where the external payment charge fails, the wallet balance SHALL remain unchanged (equal to the balance before the attempt).

**Validates: Requirements 3.4**

### Property 4: Invalid top-up amount rejection

*For any* amount that is less than or equal to zero, the top-up request SHALL be rejected and no balance change or successful transaction SHALL occur.

**Validates: Requirements 3.6**

### Property 5: Ride payment balance gate

*For any* wallet with balance B and any fare F, the wallet ride payment SHALL succeed if and only if B ≥ F. If B < F, the payment SHALL be rejected and the balance SHALL remain unchanged.

**Validates: Requirements 4.1, 4.4**

### Property 6: Ride payment debit correctness

*For any* completed ride with fare F paid via wallet (where balance B ≥ F), the wallet balance SHALL equal B - F after payment, and a WalletTransaction of type "ride_payment" with the ride identifier and amount F SHALL exist.

**Validates: Requirements 4.2, 4.3**

### Property 7: Driver earning calculation and credit

*For any* completed ride with fare F ≥ 0 and tip T ≥ 0, the driver earning SHALL equal F × 0.70 + T, and after crediting, the driver wallet balance SHALL increase by exactly that amount with a WalletTransaction of type "ride_earning" recording gross fare, app fee, tip, and net earning.

**Validates: Requirements 5.1, 5.2, 5.3**

### Property 8: Transaction history ordering

*For any* set of wallet transactions, the transaction history endpoint SHALL return them in strictly descending order of creation timestamp (most recent first).

**Validates: Requirements 6.1**

### Property 9: Transaction filtering correctness

*For any* transaction type filter value from {top_up, ride_payment, ride_earning, withdrawal}, all returned transactions SHALL have a transaction_type matching the filter, and no transactions of other types SHALL appear in the results.

**Validates: Requirements 6.3**

### Property 10: Withdrawal balance gate and debit

*For any* driver wallet with balance B and withdrawal amount A, the withdrawal SHALL succeed if and only if B ≥ A. On success, balance SHALL equal B - A and a WalletTransaction of type "withdrawal" with status "pending" SHALL exist. If B < A, the request SHALL be rejected and balance unchanged.

**Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5**

### Property 11: Withdrawal refund on admin rejection

*For any* pending withdrawal transaction with amount A, when an administrator rejects it, the driver wallet balance SHALL increase by A and the transaction status SHALL change to "refunded".

**Validates: Requirements 7.6**

### Property 12: Atomicity of wallet operations

*For any* wallet operation (credit or debit), if any part of the operation fails (balance update or transaction record creation), all changes SHALL be rolled back and the wallet balance SHALL remain at its pre-operation value.

**Validates: Requirements 8.2, 8.3**

### Property 13: Non-negative balance invariant

*For any* sequence of wallet operations (debits, credits, withdrawals, refunds), the wallet balance SHALL never be less than zero at any point in time.

**Validates: Requirements 8.4**
