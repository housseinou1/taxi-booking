    profiles = (
        DriverProfile.objects.filter(
            status="approved",
            is_available=True,
            user__is_active=True,
            account_under_review=False,
            suspension_active=False,
        )
        .exclude(user_id__in=active_driver_ids)
        .select_related("user")
    )
