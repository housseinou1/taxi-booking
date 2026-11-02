"""Phase 11 — employee ID-card PDF endpoint tests (ReportLab).

Verifies the approved contract: HR tier only, per-request generation, correct
content type/headers, an audit row per generation, IDOR safety (another
employee's card is not reachable), and — critically — that the document contains
neither the date of birth nor the national ID number.
"""

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase
from rest_framework.test import APIClient

from employees.models import StaffEmployee
from employees.services import card_service
from security.models import AuditLog

User = get_user_model()


def _user(email, is_staff=False):
    return User.objects.create_user(email=email, password="pw", is_staff=is_staff)


def _in_group(user, name):
    group, _ = Group.objects.get_or_create(name=name)
    user.groups.add(group)
    return user


def _employee(employee_number="YAM110001LAR", **overrides):
    data = {
        "employee_number": employee_number,
        "full_name": "Aicha Mint Ahmed",
        "department": "Operations",
        "job_title": "Dispatcher",
    }
    data.update(overrides)
    return StaffEmployee.objects.create(**data)


def _pdf_text(payload: bytes) -> str:
    """Decompress the PDF content streams so text assertions are meaningful.

    ReportLab compresses page content with FlateDecode, so a raw byte search would
    pass even if forbidden data were present. This helper inflates every stream so
    the assertions below actually inspect the rendered text.
    """
    import re
    import zlib

    chunks = []
    for match in re.finditer(rb"stream\r?\n(.*?)endstream", payload, re.DOTALL):
        raw = match.group(1).strip(b"\r\n")
        try:
            chunks.append(zlib.decompress(raw))
        except zlib.error:
            try:
                # ASCII85 + Flate (ReportLab's default for images/large streams)
                import base64

                chunks.append(zlib.decompress(base64.a85decode(raw, adobe=True)))
            except Exception:
                chunks.append(raw)
    return b"\n".join(chunks).decode("latin-1", errors="ignore")


class CardPdfEndpointTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.hr = _in_group(_user("hr-pdf@yala.test", is_staff=True), "HR Staff")
        self.ops = _in_group(_user("ops-pdf@yala.test", is_staff=True), "Operations Manager")
        self.employee = _employee(date_of_birth="1990-05-04")
        self.card = card_service.issue_card(self.employee)

    def _url(self, employee=None, card=None):
        employee = employee or self.employee
        card = card or self.card
        return f"/employees/{employee.employee_number}/cards/{card.pk}/pdf/"

    def test_non_hr_staff_is_forbidden(self):
        self.client.force_authenticate(user=self.ops)
        self.assertEqual(self.client.get(self._url()).status_code, 403)

    def test_anonymous_is_rejected(self):
        self.client.force_authenticate(user=None)
        self.assertIn(self.client.get(self._url()).status_code, (401, 403))

    def test_hr_staff_receives_a_pdf_with_safe_headers(self):
        self.client.force_authenticate(user=self.hr)
        response = self.client.get(self._url())

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "application/pdf")
        self.assertEqual(response["Cache-Control"], "private, no-store")
        self.assertEqual(response["X-Content-Type-Options"], "nosniff")
        payload = b"".join(response.streaming_content)
        self.assertTrue(payload.startswith(b"%PDF"))

    def test_pdf_never_contains_dob_or_national_id(self):
        self.client.force_authenticate(user=self.hr)
        response = self.client.get(self._url())
        payload = b"".join(response.streaming_content)
        text = _pdf_text(payload)

        # The decompressed content must actually contain the card text (otherwise
        # the assertions below would be vacuous), yet no DOB and no national ID.
        self.assertIn(self.card.card_number, text)
        self.assertNotIn("1990-05-04", text)
        self.assertNotIn("04/05/1990", text)
        self.assertNotIn("national", text.lower())
        self.assertNotIn("date of birth", text.lower())

    def test_pdf_carries_the_real_card_status_and_expiry(self):
        self.client.force_authenticate(user=self.hr)
        card_service.revoke_card(self.card, request=None, reason="Lost")
        response = self.client.get(self._url())
        payload = b"".join(response.streaming_content)
        text = _pdf_text(payload)

        self.assertEqual(response.status_code, 200)
        self.assertIn("REVOKED", text)
        self.assertIn(self.card.expires_at.date().isoformat(), text)

    def test_generation_is_audited(self):
        self.client.force_authenticate(user=self.hr)
        self.client.get(self._url())

        log = (
            AuditLog.objects.filter(entity_id=self.card.card_number)
            .order_by("-created_at")
            .first()
        )
        self.assertIsNotNone(log)
        self.assertEqual(log.entity_type, "id_card")
        self.assertIn("PDF", log.summary)

    def test_another_employees_card_is_not_reachable(self):
        other = _employee(employee_number="YAM110002LAR", full_name="Other Person")
        self.client.force_authenticate(user=self.hr)
        self.assertEqual(
            self.client.get(f"/employees/{other.employee_number}/cards/{self.card.pk}/pdf/").status_code,
            400,
        )

    def test_missing_card_returns_400(self):
        self.client.force_authenticate(user=self.hr)
        self.assertEqual(
            self.client.get(f"/employees/{self.employee.employee_number}/cards/99999/pdf/").status_code,
            400,
        )

    def test_pdf_is_two_pages_at_exact_cr80_size(self):
        """Front + back, each page exactly 85.60 x 53.98 mm (ISO/IEC 7810 ID-1).

        The card must print at true size on a PVC card printer and 1:1 on an office
        printer, so the page box itself has to be CR80 — not an A4 sheet with a card
        floating on it.
        """
        import re

        self.client.force_authenticate(user=self.hr)
        payload = b"".join(self.client.get(self._url()).streaming_content)

        # Two page objects (the /Pages tree node is excluded by the [^s] guard).
        pages = re.findall(rb"/Type\s*/Page[^s]", payload)
        self.assertEqual(len(pages), 2, "the card must render a front and a back page")

        # 85.60 mm x 53.98 mm in points = 242.65 x 153.01
        boxes = re.findall(rb"/MediaBox\s*\[([^\]]*)\]", payload)
        self.assertGreaterEqual(len(boxes), 2)
        for box in boxes:
            x0, y0, x1, y1 = (float(part) for part in box.split())
            self.assertAlmostEqual(x1 - x0, 242.65, delta=0.05)
            self.assertAlmostEqual(y1 - y0, 153.01, delta=0.05)


    def test_back_carries_the_required_contact_and_notice_block(self):
        """The redesigned back must show the lost/found, support and notice content.

        This is the professional back design: the QR + caption own the lower-left, the
        identifiers and notice bullets own the right column, and the dark-green footer
        carries the property notice. It also guards the layout fix — the QR caption used to
        be drawn at the same height as the verification sentence and printed on top of it.
        """
        self.client.force_authenticate(user=self.hr)
        text = _pdf_text(b"".join(self.client.get(self._url()).streaming_content))

        # Lost / found instruction — final Founder/CEO-approved wording
        self.assertIn("IF FOUND, PLEASE CONTACT US", text)
        self.assertIn("YALA TECHNOLOGIES", text)
        self.assertIn("This identification card is the property of Yala Technologies.", text)
        self.assertIn(
            "If found, please contact our administration office to arrange its safe return.", text
        )

        # Official card contact information — confirmed by the Founder/CEO
        self.assertIn("Phone: +222 22 11 43 73", text)
        self.assertIn("Email: sakho@admin.mr", text)

        # Employee verification wording
        self.assertIn("EMPLOYEE VERIFICATION", text)
        self.assertIn("Scan the QR code using the authorized", text)
        self.assertIn("Yala verification system.", text)

        # Important notice bullets — final Founder/CEO-approved wording
        self.assertIn("IMPORTANT NOTICE", text)
        self.assertIn("This card is non-transferable.", text)
        self.assertIn("Present upon request by authorized personnel.", text)
        self.assertIn("Report lost or stolen cards immediately.", text)
        self.assertIn("Unauthorized use is prohibited.", text)

    def test_pdf_renders_the_front_and_back_specification(self):
        """Every field the ID-card specification requires is on the correct side."""
        self.client.force_authenticate(user=self.hr)
        text = _pdf_text(b"".join(self.client.get(self._url()).streaming_content))

        # Front
        self.assertIn("YALA TECHNOLOGIES", text)
        self.assertIn("OFFICIAL EMPLOYEE IDENTIFICATION", text)
        self.assertIn(self.employee.full_name, text)
        self.assertIn(self.employee.employee_number, text)
        self.assertIn("Dispatcher", text)  # job title
        self.assertIn("Operations", text)  # department

        # Back
        self.assertIn("SCAN TO VERIFY", text)
        self.assertIn(self.card.card_number, text)
        self.assertIn(self.card.issued_at.date().isoformat(), text)
        self.assertIn("This identification card is the property of Yala Technologies.", text)


