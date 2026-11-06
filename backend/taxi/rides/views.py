    # Suspended drivers keep app access (so they can see their account, earnings and the
    # suspension reason) but must not accept new ride work. `suspension_active` is the
    # dedicated suspension state (B7); `account_under_review` is the separate performance
    # review flag, which also blocks new work.
    if DriverProfile.objects.filter(
        Q(user=user)
        & (Q(suspension_active=True) | Q(account_under_review=True))
    ).exists():
        return "Your driver account is suspended. New ride requests are not available."
