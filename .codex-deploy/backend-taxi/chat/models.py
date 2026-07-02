from django.conf import settings
from django.db import models


class ChatMessage(models.Model):
    """A message between rider and driver during an active ride."""
    ride = models.ForeignKey(
        "rides.Ride",
        on_delete=models.CASCADE,
        related_name="chat_messages",
    )
    sender = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="sent_messages",
    )
    text = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)
    read = models.BooleanField(default=False)

    class Meta:
        ordering = ["created_at"]
        indexes = [
            models.Index(fields=["ride", "created_at"], name="chat_ride_time_idx"),
        ]

    def __str__(self):
        return f"Ride #{self.ride_id} - {self.sender.first_name}: {self.text[:30]}"
