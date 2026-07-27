"""Request-scoped logging context for correlation across HTTP and Celery."""

from __future__ import annotations

import logging
from contextvars import ContextVar
from typing import Optional

request_id_var: ContextVar[Optional[str]] = ContextVar("yala_request_id", default=None)
correlation_id_var: ContextVar[Optional[str]] = ContextVar("yala_correlation_id", default=None)
user_id_var: ContextVar[Optional[int]] = ContextVar("yala_user_id", default=None)


def get_request_id() -> Optional[str]:
    return request_id_var.get()


def get_correlation_id() -> Optional[str]:
    return correlation_id_var.get() or get_request_id()


def get_user_id() -> Optional[int]:
    return user_id_var.get()


def set_request_context(
    *,
    request_id: str,
    correlation_id: Optional[str] = None,
    user_id: Optional[int] = None,
) -> None:
    request_id_var.set(request_id)
    correlation_id_var.set(correlation_id or request_id)
    if user_id is not None:
        user_id_var.set(user_id)


def clear_request_context() -> None:
    request_id_var.set(None)
    correlation_id_var.set(None)
    user_id_var.set(None)


class RequestContextFilter(logging.Filter):
    """Inject request/correlation/user IDs into every log record."""

    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = get_request_id() or "-"
        record.correlation_id = get_correlation_id() or "-"
        record.user_id = get_user_id() if get_user_id() is not None else "-"
        return True
