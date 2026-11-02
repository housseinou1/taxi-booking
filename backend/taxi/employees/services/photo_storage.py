"""Secure, private employee-photograph storage.

Photographs are stored OUTSIDE the public ``/media/`` tree, under
``settings.PROTECTED_MEDIA_ROOT``, with random UUID filenames (no employee
names, no predictable URLs). Files are only ever reachable through the
authenticated, HR-gated retrieval view — never via a static/media URL.

Security controls applied on upload:
- Allow-list of formats (JPEG, PNG) validated by actually decoding the image
  with Pillow (not by trusting the client content-type or filename).
- File-size and pixel-dimension limits.
- Normalization: the image is re-encoded to JPEG, which drops EXIF/metadata and
  neutralizes malformed/polyglot payloads.
- Client filenames are never used; the stored path is a server-generated UUID,
  so path traversal is structurally impossible.
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


class PhotoValidationError(Exception):
    """Raised when an uploaded photograph fails validation."""


# Pillow format name -> accepted. Validation is by decoded format, not MIME.
ALLOWED_FORMATS = {"JPEG", "PNG"}
# Normalized output is always JPEG (strips metadata, consistent sizing).
_OUTPUT_EXT = ".jpg"
_OUTPUT_QUALITY = 88


def _protected_root() -> Path:
    root = Path(settings.PROTECTED_MEDIA_ROOT) / "employee_photos"
    root.mkdir(parents=True, exist_ok=True)
    return root


def _max_bytes() -> int:
    return int(getattr(settings, "EMPLOYEE_PHOTO_MAX_BYTES", 5 * 1024 * 1024))


def _max_dimension() -> int:
    return int(getattr(settings, "EMPLOYEE_PHOTO_MAX_DIMENSION", 4000))


def _resolve_within_root(key: str) -> Path:
    """Resolve a stored key to an absolute path, guaranteed inside the root.

    Keys are server-generated UUID filenames, but we still resolve-and-check to
    defend against any accidental traversal in a stored value.
    """
    root = _protected_root().resolve()
    # Only accept a bare filename (no separators), then join to the root.
    name = Path(key).name
    candidate = (root / name).resolve()
    if root not in candidate.parents and candidate != root:
        raise PhotoValidationError("Resolved photo path escapes the protected root.")
    return candidate


def validate_and_normalize(raw: bytes) -> bytes:
    """Validate raw upload bytes and return normalized JPEG bytes.

    Raises PhotoValidationError on any problem. Does not touch disk.
    """
    if Image is None:
        raise PhotoValidationError("Image processing is unavailable on the server.")

    if not raw:
        raise PhotoValidationError("Empty file.")
    if len(raw) > _max_bytes():
        raise PhotoValidationError(
            f"File too large (max {_max_bytes() // (1024 * 1024)} MB)."
        )

    # Decode + verify integrity. verify() detects truncation/corruption; we then
    # reopen (verify() leaves the image unusable) to inspect and re-encode.
    try:
        probe = Image.open(io.BytesIO(raw))
        probe.verify()
    except (UnidentifiedImageError, OSError, ValueError):
        raise PhotoValidationError("Unsupported or corrupted image file.")

    try:
        image = Image.open(io.BytesIO(raw))
        image.load()
    except (UnidentifiedImageError, OSError, ValueError):
        raise PhotoValidationError("Unsupported or corrupted image file.")

    if (image.format or "").upper() not in ALLOWED_FORMATS:
        raise PhotoValidationError("Only JPEG and PNG images are accepted.")

    max_dim = _max_dimension()
    width, height = image.size
    if width <= 0 or height <= 0:
        raise PhotoValidationError("Invalid image dimensions.")
    if width > max_dim or height > max_dim:
        raise PhotoValidationError(
            f"Image too large (max {max_dim}x{max_dim} px)."
        )

    # Normalize: convert to RGB and re-encode as JPEG from the raw pixel bytes.
    # Rebuilding the image via frombytes(tobytes()) drops all EXIF/metadata,
    # ICC profiles, and any non-pixel/polyglot payload, and we never pass exif=
    # to save(), so nothing is carried over.
    rgb = image.convert("RGB")
    clean = Image.frombytes("RGB", rgb.size, rgb.tobytes())

    out = io.BytesIO()
    clean.save(out, format="JPEG", quality=_OUTPUT_QUALITY, optimize=True)
    return out.getvalue()


def save_photo(raw: bytes) -> str:
    """Validate, normalize, and store a photo. Returns the opaque storage key.

    The key is a bare UUID filename (e.g. ``<uuid>.jpg``) stored on
    ``StaffEmployee.photo_key``.
    """
    normalized = validate_and_normalize(raw)
    key = f"{uuid.uuid4().hex}{_OUTPUT_EXT}"
    path = _resolve_within_root(key)
    with open(path, "wb") as fh:
        fh.write(normalized)
    try:
        # Best-effort private perms (POSIX). No-op/ignored on Windows dev.
        path.chmod(0o600)
    except (OSError, NotImplementedError):
        pass
    return key


def replace_photo(old_key: str, raw: bytes) -> str:
    """Store a new photo, then delete the old file. Fails safe.

    The new photo is fully validated and written BEFORE the old file is
    removed, so a validation failure never destroys the existing photograph and
    never leaves the record pointing at a missing file.
    """
    new_key = save_photo(raw)  # raises before any deletion if invalid
    if old_key and old_key != new_key:
        delete_photo(old_key)
    return new_key


def delete_photo(key: str) -> bool:
    """Delete a stored photo by key. Returns True if a file was removed."""
    if not key:
        return False
    try:
        path = _resolve_within_root(key)
    except PhotoValidationError:
        return False
    if path.exists():
        path.unlink()
        return True
    return False


def open_photo(key: str):
    """Open a stored photo for reading. Returns a binary file handle.

    Raises FileNotFoundError if the key resolves to no file. The caller
    (HR-gated view) is responsible for authorization and streaming.
    """
    path = _resolve_within_root(key)
    if not path.exists():
        raise FileNotFoundError(key)
    return open(path, "rb")


def photo_content_type() -> str:
    return "image/jpeg"
