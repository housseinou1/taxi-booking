import React, { useState } from "react";

import { MERCHANT_TYPES, BUSINESS_TYPES, merchantRegister } from "./merchantApi";
import "../delivery/delivery-uber.css";

const initialForm = {
  email: "",
  password: "",
  first_name: "",
  last_name: "",
  business_name: "",
  owner_name: "",
  phone_number: "",
  address: "",
  city: "Nouakchott",
  merchant_type: "restaurant",
  business_type: "restaurant",
  bank_account: "",
  mobile_wallet: "",
  payout_method: "mobile_wallet",
};

export default function MerchantRegister({ onSuccess }) {
  const [form, setForm] = useState(initialForm);
  const [files, setFiles] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const update = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  const handleSubmit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const payload = new FormData();
      Object.entries(form).forEach(([key, value]) => payload.append(key, value));
      Object.entries(files).forEach(([key, file]) => {
        if (file) payload.append(key, file);
      });
      const data = await merchantRegister(payload);
      localStorage.setItem("access", data.access);
      localStorage.setItem("refresh", data.refresh);
      setMessage("Registration submitted. Your account is pending approval.");
      if (onSuccess) onSuccess(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="delivery-uber__panel" style={{ maxWidth: 640, margin: "0 auto" }}>
      <h2 style={{ marginBottom: 8 }}>Join Yala Delivery as a Merchant</h2>
      <p className="delivery-uber__muted">Register your store to sell on Yala Delivery.</p>
      {error ? <div className="delivery-uber__toast is-error">{error}</div> : null}
      {message ? <div className="delivery-uber__toast">{message}</div> : null}
      <form className="delivery-uber__form" onSubmit={handleSubmit}>
        <fieldset>
          <legend>Account</legend>
          <label>Email<input required type="email" value={form.email} onChange={(e) => update("email", e.target.value)} /></label>
          <label>Password<input required type="password" minLength={8} value={form.password} onChange={(e) => update("password", e.target.value)} /></label>
          <label>First name<input required value={form.first_name} onChange={(e) => update("first_name", e.target.value)} /></label>
          <label>Last name<input required value={form.last_name} onChange={(e) => update("last_name", e.target.value)} /></label>
        </fieldset>
        <fieldset>
          <legend>Business</legend>
          <label>Business name<input required value={form.business_name} onChange={(e) => update("business_name", e.target.value)} /></label>
          <label>Owner name<input required value={form.owner_name} onChange={(e) => update("owner_name", e.target.value)} /></label>
          <label>Phone<input required value={form.phone_number} onChange={(e) => update("phone_number", e.target.value)} /></label>
          <label>Address<textarea required value={form.address} onChange={(e) => update("address", e.target.value)} /></label>
          <label>City<input required value={form.city} onChange={(e) => update("city", e.target.value)} /></label>
          <label>
            Merchant type
            <select value={form.merchant_type} onChange={(e) => update("merchant_type", e.target.value)}>
              {MERCHANT_TYPES.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
          </label>
          <label>
            Business type
            <select value={form.business_type} onChange={(e) => update("business_type", e.target.value)}>
              {BUSINESS_TYPES.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
          </label>
        </fieldset>
        <fieldset>
          <legend>Documents</legend>
          {["business_license", "national_id", "tax_document", "logo", "store_cover_image"].map((field) => (
            <label key={field}>
              {field.replace(/_/g, " ")}
              <input type="file" onChange={(e) => setFiles((prev) => ({ ...prev, [field]: e.target.files?.[0] || null }))} />
            </label>
          ))}
        </fieldset>
        <fieldset>
          <legend>Payment</legend>
          <label>Bank account<input value={form.bank_account} onChange={(e) => update("bank_account", e.target.value)} /></label>
          <label>Mobile wallet<input value={form.mobile_wallet} onChange={(e) => update("mobile_wallet", e.target.value)} /></label>
          <label>
            Payout method
            <select value={form.payout_method} onChange={(e) => update("payout_method", e.target.value)}>
              <option value="mobile_wallet">Mobile Wallet</option>
              <option value="bank_account">Bank Account</option>
            </select>
          </label>
        </fieldset>
        <button type="submit" className="delivery-uber__primary-btn" disabled={busy}>
          {busy ? "Submitting..." : "Register merchant"}
        </button>
      </form>
    </div>
  );
}
