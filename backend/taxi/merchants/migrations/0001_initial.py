from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("deliveries", "0009_delivery_pricing_engine"),
    ]

    operations = [
        migrations.CreateModel(
            name="Merchant",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("business_name", models.CharField(max_length=200)),
                ("owner_name", models.CharField(max_length=150)),
                ("phone_number", models.CharField(max_length=30)),
                ("email", models.EmailField(max_length=254)),
                ("address", models.TextField()),
                ("city", models.CharField(default="Nouakchott", max_length=120)),
                ("latitude", models.FloatField(default=18.0735)),
                ("longitude", models.FloatField(default=-15.9582)),
                (
                    "merchant_type",
                    models.CharField(
                        choices=[
                            ("restaurant", "Restaurant"),
                            ("fast_food", "Fast Food"),
                            ("cafe", "Cafe"),
                            ("pharmacy", "Pharmacy"),
                            ("grocery", "Grocery Store"),
                            ("supermarket", "Supermarket"),
                            ("water_supplier", "Water Supplier"),
                            ("electronics", "Electronics Shop"),
                            ("clothing", "Clothing Store"),
                            ("market", "Local Market"),
                            ("business_supplier", "Business Supplier"),
                        ],
                        default="restaurant",
                        max_length=30,
                    ),
                ),
                (
                    "business_type",
                    models.CharField(
                        choices=[
                            ("restaurant", "Restaurant"),
                            ("pharmacy", "Pharmacy"),
                            ("grocery", "Grocery"),
                            ("supermarket", "Supermarket"),
                            ("shop", "Shop"),
                            ("other", "Other"),
                        ],
                        default="restaurant",
                        max_length=20,
                    ),
                ),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("pending", "Pending"),
                            ("approved", "Approved"),
                            ("rejected", "Rejected"),
                            ("suspended", "Suspended"),
                        ],
                        default="pending",
                        max_length=20,
                    ),
                ),
                ("rejection_reason", models.TextField(blank=True, default="")),
                ("business_license", models.FileField(blank=True, null=True, upload_to="merchants/licenses/")),
                ("national_id", models.FileField(blank=True, null=True, upload_to="merchants/national_ids/")),
                ("tax_document", models.FileField(blank=True, null=True, upload_to="merchants/tax/")),
                ("logo", models.ImageField(blank=True, null=True, upload_to="merchants/logos/")),
                ("store_cover_image", models.ImageField(blank=True, null=True, upload_to="merchants/covers/")),
                ("bank_account", models.CharField(blank=True, default="", max_length=120)),
                ("mobile_wallet", models.CharField(blank=True, default="", max_length=120)),
                (
                    "payout_method",
                    models.CharField(
                        choices=[("bank_account", "Bank Account"), ("mobile_wallet", "Mobile Wallet")],
                        default="mobile_wallet",
                        max_length=20,
                    ),
                ),
                ("rating", models.DecimalField(decimal_places=1, default=5.0, max_digits=3)),
                ("total_orders", models.PositiveIntegerField(default=0)),
                ("estimated_prep_minutes", models.PositiveIntegerField(default=25)),
                ("delivery_fee", models.DecimalField(decimal_places=2, default=0, max_digits=10)),
                ("is_active", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("approved_at", models.DateTimeField(blank=True, null=True)),
                (
                    "owner",
                    models.OneToOneField(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="merchant_profile",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={"ordering": ["-created_at"]},
        ),
        migrations.CreateModel(
            name="Product",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("product_name", models.CharField(max_length=200)),
                ("description", models.TextField(blank=True, default="")),
                ("category", models.CharField(default="General", max_length=100)),
                ("image", models.ImageField(blank=True, null=True, upload_to="merchants/products/")),
                ("price", models.DecimalField(decimal_places=2, max_digits=10)),
                ("discount_percent", models.DecimalField(decimal_places=2, default=0, max_digits=5)),
                ("stock_quantity", models.PositiveIntegerField(default=0)),
                ("low_stock_threshold", models.PositiveIntegerField(default=5)),
                (
                    "stock_status",
                    models.CharField(
                        choices=[
                            ("in_stock", "In Stock"),
                            ("low_stock", "Low Stock"),
                            ("out_of_stock", "Out of Stock"),
                        ],
                        default="in_stock",
                        max_length=20,
                    ),
                ),
                ("is_available", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "merchant",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="products",
                        to="merchants.merchant",
                    ),
                ),
            ],
            options={"ordering": ["category", "product_name"]},
        ),
        migrations.CreateModel(
            name="MerchantPromotion",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("title", models.CharField(max_length=150)),
                (
                    "discount_type",
                    models.CharField(
                        choices=[
                            ("percentage", "Discount Percentage"),
                            ("bogo", "Buy 1 Get 1"),
                            ("free_delivery", "Free Delivery"),
                            ("promo_code", "Promo Code"),
                        ],
                        max_length=20,
                    ),
                ),
                ("value", models.DecimalField(decimal_places=2, default=0, max_digits=10)),
                ("promo_code", models.CharField(blank=True, default="", max_length=30)),
                ("expiry_date", models.DateTimeField()),
                ("is_active", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "merchant",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="promotions",
                        to="merchants.merchant",
                    ),
                ),
            ],
            options={"ordering": ["-created_at"]},
        ),
        migrations.CreateModel(
            name="MerchantPayout",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("amount", models.DecimalField(decimal_places=2, max_digits=12)),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("pending", "Pending"),
                            ("processing", "Processing"),
                            ("paid", "Paid"),
                            ("failed", "Failed"),
                        ],
                        default="pending",
                        max_length=20,
                    ),
                ),
                ("period_start", models.DateField()),
                ("period_end", models.DateField()),
                ("reference", models.CharField(blank=True, default="", max_length=100)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("paid_at", models.DateTimeField(blank=True, null=True)),
                (
                    "merchant",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="payouts",
                        to="merchants.merchant",
                    ),
                ),
            ],
            options={"ordering": ["-created_at"]},
        ),
        migrations.CreateModel(
            name="MerchantOrder",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("new_order", "New Order"),
                            ("accepted", "Accepted"),
                            ("preparing", "Preparing"),
                            ("ready_for_pickup", "Ready for Pickup"),
                            ("picked_up", "Picked Up"),
                            ("delivered", "Delivered"),
                            ("cancelled", "Cancelled"),
                        ],
                        default="new_order",
                        max_length=20,
                    ),
                ),
                ("subtotal", models.DecimalField(decimal_places=2, default=0, max_digits=10)),
                ("tax_amount", models.DecimalField(decimal_places=2, default=0, max_digits=10)),
                ("delivery_fee", models.DecimalField(decimal_places=2, default=0, max_digits=10)),
                ("discount_amount", models.DecimalField(decimal_places=2, default=0, max_digits=10)),
                ("total", models.DecimalField(decimal_places=2, default=0, max_digits=10)),
                ("delivery_address", models.TextField()),
                ("recipient_name", models.CharField(max_length=120)),
                ("recipient_phone", models.CharField(max_length=30)),
                ("customer_notes", models.TextField(blank=True, default="")),
                ("payment_method", models.CharField(default="cash", max_length=20)),
                (
                    "payment_status",
                    models.CharField(
                        choices=[
                            ("pending", "Pending"),
                            ("paid", "Paid"),
                            ("failed", "Failed"),
                            ("refunded", "Refunded"),
                        ],
                        default="pending",
                        max_length=20,
                    ),
                ),
                ("promo_code", models.CharField(blank=True, default="", max_length=30)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("accepted_at", models.DateTimeField(blank=True, null=True)),
                ("preparing_at", models.DateTimeField(blank=True, null=True)),
                ("ready_at", models.DateTimeField(blank=True, null=True)),
                ("picked_up_at", models.DateTimeField(blank=True, null=True)),
                ("delivered_at", models.DateTimeField(blank=True, null=True)),
                ("cancelled_at", models.DateTimeField(blank=True, null=True)),
                (
                    "customer",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="merchant_orders",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "delivery",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="merchant_orders",
                        to="deliveries.delivery",
                    ),
                ),
                (
                    "merchant",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="orders",
                        to="merchants.merchant",
                    ),
                ),
            ],
            options={"ordering": ["-created_at"]},
        ),
        migrations.CreateModel(
            name="Cart",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "customer",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="merchant_carts",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "merchant",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="carts",
                        to="merchants.merchant",
                    ),
                ),
            ],
            options={"unique_together": {("customer", "merchant")}},
        ),
        migrations.CreateModel(
            name="MerchantOrderItem",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("product_name", models.CharField(max_length=200)),
                ("quantity", models.PositiveIntegerField(default=1)),
                ("unit_price", models.DecimalField(decimal_places=2, max_digits=10)),
                ("line_total", models.DecimalField(decimal_places=2, max_digits=10)),
                (
                    "order",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="items",
                        to="merchants.merchantorder",
                    ),
                ),
                (
                    "product",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        to="merchants.product",
                    ),
                ),
            ],
        ),
        migrations.CreateModel(
            name="CartItem",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("quantity", models.PositiveIntegerField(default=1)),
                ("unit_price", models.DecimalField(decimal_places=2, max_digits=10)),
                (
                    "cart",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="items",
                        to="merchants.cart",
                    ),
                ),
                (
                    "product",
                    models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to="merchants.product"),
                ),
            ],
            options={"unique_together": {("cart", "product")}},
        ),
    ]
