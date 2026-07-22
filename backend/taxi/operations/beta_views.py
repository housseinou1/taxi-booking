"""Closed beta operations dashboard API views."""

from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from .beta_dashboard_service import build_beta_ceo_summary, build_beta_dashboard
from .executive_permissions import IsExecutiveStaff
from .executive_views import _city_id


@api_view(["GET"])
@permission_classes([IsExecutiveStaff])
def beta_dashboard(request):
    city = _city_id(request)
    return Response(build_beta_dashboard(city_id=city))


@api_view(["GET"])
@permission_classes([IsExecutiveStaff])
def beta_ceo_report(request):
    city = _city_id(request)
    return Response(build_beta_ceo_summary(city_id=city))
