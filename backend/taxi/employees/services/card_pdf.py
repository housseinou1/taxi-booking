"""Employee ID-card PDF generation — CR80 double-sided (ReportLab, server-side).

Owner-approved approach (`pdf-id-card-dependency-recommendation.md`): the PDF is
generated **server-side per request** from the existing ``EmployeeIDCard`` data —
never from a cached public file, never via a public media URL. ReportLab is already
the project's PDF dependency, so nothing new is introduced.

Layout contract (this is what makes the card printable):

* **Page 1 = card front, page 2 = card back.**
* Each page is **exactly CR80 / ISO/IEC 7810 ID-1: 85.60 mm × 53.98 mm**, so a PVC
  card printer prints it at true size and a normal office printer can print it 1:1
  (no A4/Letter stretch).

Security requirements honoured:

* HR tier only (the view enforces it); every generation is audited.
* No date of birth and no personal identification number appear anywhere in the
  document — only the fields required by the ID-card specification.
* The photograph is read through the protected photo storage, and the QR is the same
  PNG path as the authenticated QR endpoint (opaque card uuid only; no tokens, no
  internal endpoints).
* A revoked/replaced/expired card still prints (it is a record) but always carries its
  real status and expiry, so a printed copy cannot misrepresent validity.
* Generation is **read-only**: it never renews, replaces, activates, deactivates or
  revokes a card, and never changes the employee record.

Branding uses the official Yala logo shipped with the project
(``employees/assets/yala_logo.png`` — a copy of the admin logo ``yala-admin-logo.png``)
and the Yala dark-green palette. No logo is invented.
"""

from __future__ import annotations

import io
from pathlib import Path

from reportlab.lib.colors import HexColor
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas

# ── Physical card geometry: CR80 / ID-1 (exact) ──────────────────────────────
CARD_WIDTH = 85.60 * mm
CARD_HEIGHT = 53.98 * mm

# ── Official Yala branding ──────────────────────────────────────────────────
YALA_GREEN = HexColor("#0a3d2a")  # dark green (brand)
YALA_GREEN_ACCENT = HexColor("#00a651")  # brand accent
YALA_INK = HexColor("#0f172a")
YALA_MUTED = HexColor("#475569")
YALA_PAPER = HexColor("#ffffff")
YALA_LINE = HexColor("#cbd5e1")
YALA_GOLD = HexColor("#d4a017")  # brand gold, used for the national flag crescent/star
MAURITANIA_FLAG_RED = HexColor("#d01c1f")
MAURITANIA_FLAG_GREEN = HexColor("#006233")
MAURITANIA_FLAG_GOLD = HexColor("#ffc400")

#: Founder/CEO slogan fallback, used only when configuration is empty. The live value comes
#: from ``settings.YALA_CARD_SLOGAN`` so marketing copy is never hardcoded in the renderer.
YALA_CARD_SLOGAN_FALLBACK = "YALA TECHNOLOGIES — FAST • SAFE • RELIABLE"

# ── Bottom-of-back zones (all exclusive, so nothing can overlap) ──────────────
#: Dark-green slogan band: the only element between the card edge and the property strip.
SLOGAN_BAND_TOP = 5.4 * mm
#: Light property strip holding the property notice, directly above the slogan band.
PROPERTY_STRIP_TOP = 8.0 * mm

STATUS_LABELS = {
    "valid": "VALID",
    "expired": "EXPIRED",
    "deactivated": "DEACTIVATED",
    "replaced": "REPLACED",
    "revoked": "REVOKED",
}

#: Official logo shipped with the project (never invented, never replaced).
LOGO_PATH = Path(__file__).resolve().parent.parent / "assets" / "yala_logo.png"


def card_page_size() -> tuple[float, float]:
    """The exact page size every card page uses (points): CR80."""
    return (CARD_WIDTH, CARD_HEIGHT)


def load_official_logo() -> bytes | None:
    """Bytes of the official Yala logo, or ``None`` if the asset is unavailable."""
    try:
        if LOGO_PATH.exists():
            return LOGO_PATH.read_bytes()
    except Exception:  # pragma: no cover - a missing logo must not break the card
        return None
    return None


