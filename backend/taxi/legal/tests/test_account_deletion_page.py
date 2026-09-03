"""Public Play Store account-deletion page — no auth required to view."""

import pytest
from django.test import Client


@pytest.mark.django_db
def test_account_deletion_page_is_public_and_identifies_yala_apps():
    client = Client()
    response = client.get("/yala-account-deletion/")

    assert response.status_code == 200
    html = response.content.decode()
    assert "Yala Technologies" in html
    assert "Yala Rider" in html
    assert "Yala Driver" in html
    assert "Yala Delivery" in html
    assert "support@yalataxi.live" in html
    assert "https://www.yalataxi.live/privacy" in html
    assert "no self-serve deletion api" in html.lower()


@pytest.mark.django_db
def test_account_deletion_page_does_not_require_login():
    client = Client()
    response = client.get("/yala-account-deletion/")
    assert response.status_code == 200
    assert "login" not in (response.get("Location") or "").lower()
