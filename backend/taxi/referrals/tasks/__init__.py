# Import tasks so Celery autodiscover finds them
from referrals.tasks.periodic import (  # noqa: F401
    escalate_stale_flags_task,
    expire_credits_task,
    expire_stale_referrals_task,
    fraud_scan_ghost_accounts_task,
    send_expiration_reminders_task,
)
