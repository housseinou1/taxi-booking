"""Merchant order and checkout logic."""

import logging
from decimal import Decimal, ROUND_HALF_UP

from django.db import transaction
from django.utils import timezone

from deliveries.services.delivery_service import DeliveryService, DeliveryServiceError
from deliveries.services.pricing import DeliveryPricingService

from ..models import Cart, CartItem, Merchant, MerchantOrder, MerchantOrderItem, Product
from .notifications import notify_merchant_new_order, notify_merchant_order_update

logger = logging.getLogger(__name__)

TWO_PLACES = Decimal("0.01")
TAX_RATE = Decimal("0.05")  # 5% VAT placeholder
pricing_service = DeliveryPricingService()
delivery_service = DeliveryService()


class MerchantOrderError(Exception):
    def __init__(self, message, code="order_error"):
        self.message = message
        self.code = code
        super().__init__(message)


def _map_merchant_to_service_category(merchant: Merchant) -> str:
    mapping = {
        "restaurant": "food",
        "fast_food": "food",
        "cafe": "food",
        "pharmacy": "pharmacy",
        "grocery": "grocery",
        "supermarket": "grocery",
        "water_supplier": "household",
        "market": "market",
        "business_supplier": "business",
    }
    return mapping.get(merchant.merchant_type, "shopping")


