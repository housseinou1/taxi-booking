from django.apps import AppConfig


class DriversConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = "taxi.drivers"

    def ready(self):
        import taxi.drivers.signals  # noqa: F401