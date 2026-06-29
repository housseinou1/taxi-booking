from decimal import Decimal

from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework import generics, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAdminUser, IsAuthenticated
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken

from authapp.views import build_user_response
from deliveries.geo import haversine_km

from .models import Cart, CartItem, Merchant, MerchantOrder, MerchantPayout, MerchantPromotion, Product
from .permissions import IsApprovedMerchant, IsMerchantOwner
from .serializers import (
    AddCartItemSerializer,
    CartSerializer,
    CheckoutSerializer,
    MerchantOrderSerializer,
    MerchantPayoutSerializer,
    MerchantPromotionSerializer,
    MerchantRegisterSerializer,
    MerchantSerializer,
    ProductSerializer,
    StoreCardSerializer,
)
from .services.analytics_service import get_merchant_analytics
from .services.order_service import (
    MerchantOrderError,
    MerchantOrderService,
    add_to_cart,
    get_or_create_cart,
)

User = get_user_model()
order_service = MerchantOrderService()


def _merchant_response(user, merchant):
    return {
        **build_user_response(user),
        "merchant": MerchantSerializer(merchant, context={"request": None}).data,
    }


@api_view(["POST"])
@permission_classes([AllowAny])
def merchant_register(request):
    serializer = MerchantRegisterSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data

    if User.objects.filter(email__iexact=data["email"]).exists():
        return Response({"error": "Email already registered."}, status=status.HTTP_400_BAD_REQUEST)

    with transaction.atomic():
        user = User.objects.create_user(
            email=data["email"],
            password=data["password"],
            first_name=data["first_name"],
            last_name=data["last_name"],
            phone_number=data["phone_number"],
            user_type="merchant",
        )
        merchant = Merchant.objects.create(
            owner=user,
            business_name=data["business_name"],
            owner_name=data["owner_name"],
            phone_number=data["phone_number"],
            email=data["email"],
            address=data["address"],
            city=data["city"],
            merchant_type=data["merchant_type"],
            business_type=data["business_type"],
            bank_account=data.get("bank_account", ""),
            mobile_wallet=data.get("mobile_wallet", ""),
            payout_method=data.get("payout_method", "mobile_wallet"),
            latitude=data.get("latitude", 18.0735),
            longitude=data.get("longitude", -15.9582),
            status="pending",
        )

        for field in ("business_license", "national_id", "tax_document", "logo", "store_cover_image"):
            upload = request.FILES.get(field)
            if upload:
                setattr(merchant, field, upload)
        merchant.save()

        from security.models import MerchantDocumentReview

        MerchantDocumentReview.objects.create(merchant=merchant)

    refresh = RefreshToken.for_user(user)
    return Response(
        {
            "access": str(refresh.access_token),
            "refresh": str(refresh),
            **_merchant_response(user, merchant),
        },
        status=status.HTTP_201_CREATED,
    )


@api_view(["POST"])
@permission_classes([AllowAny])
def merchant_login(request):
    email = request.data.get("email", "").strip().lower()
    password = request.data.get("password", "")

    try:
        user = User.objects.select_related("merchant_profile").get(email__iexact=email)
    except User.DoesNotExist:
        return Response({"error": "Invalid email or password"}, status=status.HTTP_401_UNAUTHORIZED)

    if not hasattr(user, "merchant_profile"):
        return Response({"error": "Not a merchant account."}, status=status.HTTP_403_FORBIDDEN)

    if not user.check_password(password):
        return Response({"error": "Invalid email or password"}, status=status.HTTP_401_UNAUTHORIZED)

    if not user.is_active:
        return Response({"error": "Account blocked."}, status=status.HTTP_403_FORBIDDEN)

    refresh = RefreshToken.for_user(user)
    return Response(
        {
            "access": str(refresh.access_token),
            "refresh": str(refresh),
            **_merchant_response(user, user.merchant_profile),
        }
    )


@api_view(["GET", "PATCH"])
@permission_classes([IsMerchantOwner])
def merchant_me(request):
    merchant = request.user.merchant_profile
    if request.method == "GET":
        return Response(_merchant_response(request.user, merchant))

    for field in (
        "business_name",
        "owner_name",
        "phone_number",
        "email",
        "address",
        "city",
        "bank_account",
        "mobile_wallet",
        "payout_method",
        "estimated_prep_minutes",
        "delivery_fee",
    ):
        if field in request.data:
            setattr(merchant, field, request.data[field])

    for field in ("business_license", "national_id", "tax_document", "logo", "store_cover_image"):
        if field in request.FILES:
            setattr(merchant, field, request.FILES[field])

    merchant.save()
    return Response(_merchant_response(request.user, merchant))


