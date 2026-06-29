from rest_framework.permissions import BasePermission


class IsMerchantOwner(BasePermission):
    message = "Merchant account required."

    def has_permission(self, request, view):
        return (
            request.user
            and request.user.is_authenticated
            and hasattr(request.user, "merchant_profile")
        )


class IsApprovedMerchant(BasePermission):
    message = "Your merchant account is not approved yet."

    def has_permission(self, request, view):
        if not IsMerchantOwner().has_permission(request, view):
            return False
        return request.user.merchant_profile.is_operational
