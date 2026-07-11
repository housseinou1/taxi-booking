"""Delivery prepay payment tests."""

from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone

from cities.models import City, Region
from deliveries.services.delivery_service import DeliveryService, DeliveryServiceError
from payments.models import PaymentRecord

User = get_user_model()


@pytest.fixture
def customer_user(db):
    region, _ = Region.objects.get_or_create(name="Nouakchott")
    city, _ = City.objects.get_or_create(
        region=region,
        name="Nouakchott",
        defaults={"latitude": 18.0735, "longitude": -15.9582},
    )
    return User.objects.create_user(
        email="customer@yala.mr",
        password="Test1234!",
        first_name="Fatima",
        last_name="Mint",
        phone_number="+22248123456",
        phone_verified_at=timezone.now(),
        rider_status="approved",
        city=city,
    )


@pytest.mark.django_db
def test_create_delivery_requires_payment_method(customer_user):
    service = DeliveryService()
    with pytest.raises(DeliveryServiceError) as exc:
        service.create_delivery(
            customer=customer_user,
            data={
                "pickup": "Pickup A",
                "destination": "Dropoff B",
                "recipient_name": "Fatima Mint",
                "recipient_phone": "+22248123456",
                "distance_km": Decimal("3.5"),
            },
        )
    assert exc.value.code == "payment_required"


@pytest.mark.django_db
def test_create_delivery_rejects_cash(customer_user):
    service = DeliveryService()
    with pytest.raises(DeliveryServiceError) as exc:
        service.create_delivery(
            customer=customer_user,
            data=_delivery_payload(customer_user, payment_method="cash"),
        )
    assert exc.value.code == "invalid_method"


@pytest.mark.django_db
def test_create_delivery_prepay_marks_paid(customer_user):
    service = DeliveryService()
    delivery, _metadata = service.create_delivery(
        customer=customer_user,
        data=_delivery_payload(customer_user, payment_method="bankily"),
    )

    assert delivery.payment_method == "bankily"
    assert delivery.payment_status == "paid"
    record = PaymentRecord.objects.get(delivery=delivery)
    assert record.status == "paid"
    assert record.payment_timing == "before_delivery"


@pytest.mark.django_db
def test_create_delivery_accepts_masravi(customer_user):
    service = DeliveryService()
    delivery, _metadata = service.create_delivery(
        customer=customer_user,
        data=_delivery_payload(customer_user, payment_method="masravi"),
    )
    assert delivery.payment_method == "masravi"
    assert delivery.payment_status == "paid"


def _delivery_payload(customer_user, payment_method="card"):
    return {
        "service_city": "Nouakchott",
        "pickup": "Avenue Gamal",
        "destination": "Tevragh Zeina",
        "recipient_name": "Fatima Mint",
        "recipient_phone": "+22248123456",
        "service_category": "package",
        "package_type": "small",
        "courier_type_required": "motorcycle",
        "pickup_lat": 18.0735,
        "pickup_lng": -15.9582,
        "destination_lat": 18.0896,
        "destination_lng": -15.9754,
        "distance_km": Decimal("3.5"),
        "payment_method": payment_method,
    }
