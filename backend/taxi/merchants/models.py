from django.conf import settings
from django.db import models
from django.utils import timezone


class Merchant(models.Model):
    MERCHANT_TYPE_CHOICES = [
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
    ]

    BUSINESS_TYPE_CHOICES = [
        ("restaurant", "Restaurant"),
        ("pharmacy", "Pharmacy"),
        ("grocery", "Grocery"),
        ("supermarket", "Supermarket"),
        ("shop", "Shop"),
        ("other", "Other"),
    ]

    STATUS_CHOICES = [
        ("pending", "Pending"),
        ("approved", "Approved"),
        ("rejected", "Rejected"),
        ("suspended", "Suspended"),
    ]

    PAYOUT_METHOD_CHOICES = [
        ("bank_account", "Bank Account"),
        ("mobile_wallet", "Mobile Wallet"),
    ]

    owner = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="merchant_profile",
    )
    business_name = models.CharField(max_length=200)
    owner_name = models.CharField(max_length=150)
    phone_number = models.CharField(max_length=30)
    email = models.EmailField()
    address = models.TextField()
    city = models.CharField(max_length=120, default="Nouakchott")
    latitude = models.FloatField(default=18.0735)
    longitude = models.FloatField(default=-15.9582)

    merchant_type = models.CharField(max_length=30, choices=MERCHANT_TYPE_CHOICES, default="restaurant")
    business_type = models.CharField(max_length=20, choices=BUSINESS_TYPE_CHOICES, default="restaurant")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="pending")
    rejection_reason = models.TextField(blank=True, default="")

    business_license = models.FileField(upload_to="merchants/licenses/", null=True, blank=True)
    national_id = models.FileField(upload_to="merchants/national_ids/", null=True, blank=True)
    tax_document = models.FileField(upload_to="merchants/tax/", null=True, blank=True)
    logo = models.ImageField(upload_to="merchants/logos/", null=True, blank=True)
    store_cover_image = models.ImageField(upload_to="merchants/covers/", null=True, blank=True)

    bank_account = models.CharField(max_length=120, blank=True, default="")
    mobile_wallet = models.CharField(max_length=120, blank=True, default="")
    payout_method = models.CharField(
        max_length=20, choices=PAYOUT_METHOD_CHOICES, default="mobile_wallet"
    )

    rating = models.DecimalField(max_digits=3, decimal_places=1, default=5.0)
    total_orders = models.PositiveIntegerField(default=0)
    estimated_prep_minutes = models.PositiveIntegerField(default=25)
    delivery_fee = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    delivery_radius_km = models.FloatField(default=8.0)
    opening_hours = models.JSONField(default=dict, blank=True)
    commission_rate = models.DecimalField(
        max_digits=5,
        decimal_places=4,
        null=True,
        blank=True,
        help_text="Override merchant goods share (e.g. 0.90). Null uses platform default.",
    )
    is_active = models.BooleanField(default=True)

    terms_accepted = models.BooleanField(default=False)
    terms_accepted_at = models.DateTimeField(null=True, blank=True)
    terms_version = models.CharField(max_length=30, blank=True, default="")
    signature_image = models.ImageField(upload_to="legal/merchant_signatures/", null=True, blank=True)
    signed_full_name = models.CharField(max_length=200, blank=True, default="")
    signed_ip_address = models.GenericIPAddressField(null=True, blank=True)
    signed_device_info = models.TextField(blank=True, default="")
    signed_app_version = models.CharField(max_length=40, blank=True, default="")
    legal_declaration_accepted = models.BooleanField(default=False)
    terms_scrolled_to_bottom = models.BooleanField(default=False)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    approved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.business_name

    @property
    def is_operational(self):
        return self.status == "approved" and self.is_active


class MenuCategory(models.Model):
    merchant = models.ForeignKey(Merchant, on_delete=models.CASCADE, related_name="menu_categories")
    name = models.CharField(max_length=120)
    description = models.TextField(blank=True, default="")
    sort_order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["sort_order", "name"]

    def __str__(self):
        return f"{self.name} ({self.merchant.business_name})"


