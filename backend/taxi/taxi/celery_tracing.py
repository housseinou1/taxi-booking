"""Celery task tracing hooks — correlation IDs in worker logs."""

from __future__ import annotations

import logging
import uuid

from celery.signals import task_failure, task_postrun, task_prerun

from taxi.logging_context import clear_request_context, set_request_context

logger = logging.getLogger("yala.celery")


def _extract_correlation_id(headers=None, kwargs=None) -> str:
    headers = headers or {}
    for key in ("correlation_id", "request_id", "x_correlation_id", "x_request_id"):
        value = headers.get(key)
        if value:
            return str(value)
    kwargs = kwargs or {}
    for key in ("correlation_id", "request_id"):
        value = kwargs.get(key)
        if value:
            return str(value)
    return str(uuid.uuid4())


@task_prerun.connect
def _celery_task_prerun(sender=None, task_id=None, task=None, args=None, kwargs=None, **extra):
    correlation_id = _extract_correlation_id(
        headers=getattr(getattr(task, "request", None), "headers", None),
        kwargs=kwargs,
    )
    set_request_context(request_id=correlation_id, correlation_id=correlation_id)
    logger.info(
        "celery_task_started task=%s task_id=%s correlation_id=%s",
        getattr(sender, "name", sender),
        task_id,
        correlation_id,
    )


@task_postrun.connect
def _celery_task_postrun(sender=None, task_id=None, state=None, **extra):
    logger.info(
        "celery_task_finished task=%s task_id=%s state=%s correlation_id=%s",
        getattr(sender, "name", sender),
        task_id,
        state,
        correlation_id if (correlation_id := _safe_correlation()) else "-",
    )
    clear_request_context()


@task_failure.connect
def _celery_task_failure(
    sender=None,
    task_id=None,
    exception=None,
    traceback=None,
    einfo=None,
    **extra,
):
    logger.error(
        "celery_task_failed task=%s task_id=%s correlation_id=%s error=%s",
        getattr(sender, "name", sender),
        task_id,
        _safe_correlation() or "-",
        exception,
        exc_info=einfo,
    )
    clear_request_context()


def _safe_correlation():
    from taxi.logging_context import get_correlation_id

    return get_correlation_id()
