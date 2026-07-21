from django.urls import path

from .executive_views import (
    executive_account_action,
    executive_broadcast,
    executive_dashboard,
    executive_export,
    executive_finance,
    executive_live,
    executive_maintenance_mode,
    executive_map,
    executive_qa,
    executive_queues,
    executive_security,
    executive_support,
)
from .views import complete_maintenance, maintenance_reminders

urlpatterns = [
    path("maintenance/", maintenance_reminders),
    path("maintenance/<int:reminder_id>/complete/", complete_maintenance),
    path("executive/dashboard/", executive_dashboard),
    path("executive/live/", executive_live),
    path("executive/finance/", executive_finance),
    path("executive/map/", executive_map),
    path("executive/queues/", executive_queues),
    path("executive/security/", executive_security),
    path("executive/support/", executive_support),
    path("executive/qa/", executive_qa),
    path("executive/reports/export/", executive_export),
    path("executive/broadcast/", executive_broadcast),
    path("executive/maintenance-mode/", executive_maintenance_mode),
    path("executive/account-action/", executive_account_action),
]
