import React, { useEffect, useState } from "react";

import DeliveryCustomerTermsAcceptance from "../components/DeliveryCustomerTermsAcceptance";
import DeliveryInstructionFields from "../components/DeliveryInstructionFields";
import { emptyInstructions, instructionsFromDefaults } from "../deliveryInstructionUtils";
import { getDeliveryInstructionDefaults } from "../../security/securityApi";
import { checkoutCart, fetchCart, removeCartItem, updateCartItem } from "../../merchant/merchantApi";
import { DELIVERY_PAYMENT_METHODS } from "../../payments/paymentApi";
import { getDeliveryPayButtonLabel } from "../../payments/deliveryPayment";

export default function DeliveryCart({
  store,
  deliveryAddress,
  destinationLat,
  destinationLng,
  distanceKm,
  onBack,
  onOrdered,
  showTermsAcceptance = false,
  termsChecked = false,
  privacyChecked = false,
  onTermsCheckedChange,
  onPrivacyCheckedChange,
}) {
  const [cart, setCart] = useState(null);
  const [recipientName, setRecipientName] = useState("");
  const [recipientPhone, setRecipientPhone] = useState("");
  const [promoCode, setPromoCode] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("card");
  const [dropoffInstructions, setDropoffInstructions] = useState(emptyInstructions);
  const [recipientAltPhone, setRecipientAltPhone] = useState("");
  const [saveAddress, setSaveAddress] = useState(false);
  const [saveInstructions, setSaveInstructions] = useState(false);
  const [addressLabel, setAddressLabel] = useState("Home");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const loadCart = async () => {
    try {
      const data = await fetchCart(store.id, distanceKm);
      setCart(data);
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => {
    loadCart();
  }, [store.id, distanceKm]);

  useEffect(() => {
    getDeliveryInstructionDefaults()
      .then((defaults) => {
        setDropoffInstructions(instructionsFromDefaults(defaults));
        setRecipientAltPhone(defaults?.recipient_alt_phone || "");
      })
      .catch(() => {});
  }, []);

  const updateQty = async (item, quantity) => {
    try {
      if (quantity <= 0) await removeCartItem(item.id);
      else await updateCartItem(item.id, quantity);
      await loadCart();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleCheckout = async () => {
    if (!recipientName.trim()) { setError("Recipient name is required."); return; }
    if (!recipientPhone.trim()) { setError("Recipient phone is required."); return; }
    if (showTermsAcceptance && (!termsChecked || !privacyChecked)) {
      setError("Please accept the Terms & Conditions and Privacy Policy before placing your order.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const order = await checkoutCart({
        merchant_id: store.id,
        delivery_address: deliveryAddress,
        destination_lat: destinationLat,
        destination_lng: destinationLng,
        recipient_name: recipientName,
        recipient_phone: recipientPhone,
        recipient_alt_phone: recipientAltPhone,
        dropoff_instructions: dropoffInstructions,
        save_address: saveAddress,
        save_instructions: saveInstructions,
        address_label: addressLabel,
        distance_km: distanceKm,
        payment_method: paymentMethod,
        promo_code: promoCode,
        ...(showTermsAcceptance
          ? {
              delivery_terms_accepted: true,
              privacy_accepted: true,
            }
          : {}),
      });
      onOrdered(order);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const totals = cart?.totals || {};
  const items = cart?.items || [];

  return (
    <div className="delivery-cart">
      {/* Header */}
      <header className="delivery-cart__header">
        <button type="button" className="delivery-cart__back" onClick={onBack}>←</button>
        <div>
          <h2>Your order</h2>
          <p>{store.business_name}</p>
        </div>
      </header>

      {error ? <div className="delivery-cart__error">{error}</div> : null}

      {/* Items */}
      <section className="delivery-cart__items">
        {items.length === 0 ? (
          <p className="delivery-cart__empty">Your cart is empty</p>
        ) : null}
        {items.map((item) => (
          <article key={item.id} className="delivery-cart__item">
            <div className="delivery-cart__item-body">
              <strong>{item.product_name}</strong>
              <span>{item.unit_price} MRU</span>
            </div>
            <div className="delivery-cart__qty">
              <button type="button" onClick={() => updateQty(item, item.quantity - 1)}>−</button>
              <span>{item.quantity}</span>
              <button type="button" onClick={() => updateQty(item, item.quantity + 1)}>+</button>
            </div>
          </article>
        ))}
      </section>

      {/* Delivery details */}
      <section className="delivery-cart__section">
        <h3>Delivery details</h3>
        <label className="delivery-cart__field">
          <span>Deliver to</span>
          <input value={deliveryAddress} readOnly />
        </label>
        <label className="delivery-cart__field">
          <span>Recipient name</span>
          <input
            value={recipientName}
            onChange={(e) => setRecipientName(e.target.value)}
            placeholder="Full name"
            required
          />
        </label>
        <label className="delivery-cart__field">
          <span>Recipient phone</span>
          <input
            type="tel"
            value={recipientPhone}
            onChange={(e) => setRecipientPhone(e.target.value)}
            placeholder="+222 XXXXXXXX"
            required
          />
        </label>

        <DeliveryInstructionFields
          title="Dropoff instructions"
          subtitle="Building details help your courier find the door."
          instructions={dropoffInstructions}
          onChange={setDropoffInstructions}
          recipientAltPhone={recipientAltPhone}
          onRecipientAltPhoneChange={setRecipientAltPhone}
          saveAddress={saveAddress}
          onSaveAddressChange={setSaveAddress}
          saveInstructions={saveInstructions}
          onSaveInstructionsChange={setSaveInstructions}
          addressLabel={addressLabel}
          onAddressLabelChange={setAddressLabel}
          className="delivery-cart__instructions"
        />
      </section>

      {/* Payment */}
      <section className="delivery-cart__section">
        <h3>Payment</h3>
        <div className="delivery-cart__chips">
          {DELIVERY_PAYMENT_METHODS.map((m) => (
            <button
              key={m.value}
              type="button"
              className={`delivery-cart__chip ${paymentMethod === m.value ? "is-active" : ""}`}
              onClick={() => setPaymentMethod(m.value)}
            >
              {m.label}
            </button>
          ))}
        </div>
        <label className="delivery-cart__field">
          <span>Promo code</span>
          <input value={promoCode} onChange={(e) => setPromoCode(e.target.value)} placeholder="Enter code" />
        </label>
      </section>

      {/* Summary */}
      <section className="delivery-cart__summary">
        <div className="delivery-cart__row"><span>Subtotal</span><span>{totals.subtotal || 0} MRU</span></div>
        <div className="delivery-cart__row"><span>Delivery fee</span><span>{totals.delivery_fee || 0} MRU</span></div>
        {totals.tax_amount ? <div className="delivery-cart__row"><span>Tax</span><span>{totals.tax_amount} MRU</span></div> : null}
        {totals.discount ? <div className="delivery-cart__row is-discount"><span>Discount</span><span>-{totals.discount} MRU</span></div> : null}
        <div className="delivery-cart__row is-total"><span>Total</span><span>{totals.total || 0} MRU</span></div>
      </section>

      {showTermsAcceptance ? (
        <DeliveryCustomerTermsAcceptance
          termsChecked={termsChecked}
          privacyChecked={privacyChecked}
          onTermsChange={onTermsCheckedChange}
          onPrivacyChange={onPrivacyCheckedChange}
          returnPath="/delivery"
          disabled={busy}
        />
      ) : null}

      {/* Checkout button */}
      <button
        type="button"
        className="delivery-cart__checkout"
        disabled={busy || items.length === 0 || (showTermsAcceptance && (!termsChecked || !privacyChecked))}
        onClick={handleCheckout}
        aria-busy={busy}
      >
        {getDeliveryPayButtonLabel(paymentMethod, totals.total || 0)}
      </button>

      <DeliveryCartStyles />
    </div>
  );
}

function DeliveryCartStyles() {
  return (
    <style>{`
      .delivery-cart {
        display: grid;
        gap: 16px;
        padding-bottom: 24px;
      }

      .delivery-cart__header {
        display: flex;
        align-items: center;
        gap: 12px;
      }

      .delivery-cart__header h2 {
        margin: 0;
        font-size: 20px;
        font-weight: 800;
        color: #111827;
      }

      .delivery-cart__header p {
        margin: 2px 0 0;
        font-size: 13px;
        color: #6b7280;
      }

      .delivery-cart__back {
        width: 40px;
        height: 40px;
        border: none;
        border-radius: 12px;
        background: #f3f4f6;
        font-size: 18px;
        cursor: pointer;
        display: grid;
        place-items: center;
      }

      .delivery-cart__error {
        padding: 12px 14px;
        border-radius: 12px;
        background: #fef2f2;
        border: 1px solid #fecaca;
        color: #b91c1c;
        font-size: 13px;
        font-weight: 600;
      }

      .delivery-cart__items {
        border-radius: 16px;
        background: #fff;
        box-shadow: 0 2px 8px rgba(0,0,0,0.05);
        overflow: hidden;
      }

      .delivery-cart__empty {
        padding: 24px;
        text-align: center;
        color: #9ca3af;
      }

      .delivery-cart__item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 14px 16px;
        border-bottom: 1px solid #f3f4f6;
      }

      .delivery-cart__item:last-child {
        border-bottom: none;
      }

      .delivery-cart__item-body strong {
        display: block;
        font-size: 14px;
        font-weight: 700;
        color: #111827;
      }

      .delivery-cart__item-body span {
        font-size: 13px;
        color: #FF6B00;
        font-weight: 600;
      }

      .delivery-cart__qty {
        display: flex;
        align-items: center;
        gap: 0;
        border: 1.5px solid #e5e7eb;
        border-radius: 10px;
        overflow: hidden;
      }

      .delivery-cart__qty button {
        width: 34px;
        height: 34px;
        border: none;
        background: #f9fafb;
        font-size: 16px;
        font-weight: 700;
        cursor: pointer;
        color: #374151;
      }

      .delivery-cart__qty button:active {
        background: #e5e7eb;
      }

      .delivery-cart__qty span {
        width: 28px;
        text-align: center;
        font-size: 14px;
        font-weight: 700;
      }

      .delivery-cart__section {
        display: grid;
        gap: 10px;
      }

      .delivery-cart__section h3 {
        margin: 0;
        font-size: 15px;
        font-weight: 800;
        color: #111827;
      }

      .delivery-cart__field {
        display: grid;
        gap: 4px;
      }

      .delivery-cart__field span {
        font-size: 12px;
        font-weight: 600;
        color: #6b7280;
      }

      .delivery-cart__field input {
        width: 100%;
        min-height: 46px;
        padding: 0 14px;
        border: 1.5px solid #e5e7eb;
        border-radius: 12px;
        background: #fff;
        font-size: 15px;
        color: #111827;
        outline: none;
        transition: border-color 0.2s;
      }

      .delivery-cart__field input:focus {
        border-color: #FF6B00;
        box-shadow: 0 0 0 3px rgba(255,107,0,0.1);
      }

      .delivery-cart__chips {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }

      .delivery-cart__chip {
        padding: 8px 14px;
        border: 1.5px solid #e5e7eb;
        border-radius: 999px;
        background: #fff;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.15s;
      }

      .delivery-cart__chip.is-active {
        border-color: #FF6B00;
        background: #fff7ed;
        color: #EA580C;
      }

      .delivery-cart__summary {
        padding: 16px;
        border-radius: 16px;
        background: #f9fafb;
        display: grid;
        gap: 8px;
      }

      .delivery-cart__row {
        display: flex;
        justify-content: space-between;
        font-size: 13px;
        color: #6b7280;
      }

      .delivery-cart__row.is-total {
        padding-top: 8px;
        border-top: 1px solid #e5e7eb;
        font-size: 16px;
        font-weight: 800;
        color: #111827;
      }

      .delivery-cart__row.is-discount span:last-child {
        color: #10b981;
      }

      .delivery-cart__checkout {
        width: 100%;
        min-height: 54px;
        border: none;
        border-radius: 14px;
        background: linear-gradient(135deg, #FF8A3D, #FF6B00);
        color: #fff;
        font-size: 16px;
        font-weight: 800;
        cursor: pointer;
        box-shadow: 0 8px 24px rgba(255,107,0,0.25);
        transition: transform 0.1s;
      }

      .delivery-cart__checkout:active {
        transform: scale(0.97);
      }

      .delivery-cart__checkout:disabled {
        opacity: 0.6;
        cursor: not-allowed;
        transform: none;
      }
    `}</style>
  );
}
