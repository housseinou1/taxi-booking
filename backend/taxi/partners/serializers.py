from rest_framework import serializers

from .models import Partner, PartnerSettlement, PartnerTerritory


class PartnerTerritorySerializer(serializers.ModelSerializer):
    city_name = serializers.CharField(source="city.name", read_only=True)

    class Meta:
        model = PartnerTerritory
        fields = [
            "id",
            "city",
            "city_name",
            "zone_name",
            "service_boundary",
            "allow_overlap",
            "is_active",
            "created_at",
        ]
        read_only_fields = ["created_at"]


class PartnerSerializer(serializers.ModelSerializer):
    city_name = serializers.CharField(source="city.name", read_only=True, allow_null=True)
    territory_count = serializers.SerializerMethodField()

    class Meta:
        model = Partner
        fields = [
            "id",
            "partner_name",
            "company",
            "contact_person",
            "phone",
            "email",
            "city",
            "city_name",
            "territory_label",
            "contract_status",
            "revenue_share",
            "start_date",
            "end_date",
            "territory_count",
            "created_at",
            "approved_at",
        ]

    def get_territory_count(self, obj):
        return obj.territories.filter(is_active=True).count()


class PartnerDetailSerializer(PartnerSerializer):
    territories = PartnerTerritorySerializer(many=True, read_only=True)

    class Meta(PartnerSerializer.Meta):
        fields = PartnerSerializer.Meta.fields + ["territories", "notes", "suspension_reason"]


class PartnerSettlementSerializer(serializers.ModelSerializer):
    partner_name = serializers.CharField(source="partner.partner_name", read_only=True)

    class Meta:
        model = PartnerSettlement
        fields = [
            "id",
            "partner",
            "partner_name",
            "period_type",
            "period_start",
            "period_end",
            "gross_revenue",
            "platform_commission",
            "partner_payout",
            "order_count",
            "status",
            "invoice_reference",
            "paid_at",
            "created_at",
        ]
