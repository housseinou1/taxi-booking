from django.urls import path
from .corporate_views import (
    company_admin_dashboard,
    company_invite_employee,
    company_update_employee,
    my_corporate_account,
    register_corporate_company,
)
from .views import (
    list_airports, book_airport_pickup, my_airport_pickups,
    create_corporate_account,
    report_lost_item, my_lost_items, admin_lost_items,
    my_driver_referrals, apply_driver_referral,
    active_surges, create_surge, deactivate_surge,
)

urlpatterns = [
    # Airport Pickup
    path("airports/", list_airports),
    path("airports/book/", book_airport_pickup),
    path("airports/my-pickups/", my_airport_pickups),

    # Corporate / Business Accounts
    path("corporate/me/", my_corporate_account),
    path("corporate/register/", register_corporate_company),
    path("corporate/create/", create_corporate_account),
    path("corporate/admin/", company_admin_dashboard),
    path("corporate/employees/", company_invite_employee),
    path("corporate/employees/<int:employee_id>/", company_update_employee),

    # Lost & Found
    path("lost-found/report/", report_lost_item),
    path("lost-found/my-items/", my_lost_items),
    path("lost-found/admin/", admin_lost_items),

    # Driver Referral
    path("driver-referral/my-referrals/", my_driver_referrals),
    path("driver-referral/apply/", apply_driver_referral),

    # Surge Pricing
    path("surge/active/", active_surges),
    path("surge/create/", create_surge),
    path("surge/<int:zone_id>/deactivate/", deactivate_surge),
]
