"""Root conftest for taxi project tests."""

from django.conf import settings


def pytest_configure(config):
    """Configure Celery to run tasks eagerly during tests."""
    settings.CELERY_TASK_ALWAYS_EAGER = True
    settings.CELERY_TASK_EAGER_PROPAGATES = True
    # Tests must not depend on a prior `collectstatic` (the manifest storage raises
    # "Missing staticfiles manifest entry" when Django admin templates render).
    settings.STORAGES = {
        **settings.STORAGES,
        "staticfiles": {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"},
    }
