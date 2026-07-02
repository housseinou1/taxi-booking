from django.urls import path
from .views import (
    available_programs, enroll_program, my_progress, my_bonus_history,
    admin_programs, admin_pay_bonus, admin_incentive_analytics,
)

urlpatterns = [
    # Driver
    path("programs/", available_programs),
    path("programs/<int:program_id>/enroll/", enroll_program),
    path("my-progress/", my_progress),
    path("my-bonuses/", my_bonus_history),

    # Admin
    path("admin/programs/", admin_programs),
    path("admin/pay-bonus/", admin_pay_bonus),
    path("admin/analytics/", admin_incentive_analytics),
]