def _status_label(card) -> str:
    return STATUS_LABELS.get(card.status, str(card.status or "").upper())


def _date(value) -> str:
    return value.date().isoformat() if value else "-"


def _draw_photo(pdf, x, y, width, height, photo_bytes):
    """Draw the employee photo without distortion, or a clear placeholder."""
    if photo_bytes:
        try:
            pdf.drawImage(
                ImageReader(io.BytesIO(photo_bytes)),
                x,
                y,
                width=width,
                height=height,
                preserveAspectRatio=True,
                anchor="c",
                mask="auto",
            )
            return
        except Exception:  # pragma: no cover - an unreadable image must not break the card
            pass
    pdf.setFillColorRGB(0.93, 0.93, 0.93)
    pdf.rect(x, y, width, height, stroke=0, fill=1)
    pdf.setStrokeColor(YALA_LINE)
    pdf.rect(x, y, width, height, stroke=1, fill=0)
    pdf.setFillColor(YALA_MUTED)
    pdf.setFont("Helvetica", 4.6)
    pdf.drawCentredString(x + width / 2, y + height / 2, "NO PHOTO")


def _draw_signature(pdf, x, y, width, height, signature_bytes):
    """Draw the employee's own signature, or the literal "not provided" placeholder.

    The image is always drawn with ``preserveAspectRatio=True`` and ``mask="auto"``, so it is
    never stretched or distorted and a transparent background stays transparent over the card.
    Nothing here can produce a signature: when no asset is supplied the card states
    "Signature not provided".
    """
    # Signature rule (the line the signature sits on).
    pdf.setStrokeColor(YALA_LINE)
    pdf.setLineWidth(0.25)
    pdf.line(x, y, x + width, y)

    if signature_bytes:
        try:
            pdf.drawImage(
                ImageReader(io.BytesIO(signature_bytes)),
                x,
                y + 0.4 * mm,
                width=width,
                height=height,
                preserveAspectRatio=True,
                anchor="sw",
                mask="auto",
            )
            return
        except Exception:  # pragma: no cover - an unreadable image must not break the card
            pass
    pdf.setFillColor(YALA_MUTED)
    pdf.setFont("Helvetica-Oblique", 4.4)
    pdf.drawString(x, y + 1.4 * mm, "Signature not provided")


