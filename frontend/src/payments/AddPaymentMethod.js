import React, { useState } from "react";
import axios from "axios";
import { API_URL } from "../apiConfig";

const METHOD_OPTIONS = [
  { id: "card", label: "Card" },
  { id: "cash", label: "Cash" },
  { id: "bankily", label: "Bankily" },
  { id: "masrvi", label: "Masravi" },
  { id: "seddad", label: "Seddad" },
  { id: "bank_account", label: "Bank" },
];

function AddPaymentMethod({ onCardSaved }) {
  const [formData, setFormData] = useState(defaultFormData);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const selectedOption = METHOD_OPTIONS.find((option) => option.id === formData.payment_type);

  const handleChange = (event) => {
    const { name, value, type, checked } = event.target;

    setFormData((current) => ({
      ...current,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const changePaymentType = (paymentType) => {
    setFormData((current) => ({
      ...defaultFormData,
      payment_type: paymentType,
      is_default: current.is_default,
    }));
    setMessage("");
  };

  const savePaymentMethod = async (event) => {
    event.preventDefault();

    try {
      setLoading(true);
      setMessage("");

      const token = localStorage.getItem("access");

      if (!token) {
        setMessage("Please login again.");
        return;
      }

      await axios.post(`${API_URL}/payments/methods/save/`, formData, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      setMessage("Payment method saved successfully.");
      setFormData(defaultFormData);

      if (onCardSaved) {
        onCardSaved();
      }
    } catch (error) {
      console.log(error.response?.data || error);
      setMessage("Failed to save payment method. Please check the information.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="sx-add-payment">
      <AddPaymentMethodStyles />

      <div className="sx-add-payment-head">
        <span>Payment setup</span>
        <h2>Add payment method</h2>
        <p>Save a card, mobile wallet, cash preference, or bank account for Yala rides.</p>
      </div>

      <div className="sx-add-payment-grid">
        <aside className="sx-card-preview">
          <span>{selectedOption?.label || "Payment"}</span>
          <strong>
            {formData.payment_type === "card"
              ? `•••• ${formData.card_last4 || "0000"}`
              : formData.phone_number || formData.account_reference || "Ready to save"}
          </strong>
          <small>
            {formData.payment_type === "card"
              ? formData.card_holder_name || "Card holder"
              : selectedOption?.label || "Yala"}
          </small>
        </aside>

        <form className="sx-method-form" onSubmit={savePaymentMethod}>
          <div className="sx-method-tabs" aria-label="Payment type">
            {METHOD_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                className={formData.payment_type === option.id ? "active" : ""}
                onClick={() => changePaymentType(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>

          {formData.payment_type === "card" && (
            <>
              <label>
                Card holder
                <input
                  type="text"
                  name="card_holder_name"
                  placeholder="Full name"
                  value={formData.card_holder_name}
                  onChange={handleChange}
                />
              </label>

              <div className="sx-form-row">
                <label>
                  Card type
                  <select name="card_type" value={formData.card_type} onChange={handleChange}>
                    <option value="visa">Visa</option>
                    <option value="mastercard">Mastercard</option>
                    <option value="amex">American Express</option>
                  </select>
                </label>

                <label>
                  Last 4 digits
                  <input
                    type="text"
                    name="card_last4"
                    placeholder="1234"
                    maxLength="4"
                    inputMode="numeric"
                    value={formData.card_last4}
                    onChange={handleChange}
                  />
                </label>
              </div>

              <div className="sx-form-row">
                <label>
                  Expiry month
                  <input
                    type="text"
                    name="expiry_month"
                    placeholder="MM"
                    maxLength="2"
                    inputMode="numeric"
                    value={formData.expiry_month}
                    onChange={handleChange}
                  />
                </label>

                <label>
                  Expiry year
                  <input
                    type="text"
                    name="expiry_year"
                    placeholder="YYYY"
                    maxLength="4"
                    inputMode="numeric"
                    value={formData.expiry_year}
                    onChange={handleChange}
                  />
                </label>
              </div>
            </>
          )}

          {formData.payment_type === "bank_account" && (
            <>
              <label>
                Bank name
                <input
                  type="text"
                  name="bank_name"
                  placeholder="Bank name"
                  value={formData.bank_name}
                  onChange={handleChange}
                />
              </label>

              <label>
                Account number or reference
                <input
                  type="text"
                  name="account_reference"
                  placeholder="Account reference"
                  value={formData.account_reference}
                  onChange={handleChange}
                />
              </label>
            </>
          )}

          {["bankily", "masrvi", "seddad"].includes(formData.payment_type) && (
            <>
              <label>
                Phone number
                <input
                  type="text"
                  name="phone_number"
                  placeholder="22114373"
                  value={formData.phone_number}
                  onChange={handleChange}
                />
              </label>

              <label>
                Wallet ID or reference
                <input
                  type="text"
                  name="wallet_id"
                  placeholder="Optional"
                  value={formData.wallet_id}
                  onChange={handleChange}
                />
              </label>
            </>
          )}

          {formData.payment_type === "cash" && (
            <div className="sx-cash-note">
              Cash will stay available at checkout. The driver confirms the payment after drop-off.
            </div>
          )}

          <label className="sx-default-check">
            <input
              type="checkbox"
              name="is_default"
              checked={formData.is_default}
              onChange={handleChange}
            />
            Set as default payment method
          </label>

          {message && <div className="sx-save-message">{message}</div>}

          <button className="sx-save-method" disabled={loading}>
            {loading ? "Saving..." : "Save payment method"}
          </button>
        </form>
      </div>
    </section>
  );
}

const defaultFormData = {
  payment_type: "card",
  card_holder_name: "",
  card_type: "visa",
  card_last4: "",
  expiry_month: "",
  expiry_year: "",
  bank_name: "",
  account_reference: "",
  phone_number: "",
  wallet_id: "",
  is_default: true,
};

function AddPaymentMethodStyles() {
  return (
    <style>{`
      .sx-add-payment {
        margin-top: 24px;
        color: #f8fafc;
      }

      .sx-add-payment-head span {
        display: block;
        color: #facc15;
        font-size: 12px;
        font-weight: 900;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        margin-bottom: 6px;
      }

      .sx-add-payment-head h2 {
        margin: 0;
        font-size: 28px;
        letter-spacing: 0;
      }

      .sx-add-payment-head p {
        margin: 8px 0 0;
        color: #cbd5e1;
        line-height: 1.6;
      }

      .sx-add-payment-grid {
        margin-top: 18px;
        display: grid;
        grid-template-columns: minmax(240px, 330px) minmax(0, 1fr);
        gap: 16px;
        align-items: start;
      }

      .sx-card-preview {
        min-height: 190px;
        border-radius: 8px;
        padding: 22px;
        color: #fff;
        background:
          radial-gradient(circle at 80% 0%, rgba(245, 158, 11, 0.36), transparent 34%),
          linear-gradient(145deg, #06070b, #151923 62%, #2a1d08);
        box-shadow: 0 20px 46px rgba(15, 23, 42, 0.25);
        display: grid;
        align-content: space-between;
        gap: 22px;
      }

      .sx-card-preview span,
      .sx-card-preview small {
        color: #d1d5db;
        font-weight: 800;
      }

      .sx-card-preview strong {
        font-size: 28px;
        letter-spacing: 0;
      }

      .sx-method-form {
        border: 1px solid rgba(255,255,255,0.12);
        border-radius: 8px;
        background: rgba(255,255,255,0.06);
        padding: 16px;
        display: grid;
        gap: 13px;
      }

      .sx-method-tabs {
        display: grid;
        grid-template-columns: repeat(6, minmax(0, 1fr));
        gap: 8px;
        margin-bottom: 4px;
      }

      .sx-method-tabs button {
        border: 1px solid rgba(255,255,255,0.12);
        border-radius: 8px;
        background: rgba(255,255,255,0.07);
        color: #f8fafc;
        padding: 10px 8px;
        font-weight: 900;
        cursor: pointer;
      }

      .sx-method-tabs button.active {
        background: #facc15;
        border-color: #facc15;
        color: #111827;
      }

      .sx-method-form label {
        display: grid;
        gap: 7px;
        color: #e2e8f0;
        font-size: 13px;
        font-weight: 900;
      }

      .sx-method-form input,
      .sx-method-form select {
        width: 100%;
        box-sizing: border-box;
        border: 1px solid rgba(255,255,255,0.14);
        border-radius: 8px;
        padding: 13px 12px;
        color: #fff;
        background: rgba(255,255,255,0.08);
        font: inherit;
      }

      .sx-form-row {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
      }

      .sx-cash-note,
      .sx-save-message {
        border-radius: 8px;
        padding: 13px;
        font-weight: 800;
      }

      .sx-cash-note {
        background: #fffbeb;
        color: #92400e;
        border: 1px solid #fde68a;
      }

      .sx-save-message {
        background: #f0fdf4;
        color: #166534;
        border: 1px solid #bbf7d0;
      }

      .sx-default-check {
        display: flex !important;
        grid-template-columns: auto 1fr;
        align-items: center;
        gap: 10px !important;
      }

      .sx-default-check input {
        width: auto;
      }

      .sx-save-method {
        width: 100%;
        border: 0;
        border-radius: 8px;
        background: #facc15;
        color: #111827;
        padding: 15px 18px;
        font-weight: 900;
        cursor: pointer;
      }

      .sx-save-method:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }

      @media (max-width: 820px) {
        .sx-add-payment-grid,
        .sx-form-row {
          grid-template-columns: 1fr;
        }

        .sx-method-tabs {
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }
      }

      @media (max-width: 480px) {
        .sx-method-tabs {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }
    `}</style>
  );
}

export default AddPaymentMethod;
