"""
Unit tests for SupportService.

Tests cover:
- initiate_emergency(): GPS sharing within 5 seconds, fallback to last known location
- initiate_live_chat(): session creation with queue confirmation
- get_faq(): category organization
- search_faq(): keyword search returning matching results
- get_driver_tickets(): ticket retrieval with filters

Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6
"""

from decimal import Decimal
from unittest.mock import MagicMock, patch

import pytest

from taxi.drivers.services.support_service import FAQ_DATA, SupportService


def _make_driver_profile(current_lat=18.0735, current_lng=-15.9582):
    """Create a mock driver profile with location fields."""
    profile = MagicMock()
    profile.current_lat = current_lat
    profile.current_lng = current_lng
    profile.pk = 1
    return profile


class TestInitiateEmergency:
    """Tests for SupportService.initiate_emergency()"""

    def setup_method(self):
        self.service = SupportService()

    @patch("taxi.drivers.services.support_service.SupportTicket")
    def test_emergency_with_current_gps(self, mock_ticket_model):
        """Emergency with current GPS shares the provided coordinates."""
        mock_ticket = MagicMock()
        mock_ticket_model.objects.create.return_value = mock_ticket

        profile = _make_driver_profile()
        result = self.service.initiate_emergency(
            profile, current_lat=18.1000, current_lng=-15.9000
        )

        assert result["location_lat"] == 18.1000
        assert result["location_lng"] == -15.9000
        assert result["location_current"] is True
        assert result["ticket"] == mock_ticket
        assert "current GPS location" in result["message"]

        # Verify ticket was created with correct type
        mock_ticket_model.objects.create.assert_called_once()
        call_kwargs = mock_ticket_model.objects.create.call_args[1]
        assert call_kwargs["ticket_type"] == "emergency"
        assert call_kwargs["status"] == "open"
        assert call_kwargs["location_lat"] == 18.1000
        assert call_kwargs["location_lng"] == -15.9000

    @patch("taxi.drivers.services.support_service.SupportTicket")
    def test_emergency_fallback_to_last_known_location(self, mock_ticket_model):
        """Emergency without GPS falls back to last known location."""
        mock_ticket = MagicMock()
        mock_ticket_model.objects.create.return_value = mock_ticket

        profile = _make_driver_profile(current_lat=18.0735, current_lng=-15.9582)
        result = self.service.initiate_emergency(
            profile, current_lat=None, current_lng=None
        )

        assert result["location_lat"] == 18.0735
        assert result["location_lng"] == -15.9582
        assert result["location_current"] is False
        assert "last known location" in result["message"]
        assert "may not be current" in result["message"]

    @patch("taxi.drivers.services.support_service.SupportTicket")
    def test_emergency_creates_ticket_with_subject(self, mock_ticket_model):
        """Emergency creates a ticket with 'Emergency Alert' subject."""
        mock_ticket = MagicMock()
        mock_ticket_model.objects.create.return_value = mock_ticket

        profile = _make_driver_profile()
        self.service.initiate_emergency(profile, current_lat=18.0, current_lng=-15.0)

        call_kwargs = mock_ticket_model.objects.create.call_args[1]
        assert call_kwargs["subject"] == "Emergency Alert"
        assert call_kwargs["driver"] == profile

    @patch("taxi.drivers.services.support_service.SupportTicket")
    def test_emergency_response_includes_time(self, mock_ticket_model):
        """Emergency response includes response_time_ms field."""
        mock_ticket = MagicMock()
        mock_ticket_model.objects.create.return_value = mock_ticket

        profile = _make_driver_profile()
        result = self.service.initiate_emergency(
            profile, current_lat=18.0, current_lng=-15.0
        )

        assert "response_time_ms" in result
        assert isinstance(result["response_time_ms"], int)
        # Should complete well within 5 seconds (5000ms)
        assert result["response_time_ms"] < 5000

    def test_emergency_gps_timeout_constant(self):
        """EMERGENCY_GPS_TIMEOUT is set to 5 seconds."""
        assert self.service.EMERGENCY_GPS_TIMEOUT == 5


