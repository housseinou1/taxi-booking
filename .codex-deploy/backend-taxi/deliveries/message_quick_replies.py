"""Predefined quick replies for delivery in-app chat."""

COURIER_QUICK_REPLIES = [
    "I'm on my way",
    "I arrived",
    "Please come outside",
    "I need your PIN",
    "I cannot find your location",
]

CUSTOMER_QUICK_REPLIES = [
    "I'm coming",
    "Wait 2 minutes",
    "Use side entrance",
    "I sent the PIN",
    "Call me",
]


def quick_replies_for_role(role: str):
    role = (role or "").lower()
    if role == "courier":
        return COURIER_QUICK_REPLIES
    if role == "customer":
        return CUSTOMER_QUICK_REPLIES
    return []
