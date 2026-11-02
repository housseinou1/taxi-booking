"""Purge expired ID-card verification tokens and report retention state.

Tokens are stateless and self-expiring; their *revocation denylist* entries carry a
TTL equal to the token's remaining lifetime and therefore clean themselves up. This
command performs the explicit cleanup sweep and prints the retention configuration,
so operations can verify the window without inspecting the cache directly.

Usage::

    python manage.py purge_expired_verification_tokens
"""

from django.core.management.base import BaseCommand

from employees.services.verification_tokens import purge_expired_tokens, token_stats


class Command(BaseCommand):
    help = "Clear expired ID-card verification token denylist entries."

    def handle(self, *args, **options):
        stats = token_stats()
        result = purge_expired_tokens()

        self.stdout.write(
            f"Token TTL: {stats['ttl_seconds']}s · keys: {', '.join(stats['key_ids'])} "
            f"(current {stats['current_key_id']})"
        )
        self.stdout.write(
            f"Denylist scan: {result['scanned']} entry(ies), removed {result['removed']} "
            f"(TTL-based expiry: {result['ttl_based']}, "
            f"key listing supported: {result['key_listing_supported']})"
        )
        self.stdout.write(self.style.SUCCESS("Verification token cleanup complete."))