@api_view(["GET"])
@permission_classes([AllowAny])
def store_list(request):
    lat = request.query_params.get("lat")
    lng = request.query_params.get("lng")
    query = request.query_params.get("q", "").strip()
    merchant_type = request.query_params.get("merchant_type", "").strip()
    business_type = request.query_params.get("business_type", "").strip()

    qs = Merchant.objects.filter(status="approved", is_active=True)
    if query:
        qs = qs.filter(
            Q(business_name__icontains=query)
            | Q(city__icontains=query)
            | Q(address__icontains=query)
        )
    if merchant_type:
        qs = qs.filter(merchant_type=merchant_type)
    if business_type:
        qs = qs.filter(business_type=business_type)

    stores = list(qs)
    if lat and lng:
        try:
            clat, clng = float(lat), float(lng)
            for store in stores:
                store._distance_km = round(
                    haversine_km(clat, clng, store.latitude, store.longitude), 1
                )
            stores.sort(key=lambda s: getattr(s, "_distance_km", 999))
        except (TypeError, ValueError):
            pass

    return Response(StoreCardSerializer(stores, many=True).data)


@api_view(["GET"])
@permission_classes([AllowAny])
def store_detail(request, store_id):
    try:
        merchant = Merchant.objects.get(pk=store_id, status="approved", is_active=True)
    except Merchant.DoesNotExist:
        return Response({"error": "Store not found."}, status=status.HTTP_404_NOT_FOUND)
    return Response(StoreCardSerializer(merchant).data)


@api_view(["GET"])
@permission_classes([AllowAny])
def store_products(request, store_id):
    try:
        merchant = Merchant.objects.get(pk=store_id, status="approved", is_active=True)
    except Merchant.DoesNotExist:
        return Response({"error": "Store not found."}, status=status.HTTP_404_NOT_FOUND)

    category = request.query_params.get("category", "").strip()
    qs = merchant.products.filter(is_available=True)
    if category:
        qs = qs.filter(category__iexact=category)
    return Response(ProductSerializer(qs, many=True).data)


class MerchantProductListCreateView(generics.ListCreateAPIView):
    serializer_class = ProductSerializer
    permission_classes = [IsApprovedMerchant]

    def get_queryset(self):
        return self.request.user.merchant_profile.products.all()

    def perform_create(self, serializer):
        product = serializer.save(merchant=self.request.user.merchant_profile)
        product.refresh_stock_status()
        product.save(update_fields=["stock_status", "is_available"])


class MerchantProductDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = ProductSerializer
    permission_classes = [IsApprovedMerchant]

    def get_queryset(self):
        return self.request.user.merchant_profile.products.all()

    def perform_update(self, serializer):
        product = serializer.save()
        product.refresh_stock_status()
        product.save(update_fields=["stock_status", "is_available"])


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def inventory_list(request):
    if hasattr(request.user, "merchant_profile"):
        merchant = request.user.merchant_profile
    else:
        return Response({"error": "Merchant required."}, status=status.HTTP_403_FORBIDDEN)

    stock_status = request.query_params.get("stock_status", "").strip()
    qs = merchant.products.all()
    if stock_status:
        qs = qs.filter(stock_status=stock_status)
    return Response(ProductSerializer(qs, many=True).data)


class MerchantPromotionListCreateView(generics.ListCreateAPIView):
    serializer_class = MerchantPromotionSerializer
    permission_classes = [IsApprovedMerchant]

    def get_queryset(self):
        return self.request.user.merchant_profile.promotions.all()

    def perform_create(self, serializer):
        serializer.save(merchant=self.request.user.merchant_profile)


class MerchantPromotionDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = MerchantPromotionSerializer
    permission_classes = [IsApprovedMerchant]

    def get_queryset(self):
        return self.request.user.merchant_profile.promotions.all()


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def cart_detail(request, merchant_id):
    try:
        merchant = Merchant.objects.get(pk=merchant_id, status="approved", is_active=True)
    except Merchant.DoesNotExist:
        return Response({"error": "Store not found."}, status=status.HTTP_404_NOT_FOUND)

    cart = get_or_create_cart(request.user, merchant)
    distance = request.query_params.get("distance_km", 5)
    return Response(CartSerializer(cart, context={"distance_km": distance}).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def cart_add_item(request):
    serializer = AddCartItemSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    try:
        product = Product.objects.select_related("merchant").get(
            pk=serializer.validated_data["product_id"],
            is_available=True,
            merchant__status="approved",
            merchant__is_active=True,
        )
    except Product.DoesNotExist:
        return Response({"error": "Product not found."}, status=status.HTTP_404_NOT_FOUND)

    try:
        item = add_to_cart(
            request.user,
            product.merchant,
            product,
            serializer.validated_data["quantity"],
        )
    except MerchantOrderError as exc:
        return Response({"error": exc.message, "code": exc.code}, status=status.HTTP_400_BAD_REQUEST)

    cart = item.cart
    return Response(CartSerializer(cart).data)


@api_view(["PATCH", "DELETE"])
@permission_classes([IsAuthenticated])
def cart_item_detail(request, item_id):
    try:
        item = CartItem.objects.select_related("cart").get(
            pk=item_id, cart__customer=request.user
        )
    except CartItem.DoesNotExist:
        return Response({"error": "Item not found."}, status=status.HTTP_404_NOT_FOUND)

    if request.method == "DELETE":
        cart = item.cart
        item.delete()
        return Response(CartSerializer(cart).data)

    quantity = int(request.data.get("quantity", item.quantity))
    if quantity <= 0:
        item.delete()
    else:
        item.quantity = quantity
        item.save(update_fields=["quantity"])
    return Response(CartSerializer(item.cart).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def cart_checkout(request):
    serializer = CheckoutSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data

    try:
        merchant = Merchant.objects.get(pk=data["merchant_id"], status="approved", is_active=True)
    except Merchant.DoesNotExist:
        return Response({"error": "Store not found."}, status=status.HTTP_404_NOT_FOUND)

    cart = get_or_create_cart(request.user, merchant)
    promo_discount = Decimal("0")
    promo_code = data.get("promo_code", "").strip()
    if promo_code:
        promo = merchant.promotions.filter(
            promo_code__iexact=promo_code, is_active=True, expiry_date__gt=timezone.now()
        ).first()
        if promo:
            if promo.discount_type == "percentage":
                totals_preview = order_service.calculate_cart_totals(cart, data["distance_km"])
                promo_discount = totals_preview["subtotal"] * promo.value / Decimal("100")
            elif promo.discount_type == "free_delivery":
                promo_discount = merchant.delivery_fee or Decimal("0")

    try:
        order = order_service.checkout(
            customer=request.user,
            cart=cart,
            delivery_address=data["delivery_address"],
            recipient_name=data["recipient_name"],
            recipient_phone=data["recipient_phone"],
            distance_km=float(data["distance_km"]),
            payment_method=data["payment_method"],
            customer_notes=data.get("customer_notes", ""),
            promo_code=promo_code,
            promo_discount=promo_discount,
        )
    except MerchantOrderError as exc:
        return Response({"error": exc.message, "code": exc.code}, status=status.HTTP_400_BAD_REQUEST)

    return Response(MerchantOrderSerializer(order).data, status=status.HTTP_201_CREATED)


@api_view(["GET"])
@permission_classes([IsMerchantOwner])
def merchant_orders(request):
    merchant = request.user.merchant_profile
    status_filter = request.query_params.get("status", "").strip()
    qs = merchant.orders.prefetch_related("items").select_related("customer")
    if status_filter:
        qs = qs.filter(status=status_filter)
    return Response(MerchantOrderSerializer(qs[:100], many=True).data)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def my_orders(request):
    qs = MerchantOrder.objects.filter(customer=request.user).prefetch_related("items")
    return Response(MerchantOrderSerializer(qs[:50], many=True).data)


@api_view(["POST"])
@permission_classes([IsApprovedMerchant])
def merchant_order_action(request, order_id):
    merchant = request.user.merchant_profile
    action = request.data.get("action", "").strip().lower()
    reason = request.data.get("reason", "")

    try:
        order = merchant.orders.get(pk=order_id)
    except MerchantOrder.DoesNotExist:
        return Response({"error": "Order not found."}, status=status.HTTP_404_NOT_FOUND)

    try:
        if action == "accept":
            order = order_service.accept_order(order)
        elif action == "reject":
            order = order_service.reject_order(order, reason=reason)
        elif action == "preparing":
            order = order_service.mark_preparing(order)
        elif action == "ready":
            distance = float(request.data.get("distance_km", 5))
            order = order_service.mark_ready(order, distance_km=distance)
        else:
            return Response({"error": "Invalid action."}, status=status.HTTP_400_BAD_REQUEST)
    except MerchantOrderError as exc:
        return Response({"error": exc.message, "code": exc.code}, status=status.HTTP_400_BAD_REQUEST)

    return Response(MerchantOrderSerializer(order).data)


@api_view(["GET"])
@permission_classes([IsMerchantOwner])
def merchant_analytics(request):
    return Response(get_merchant_analytics(request.user.merchant_profile))


@api_view(["GET"])
@permission_classes([IsMerchantOwner])
def merchant_payouts(request):
    payouts = request.user.merchant_profile.payouts.all()[:50]
    return Response(MerchantPayoutSerializer(payouts, many=True).data)


@api_view(["POST"])
@permission_classes([IsAdminUser])
def admin_merchant_status(request, merchant_id):
    try:
        merchant = Merchant.objects.get(pk=merchant_id)
    except Merchant.DoesNotExist:
        return Response({"error": "Merchant not found."}, status=status.HTTP_404_NOT_FOUND)

    new_status = request.data.get("status", "").strip().lower()
    if new_status not in {"approved", "rejected", "suspended", "pending"}:
        return Response({"error": "Invalid status."}, status=status.HTTP_400_BAD_REQUEST)

    merchant.status = new_status
    if new_status == "approved":
        merchant.approved_at = timezone.now()
        merchant.rejection_reason = ""
    elif new_status == "rejected":
        merchant.rejection_reason = request.data.get("reason", "")
    merchant.save()

    from security.services.audit_service import log_from_request

    log_from_request(
        request,
        action="admin_action",
        entity_type="merchant",
        entity_id=merchant.id,
        summary=f"Merchant status → {new_status}: {merchant.business_name}",
        details={"status": new_status, "reason": merchant.rejection_reason},
    )
    return Response(MerchantSerializer(merchant).data)