def _draw_front(pdf, *, employee, card, photo_bytes, logo_bytes, signature_bytes=None):
    """Card front: logo, photograph, identity, employment, validity and signature."""
    width, height = CARD_WIDTH, CARD_HEIGHT

    pdf.setFillColor(YALA_PAPER)
    pdf.rect(0, 0, width, height, stroke=0, fill=1)

    # Header band (dark green) with the official logo.
    band_h = 10.5 * mm
    pdf.setFillColor(YALA_GREEN)
    pdf.rect(0, height - band_h, width, band_h, stroke=0, fill=1)
    pdf.setFillColor(YALA_GREEN_ACCENT)
    pdf.rect(0, height - band_h, width, 0.7 * mm, stroke=0, fill=1)

    text_x = 3 * mm
    if logo_bytes:
        try:
            logo_w = 9 * mm
            pdf.drawImage(
                ImageReader(io.BytesIO(logo_bytes)),
                text_x,
                height - band_h + 1.6 * mm,
                width=logo_w,
                height=band_h - 3.2 * mm,
                preserveAspectRatio=True,
                anchor="w",
                mask="auto",
            )
            text_x = text_x + logo_w + 2 * mm
        except Exception:  # pragma: no cover
            pass

    pdf.setFillColor(YALA_PAPER)
    pdf.setFont("Helvetica-Bold", 7.4)
    pdf.drawString(text_x, height - 4.6 * mm, "YALA TECHNOLOGIES")
    pdf.setFont("Helvetica", 4.4)
    pdf.drawString(text_x, height - 7.6 * mm, "OFFICIAL EMPLOYEE IDENTIFICATION")

    # Photograph (protected storage bytes only; never distorted).
    photo_w, photo_h = 19 * mm, 22 * mm
    photo_x = 3 * mm
    photo_y = 7 * mm
    _draw_photo(pdf, photo_x, photo_y, photo_w, photo_h, photo_bytes)

    # Identity block (no date of birth, no personal identification number).
    block_x = photo_x + photo_w + 3 * mm
    pdf.setFillColor(YALA_INK)
    pdf.setFont("Helvetica-Bold", 8.4)
    name = (employee.full_name or "").strip() or "-"
    pdf.drawString(block_x, height - 16 * mm, name[:30])

    pdf.setFont("Helvetica", 5.8)
    lines = [
        ("Employee ID", str(employee.employee_number or "-")),
        ("Job title", employee.job_title or "-"),
        ("Department", employee.department or "-"),
        ("Employment", employee.employment_status or "-"),
        ("Expires", _date(card.expires_at)),
    ]
    line_y = height - 20.4 * mm
    for label, value in lines:
        pdf.setFillColor(YALA_MUTED)
        pdf.setFont("Helvetica", 5.4)
        pdf.drawString(block_x, line_y, f"{label}:")
        pdf.setFillColor(YALA_INK)
        pdf.setFont("Helvetica-Bold", 5.8)
        pdf.drawString(block_x + 17 * mm, line_y, str(value)[:20])
        line_y -= 3.4 * mm

    # Employee signature — bottom of the front, beneath the photograph and identity details.
    # x starts right of the photograph (which ends at 22mm) and below the last identity line
    # (baseline 19.98mm), so nothing overlaps the photo, name, ID number or other details.
    sig_x = block_x
    sig_width = 35 * mm
    pdf.setFillColor(YALA_MUTED)
    pdf.setFont("Helvetica-Bold", 4.6)
    pdf.drawString(sig_x, 15.4 * mm, "EMPLOYEE SIGNATURE")
    _draw_signature(pdf, sig_x, 7.0 * mm, sig_width, 6.6 * mm, signature_bytes)

    # Footer: card number + real status (a printed copy can never look "more valid").
    pdf.setFillColor(YALA_GREEN)
    pdf.rect(0, 0, width, 4.6 * mm, stroke=0, fill=1)
    pdf.setFillColor(YALA_PAPER)
    pdf.setFont("Helvetica-Bold", 5)
    pdf.drawString(3 * mm, 1.6 * mm, f"CARD {card.card_number}")
    pdf.drawRightString(width - 3 * mm, 1.6 * mm, _status_label(card))
    pdf.showPage()



def _card_setting(name: str, placeholder: str) -> str:
    """Read a card contact setting, falling back to a clearly marked placeholder.

    Card contact details are owned by configuration (``YALA_CARD_SUPPORT_PHONE`` /
    ``YALA_CARD_CONTACT_EMAIL``) so the renderer never invents or hardcodes a contact value.
    """
    try:
        from django.conf import settings

        value = str(getattr(settings, name, "") or "").strip()
    except Exception:  # pragma: no cover
        value = ""
    return value or placeholder


def _support_phone() -> str:
    """Official Yala card phone number — confirmed by the Founder/CEO (2026-10-26).

    Never invented in the renderer: it comes from ``YALA_CARD_SUPPORT_PHONE``, which
    defaults to the CEO-confirmed ``+222 22 11 43 73``. If it is ever unset, a clearly
    marked placeholder is printed instead of a guessed number.
    """
    return _card_setting("YALA_CARD_SUPPORT_PHONE", "[PHONE NOT CONFIGURED]")


def _support_email() -> str:
    """Official Yala card email — confirmed by the Founder/CEO (2026-10-26).

    Never invented in the renderer: it comes from ``YALA_CARD_CONTACT_EMAIL``, which
    defaults to the CEO-confirmed ``sakho@admin.mr``.
    """
    return _card_setting("YALA_CARD_CONTACT_EMAIL", "[EMAIL NOT CONFIGURED]")


