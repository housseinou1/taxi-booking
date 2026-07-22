from django.contrib import admin

from .models import Partner, PartnerSettlement, PartnerTerritory


@admin.register(Partner)
class PartnerAdmin(admin.ModelAdmin):
    list_display = ("partner_name", "company", "contract_status", "city", "revenue_share", "created_at")
    list_filter = ("contract_status",)
    search_fields = ("partner_name", "company", "email", "contact_person")


@admin.register(PartnerTerritory)
class PartnerTerritoryAdmin(admin.ModelAdmin):
    list_display = ("partner", "city", "zone_name", "allow_overlap", "is_active")
    list_filter = ("is_active", "allow_overlap")


@admin.register(PartnerSettlement)
class PartnerSettlementAdmin(admin.ModelAdmin):
    list_display = ("partner", "period_type", "period_start", "period_end", "partner_payout", "status")
    list_filter = ("status", "period_type")