class Product(models.Model):
    PRODUCT_KIND_CHOICES = [
        ("general", "General"),
        ("food", "Food"),
        ("medicine", "Medicine"),
        ("otc", "OTC"),
        ("grocery", "Grocery"),
    ]

    STOCK_STATUS_CHOICES = [
        ("in_stock", "In Stock"),
        ("low_stock", "Low Stock"),
        ("out_of_stock", "Out of Stock"),
    ]

    merchant = models.ForeignKey(Merchant, on_delete=models.CASCADE, related_name="products")
    menu_category = models.ForeignKey(
        MenuCategory, on_delete=models.SET_NULL, null=True, blank=True, related_name="products"
    )
    product_name = models.CharField(max_length=200)
    description = models.TextField(blank=True, default="")
    category = models.CharField(max_length=100, default="General")
    product_kind = models.CharField(max_length=20, choices=PRODUCT_KIND_CHOICES, default="general")
    requires_prescription = models.BooleanField(default=False)
    image = models.ImageField(upload_to="merchants/products/", null=True, blank=True)
    price = models.DecimalField(max_digits=10, decimal_places=2)
    price_per_kg = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    weight_kg = models.DecimalField(max_digits=8, decimal_places=3, null=True, blank=True)
    discount_percent = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    stock_quantity = models.PositiveIntegerField(default=0)
    low_stock_threshold = models.PositiveIntegerField(default=5)
    sort_order = models.PositiveIntegerField(default=0)
    stock_status = models.CharField(
        max_length=20, choices=STOCK_STATUS_CHOICES, default="in_stock"
    )
    is_available = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["category", "product_name"]

    def __str__(self):
        return f"{self.product_name} ({self.merchant.business_name})"

    def refresh_stock_status(self):
        if self.stock_quantity <= 0:
            self.stock_status = "out_of_stock"
            self.is_available = False
        elif self.stock_quantity <= self.low_stock_threshold:
            self.stock_status = "low_stock"
            self.is_available = True
        else:
            self.stock_status = "in_stock"
            self.is_available = True

    @property
    def effective_price(self):
        if self.price_per_kg and self.weight_kg:
            base = self.price_per_kg * self.weight_kg
        else:
            base = self.price
        if self.discount_percent > 0:
            discount = base * self.discount_percent / 100
            return base - discount
        return base


class ProductVariant(models.Model):
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name="variants")
    name = models.CharField(max_length=120)
    price_delta = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    is_available = models.BooleanField(default=True)
    sort_order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["sort_order", "name"]


class ProductExtra(models.Model):
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name="extras")
    name = models.CharField(max_length=120)
    price = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    is_available = models.BooleanField(default=True)
    sort_order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["sort_order", "name"]


class MerchantPromotion(models.Model):
    DISCOUNT_TYPE_CHOICES = [
        ("percentage", "Discount Percentage"),
        ("bogo", "Buy 1 Get 1"),
        ("free_delivery", "Free Delivery"),
        ("promo_code", "Promo Code"),
    ]

    merchant = models.ForeignKey(Merchant, on_delete=models.CASCADE, related_name="promotions")
    title = models.CharField(max_length=150)
    discount_type = models.CharField(max_length=20, choices=DISCOUNT_TYPE_CHOICES)
    value = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    promo_code = models.CharField(max_length=30, blank=True, default="")
    expiry_date = models.DateTimeField()
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    @property
    def is_valid(self):
        return self.is_active and self.expiry_date > timezone.now()


class Cart(models.Model):
    customer = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="merchant_carts"
    )
    merchant = models.ForeignKey(Merchant, on_delete=models.CASCADE, related_name="carts")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = [("customer", "merchant")]

    def __str__(self):
        return f"Cart #{self.id} — {self.merchant.business_name}"


class CartItem(models.Model):
    cart = models.ForeignKey(Cart, on_delete=models.CASCADE, related_name="items")
    product = models.ForeignKey(Product, on_delete=models.CASCADE)
    quantity = models.PositiveIntegerField(default=1)
    unit_price = models.DecimalField(max_digits=10, decimal_places=2)

    class Meta:
        unique_together = [("cart", "product")]

    @property
    def line_total(self):
        return self.unit_price * self.quantity


