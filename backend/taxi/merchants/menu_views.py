"""Menu management views — categories, variants, extras (Phase 31)."""

from rest_framework import generics, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from .models import MenuCategory, MerchantSettlement, Product, ProductExtra, ProductVariant
from .permissions import IsApprovedMerchant, IsMerchantOwner
from .serializers import (
    MenuCategorySerializer,
    MerchantSettlementSerializer,
    ProductExtraSerializer,
    ProductVariantSerializer,
)


class MenuCategoryListCreateView(generics.ListCreateAPIView):
    serializer_class = MenuCategorySerializer
    permission_classes = [IsApprovedMerchant]

    def get_queryset(self):
        return self.request.user.merchant_profile.menu_categories.all()

    def perform_create(self, serializer):
        serializer.save(merchant=self.request.user.merchant_profile)


class MenuCategoryDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = MenuCategorySerializer
    permission_classes = [IsApprovedMerchant]

    def get_queryset(self):
        return self.request.user.merchant_profile.menu_categories.all()


@api_view(["GET", "POST"])
@permission_classes([IsApprovedMerchant])
def product_variants(request, product_id):
    merchant = request.user.merchant_profile
    product = Product.objects.filter(pk=product_id, merchant=merchant).first()
    if not product:
        return Response({"error": "Product not found."}, status=status.HTTP_404_NOT_FOUND)

    if request.method == "GET":
        variants = ProductVariant.objects.filter(product=product)
        return Response(ProductVariantSerializer(variants, many=True).data)

    serializer = ProductVariantSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    variant = serializer.save(product=product)
    return Response(ProductVariantSerializer(variant).data, status=status.HTTP_201_CREATED)


@api_view(["PATCH", "DELETE"])
@permission_classes([IsApprovedMerchant])
def product_variant_detail(request, product_id, variant_id):
    merchant = request.user.merchant_profile
    variant = ProductVariant.objects.filter(
        pk=variant_id, product_id=product_id, product__merchant=merchant
    ).first()
    if not variant:
        return Response({"error": "Variant not found."}, status=status.HTTP_404_NOT_FOUND)

    if request.method == "DELETE":
        variant.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    serializer = ProductVariantSerializer(variant, data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    serializer.save()
    return Response(serializer.data)


@api_view(["GET", "POST"])
@permission_classes([IsApprovedMerchant])
def product_extras(request, product_id):
    merchant = request.user.merchant_profile
    product = Product.objects.filter(pk=product_id, merchant=merchant).first()
    if not product:
        return Response({"error": "Product not found."}, status=status.HTTP_404_NOT_FOUND)

    if request.method == "GET":
        extras = ProductExtra.objects.filter(product=product)
        return Response(ProductExtraSerializer(extras, many=True).data)

    serializer = ProductExtraSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    extra = serializer.save(product=product)
    return Response(ProductExtraSerializer(extra).data, status=status.HTTP_201_CREATED)


@api_view(["PATCH", "DELETE"])
@permission_classes([IsApprovedMerchant])
def product_extra_detail(request, product_id, extra_id):
    merchant = request.user.merchant_profile
    extra = ProductExtra.objects.filter(
        pk=extra_id, product_id=product_id, product__merchant=merchant
    ).first()
    if not extra:
        return Response({"error": "Extra not found."}, status=status.HTTP_404_NOT_FOUND)

    if request.method == "DELETE":
        extra.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    serializer = ProductExtraSerializer(extra, data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    serializer.save()
    return Response(serializer.data)


@api_view(["GET"])
@permission_classes([IsMerchantOwner])
def merchant_settlements(request):
    settlements = request.user.merchant_profile.settlements.all()[:50]
    return Response(MerchantSettlementSerializer(settlements, many=True).data)
