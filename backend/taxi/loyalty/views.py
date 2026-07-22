from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from loyalty.models import LoyaltyReward
from loyalty.services.loyalty_service import get_or_create_account, redeem_reward, serialize_account


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def my_loyalty_status(request):
    account = get_or_create_account(request.user)
    rewards = LoyaltyReward.objects.filter(is_active=True).select_related("min_tier")
    return Response(
        {
            "account": serialize_account(account),
            "rewards": [
                {
                    "id": r.id,
                    "name": r.name,
                    "reward_type": r.reward_type,
                    "points_cost": r.points_cost,
                    "value": float(r.value),
                    "min_tier": r.min_tier.slug if r.min_tier else None,
                }
                for r in rewards
            ],
        }
    )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def redeem_loyalty_reward(request):
    reward_id = request.data.get("reward_id")
    if not reward_id:
        return Response({"error": "reward_id is required."}, status=400)
    result = redeem_reward(request.user, int(reward_id))
    status_code = 200 if result.get("success") else 400
    return Response(result, status=status_code)
