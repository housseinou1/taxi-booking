from django.urls import path

from . import menu_views, views

urlpatterns = [
    path("register/", views.merchant_register, name="merchant-register"),
    path("login/", views.merchant_login, name="merchant-login"),
    path("me/", views.merchant_me, name="merchant-me"),
    path("stores/", views.store_list, name="merchant-stores"),
    path("stores/<int:store_id>/", views.store_detail, name="merchant-store-detail"),
    path("stores/<int:store_id>/products/", views.store_products, name="merchant-store-products"),
    path("products/", views.MerchantProductListCreateView.as_view(), name="merchant-products"),
    path("products/<int:pk>/", views.MerchantProductDetailView.as_view(), name="merchant-product-detail"),
    path("inventory/", views.inventory_list, name="merchant-inventory"),
    path("promotions/", views.MerchantPromotionListCreateView.as_view(), name="merchant-promotions"),
    path("promotions/<int:pk>/", views.MerchantPromotionDetailView.as_view(), name="merchant-promotion-detail"),
    path("cart/<int:merchant_id>/", views.cart_detail, name="merchant-cart"),
    path("cart/items/", views.cart_add_item, name="merchant-cart-add"),
    path("cart/items/<int:item_id>/", views.cart_item_detail, name="merchant-cart-item"),
    path("cart/checkout/", views.cart_checkout, name="merchant-cart-checkout"),
    path("orders/", views.merchant_orders, name="merchant-orders"),
    path("orders/mine/", views.my_orders, name="merchant-my-orders"),
    path("orders/<int:order_id>/action/", views.merchant_order_action, name="merchant-order-action"),
    path("dashboard/analytics/", views.merchant_analytics, name="merchant-analytics"),
    path("settlements/", menu_views.merchant_settlements, name="merchant-settlements"),
    path("menu/categories/", menu_views.MenuCategoryListCreateView.as_view(), name="merchant-menu-categories"),
    path("menu/categories/<int:pk>/", menu_views.MenuCategoryDetailView.as_view(), name="merchant-menu-category-detail"),
    path("products/<int:product_id>/variants/", menu_views.product_variants, name="merchant-product-variants"),
    path("products/<int:product_id>/variants/<int:variant_id>/", menu_views.product_variant_detail, name="merchant-product-variant-detail"),
    path("products/<int:product_id>/extras/", menu_views.product_extras, name="merchant-product-extras"),
    path("products/<int:product_id>/extras/<int:extra_id>/", menu_views.product_extra_detail, name="merchant-product-extra-detail"),
    path("payouts/", views.merchant_payouts, name="merchant-payouts"),
    path("admin/<int:merchant_id>/status/", views.admin_merchant_status, name="merchant-admin-status"),
]