class TestInitiateLiveChat:
    """Tests for SupportService.initiate_live_chat()"""

    def setup_method(self):
        self.service = SupportService()

    @patch("taxi.drivers.services.support_service.SupportTicket")
    def test_live_chat_creates_ticket(self, mock_ticket_model):
        """Live chat creates a support ticket of type 'live_chat'."""
        mock_ticket = MagicMock()
        mock_ticket.created_at = "2024-01-01T00:00:00Z"
        mock_ticket_model.objects.create.return_value = mock_ticket
        mock_ticket_model.objects.filter.return_value.count.return_value = 1

        profile = _make_driver_profile()
        result = self.service.initiate_live_chat(profile, subject="Help needed")

        assert result["ticket"] == mock_ticket
        call_kwargs = mock_ticket_model.objects.create.call_args[1]
        assert call_kwargs["ticket_type"] == "live_chat"
        assert call_kwargs["subject"] == "Help needed"

    @patch("taxi.drivers.services.support_service.SupportTicket")
    def test_live_chat_returns_queue_position(self, mock_ticket_model):
        """Live chat returns queue position confirmation."""
        mock_ticket = MagicMock()
        mock_ticket.created_at = "2024-01-01T00:00:00Z"
        mock_ticket_model.objects.create.return_value = mock_ticket
        mock_ticket_model.objects.filter.return_value.count.return_value = 3

        profile = _make_driver_profile()
        result = self.service.initiate_live_chat(profile)

        assert result["queue_position"] == 3
        assert "queued" in result["message"]
        assert "3" in result["message"]

    @patch("taxi.drivers.services.support_service.SupportTicket")
    def test_live_chat_default_subject(self, mock_ticket_model):
        """Live chat uses default subject when none provided."""
        mock_ticket = MagicMock()
        mock_ticket.created_at = "2024-01-01T00:00:00Z"
        mock_ticket_model.objects.create.return_value = mock_ticket
        mock_ticket_model.objects.filter.return_value.count.return_value = 1

        profile = _make_driver_profile()
        self.service.initiate_live_chat(profile)

        call_kwargs = mock_ticket_model.objects.create.call_args[1]
        assert call_kwargs["subject"] == "Live Chat Request"

    @patch("taxi.drivers.services.support_service.SupportTicket")
    def test_live_chat_includes_message(self, mock_ticket_model):
        """Live chat stores the initial message."""
        mock_ticket = MagicMock()
        mock_ticket.created_at = "2024-01-01T00:00:00Z"
        mock_ticket_model.objects.create.return_value = mock_ticket
        mock_ticket_model.objects.filter.return_value.count.return_value = 1

        profile = _make_driver_profile()
        self.service.initiate_live_chat(
            profile, subject="Issue", message="I need help with my ride"
        )

        call_kwargs = mock_ticket_model.objects.create.call_args[1]
        assert call_kwargs["message"] == "I need help with my ride"


class TestGetFaq:
    """Tests for SupportService.get_faq()"""

    def setup_method(self):
        self.service = SupportService()

    def test_get_all_faq_returns_all_categories(self):
        """get_faq() without filter returns all categories."""
        result = self.service.get_faq()
        assert len(result) == len(FAQ_DATA)
        categories = [cat["category"] for cat in result]
        assert "Account & Profile" in categories
        assert "Rides & Earnings" in categories
        assert "Documents & Verification" in categories
        assert "Safety & Emergency" in categories
        assert "Levels & Rewards" in categories

    def test_get_faq_by_category(self):
        """get_faq() with category filter returns only that category."""
        result = self.service.get_faq(category="Safety & Emergency")
        assert len(result) == 1
        assert result[0]["category"] == "Safety & Emergency"
        assert len(result[0]["questions"]) > 0

    def test_get_faq_category_case_insensitive(self):
        """Category filter is case-insensitive."""
        result = self.service.get_faq(category="safety & emergency")
        assert len(result) == 1
        assert result[0]["category"] == "Safety & Emergency"

    def test_get_faq_invalid_category_returns_empty(self):
        """Invalid category returns empty list."""
        result = self.service.get_faq(category="Nonexistent Category")
        assert result == []

    def test_faq_questions_have_required_fields(self):
        """Each FAQ question has id, question, and answer fields."""
        result = self.service.get_faq()
        for cat in result:
            assert "category" in cat
            assert "questions" in cat
            for q in cat["questions"]:
                assert "id" in q
                assert "question" in q
                assert "answer" in q

    def test_faq_does_not_expose_keywords(self):
        """FAQ response does not include internal keywords field."""
        result = self.service.get_faq()
        for cat in result:
            for q in cat["questions"]:
                assert "keywords" not in q


