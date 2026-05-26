import React, { useState } from "react";
import axios from "axios";
import { API_URL } from "../apiConfig";

function AddPaymentMethod({ onCardSaved }) {
  const [formData, setFormData] = useState({
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
  });

  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;

    setFormData({
      ...formData,
      [name]: type === "checkbox" ? checked : value,
    });
  };

  const savePaymentMethod = async () => {
    try {
      setLoading(true);

      const token = localStorage.getItem("access");

      if (!token) {
        alert("Please login again.");
        return;
      }

      await axios.post(`${API_URL}/payments/methods/save/`, formData, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      alert("Payment method saved ✅");

      setFormData({
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
      });

      if (onCardSaved) {
        onCardSaved();
      }
    } catch (error) {
      console.log(error.response?.data || error);
      alert("Failed to save payment method");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={containerStyle}>
      <h2 style={titleStyle}>💳 Add Payment Method</h2>

      <div style={cardStyle}>
        <label style={labelStyle}>Payment Type</label>

        <select
          name="payment_type"
          value={formData.payment_type}
          onChange={handleChange}
          style={inputStyle}
        >
          <option value="card">Card</option>
          <option value="bank_account">Bank Account</option>
          <option value="bankily">Bankily</option>
          <option value="masrvi">Masravi</option>
          <option value="seddad">Seddad</option>
          <option value="cash">Cash</option>
        </select>

        {formData.payment_type === "card" && (
          <>
            <input
              type="text"
              name="card_holder_name"
              placeholder="Card Holder Name"
              value={formData.card_holder_name}
              onChange={handleChange}
              style={inputStyle}
            />

            <select
              name="card_type"
              value={formData.card_type}
              onChange={handleChange}
              style={inputStyle}
            >
              <option value="visa">Visa</option>
              <option value="mastercard">Mastercard</option>
              <option value="amex">American Express</option>
            </select>

            <input
              type="text"
              name="card_last4"
              placeholder="Last 4 Digits"
              maxLength="4"
              value={formData.card_last4}
              onChange={handleChange}
              style={inputStyle}
            />

            <div style={rowStyle}>
              <input
                type="text"
                name="expiry_month"
                placeholder="MM"
                maxLength="2"
                value={formData.expiry_month}
                onChange={handleChange}
                style={smallInputStyle}
              />

              <input
                type="text"
                name="expiry_year"
                placeholder="YYYY"
                maxLength="4"
                value={formData.expiry_year}
                onChange={handleChange}
                style={smallInputStyle}
              />
            </div>
          </>
        )}

        {formData.payment_type === "bank_account" && (
          <>
            <input
              type="text"
              name="bank_name"
              placeholder="Bank Name"
              value={formData.bank_name}
              onChange={handleChange}
              style={inputStyle}
            />

            <input
              type="text"
              name="account_reference"
              placeholder="Account Number / Reference"
              value={formData.account_reference}
              onChange={handleChange}
              style={inputStyle}
            />
          </>
        )}

        {["bankily", "masrvi", "seddad"].includes(formData.payment_type) && (
          <>
            <input
              type="text"
              name="phone_number"
              placeholder="Phone Number"
              value={formData.phone_number}
              onChange={handleChange}
              style={inputStyle}
            />

            <input
              type="text"
              name="wallet_id"
              placeholder="Wallet ID / Optional Reference"
              value={formData.wallet_id}
              onChange={handleChange}
              style={inputStyle}
            />
          </>
        )}

        {formData.payment_type === "cash" && (
          <div style={cashBoxStyle}>
            Cash selected. Rider will pay the driver directly.
          </div>
        )}

        <label style={checkboxRowStyle}>
          <input
            type="checkbox"
            name="is_default"
            checked={formData.is_default}
            onChange={handleChange}
          />
          Set as default payment method
        </label>

        <button
          onClick={savePaymentMethod}
          disabled={loading}
          style={buttonStyle}
        >
          {loading ? "Saving..." : "Save Payment Method"}
        </button>
      </div>
    </div>
  );
}

const containerStyle = {
  marginTop: "25px",
};

const titleStyle = {
  color: "#111827",
  marginBottom: "14px",
};

const cardStyle = {
  background: "#111827",
  padding: "20px",
  borderRadius: "16px",
  maxWidth: "500px",
};

const labelStyle = {
  color: "white",
  fontWeight: "bold",
  display: "block",
  marginBottom: "8px",
};

const inputStyle = {
  width: "100%",
  padding: "14px",
  marginBottom: "14px",
  borderRadius: "12px",
  border: "none",
};

const rowStyle = {
  display: "flex",
  gap: "12px",
};

const smallInputStyle = {
  flex: 1,
  padding: "14px",
  borderRadius: "12px",
  border: "none",
};

const checkboxRowStyle = {
  color: "white",
  display: "flex",
  alignItems: "center",
  gap: "8px",
  marginTop: "14px",
};

const cashBoxStyle = {
  background: "#fef3c7",
  color: "#92400e",
  padding: "14px",
  borderRadius: "12px",
  marginBottom: "14px",
  fontWeight: "bold",
};

const buttonStyle = {
  width: "100%",
  marginTop: "18px",
  padding: "14px",
  border: "none",
  borderRadius: "12px",
  background: "#16a34a",
  color: "white",
  fontWeight: "bold",
  cursor: "pointer",
};

export default AddPaymentMethod;