class MerchantOrderService:
    def calculate_cart_totals(self, cart: Cart, distance_km=5, promo_discount=Decimal("0")):
        subtotal = Decimal("0")
        for item in cart.items.select_related("product"):
            subtotal += item.line_total
        subtotal = subtotal.quantize(TWO_PLACES, ROUND_HALF_UP)
        tax_amount = (subtotal * TAX_RATE).quantize(TWO_PLACES, ROUND_HALF_UP)
        delivery_fee = cart.merchant.delivery_fee
        if delivery_fee <= 0:
            category = _map_merchant_to_service_category(cart.merchant)
            breakdown = pricing_service.calculate_fare(
                service_category=category,
                package_type="small",
                distance_km=Decimal(str(distance_km)),
                courier_type="motorcycle",
            )
            delivery_fee = breakdown.total_fare
        discount = Decimal(str(promo_discount or 0))
        total = max(subtotal + tax_amount + delivery_fee - discount, Decimal("0"))
        return {
            "subtotal": subtotal,
            "tax_amount": tax_amount,
            "delivery_fee": delivery_fee.quantize(TWO_PLACES) if hasattr(delivery_fee, "quantize") else Decimal(str(delivery_fee)),
            "discount_amount": discount,
            "total": total.quantize(TWO_PLACES, ROUND_HALF_UP),
        }

    @transaction.atomic
    def checkout(
        self,
        customer,
        cart: Cart,
        delivery_address: str,
        recipient_name: str,
        recipient_phone: str,
        distance_km=5,
        payment_method="card",
        customer_notes="",
        dropoff_instructions=None,
        recipient_alt_phone="",
        promo_code="",
        promo_discount=Decimal("0"),
        destination_lat=18.0896,
        destination_lng=-15.9754,
    ) -> MerchantOrder:
        if not cart.items.exists():
            raise MerchantOrderError("Cart is empty.", code="empty_cart")
        if not cart.merchant.is_operational:
            raise MerchantOrderError("This store is not accepting orders.", code="store_closed")

        for item in cart.items.select_related("product"):
            if not item.product.is_available or item.product.stock_quantity < item.quantity:
                raise MerchantOrderError(
                    f"{item.product.product_name} is unavailable.",
                    code="out_of_stock",
                )

        totals = self.calculate_cart_totals(cart, distance_km, promo_discount)

        from deliveries.instruction_utils import normalize_instructions

        normalized_dropoff = normalize_instructions(dropoff_instructions)

        order = MerchantOrder.objects.create(
            customer=customer,
            merchant=cart.merchant,
            subtotal=totals["subtotal"],
            tax_amount=totals["tax_amount"],
            delivery_fee=totals["delivery_fee"],
            discount_amount=totals["discount_amount"],
            total=totals["total"],
            delivery_address=delivery_address,
            recipient_name=recipient_name,
            recipient_phone=recipient_phone,
            customer_notes=customer_notes,
            dropoff_instructions=normalized_dropoff,
            recipient_alt_phone=(recipient_alt_phone or "").strip(),
            payment_method=payment_method,
            payment_status="pending",
            promo_code=promo_code or "",
            status="new_order",
        )

        for item in cart.items.select_related("product"):
            MerchantOrderItem.objects.create(
                order=order,
                product=item.product,
                product_name=item.product.product_name,
                quantity=item.quantity,
                unit_price=item.unit_price,
                line_total=item.line_total,
            )
            item.product.stock_quantity = max(0, item.product.stock_quantity - item.quantity)
            item.product.refresh_stock_status()
            item.product.save(update_fields=["stock_quantity", "stock_status", "is_available"])

        cart.items.all().delete()

        notify_merchant_new_order(order)

        try:
            from payments.settlement_service import settle_merchant_order_payment

            settle_merchant_order_payment(
                order,
                payment_method=payment_method,
                payment_timing="before_delivery",
            )
            order.refresh_from_db()
        except Exception as exc:
            order.delete()
            raise MerchantOrderError(
                str(exc) if str(exc) else "Payment failed. Order was not created.",
                code="payment_failed",
            ) from exc

        return order

    @transaction.atomic
    def accept_order(self, order: MerchantOrder) -> MerchantOrder:
        if order.status != "new_order":
            raise MerchantOrderError("Order cannot be accepted.", code="invalid_status")
        order.status = "accepted"
        order.accepted_at = timezone.now()
        order.save(update_fields=["status", "accepted_at"])
        return order

    def reject_order(self, order: MerchantOrder, reason="") -> MerchantOrder:
        if order.status not in {"new_order", "accepted"}:
            raise MerchantOrderError("Order cannot be rejected.", code="invalid_status")
        order.status = "cancelled"
        order.cancelled_at = timezone.now()
        order.customer_notes = f"{order.customer_notes}\nRejected: {reason}".strip()
        order.save(update_fields=["status", "cancelled_at", "customer_notes"])

        from payments.models import PaymentRecord
        from payments.settlement_service import request_refund

        record = PaymentRecord.objects.filter(merchant_order=order, status="paid").first()
        if record:
            try:
                request_refund(record, order.customer, reason="merchant_rejected", note=reason)
            except Exception:
                logger.exception("Refund request failed for order %s", order.id)

        return order

    def mark_preparing(self, order: MerchantOrder) -> MerchantOrder:
        if order.status != "accepted":
            raise MerchantOrderError("Order must be accepted first.", code="invalid_status")
        order.status = "preparing"
        order.preparing_at = timezone.now()
        order.save(update_fields=["status", "preparing_at"])
        return order

    @transaction.atomic
    def mark_ready(self, order: MerchantOrder, distance_km=5) -> MerchantOrder:
        if order.status not in {"accepted", "preparing"}:
            raise MerchantOrderError("Order is not ready to mark.", code="invalid_status")

        order.status = "ready_for_pickup"
        order.ready_at = timezone.now()
        order.save(update_fields=["status", "ready_at"])

        merchant = order.merchant
        category = _map_merchant_to_service_category(merchant)
        items_summary = ", ".join(
            f"{item.product_name} x{item.quantity}" for item in order.items.all()
        )

        try:
            delivery, _metadata = delivery_service.create_delivery(
                customer=order.customer,
                data={
                    "service_city": merchant.city,
                    "pickup": merchant.address,
                    "destination": order.delivery_address,
                    "pickup_lat": merchant.latitude,
                    "pickup_lng": merchant.longitude,
                    "destination_lat": 18.0896,
                    "destination_lng": -15.9754,
                    "recipient_name": order.recipient_name,
                    "recipient_phone": order.recipient_phone,
                    "service_category": category,
                    "package_type": "small",
                    "courier_type_required": "motorcycle",
                    "distance_km": distance_km,
                    "customer_notes": order.customer_notes,
                    "dropoff_instructions": order.dropoff_instructions,
                    "recipient_alt_phone": order.recipient_alt_phone,
                    "pickup_instructions": {
                        "extra_instructions": f"Pick up order #{order.id} at {merchant.business_name}.",
                    },
                    "restaurant_name": merchant.business_name,
                    "food_items": items_summary,
                    "store_name": merchant.business_name,
                    "shopping_list": items_summary,
                    "payment_method": order.payment_method,
                },
            )
            order.delivery = delivery
            order.save(update_fields=["delivery"])
        except DeliveryServiceError:
            pass

        return order

    def mark_picked_up(self, order: MerchantOrder) -> MerchantOrder:
        if order.status != "ready_for_pickup":
            raise MerchantOrderError("Invalid status.", code="invalid_status")
        order.status = "picked_up"
        order.picked_up_at = timezone.now()
        order.save(update_fields=["status", "picked_up_at"])
        notify_merchant_order_update(order, "picked_up")
        return order

    def mark_delivered(self, order: MerchantOrder) -> MerchantOrder:
        if order.status not in {"picked_up", "ready_for_pickup"}:
            raise MerchantOrderError("Invalid status.", code="invalid_status")
        order.status = "delivered"
        order.delivered_at = timezone.now()
        order.payment_status = "paid"
        order.save(update_fields=["status", "delivered_at", "payment_status"])
        merchant = order.merchant
        merchant.total_orders += 1
        merchant.save(update_fields=["total_orders"])
        notify_merchant_order_update(order, "delivered")
        if order.payment_status == "paid":
            notify_merchant_order_update(order, "payment_received")
        return order


def get_or_create_cart(customer, merchant: Merchant) -> Cart:
    cart, _ = Cart.objects.get_or_create(customer=customer, merchant=merchant)
    return cart


def add_to_cart(customer, merchant: Merchant, product: Product, quantity: int = 1) -> CartItem:
    if not product.is_available:
        raise MerchantOrderError("Product is unavailable.", code="unavailable")
    cart = get_or_create_cart(customer, merchant)
    unit_price = product.effective_price.quantize(TWO_PLACES, ROUND_HALF_UP)
    item, created = CartItem.objects.get_or_create(
        cart=cart,
        product=product,
        defaults={"quantity": quantity, "unit_price": unit_price},
    )
    if not created:
        item.quantity += quantity
        item.unit_price = unit_price
        item.save(update_fields=["quantity", "unit_price"])
    return item