class TestSearchFaq:
    """Tests for SupportService.search_faq()"""

    def setup_method(self):
        self.service = SupportService()

    def test_search_by_keyword_returns_matches(self):
        """Searching by keyword returns matching FAQ entries."""
        result = self.service.search_faq("emergency")
        assert len(result) > 0
        # Should find the emergency-related questions
        questions = [r["question"] for r in result]
        assert any("Emergency" in q for q in questions)

    def test_search_case_insensitive(self):
        """Search is case-insensitive."""
        result_lower = self.service.search_faq("pin")
        result_upper = self.service.search_faq("PIN")
        assert len(result_lower) == len(result_upper)

    def test_search_empty_query_returns_empty(self):
        """Empty search query returns empty results."""
        assert self.service.search_faq("") == []
        assert self.service.search_faq("   ") == []
        assert self.service.search_faq(None) == []

    def test_search_no_match_returns_empty(self):
        """Query with no matches returns empty list."""
        result = self.service.search_faq("xyznonexistent123")
        assert result == []

    def test_search_results_include_category(self):
        """Search results include the category field."""
        result = self.service.search_faq("document")
        assert len(result) > 0
        for r in result:
            assert "category" in r
            assert "id" in r
            assert "question" in r
            assert "answer" in r

    def test_search_matches_question_text(self):
        """Search matches against question text."""
        result = self.service.search_faq("profile photo")
        assert len(result) > 0
        assert any("profile" in r["question"].lower() for r in result)

    def test_search_matches_answer_text(self):
        """Search matches against answer text."""
        result = self.service.search_faq("verification")
        assert len(result) > 0

    def test_search_multiple_terms(self):
        """Multiple search terms find results matching any term."""
        result = self.service.search_faq("level upgrade")
        assert len(result) > 0


class TestGetDriverTickets:
    """Tests for SupportService.get_driver_tickets()"""

    def setup_method(self):
        self.service = SupportService()

    @patch("taxi.drivers.services.support_service.SupportTicket")
    def test_get_all_tickets(self, mock_ticket_model):
        """get_driver_tickets() returns all tickets for a driver."""
        mock_qs = MagicMock()
        mock_ticket_model.objects.filter.return_value = mock_qs
        mock_qs.filter.return_value = mock_qs
        mock_qs.order_by.return_value = mock_qs

        profile = _make_driver_profile()
        self.service.get_driver_tickets(profile)

        mock_ticket_model.objects.filter.assert_called_once_with(driver=profile)
        mock_qs.order_by.assert_called_once_with("-created_at")

    @patch("taxi.drivers.services.support_service.SupportTicket")
    def test_filter_by_status(self, mock_ticket_model):
        """get_driver_tickets() filters by status when provided."""
        mock_qs = MagicMock()
        mock_ticket_model.objects.filter.return_value = mock_qs
        mock_qs.filter.return_value = mock_qs
        mock_qs.order_by.return_value = mock_qs

        profile = _make_driver_profile()
        self.service.get_driver_tickets(profile, status="open")

        mock_qs.filter.assert_any_call(status="open")

    @patch("taxi.drivers.services.support_service.SupportTicket")
    def test_filter_by_ticket_type(self, mock_ticket_model):
        """get_driver_tickets() filters by ticket_type when provided."""
        mock_qs = MagicMock()
        mock_ticket_model.objects.filter.return_value = mock_qs
        mock_qs.filter.return_value = mock_qs
        mock_qs.order_by.return_value = mock_qs

        profile = _make_driver_profile()
        self.service.get_driver_tickets(profile, ticket_type="emergency")

        mock_qs.filter.assert_any_call(ticket_type="emergency")
