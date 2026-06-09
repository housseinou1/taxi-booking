from django.conf import settings
from django.db import models


class PushSubscription(models.Model):
    """Stores Web Push subscription info for a user's device."""
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="push_subscriptions",
    )
    endpoint = models.URLField(max_length=500)
    p256dh = models.CharField(max_length=200)
    auth = models.CharField(max_length=100)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("user", "endpoint")

    def __str__(self):
        return f"Push sub for {self.user.email}"


class DeviceToken(models.Model):
    """Stores native app push notification tokens (FCM/APNs) for a user's device."""

    PLATFORM_CHOICES = [
        ('ios', 'iOS'),
        ('android', 'Android'),
    ]

    APP_TYPE_CHOICES = [
        ('rider', 'Rider'),
        ('driver', 'Driver'),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='device_tokens',
    )
    token = models.CharField(max_length=512, unique=True)
    platform = models.CharField(max_length=10, choices=PLATFORM_CHOICES)
    app_type = models.CharField(max_length=10, choices=APP_TYPE_CHOICES)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-updated_at']

    def __str__(self):
        return f"DeviceToken({self.platform}/{self.app_type}) for {self.user}"


class FCMToken(models.Model):
    """Stores Firebase Cloud Messaging tokens for push notifications."""
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="fcm_tokens",
    )
    token = models.TextField(unique=True)
    device_type = models.CharField(
        max_length=20,
        choices=[("android", "Android"), ("ios", "iOS"), ("web", "Web")],
        default="android",
    )
    app_type = models.CharField(
        max_length=20,
        choices=[("rider", "Rider"), ("driver", "Driver"), ("web", "Web")],
        default="web",
    )
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "FCM Token"
        verbose_name_plural = "FCM Tokens"

    def __str__(self):
        return f"{self.user.email} - {self.device_type} ({self.token[:20]}...)"


class NotificationHistory(models.Model):
    """Stores notification history for users."""
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="notification_history",
    )
    title = models.CharField(max_length=200)
    body = models.TextField()
    notification_type = models.CharField(max_length=50, blank=True, default="")
    ride_id = models.IntegerField(null=True, blank=True)
    data = models.JSONField(default=dict, blank=True)
    deep_link = models.CharField(max_length=255, blank=True, default="")
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name_plural = "Notification histories"

    def __str__(self):
        return f"{self.user.email} - {self.title} ({self.created_at})"
