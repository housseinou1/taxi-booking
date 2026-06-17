"""Root conftest for taxi project tests."""

import django
from django.conf import settings


def pytest_configure(config):
    """Configure Celery to run tasks eagerly during tests."""
    settings.CELERY_TASK_ALWAYS_EAGER = True
    settings.CELERY_TASK_EAGER_PROPAGATES = True