class CardSloganBandTests(TestCase):
    """Founder/CEO directive (2026-10-26): official slogan at the bottom of the card BACK,
    with the Mauritanian flag beside it, without overlapping anything else.

    Guards the whole contract: the slogan prints on the PDF back (which is what Download and
    Print both use), it is configuration-owned, a pasted flag emoji cannot break the render,
    the bottom zones stay exclusive, and the front keeps its signature block.
    """

    def setUp(self):
        self.client = APIClient()
        self.hr = _in_group(_user("hr-slogan@yala.test", is_staff=True), "HR Staff")
        self.employee = _employee("YAM110002LAR")
        self.card = card_service.issue_card(self.employee)
        self.client.force_authenticate(user=self.hr)

    def _render(self):
        response = self.client.get(
            f"/employees/{self.employee.employee_number}/cards/{self.card.pk}/pdf/"
        )
        self.assertEqual(response.status_code, 200)
        return b"".join(response.streaming_content)

    @staticmethod
    def _letters_only(value):
        return "".join(ch for ch in value.upper() if ch.isalnum())

    @staticmethod
    def _inflate(payload):
        """PDF text with ReportLab's octal escapes for the em dash/bullet decoded."""
        import re

        text = _pdf_text(payload)
        return re.sub(r"\\([0-7]{3})", lambda m: chr(int(m.group(1), 8)), text)

    def test_back_prints_the_official_slogan(self):
        from employees.services import card_pdf

        text = self._inflate(self._render())
        slogan = card_pdf._slogan()
        self.assertEqual(slogan, "YALA TECHNOLOGIES — FAST • SAFE • RELIABLE")
        self.assertIn(
            self._letters_only(slogan),
            self._letters_only(text),
            "the official slogan must be rendered on the card PDF",
        )
        for word in ("FAST", "SAFE", "RELIABLE"):
            self.assertIn(word, text)

    def test_slogan_is_owned_by_configuration(self):
        from django.test import override_settings

        with override_settings(YALA_CARD_SLOGAN="CUSTOM SLOGAN LINE"):
            text = self._inflate(self._render())
        self.assertIn("CUSTOM SLOGAN LINE", text)

    def test_flag_emoji_in_the_setting_cannot_break_the_render(self):
        """The flag is drawn as vector art, so pasting the flag emoji must be harmless."""
        from django.test import override_settings

        from employees.services import card_pdf

        pasted = "YALA TECHNOLOGIES — FAST • SAFE • RELIABLE \U0001F1F2\U0001F1F7"
        with override_settings(YALA_CARD_SLOGAN=pasted):
            text = self._inflate(self._render())
        self.assertIn("FAST", text)
        self.assertIn("RELIABLE", text)
        self.assertFalse(
            any(0x1F1E6 <= ord(ch) <= 0x1F1FF for ch in card_pdf._slogan()),
            "regional indicator glyphs must never reach the type engine",
        )

    def test_slogan_band_zones_do_not_overlap(self):
        """Bottom-of-back zones must stay exclusive, using real ink extents."""
        from reportlab.lib.units import mm

        from employees.services import card_pdf

        def line_box(baseline_mm, size_pt):
            cap = size_pt * 0.717 / 72 * 25.4
            desc = size_pt * 0.207 / 72 * 25.4
            return baseline_mm - desc, baseline_mm + cap

        band_top = card_pdf.SLOGAN_BAND_TOP / mm
        strip_top = card_pdf.PROPERTY_STRIP_TOP / mm
        self.assertGreater(strip_top, band_top, "the strip sits above the slogan band")

        # Left column, bottom upward: slogan band -> property strip -> email -> phone ->
        # QR caption -> QR block.
        left = [
            (0.0, band_top),
            (band_top, strip_top),
            line_box(9.4, 4.2),   # email line
            line_box(11.2, 4.2),  # phone line
            line_box(13.2, 4.0),  # QR caption
            (14.5, 14.5 + 24.0),  # QR block
        ]
        for index in range(len(left) - 1):
            self.assertGreaterEqual(
                left[index + 1][0],
                left[index][1],
                f"zone {index + 1} starts before zone {index} ends",
            )

        # The property notice is the strip's own content: contained, not stacked.
        notice_low, notice_high = line_box(6.35, 3.9)
        self.assertGreaterEqual(notice_low, band_top)
        self.assertLessEqual(notice_high, strip_top)

        # The slogan band must also clear the lowest right-column notice bullet.
        bullet_low, _bullet_high = line_box(9.6, 4.0)
        self.assertGreaterEqual(bullet_low, strip_top)

    def test_slogan_band_stays_inside_the_card(self):
        from reportlab.lib.units import mm

        from employees.services import card_pdf

        self.assertLess(card_pdf.SLOGAN_BAND_TOP, card_pdf.CARD_HEIGHT)
        self.assertLess(card_pdf.PROPERTY_STRIP_TOP, card_pdf.CARD_HEIGHT)
        self.assertEqual(card_pdf.CARD_WIDTH, 85.60 * mm)
        self.assertEqual(card_pdf.CARD_HEIGHT, 53.98 * mm)

    def test_front_signature_block_is_preserved(self):
        """Requirement 4: the front keeps its signature block and placeholder."""
        text = self._inflate(self._render())
        self.assertIn("EMPLOYEE SIGNATURE", text)
        self.assertIn("Signature not provided", text)

    def test_photo_and_qr_and_identifiers_are_preserved(self):
        """Requirement 5: photo, identification details and QR code are untouched."""
        text = self._inflate(self._render())
        self.assertIn("SCAN TO VERIFY", text)
        self.assertIn(self.employee.employee_number, text)
        self.assertIn(self.card.card_number, text)
        self.assertIn("EMPLOYEE VERIFICATION:", text)


