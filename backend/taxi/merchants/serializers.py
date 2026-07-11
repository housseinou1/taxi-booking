from decimal import Decimal

from rest_framework import serializers

from deliveries.serializers import DeliveryInstructionsSerializer

from .models import (
    Cart,
    CartItem,
    Merchant,
    MerchantOrder,
    MerchantOrderItem,
    MerchantPayout,
    MerchantPromotion,
    Product,
)


class MerchantSerializer(serializers.ModelSerializer):
    is_operational = serializers.BooleanField(read_only=True)

    class Meta:
        model = Merchant
        fields = (
            "id",
            "business_name",
            "owner_name",
            "phone_number",
            "email",
            "address",
            "city",
            "latitude",
            "longitude",
            "merchant_type",
            "business_type",
            "status",
            "rejection_reason",
            "logo",
            "store_cover_image",
            "bank_account",
            "mobile_wallet",
            "payout_method",
            "rating",
            "total_orders",
            "estimated_prep_minutes",
            "delivery_fee",
            "is_active",
            "is_operational",
            "created_at",
            "approved_at",
        )
        read_only_fields = (
            "id",
            "status",
            "rejection_reason",
            "rating",
            "total_orders",
            "created_at",
            "approved_at",
        )


class MerchantRegisterSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, min_length=8)
    first_name = serializers.CharField(max_length=100)
    last_name = serializers.CharField(max_length=100)
    business_name = serializers.CharField(max_length=200)
    owner_name = serializers.CharField(max_length=150)
    phone_number = serializers.CharField(max_length=30)
    address = serializers.CharField()
    city = serializers.CharField(max_length=120, default="Nouakchott")
    merchant_type = serializers.ChoiceField(choices=Merchant.MERCHANT_TYPE_CHOICES)
    business_type = serializers.ChoiceField(choices=Merchant.BUSINESS_TYPE_CHOICES)
    bank_account = serializers.CharField(required=False, allow_blank=True, default="")
    mobile_wallet = serializers.CharField(required=False, allow_blank=True, default="")
    payout_method = serializers.ChoiceField(
        choices=Merchant.PAYOUT_METHOD_CHOICES, default="mobile_wallet"
    )
    latitude = serializers.FloatField(required=False, default=18.0735)
    longitude = serializers.FloatField(required=False, default=-15.9582)


class StoreCardSerializer(serializers.ModelSerializer):
    """Public store listing card."""

    delivery_time = serializers.IntegerField(source="estimated_prep_minutes", read_only=True)
    distance_km = serializers.SerializerMethodField()

    class Meta:
        model = Merchant
        fields = (
            "id",
            "business_name",
            "merchant_type",
            "business_type",
            "logo",
            "store_cover_image",
            "rating",
            "city",
            "address",
            "delivery_time",
            "delivery_fee",
            "distance_km",
        )

    def get_distance_km(self, obj):
        return getattr(obj, "_distance_km", None)


class ProductSerializer(serializers.ModelSerializer):
    effective_price = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)

    class Meta:
        model = Product
        fields = (
            "id",
            "merchant",
            "product_name",
            "description",
            "category",
            "image",
            "price",
            "discount_percent",
            "effective_price",
            "stock_quantity",
            "stock_status",
            "is_available",
            "low_stock_threshold",
            "created_at",
        )
        read_only_fields = ("id", "stock_status", "merchant", "created_at")


class MerchantPromotionSerializer(serializers.ModelSerializer):
    is_valid = serializers.BooleanField(read_only=True)

    class Meta:
        model = MerchantPromotion
        fields = (
            "id",
            "title",
            "discount_type",
            "value",
            "promo_code",
            "expiry_date",
            "is_active",
            "is_valid",
            "created_at",
        )
        read_only_fields = ("id", "created_at")


class CartItemSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source="product.product_name", read_only=True)
    line_total = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)

    class Meta:
        model = CartItem
        fields = ("id", "product", "product_name", "quantity", "unit_price", "line_total")


class CartSerializer(serializers.ModelSerializer):
    items = CartItemSerializer(many=True, read_only=True)
    merchant_name = serializers.CharField(source="merchant.business_name", read_only=True)
    totals = serializers.SerializerMethodField()

    class Meta:
        model = Cart
        fields = ("id", "merchant", "merchant_name", "items", "totals", "updated_at")

    def get_totals(self, obj):
        from .services.order_service import MerchantOrderService

        service = MerchantOrderService()
        distance = self.context.get("distance_km", 5)
        return service.calculate_cart_totals(obj, distance_km=distance)


class MerchantOrderItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = MerchantOrderItem
        fields = ("id", "product", "product_name", "quantity", "unit_price", "line_total")


class MerchantOrderSerializer(serializers.ModelSerializer):
    items = MerchantOrderItemSerializer(many=True, read_only=True)
    merchant_name = serializers.CharField(source="merchant.business_name", read_only=True)
    customer_name = serializers.SerializerMethodField()

    class Meta:
        model = MerchantOrder
        fields = (
            "id",
            "merchant",
            "merchant_name",
            "customer",
            "customer_name",
            "delivery",
            "status",
            "subtotal",
            "tax_amount",
            "delivery_fee",
            "discount_amount",
            "total",
            "delivery_address",
            "recipient_name",
            "recipient_phone",
            "customer_notes",
            "payment_method",
            "payment_status",
            "promo_code",
            "items",
            "created_at",
            "accepted_at",
            "preparing_at",
            "ready_at",
            "delivered_at",
        )
        read_only_fields = fields

    def get_customer_name(self, obj):
        return f"{obj.customer.first_name} {obj.customer.last_name}".strip()


class CheckoutSerializer(serializers.Serializer):
    merchant_id = serializers.IntegerField()
    delivery_address = serializers.CharField()
    recipient_name = serializers.CharField(max_length=120)
    recipient_phone = serializers.CharField(max_length=30)
    distance_km = serializers.DecimalField(max_digits=7, decimal_places=2, default=Decimal("5"))
    payment_method = serializers.ChoiceField(
        choices=[
            ("card", "Debit/Credit Card"),
            ("bankily", "Bankily"),
            ("sedad", "Sedad"),
            ("masravi", "Masravi"),
        ]
    )
    customer_notes = serializers.CharField(required=False, allow_blank=True, default="")
    dropoff_instructions = DeliveryInstructionsSerializer(required=False)
    recipient_alt_phone = serializers.CharField(required=False, allow_blank=True, default="")
    save_address = serializers.BooleanField(required=False, default=False)
    save_instructions = serializers.BooleanField(required=False, default=False)
    address_label = serializers.CharField(required=False, allow_blank=True, default="")
    promo_code = serializers.CharField(required=False, allow_blank=True, default="")


class AddCartItemSerializer(serializers.Serializer):
    product_id = serializers.IntegerField()
    quantity = serializers.IntegerField(min_value=1, default=1)


class MerchantPayoutSerializer(serializers.ModelSerializer):
    class Meta:
        model = MerchantPayout
        fields = (
            "id",
            "amount",
            "status",
            "period_start",
            "period_end",
            "reference",
            "created_at",
            "paid_at",
        )
