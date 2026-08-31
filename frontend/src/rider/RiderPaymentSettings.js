import React, { useEffect, useState } from "react";
import {
  fetchSavedPaymentMethods,
  setDefaultPaymentMethod,
} from "./utils/riderProfileSettingsApi";
import {
  getPaymentMethodLabel,
  readStoredPaymentMethod,
  storePaymentMethod,
} from "./utils/paymentMethods";

export default function RiderPaymentSettings() {
  const [methods, setMethods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [bookingDefault, setBookingDefault] = useState(() => readStoredPaymentMethod());

  useEffect(() => {
    fetchSavedPaymentMethods()
      .then((data) => setMethods(data))
      .catch((err) => setError(err.message || "Could not load payment methods."))
      .finally(() => setLoading(false));
  }, []);

  const handleSetDefault = async (method) => {
    setNotice("");
    try {
      await setDefaultPaymentMethod(method);
      storePaymentMethod(method.payment_type);
      setBookingDefault(method.payment_type);
      const refreshed = await fetchSavedPaymentMethods();
      setMethods(refreshed);
      setNotice(`${getPaymentMethodLabel(method.payment_type)} is now your default.`);
    } catch (err) {
      setError(err.response?.data?.error || err.message || "Could not update default method.");
    }
  };

  if (loading) return <p role="status">Loading payment settings...</p>;

  return (
    <section className="rider-payment-settings" aria-label="Payment settings">
      <div className="rider-payment-settings__header">
        <h2>Payment settings</h2>
        <p>Default for new rides: <strong>{getPaymentMethodLabel(bookingDefault)}</strong></p>
      </div>

      {error ? <p role="alert">{error}</p> : null}
      {notice ? <p role="status">{notice}</p> : null}

      {methods.length === 0 ? (
        <p>No saved payment methods yet. <button type="button" onClick={() => { window.location.href = "/payment-setup"; }}>Add one</button></p>
      ) : (
        <ul className="rider-payment-settings__list">
          {methods.map((method) => (
            <li key={method.id}>
              <div>
                <strong>{method.display_name || getPaymentMethodLabel(method.payment_type)}</strong>
                <span>{method.is_default ? "Default" : getPaymentMethodLabel(method.payment_type)}</span>
              </div>
              {!method.is_default ? (
                <button type="button" onClick={() => handleSetDefault(method)}>Set default</button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <div className="rider-payment-settings__links">
        <button type="button" onClick={() => { window.location.href = "/payment-setup"; }}>Manage saved methods</button>
        <button type="button" onClick={() => { window.location.href = "/wallet"; }}>Open wallet</button>
      </div>
    </section>
  );
}