class MerchantOrder(models.Model):
    STATUS_CHOICES = [
        ("new_order", "New Order"),
        ("accepted", "Accepted"),
        ("preparing", "Preparing"),
        ("ready_for_pickup", "Ready for Pickup"),
        ("courier_assigned", "Courier Assigned"),
        ("picked_up", "Picked Up"),
        ("delivered", "Delivered"),
        ("cancelled", "Cancelled"),
    ]

    PAYMENT_STATUS_CHOICES = [
        ("pending", "Pending"),
        ("paid", "Paid"),
        ("failed", "Failed"),
        ("refunded", "Refunded"),
    ]

    customer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="merchant_orders",
    )
    merchant = models.ForeignKey(Merchant, on_delete=models.CASCADE, related_name="orders")
    delivery = models.ForeignKey(
        "deliveries.Delivery",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="merchant_orders",
    )

    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="new_order")
    subtotal = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    tax_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    delivery_fee = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    discount_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    total = models.DecimalField(max_digits=10, decimal_places=2, default=0)

    delivery_address = models.TextField()
    destination_lat = models.FloatField(default=18.0896)
    destination_lng = models.FloatField(default=-15.9754)
    recipient_name = models.CharField(max_length=120)
    recipient_phone = models.CharField(max_length=30)
    customer_notes = models.TextField(blank=True, default="")
    dropoff_instructions = models.JSONField(default=dict, blank=True)
    recipient_alt_phone = models.CharField(max_length=30, blank=True, default="")

    payment_method = models.CharField(max_length=20, default="cash")
    payment_status = models.CharField(
        max_length=20, choices=PAYMENT_STATUS_CHOICES, default="pending"
    )
    promo_code = models.CharField(max_length=30, blank=True, default="")

    created_at = models.DateTimeField(auto_now_add=True)
    accepted_at = models.DateTimeField(null=True, blank=True)
    preparing_at = models.DateTimeField(null=True, blank=True)
    ready_at = models.DateTimeField(null=True, blank=True)
    courier_assigned_at = models.DateTimeField(null=True, blank=True)
    picked_up_at = models.DateTimeField(null=True, blank=True)
    delivered_at = models.DateTimeField(null=True, blank=True)
    cancelled_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"Order #{self.id} — {self.merchant.business_name}"


class MerchantOrderItem(models.Model):
    order = models.ForeignKey(MerchantOrder, on_delete=models.CASCADE, related_name="items")
    product = models.ForeignKey(Product, on_delete=models.SET_NULL, null=True, blank=True)
    product_name = models.CharField(max_length=200)
    quantity = models.PositiveIntegerField(default=1)
    unit_price = models.DecimalField(max_digits=10, decimal_places=2)
    line_total = models.DecimalField(max_digits=10, decimal_places=2)

    def __str__(self):
        return f"{self.product_name} x{self.quantity}"


class MerchantPayout(models.Model):
    STATUS_CHOICES = [
        ("pending", "Pending"),
        ("processing", "Processing"),
        ("paid", "Paid"),
        ("failed", "Failed"),
    ]

    merchant = models.ForeignKey(Merchant, on_delete=models.CASCADE, related_name="payouts")
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="pending")
    period_start = models.DateField()
    period_end = models.DateField()
    reference = models.CharField(max_length=100, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    paid_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]


class MerchantSettlement(models.Model):
    STATUS_CHOICES = [
        ("pending", "Pending"),
        ("processing", "Processing"),
        ("paid", "Paid"),
        ("failed", "Failed"),
    ]

    merchant = models.ForeignKey(Merchant, on_delete=models.CASCADE, related_name="settlements")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="pending")
    period_start = models.DateField()
    period_end = models.DateField()
    gross_sales = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    commission_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    net_payout = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    order_count = models.PositiveIntegerField(default=0)
    invoice_reference = models.CharField(max_length=64, blank=True, default="")
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="approved_merchant_settlements",
    )
    paid_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-period_end"]
