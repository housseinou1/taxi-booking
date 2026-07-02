# This will make sure the Celery app is always imported when
# Django starts so that shared_task will use this app.
try:
    from taxi.celery import app as celery_app

    __all__ = ("celery_app",)
except ImportError:
    # Celery not installed (e.g., lightweight dev/test environment)
    pass
