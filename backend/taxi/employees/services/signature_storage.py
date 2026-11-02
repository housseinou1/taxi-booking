"""Secure, private employee-signature storage.

An electronic signature is sensitive employee information, so it is handled exactly like the
employee photograph: stored OUTSIDE the public ``/media/`` tree, under
``settings.PROTECTED_MEDIA_ROOT``, with a random UUID filename (never the employee's name or
number), and reachable only through the authenticated, HR-gated retrieval view.

Differences from ``photo_storage`` (and why):

* Output is **PNG**, not JPEG, so a transparent signature background survives normalization
  (the card shows the signature over the printed card, so alpha matters).
* The image is **not** cropped, scaled or trimmed. "Maintain the signature's original
  proportions" is a card-rendering rule, and it can only be honoured if storage never changes
  the pixel geometry. Only re-encoding happens.

Security controls applied on upload (identical posture to photographs):

- Format allow-list (JPEG, PNG) validated by actually decoding with Pillow — the client's
  content-type and filename are never trusted.
- File-size and pixel-dimension limits.
- Normalization: pixels are rebuilt via ``frombytes(tobytes())`` and re-encoded, which drops
  EXIF/metadata, ICC profiles and any non-pixel/polyglot payload.
- Server-generated UUID filenames only, so path traversal is structurally impossible.
- Nothing here ever *creates* a signature. There is no code path that draws, synthesises or
  imitates a signature — an image must be supplied by an authorized administrator acting on a
  signature the employee provided.
"""

from __future__ import annotations

import io
import uuid
from pathlib import Path

from django.conf import settings

try:
    from PIL import Image, UnidentifiedImageError
except Exception:  # pragma: no cover - Pillow is a declared dependency
    Image = None
    UnidentifiedImageError = Exception


class SignatureValidationError(Exception):
    """Raised when an uploaded signature fails validation."""


# Pillow format name -> accepted. Validation is by decoded format, not MIME.
ALLOWED_FORMATS = {"JPEG", "PNG"}
# Normalized output is always PNG so transparency is preserved.
_OUTPUT_EXT = ".png"


def _protected_root() -> Path:
    root = Path(settings.PROTECTED_MEDIA_ROOT) / "employee_signatures"
    root.mkdir(parents=True, exist_ok=True)
    return root


def _max_bytes() -> int:
    return int(getattr(settings, "EMPLOYEE_SIGNATURE_MAX_BYTES", 2 * 1024 * 1024))


def _max_dimension() -> int:
    return int(getattr(settings, "EMPLOYEE_SIGNATURE_MAX_DIMENSION", 2000))


def _resolve_within_root(key: str) -> Path:
    """Resolve a stored key to an absolute path, guaranteed inside the root."""
    root = _protected_root().resolve()
    name = Path(key).name
    candidate = (root / name).resolve()
    if root not in candidate.parents and candidate != root:
        raise SignatureValidationError("Resolved signature path escapes the protected root.")
    return candidate


def validate_and_normalize(raw: bytes) -> bytes:
    """Validate raw upload bytes and return normalized PNG bytes.

    Raises SignatureValidationError on any problem. Does not touch disk.
    """
    if Image is None:
        raise SignatureValidationError("Image processing is unavailable on the server.")

    if not raw:
        raise SignatureValidationError("Empty file.")
    if len(raw) > _max_bytes():
        raise SignatureValidationError(
            f"File too large (max {_max_bytes() // (1024 * 1024)} MB)."
        )

    # Decode + verify integrity before trusting anything about the file.
    try:
        probe = Image.open(io.BytesIO(raw))
        probe.verify()
    except (UnidentifiedImageError, OSError, ValueError):
        raise SignatureValidationError("Unsupported or corrupted image file.")

    try:
        image = Image.open(io.BytesIO(raw))
        image.load()
    except (UnidentifiedImageError, OSError, ValueError):
        raise SignatureValidationError("Unsupported or corrupted image file.")

    if (image.format or "").upper() not in ALLOWED_FORMATS:
        raise SignatureValidationError("Only JPEG and PNG images are accepted.")

    max_dim = _max_dimension()
    width, height = image.size
    if width <= 0 or height <= 0:
        raise SignatureValidationError("Invalid image dimensions.")
    if width > max_dim or height > max_dim:
        raise SignatureValidationError(f"Image too large (max {max_dim}x{max_dim} px).")

    # Normalize to RGBA and re-encode from raw pixel bytes. Rebuilding drops EXIF/metadata
    # and any embedded payload while keeping alpha, and pixel geometry is untouched.
    rgba = image.convert("RGBA")
    clean = Image.frombytes("RGBA", rgba.size, rgba.tobytes())

    out = io.BytesIO()
    clean.save(out, format="PNG", optimize=True)
    return out.getvalue()


def save_signature(raw: bytes) -> str:
    """Validate, normalize and store a signature. Returns the opaque storage key."""
    normalized = validate_and_normalize(raw)
    key = f"{uuid.uuid4().hex}{_OUTPUT_EXT}"
    path = _resolve_within_root(key)
    with open(path, "wb") as fh:
        fh.write(normalized)
    try:
        path.chmod(0o600)  # best-effort private perms (no-op on Windows dev)
    except (OSError, NotImplementedError):
        pass
    return key


def replace_signature(old_key: str, raw: bytes) -> str:
    """Store a new signature, then delete the old file. Fails safe.

    The replacement is fully validated and written BEFORE the old file is removed, so a
    rejected upload never destroys the existing signature and never leaves the record
    pointing at a missing file.
    """
    new_key = save_signature(raw)  # raises before any deletion if invalid
    if old_key and old_key != new_key:
        delete_signature(old_key)
    return new_key


def delete_signature(key: str) -> bool:
    """Delete a stored signature by key. Returns True if a file was removed."""
    if not key:
        return False
    try:
        path = _resolve_within_root(key)
    except SignatureValidationError:
        return False
    if path.exists():
        path.unlink()
        return True
    return False


def open_signature(key: str):
    """Open a stored signature for reading. Returns a binary file handle.

    Raises FileNotFoundError if the key resolves to no file. The caller (HR-gated view) is
    responsible for authorization and streaming.
    """
    path = _resolve_within_root(key)
    if not path.exists():
        raise FileNotFoundError(key)
    return open(path, "rb")


def signature_content_type() -> str:
    return "image/png"