def draw_mauritania_flag(pdf, x, y, width, height):
    """Draw the Mauritanian national flag as vector art.

    Drawn geometrically (green field, gold crescent and five-pointed star, and the two red
    bands added in 2017) so the flag renders identically in every PDF viewer and never
    depends on an emoji font being installed — Helvetica has no glyph for the regional
    indicators in 🇲🇷 and would print two letters or blank boxes instead of a flag.
    """
    from math import cos, pi, sin

    stripe = height / 5.0
    pdf.setFillColor(MAURITANIA_FLAG_RED)
    pdf.rect(x, y + height - stripe, width, stripe, stroke=0, fill=1)
    pdf.rect(x, y, width, stripe, stroke=0, fill=1)
    pdf.setFillColor(MAURITANIA_FLAG_GREEN)
    pdf.rect(x, y + stripe, width, height - (2 * stripe), stroke=0, fill=1)

    radius = min(width, height) * 0.22
    centre_x = x + width / 2.0
    centre_y = y + height * 0.44

    # Crescent: a gold disc with a green disc offset upward to cut the opening.
    pdf.setFillColor(MAURITANIA_FLAG_GOLD)
    pdf.circle(centre_x, centre_y, radius, stroke=0, fill=1)
    pdf.setFillColor(MAURITANIA_FLAG_GREEN)
    pdf.circle(centre_x, centre_y + radius * 0.42, radius * 0.86, stroke=0, fill=1)

    # Five-pointed gold star sitting in the crescent's opening.
    star_radius = radius * 0.72
    star_x = centre_x
    star_y = centre_y + radius * 0.78
    points = []
    for index in range(10):
        angle = -pi / 2 + index * pi / 5.0
        reach = star_radius if index % 2 == 0 else star_radius * 0.42
        points.append((star_x + reach * cos(angle), star_y + reach * sin(angle)))
    pdf.setFillColor(MAURITANIA_FLAG_GOLD)
    path = pdf.beginPath()
    path.moveTo(*points[0])
    for point in points[1:]:
        path.lineTo(*point)
    path.close()
    pdf.drawPath(path, stroke=0, fill=1)


def _slogan() -> str:
    """The configured company slogan, safe to typeset with Helvetica.

    Any flag emoji or unsupported glyph is removed here because the flag is drawn as vector
    art beside the text; pasting the full Founder/CEO line (including 🇲🇷) therefore still
    produces a correct card.
    """
    raw = _card_setting("YALA_CARD_SLOGAN", YALA_CARD_SLOGAN_FALLBACK)
    cleaned = "".join(
        ch for ch in str(raw) if ch in "—•" or 0x20 <= ord(ch) < 0x2000
    )
    return " ".join(cleaned.split()).strip() or YALA_CARD_SLOGAN_FALLBACK


def draw_slogan_band(pdf, *, width, top=SLOGAN_BAND_TOP):
    """Bottom-of-back slogan band: Mauritanian flag beside the official slogan.

    The band is the only element below the property strip, so it cannot overlap the QR
    block, the contact lines, the notice bullets or the property notice. The flag + slogan
    group is centred horizontally, and the measured text width is used rather than an
    assumed one.
    """
    pdf.setFillColor(YALA_GREEN)
    pdf.rect(0, 0, width, top, stroke=0, fill=1)
    pdf.setFillColor(YALA_GREEN_ACCENT)
    pdf.rect(0, top - 0.6 * mm, width, 0.6 * mm, stroke=0, fill=1)

    slogan = _slogan()
    pdf.setFont("Helvetica-Bold", 4.8)
    text_width = pdf.stringWidth(slogan, "Helvetica-Bold", 4.8)

    flag_w = 5.1 * mm
    flag_h = 3.4 * mm
    gap = 2.0 * mm
    group_w = flag_w + gap + text_width

    start_x = max((width - group_w) / 2.0, 3 * mm)
    baseline = 2.2 * mm

    draw_mauritania_flag(pdf, start_x, 1.0 * mm, flag_w, flag_h)
    pdf.setFillColor(YALA_PAPER)
    pdf.setFont("Helvetica-Bold", 4.8)
    pdf.drawString(start_x + flag_w + gap, baseline, slogan)


