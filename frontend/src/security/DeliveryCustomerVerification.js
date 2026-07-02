import React, { useCallback, useEffect, useState } from "react";

import { API_URL } from "../apiConfig";
import { apiRequest } from "../delivery/DeliveryShared";
import {
  createSavedAddress,
  deleteSavedAddress,
  getCustomerVerification,
  listSavedAddresses,
  uploadCustomerProfilePhoto,
} from "./securityApi";

export default function DeliveryCustomerVerification({ onClose }) {
  const [verification, setVerification] = useState(null);
  const [addresses, setAddresses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");
  const [newAddress, setNewAddress] = useState({ label: "Home", address: "" });
  const [phoneCode, setPhoneCode] = useState("");

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [v, a] = await Promise.all([
        getCustomerVerification(),
        listSavedAddresses().catch(() => []),
      ]);
      setVerification(v);
      setAddresses(Array.isArray(a) ? a : []);
    } catch (err) {
      setMessage(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const requestPhoneCode = async () => {
    setBusy("phone");
    try {
      await apiRequest(`${API_URL}/auth/phone/request-code/`, { method: "POST" });
      setMessage("Verification code sent to your phone.");
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy("");
    }
  };

  const verifyPhone = async () => {
    setBusy("verify");
    try {
      await apiRequest(`${API_URL}/auth/phone/verify/`, {
        method: "POST",
        body: JSON.stringify({ code: phoneCode }),
      });
      setMessage("Phone verified.");
      setPhoneCode("");
      await load();
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy("");
    }
  };

  const sendEmailVerification = async () => {
    setBusy("email");
    try {
      await apiRequest(`${API_URL}/auth/email/send-verification/`, { method: "POST" });
      setMessage("Verification email sent. Check your inbox.");
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy("");
    }
  };

  const handlePhoto = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy("photo");
    try {
      await uploadCustomerProfilePhoto(file);
      setMessage("Profile photo updated.");
      await load();
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy("");
    }
  };

  const addAddress = async () => {
    if (!newAddress.address.trim()) return;
    setBusy("address");
    try {
      await createSavedAddress(newAddress);
      setNewAddress({ label: "Home", address: "" });
      await load();
      setMessage("Address saved.");
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy("");
    }
  };

  const removeAddress = async (id) => {
    try {
      await deleteSavedAddress(id);
      await load();
    } catch (err) {
      setMessage(err.message);
    }
  };

  if (loading) return <p>Loading verification status...</p>;

  return (
    <div className="delivery-uber__verification">
      <div className="delivery-uber__verification-header">
        <h3>Account verification</h3>
        {onClose ? (
          <button type="button" className="delivery-uber__round-btn" onClick={onClose}>
            ✕
          </button>
        ) : null}
      </div>

      {message ? <p className="delivery-uber-trip__notes">{message}</p> : null}

      <ul className="delivery-uber__checklist">
        <li className={verification?.phone_verified ? "is-done" : ""}>
          Phone verification
          {!verification?.phone_verified ? (
            <div className="delivery-uber-offer__actions">
              <button type="button" disabled={busy === "phone"} onClick={requestPhoneCode}>
                Send code
              </button>
              <input
                value={phoneCode}
                onChange={(e) => setPhoneCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="6-digit code"
                inputMode="numeric"
              />
              <button type="button" disabled={busy === "verify" || phoneCode.length < 4} onClick={verifyPhone}>
                Verify
              </button>
            </div>
          ) : (
            <span> ✓</span>
          )}
        </li>
        <li className={verification?.email_verified ? "is-done" : ""}>
          Email verification
          {!verification?.email_verified ? (
            <button type="button" disabled={busy === "email"} onClick={sendEmailVerification}>
              Resend email
            </button>
          ) : (
            <span> ✓</span>
          )}
        </li>
        <li className={verification?.profile_photo_uploaded ? "is-done" : ""}>
          Profile photo (optional)
          <input type="file" accept="image/*" onChange={handlePhoto} disabled={busy === "photo"} />
        </li>
      </ul>

      <h4>Saved addresses</h4>
      <ul className="delivery-uber__address-list">
        {addresses.map((item) => (
          <li key={item.id}>
            <strong>{item.label || "Address"}</strong>
            <span>{item.address}</span>
            <button type="button" onClick={() => removeAddress(item.id)}>
              Remove
            </button>
          </li>
        ))}
      </ul>
      <div className="delivery-uber-offer__actions">
        <input
          value={newAddress.label}
          onChange={(e) => setNewAddress((p) => ({ ...p, label: e.target.value }))}
          placeholder="Label"
        />
        <input
          value={newAddress.address}
          onChange={(e) => setNewAddress((p) => ({ ...p, address: e.target.value }))}
          placeholder="Full address"
        />
        <button type="button" disabled={busy === "address"} onClick={addAddress}>
          Save address
        </button>
      </div>
    </div>
  );
}
