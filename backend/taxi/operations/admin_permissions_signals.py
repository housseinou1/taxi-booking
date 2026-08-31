"""Django signals for admin RBAC audit."""

from django.contrib.auth import get_user_model
from django.db.models.signals import m2m_changed
from django.dispatch import receiver

from .admin_audit_service import log_role_change

User = get_user_model()


@receiver(m2m_changed, sender=User.groups.through)
def audit_user_group_change(sender, instance, action, reverse, model, pk_set, **kwargs):
    if action not in {"post_add", "post_remove", "post_clear"}:
        return
    if not isinstance(instance, User):
        return
    if not instance.is_staff and not instance.is_superuser:
        return

    new_groups = sorted(instance.groups.values_list("name", flat=True))
    old_groups = list(new_groups)

    if action == "post_remove" and pk_set:
        removed = list(model.objects.filter(pk__in=pk_set).values_list("name", flat=True))
        old_groups = sorted(set(new_groups) | set(removed))
    elif action == "post_add" and pk_set:
        added = list(model.objects.filter(pk__in=pk_set).values_list("name", flat=True))
        old_groups = sorted(set(new_groups) - set(added))

    if sorted(old_groups) == sorted(new_groups):
        return

    log_role_change(
        actor=instance,
        target_user=instance,
        old_groups=old_groups,
        new_groups=new_groups,
    )
