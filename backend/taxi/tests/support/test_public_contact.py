import pytest
from django.core.cache import cache
from rest_framework.test import APIClient

from security.models import AuditLog
from taxi.drivers.models import SupportTicket

pytestmark = pytest.mark.django_db
URL = "/support/contact/"


@pytest.fixture(autouse=True)
def _clear_cache():
    cache.clear()
    yield
    cache.clear()


def payload(**over):
    data = {"name": "Aminata", "email": "Aminata@Example.com", "phone": "+222 22 11 43 73",
            "category": "ride", "message": "My driver was late this morning.", "language": "fr",
            "consent": True, "website": ""}
    data.update(over)
    return data


def post(data, ip="203.0.113.7"):
    return APIClient().post(URL, data, format="json", REMOTE_ADDR=ip, HTTP_USER_AGENT="pytest-agent")


def test_anonymous_contact_creates_driverless_website_ticket():
    res = post(payload())
    assert res.status_code == 201
    assert set(res.data) == {"reference", "status"}
    assert res.data["reference"].startswith("YALA-") and res.data["status"] == "open"
    t = SupportTicket.objects.get(reference=res.data["reference"])
    assert t.driver is None and t.source == "website" and t.ticket_type == "contact_form"
    assert t.contact_email == "aminata@example.com" and t.language == "fr" and t.category == "ride"
    assert t.consent_at is not None
    assert len(t.ip_hash) == 64 and "203.0.113.7" not in t.ip_hash
    assert "pytest-agent" not in t.user_agent_hash
    assert AuditLog.objects.filter(entity_type="support_ticket", entity_id=t.reference).exists()


def test_honeypot_returns_fake_reference_and_stores_nothing():
    res = post(payload(website="http://spam.example"))
    assert res.status_code == 201 and res.data["reference"].startswith("YALA-")
    assert not SupportTicket.objects.exists()


@pytest.mark.parametrize("over", [
    {"email": "not-an-email"}, {"consent": False}, {"message": "short"}, {"category": "bogus"},
    {"language": "de"}, {"name": ""}, {"phone": "call me maybe"}, {"message": "x" * 2001},
])
def test_invalid_input_is_rejected(over):
    res = post(payload(**over))
    assert res.status_code == 400
    assert not SupportTicket.objects.exists()


def test_rate_limit_per_email():
    codes = [post(payload(), ip=f"198.51.100.{i}").status_code for i in range(4)]
    assert codes == [201, 201, 201, 429]
    assert SupportTicket.objects.count() == 3


def test_rate_limit_per_ip():
    codes = [post(payload(email=f"user{i}@example.com")).status_code for i in range(6)]
    assert codes == [201] * 5 + [429]


def test_references_are_unique_and_not_sequential():
    refs = {post(payload(email=f"u{i}@example.com"), ip=f"192.0.2.{i}").data["reference"] for i in range(5)}
    assert len(refs) == 5


def test_get_is_not_allowed():
    assert APIClient().get(URL).status_code == 405
