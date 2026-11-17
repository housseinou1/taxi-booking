"""
National ID image quality checks using Pillow only.

OCR is optional (pytesseract if installed). OCR failure never rejects a
technically clear photo — Mauritania ID layouts vary.
"""

from __future__ import annotations

import io
import logging
from dataclasses import dataclass, field
from typing import List, Optional, Sequence, Tuple

from PIL import Image, ImageFilter, ImageOps, UnidentifiedImageError

logger = logging.getLogger(__name__)

NATIONAL_ID_IMAGE_TYPES = frozenset({"national_id_front", "national_id_back", "national_id"})

MIN_WIDTH = 640
MIN_HEIGHT = 400
MIN_SHARPNESS = 45.0
MIN_BRIGHTNESS = 38.0
MAX_BRIGHTNESS = 225.0
MAX_GLARE_RATIO = 0.18
MIN_EDGE_RATIO = 0.012
MAX_EDGE_RATIO = 0.42


@dataclass
class ImageQualityResult:
    passed: bool
    checks: dict = field(default_factory=dict)
    messages: List[str] = field(default_factory=list)
    ocr_readable: Optional[bool] = None

    @property
    def error(self) -> Optional[str]:
        if self.passed:
            return None
        return self.messages[0] if self.messages else "Photo did not pass quality checks. Please retake it."


def _laplacian_variance(gray: Image.Image) -> float:
    """Approximate sharpness via Laplacian-like high-pass variance."""
    edges = gray.filter(ImageFilter.Kernel((3, 3), [-1, -1, -1, -1, 8, -1, -1, -1, -1], scale=1))
    hist = edges.histogram()
    total = sum(hist) or 1
    mean = sum(i * c for i, c in enumerate(hist)) / total
    var = sum(((i - mean) ** 2) * c for i, c in enumerate(hist)) / total
    return float(var)


def _mean_brightness(gray: Image.Image) -> float:
    hist = gray.histogram()
    total = sum(hist) or 1
    return sum(i * c for i, c in enumerate(hist)) / total


def _glare_ratio(gray: Image.Image) -> float:
    hist = gray.histogram()
    total = sum(hist) or 1
    bright = sum(hist[250:])
    return bright / total


def _edge_ratio(gray: Image.Image) -> float:
    edges = gray.filter(ImageFilter.FIND_EDGES)
    hist = edges.histogram()
    total = sum(hist) or 1
    strong = sum(hist[40:])
    return strong / total


def _border_crop_score(gray: Image.Image) -> float:
    """Low score suggests content may be cropped to the frame edge."""
    w, h = gray.size
    if w < 20 or h < 20:
        return 0.0
    border = max(2, min(w, h) // 40)
    pixels = list(gray.getdata()) if hasattr(gray, "getdata") else list(gray.get_flattened_data())

    def band_mean(coords: Sequence[Tuple[int, int]]) -> float:
        vals = [pixels[y * w + x] for x, y in coords]
        return (sum(vals) / len(vals)) if vals else 0.0

    top = [(x, y) for y in range(border) for x in range(0, w, 3)]
    bottom = [(x, y) for y in range(h - border, h) for x in range(0, w, 3)]
    left = [(x, y) for y in range(0, h, 3) for x in range(border)]
    right = [(x, y) for y in range(0, h, 3) for x in range(w - border, w)]
    interior = gray.crop((border, border, w - border, h - border))
    interior_mean = _mean_brightness(interior)
    border_mean = (
        band_mean(top) + band_mean(bottom) + band_mean(left) + band_mean(right)
    ) / 4.0
    return abs(interior_mean - border_mean)


def _optional_ocr_readable(image: Image.Image) -> Optional[bool]:
    try:
        import pytesseract  # type: ignore
    except Exception:
        return None
    try:
        text = pytesseract.image_to_string(image) or ""
        # Do not log OCR text (may contain PII).
        alnum = sum(1 for ch in text if ch.isalnum())
        return alnum >= 8
    except Exception:
        logger.debug("Optional OCR unavailable during National ID quality check", exc_info=False)
        return None


def analyze_national_id_image(file_obj) -> ImageQualityResult:
    """Analyze an uploaded National ID photo. Never auto-approves documents."""
    messages: List[str] = []
    checks: dict = {}

    try:
        raw = file_obj.read() if hasattr(file_obj, "read") else file_obj
        if hasattr(file_obj, "seek"):
            try:
                file_obj.seek(0)
            except Exception:
                pass
        if not raw:
            return ImageQualityResult(passed=False, messages=["File is empty."])
        image = Image.open(io.BytesIO(raw))
        image = ImageOps.exif_transpose(image)
        image.load()
    except UnidentifiedImageError:
        return ImageQualityResult(
            passed=False,
            messages=["Could not read this image. Please upload a JPEG or PNG photo."],
        )
    except Exception:
        return ImageQualityResult(
            passed=False,
            messages=["Could not read this image. Please retake the photo."],
        )

    width, height = image.size
    checks["width"] = width
    checks["height"] = height
    if width < MIN_WIDTH or height < MIN_HEIGHT:
        messages.append("Move the camera closer so the National ID fills more of the frame.")

    gray = ImageOps.grayscale(image)
    # Downscale for stable metrics on large phone photos.
    max_side = 1280
    if max(gray.size) > max_side:
        gray.thumbnail((max_side, max_side), Image.Resampling.LANCZOS)

    sharpness = _laplacian_variance(gray)
    brightness = _mean_brightness(gray)
    glare = _glare_ratio(gray)
    edges = _edge_ratio(gray)
    crop_contrast = _border_crop_score(gray)
    checks.update(
        {
            "sharpness": round(sharpness, 2),
            "brightness": round(brightness, 2),
            "glare_ratio": round(glare, 4),
            "edge_ratio": round(edges, 4),
            "border_contrast": round(crop_contrast, 2),
        }
    )

    if sharpness < MIN_SHARPNESS:
        messages.append("Photo is too blurry. Please retake it.")
    if brightness < MIN_BRIGHTNESS:
        messages.append("Improve lighting and try again.")
    elif brightness > MAX_BRIGHTNESS:
        messages.append("Photo is too bright. Reduce glare or move away from strong light.")
    if glare > MAX_GLARE_RATIO:
        messages.append("Avoid reflections on the document.")
    if edges < MIN_EDGE_RATIO:
        messages.append("Image does not appear to contain an identity document. Center the National ID and try again.")
    elif edges > MAX_EDGE_RATIO and sharpness < MIN_SHARPNESS * 1.5:
        messages.append("Photo looks noisy or unclear. Hold the camera steady and retake it.")
    if crop_contrast < 6.0 and edges < MIN_EDGE_RATIO * 2:
        messages.append("Make sure all four corners are visible.")

    ocr_readable = _optional_ocr_readable(gray)
    checks["ocr_readable"] = ocr_readable
    # Soft signal only — never reject solely on OCR.
    if ocr_readable is False and not messages:
        checks["ocr_soft_warning"] = "OCR could not read clear text; admin review still required."

    passed = len(messages) == 0
    if passed:
        messages = ["Photo is clear and readable."]
    return ImageQualityResult(
        passed=passed,
        checks=checks,
        messages=messages,
        ocr_readable=ocr_readable,
    )


def requires_national_id_image_quality(document_type: str) -> bool:
    return (document_type or "").strip() in NATIONAL_ID_IMAGE_TYPES
