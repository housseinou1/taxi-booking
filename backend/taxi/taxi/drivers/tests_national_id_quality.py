"""National ID front/back quality checks and legacy approval preservation."""

from __future__ import annotations

import io

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from PIL import Image, ImageDraw, ImageFilter

from deliveries.courier_onboarding import (
    _courier_documents_complete,
    get_required_courier_document_types,
)
from deliveries.models import DriverDeliverySettings
from taxi.drivers.models import DriverDocument, DriverProfile
from taxi.drivers.services.document_image_quality import analyze_national_id_image
from taxi.drivers.services.document_service import DocumentService


User = get_user_model()


def _png_bytes(image: Image.Image) -> bytes:
    buf = io.BytesIO()
    image.save(buf, format="PNG")
    return buf.getvalue()


def _clear_document_photo(width=900, height=560) -> bytes:
    """Synthetic ID-like card: patterned interior with readable-looking blocks."""
    img = Image.new("RGB", (width, height), (240, 240, 235))
    draw = ImageDraw.Draw(img)
    draw.rectangle([40, 40, width - 40, height - 40], outline=(30, 30, 30), width=4)
    draw.rectangle([70, 70, 260, 280], fill=(60, 90, 140))
    for i in range(8):
        y = 90 + i * 40
        draw.rectangle([300, y, width - 80, y + 18], fill=(20, 20, 20))
    # Soft texture so edge/sharpness metrics trip
    for x in range(0, width, 17):
        draw.line([(x, 40), (x, height - 40)], fill=(210, 210, 205), width=1)
    return _png_bytes(img)


def _blurry_photo() -> bytes:
    img = Image.open(io.BytesIO(_clear_document_photo()))
    img = img.filter(ImageFilter.GaussianBlur(radius=28))
    return _png_bytes(img)


def _dark_photo() -> bytes:
    img = Image.open(io.BytesIO(_clear_document_photo())).convert("RGB")
    dark = Image.eval(img, lambda p: int(p * 0.12))
    return _png_bytes(dark)


def _tiny_photo() -> bytes:
    img = Image.new("RGB", (120, 80), (200, 200, 200))
    return _png_bytes(img)


class NationalIdImageQualityTests(TestCase):
    def test_clear_photo_passes(self):
        result = analyze_national_id_image(io.BytesIO(_clear_document_photo()))
        self.assertTrue(result.passed, result.messages)

    def test_blurry_photo_fails(self):
        result = analyze_national_id_image(io.BytesIO(_blurry_photo()))
        self.assertFalse(result.passed, result.messages)
        joined = " ".join(result.messages).lower()
        self.assertTrue(
            any(
                token in joined
                for token in ("blurry", "unclear", "steady", "identity", "center", "retake")
            ),
            result.messages,
        )

    def test_dark_photo_fails(self):
        result = analyze_national_id_image(io.BytesIO(_dark_photo()))
        self.assertFalse(result.passed, result.messages)
        joined = " ".join(result.messages).lower()
        self.assertTrue("lighting" in joined or "bright" in joined or "dark" in joined, result.messages)

    def test_tiny_photo_fails(self):
        result = analyze_national_id_image(io.BytesIO(_tiny_photo()))
        self.assertFalse(result.passed)
        self.assertTrue(any("closer" in m.lower() for m in result.messages))


class NationalIdUploadAndLegacyTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            email="nid@example.com",
            password="pass12345",
            user_type="driver",
        )
        self.profile = DriverProfile.objects.create(
            user=self.user,
            status="pending_review",
            vehicle_make="Yamaha",
            vehicle_model="YZF",
            vehicle_color="Red",
            plate_number="1234AB",
        )
        DriverDeliverySettings.objects.create(
            driver=self.user,
            delivery_vehicle_type="bicycle",
        )
        self.service = DocumentService()

    def test_required_types_are_front_and_back(self):
        self.assertEqual(
            get_required_courier_document_types("bicycle"),
            ["national_id_front", "national_id_back"],
        )

    def test_upload_sets_pending_review_not_approved(self):
        uploaded = SimpleUploadedFile(
            "front.png",
            _clear_document_photo(),
            content_type="image/png",
        )
        doc = self.service.upload_document(
            self.profile,
            "national_id_front",
            uploaded,
        )
        self.assertEqual(doc.status, "pending_review")
        self.assertNotEqual(doc.status, "approved")

    def test_blurry_upload_rejected_by_server(self):
        uploaded = SimpleUploadedFile(
            "front.png",
            _blurry_photo(),
            content_type="image/png",
        )
        with self.assertRaises(ValueError) as ctx:
            self.service.upload_document(self.profile, "national_id_front", uploaded)
        message = str(ctx.exception).lower()
        self.assertTrue(
            any(token in message for token in ("blurry", "identity", "center", "unclear", "retake")),
            message,
        )

    def test_legacy_approved_national_id_not_forced_to_reupload(self):
        DriverDocument.objects.create(
            driver=self.profile,
            document_type="national_id",
            file=SimpleUploadedFile("id.png", _clear_document_photo(), content_type="image/png"),
            status="approved",
        )
        state = _courier_documents_complete(self.profile, "bicycle")
        self.assertTrue(state["all_required_documents_uploaded"])
        self.assertEqual(state["missing_document_types"], [])