def _draw_back(pdf, *, employee, card, qr_png, logo_bytes):

    """Card back: verification QR, identifiers, CEO-confirmed contact block, slogan band.

    The layout gives every area its own coordinates so nothing can overlap. From the bottom
    edge upward the zones are exclusive:

    * ``0 - 5.4mm``  dark-green SLOGAN BAND — Mauritanian flag + official company slogan
    * ``5.4 - 8.0mm`` light PROPERTY STRIP — property notice and optional website
    * ``8.0 - 14.5mm`` left column: contact lines (right column: last notice bullet)
    * ``14.5 - 38.5mm`` left column: verification QR + caption
    * ``x >= 29mm``  right column: identifiers, verification wording, lost-and-found, notice

    The slogan band was added by Founder/CEO directive (2026-10-26). To keep its zone clear,
    the QR, the contact lines and the right column were each shifted up within their own
    column; no element was removed and the minimum vertical clearance between zones is
    0.3mm. The earlier version drew the QR caption at y=7.3mm while the verification
    sentence sat at y=7.4mm, which printed on top of each other.

    Contact details come from configuration (never invented here): see ``_support_phone`` and
    ``_support_email``, both confirmed by the Founder/CEO on 2026-10-26.
    """
    width, height = CARD_WIDTH, CARD_HEIGHT

    pdf.setFillColor(YALA_PAPER)
    pdf.rect(0, 0, width, height, stroke=0, fill=1)

    # Header band (dark green) with the official logo.
    band_h = 9.0 * mm
    pdf.setFillColor(YALA_GREEN)
    pdf.rect(0, height - band_h, width, band_h, stroke=0, fill=1)
    pdf.setFillColor(YALA_GREEN_ACCENT)
    pdf.rect(0, height - band_h, width, 0.7 * mm, stroke=0, fill=1)

    text_x = 3 * mm
    if logo_bytes:
        try:
            logo_w = 7 * mm
            pdf.drawImage(
                ImageReader(io.BytesIO(logo_bytes)),
                text_x,
                height - band_h + 1.5 * mm,
                width=logo_w,
                height=band_h - 3.0 * mm,
                preserveAspectRatio=True,
                anchor="w",
                mask="auto",
            )
            text_x = text_x + logo_w + 2 * mm
        except Exception:  # pragma: no cover
            pass
    pdf.setFillColor(YALA_PAPER)
    pdf.setFont("Helvetica-Bold", 6.6)
    pdf.drawString(text_x, height - 5.6 * mm, "YALA TECHNOLOGIES")
    pdf.setFont("Helvetica", 4.2)
    pdf.drawString(text_x, height - 8.2 * mm, "EMPLOYEE IDENTIFICATION")

    # Verification QR (lower-left; encodes only the opaque card uuid). 24mm keeps it
    # comfortably scannable at CR80 print size.
    qr_size = 24 * mm
    qr_x, qr_y = 3 * mm, 14.5 * mm
    if qr_png:
        try:
            pdf.drawImage(
                ImageReader(io.BytesIO(qr_png)),
                qr_x,
                qr_y,
                width=qr_size,
                height=qr_size,
                preserveAspectRatio=True,
                anchor="sw",
            )
        except Exception:  # pragma: no cover
            pass
    else:
        pdf.setStrokeColor(YALA_LINE)
        pdf.rect(qr_x, qr_y, qr_size, qr_size, stroke=1, fill=0)
    pdf.setFillColor(YALA_MUTED)
    pdf.setFont("Helvetica-Bold", 4.0)
    pdf.drawCentredString(qr_x + qr_size / 2, 13.2 * mm, "SCAN TO VERIFY")

    # Left column under the QR: official card contact information (Founder/CEO confirmed).
    pdf.setFillColor(YALA_INK)
    pdf.setFont("Helvetica-Bold", 4.2)
    pdf.drawString(3 * mm, 11.2 * mm, f"Phone: {_support_phone()}")
    pdf.drawString(3 * mm, 9.4 * mm, f"Email: {_support_email()}")

    # Right column: identifiers, verification wording, lost/found notice, notice bullets.
    col_x = 29 * mm
    value_x = 46 * mm
    rows = [
        ("Card number", str(card.card_number or "-")),
        ("Employee ID", str(employee.employee_number or "-")),
        ("Issued", _date(card.issued_at)),
        ("Expires", _date(card.expires_at)),
    ]
    row_y = height - 13.8 * mm
    for label, value in rows:
        pdf.setFillColor(YALA_MUTED)
        pdf.setFont("Helvetica", 4.3)
        pdf.drawString(col_x, row_y, label)
        pdf.setFillColor(YALA_INK)
        pdf.setFont("Helvetica-Bold", 5.2)
        pdf.drawString(value_x, row_y, str(value)[:20])
        row_y -= 3.15 * mm

    pdf.setFillColor(YALA_MUTED)
    pdf.setFont("Helvetica-Bold", 4.1)
    pdf.drawString(col_x, 27.6 * mm, "EMPLOYEE VERIFICATION:")
    pdf.setFont("Helvetica", 4.0)
    pdf.drawString(col_x, 25.7 * mm, "Scan the QR code using the authorized Yala verification system.")

    pdf.setFillColor(YALA_INK)
    pdf.setFont("Helvetica-Bold", 4.1)
    pdf.drawString(col_x, 23.0 * mm, "IF FOUND, PLEASE CONTACT US")
    pdf.setFont("Helvetica", 4.0)
    pdf.drawString(col_x, 21.2 * mm, "This identification card is the property of Yala Technologies.")
    pdf.drawString(col_x, 19.4 * mm, "If found, please contact our administration office to arrange its safe return.")

    pdf.setFont("Helvetica-Bold", 4.1)
    pdf.drawString(col_x, 16.9 * mm, "IMPORTANT NOTICE:")
    pdf.setFont("Helvetica", 4.0)
    bullet_y = 15.0 * mm
    for bullet in (
        "This card is non-transferable.",
        "Present upon request by authorized personnel.",
        "Report lost or stolen cards immediately.",
        "Unauthorized use is prohibited.",
    ):
        pdf.drawString(col_x, bullet_y, f"- {bullet}")
        bullet_y -= 1.8 * mm

    # Property strip: the property notice moved up out of the bottom band so the slogan band
    # can own the bottom edge exclusively (Founder/CEO directive 2026-10-26).
    pdf.setFillColor(YALA_PAPER)
    pdf.rect(
        0,
        SLOGAN_BAND_TOP,
        width,
        PROPERTY_STRIP_TOP - SLOGAN_BAND_TOP,
        stroke=0,
        fill=1,
    )
    pdf.setStrokeColor(YALA_LINE)
    pdf.setLineWidth(0.25)
    pdf.line(0, PROPERTY_STRIP_TOP, width, PROPERTY_STRIP_TOP)
    pdf.setFillColor(YALA_MUTED)
    pdf.setFont("Helvetica-Bold", 3.9)
    pdf.drawString(3 * mm, 6.35 * mm, "This identification card is the property of Yala Technologies.")
    website = _public_website()
    if website:
        pdf.drawRightString(width - 3 * mm, 6.35 * mm, website[:24])

    # Founder/CEO slogan band: official slogan with the Mauritanian flag beside it.
    draw_slogan_band(pdf, width=width)
    pdf.showPage()


