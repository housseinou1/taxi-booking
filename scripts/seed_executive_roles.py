"""Seed executive dashboard Django groups and assign production users."""
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group

User = get_user_model()

GROUPS = [
    "CEO",
    "Accountant",
    "Finance",
    "Operations Manager",
    "Super Admin",
]

ROLE_ASSIGNMENTS = {
    "sakho@admin.mr": ["Super Admin", "CEO"],
}


def main() -> None:
    created_groups = []
    for name in GROUPS:
        group, created = Group.objects.get_or_create(name=name)
        if created:
            created_groups.append(name)

    assigned = []
    for email, roles in ROLE_ASSIGNMENTS.items():
        user = User.objects.filter(email__iexact=email).first()
        if not user:
            print(f"skip_missing_user email={email}")
            continue
        if not user.is_staff:
            user.is_staff = True
            user.save(update_fields=["is_staff"])
        for role in roles:
            group = Group.objects.get(name=role)
            user.groups.add(group)
        assigned.append(f"{email}:{','.join(roles)}")

    print(f"groups_created={created_groups or 'none'}")
    print(f"groups_total={Group.objects.filter(name__in=GROUPS).count()}")
    print(f"assigned={'; '.join(assigned) or 'none'}")


main()
