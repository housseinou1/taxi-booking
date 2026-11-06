"""Multi-city operations permissions (Phase 27)."""

from rest_framework.permissions import BasePermission

from .executive_permissions import can_ceo_actions, can_manage_finance, user_in_groups
from .models import OpsCityProfile

FINANCE_CITY_GROUPS = {"CEO", "Super Admin", "Accountant", "Finance"}
CITY_OPS_GROUPS = {"CEO", "Super Admin", "Operations Manager", "Supervisor"}


def has_national_access(user) -> bool:
    return can_ceo_actions(user) or (user.is_superuser if user else False)


def location_city_id_for_user(user) -> int | None:
    """Translate the staff member's home city to a ``locations.City`` id.

    ``User.city`` points to ``cities.City`` while ``OpsCityProfile.city`` (and every city id
    these permissions are compared with) is a ``locations.City`` id. The two tables have
    independent ids, so ``user.city_id`` must never be mixed into a locations id set.

    Deterministic rule: exactly one ``locations.City`` whose name AND region name equal the
    user's ``cities.City`` name and region name (case-insensitive, trimmed). No match or an
    ambiguous match returns None, so no city access is granted.
    """
    city_id = getattr(user, "city_id", None)
    if not city_id:
        return None
    from cities.models import City as UserCity
    from locations.models import City as LocationCity

    source = UserCity.objects.filter(id=city_id).select_related("region").first()
    if source is None:
        return None
    name = (source.name or "").strip()
    region = (getattr(source.region, "name", "") or "").strip()
    matches = [
        candidate.id
        for candidate in LocationCity.objects.filter(name__iexact=name).select_related("region")
        if (getattr(candidate.region, "name", "") or "").strip().casefold() == region.casefold()
    ]
    return matches[0] if len(matches) == 1 else None


def get_user_city_ids(user, scope: str = "operations") -> list[int] | None:
    """Return None for national access, else list of allowed city IDs (may be empty)."""
    if not user or not user.is_authenticated:
        return []
    if has_national_access(user):
        return None

    city_ids: set[int] = set()
    # Home city translated to the locations.City id space (see location_city_id_for_user).
    home_city_id = location_city_id_for_user(user)
    if scope in {"operations", "all"}:
        city_ids.update(
            OpsCityProfile.objects.filter(operations_manager=user).values_list("city_id", flat=True)
        )
        if user_in_groups(user, CITY_OPS_GROUPS) and home_city_id:
            city_ids.add(home_city_id)
    if scope in {"finance", "all"}:
        city_ids.update(
            OpsCityProfile.objects.filter(finance_manager=user).values_list("city_id", flat=True)
        )
        if can_manage_finance(user) and home_city_id:
            city_ids.add(home_city_id)
    if scope in {"support", "all"}:
        city_ids.update(
            OpsCityProfile.objects.filter(support_manager=user).values_list("city_id", flat=True)
        )

    return list(city_ids)


def can_access_city(user, city_id: int, scope: str = "operations") -> bool:
    allowed = get_user_city_ids(user, scope=scope)
    if allowed is None:
        return True
    return city_id in allowed


def can_manage_city_admin(user) -> bool:
    return has_national_access(user)


def user_permissions_payload(user) -> dict:
    national = has_national_access(user)
    ops_cities = get_user_city_ids(user, "operations")
    finance_cities = get_user_city_ids(user, "finance")
    return {
        "national": national,
        "operations": national or bool(ops_cities),
        "finance": national or can_manage_finance(user) or bool(finance_cities),
        "city_admin": can_manage_city_admin(user),
        "city_ids": ops_cities if ops_cities is not None else [],
        "finance_city_ids": finance_cities if finance_cities is not None else [],
    }


class IsMultiCityStaff(BasePermission):
    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        if has_national_access(user):
            return True
        perms = user_permissions_payload(user)
        return bool(perms["city_ids"] or perms["finance_city_ids"])