def _public_website() -> str:
    """Company website, only when explicitly configured for public display."""
    try:
        from django.conf import settings

        return str(getattr(settings, "YALA_CARD_WEBSITE", "") or "").strip()
    except Exception:  # pragma: no cover
        return ""


def build_card_pdf(
    *,
    employee,
    card,
    qr_png: bytes | None = None,
    photo_bytes: bytes | None = None,
    signature_bytes: bytes | None = None,
    logo_bytes: bytes | None = None,
) -> bytes:
    """Render the employee ID card as a two-page, exact-CR80 PDF.

    Page 1 = front, page 2 = back. Read-only: nothing here mutates the card or the
    employee record.

    ``signature_bytes`` is the employee's own electronic signature read from protected
    storage. When it is absent the front prints the literal placeholder
    "Signature not provided" — a signature is never drawn, synthesised or imitated here.
    """
    logo = logo_bytes if logo_bytes is not None else load_official_logo()

    buffer = io.BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=card_page_size())
    pdf.setTitle(f"Yala employee ID card {card.card_number}")
    pdf.setAuthor("Yala Technologies")
    pdf.setSubject("Official employee identification card")

    _draw_front(
        pdf,
        employee=employee,
        card=card,
        photo_bytes=photo_bytes,
        signature_bytes=signature_bytes,
        logo_bytes=logo,
    )
    _draw_back(pdf, employee=employee, card=card, qr_png=qr_png, logo_bytes=logo)

    pdf.save()
    return buffer.getvalue()

