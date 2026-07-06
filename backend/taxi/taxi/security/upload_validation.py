"""Shared upload validation for images and documents."""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Optional, Set

BLOCKED_EXTENSIONS = {
    ".exe",
    ".bat",
    ".cmd",
    ".com",
    ".msi",
    ".apk",
    ".sh",
    ".php",
    ".js",
    ".html",
    ".htm",
    ".svg",
    ".webp",
}

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png"}
IMAGE_CONTENT_TYPES = {"image/jpeg", "image/png"}
DOCUMENT_EXTENSIONS = IMAGE_EXTENSIONS | {".pdf"}
DOCUMENT_CONTENT_TYPES = IMAGE_CONTENT_TYPES | {"application/pdf"}

DEFAULT_IMAGE_MAX_BYTES = 5 * 1024 * 1024
DEFAULT_DOCUMENT_MAX_BYTES = 10 * 1024 * 1024


@dataclass
class UploadValidationResult:
    valid: bool
    error: Optional[str] = None


def _extension(name: str) -> str:
    return os.path.splitext(name or "")[1].lower()


def _safe_basename(name: str) -> str:
    base = os.path.basename(name or "upload")
    return base.replace("\x00", "").strip() or "upload"


def validate_upload_file(
    file,
    *,
    allowed_extensions: Set[str],
    allowed_content_types: Set[str],
    max_bytes: int,
    label: str = "File",
) -> UploadValidationResult:
    if file is None:
        return UploadValidationResult(valid=False, error=f"{label} is required.")

    name = _safe_basename(getattr(file, "name", ""))
    ext = _extension(name)
    if not ext or ext not in allowed_extensions:
        allowed = ", ".join(sorted(allowed_extensions))
        return UploadValidationResult(
            valid=False,
            error=f"{label} must be one of: {allowed}.",
        )
    if ext in BLOCKED_EXTENSIONS:
        return UploadValidationResult(valid=False, error=f"{label} type is not allowed.")

    size = getattr(file, "size", 0) or 0
    if size <= 0:
        return UploadValidationResult(valid=False, error=f"{label} is empty.")
    if size > max_bytes:
        limit_mb = max_bytes // (1024 * 1024)
        return UploadValidationResult(
            valid=False,
            error=f"{label} must be {limit_mb} MB or smaller.",
        )

    content_type = (getattr(file, "content_type", "") or "").split(";")[0].strip().lower()
    if content_type and content_type not in allowed_content_types:
        return UploadValidationResult(
            valid=False,
            error=f"{label} content type is not allowed.",
        )

    file.name = name
    return UploadValidationResult(valid=True)


def validate_image_upload(file, *, max_bytes: int = DEFAULT_IMAGE_MAX_BYTES) -> UploadValidationResult:
    return validate_upload_file(
        file,
        allowed_extensions=IMAGE_EXTENSIONS,
        allowed_content_types=IMAGE_CONTENT_TYPES,
        max_bytes=max_bytes,
        label="Image",
    )


def validate_document_upload(file, *, max_bytes: int = DEFAULT_DOCUMENT_MAX_BYTES) -> UploadValidationResult:
    return validate_upload_file(
        file,
        allowed_extensions=DOCUMENT_EXTENSIONS,
        allowed_content_types=DOCUMENT_CONTENT_TYPES,
        max_bytes=max_bytes,
        label="Document",
    )
