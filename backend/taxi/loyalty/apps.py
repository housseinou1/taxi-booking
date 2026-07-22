from django.apps import AppConfig


class LoyaltyConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "loyalty"
    verbose_name = "Yala Customer Loyalty"

    def ready(self):
        import loyalty.signals  # noqa: F401
