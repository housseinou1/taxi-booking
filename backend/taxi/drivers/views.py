    # A suspended driver keeps account access (earnings, documents, support) but must
    # not go online to take new work. Suspension is a persisted state
    # (`DriverProfile.suspension_active`), distinct from being offline, and the legacy
    # performance review flag also blocks new work.
    if going_online and (profile.suspension_active or profile.account_under_review):
