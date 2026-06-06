import React, { useCallback, useEffect, useMemo, useState } from "react";

import { API_URL } from "../apiConfig";
import { apiRequest, DeliveryCard, DeliveryHeader } from "./DeliveryShared";
import "./Delivery.css";

const initialForm = {
  pickup: "",
  destination: "",
  recipient_name: "",
  recipient_phone: "",
  package_type: "small",
  package_description: "",
  distance_km: "5",
};

export default function DeliveryCustomerApp() {
  const [form, setForm] = useState(initialForm);
  const [deliveries, setDeliveries] = useState([]);
  const [recipientCodes, setRecipientCodes] = useState({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const loadDeliveries = useCallback(async () => {
    try {
      setLoading(true);
      setDeliveries(await apiRequest(`${API_URL}/deliveries/mine/`));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDeliveries();
  }, [loadDeliveries]);

  const activeDelivery = useMemo(
    () => deliveries.find((delivery) => !["delivered", "cancelled"].includes(delivery.status)),
    [deliveries]
  );

  const updateForm = (event) => {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  };

  const submitDelivery = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    setNotice("");
    try {
      const delivery = await apiRequest(`${API_URL}/deliveries/request/`, {
        method: "POST",
        body: JSON.stringify(form),
      });
      setRecipientCodes((current) => ({ ...current, [delivery.id]: delivery.recipient_code }));
      setForm(initialForm);
      setNotice("Delivery requested. Keep the recipient code private until handoff.");
      await loadDeliveries();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const cancelDelivery = async (id) => {
    try {
      await apiRequest(`${API_URL}/deliveries/${id}/cancel/`, { method: "POST" });
      setNotice("Delivery cancelled.");
      await loadDeliveries();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <main className="delivery-shell">
      <DeliveryHeader subtitle="Send packages safely across Mauritania" backPath="/rider-dashboard" />
      <div className="delivery-layout">
        <section className="delivery-panel">
          <h1>Send a package</h1>
          <p className="delivery-panel-copy">Enter the handoff details. A verified Yala driver will accept the request.</p>
          {notice && <p className="delivery-notice">{notice}</p>}
          {error && <p className="delivery-notice delivery-notice-error">{error}</p>}
          <form className="delivery-form" onSubmit={submitDelivery}>
            <label>Pickup address<input required name="pickup" value={form.pickup} onChange={updateForm} placeholder="Tevragh Zeina, Nouakchott" /></label>
            <label>Destination<input required name="destination" value={form.destination} onChange={updateForm} placeholder="Ksar, Nouakchott" /></label>
            <div className="delivery-form-grid">
              <label>Recipient name<input required name="recipient_name" value={form.recipient_name} onChange={updateForm} /></label>
              <label>Recipient phone<input required name="recipient_phone" value={form.recipient_phone} onChange={updateForm} placeholder="+222..." /></label>
            </div>
            <div className="delivery-form-grid">
              <label>Package type
                <select name="package_type" value={form.package_type} onChange={updateForm}>
                  <option value="document">Document</option>
                  <option value="small">Small package</option>
                  <option value="medium">Medium package</option>
                  <option value="large">Large package</option>
                </select>
              </label>
              <label>Estimated distance (km)<input required min="0.1" step="0.1" type="number" name="distance_km" value={form.distance_km} onChange={updateForm} /></label>
            </div>
            <label>Package details<textarea name="package_description" value={form.package_description} onChange={updateForm} placeholder="Color, size, handling instructions..." /></label>
            <button className="delivery-button delivery-button-gold" disabled={submitting || Boolean(activeDelivery)}>
              {activeDelivery ? "Complete active delivery first" : submitting ? "Requesting..." : "Request delivery"}
            </button>
          </form>
        </section>

        <section className="delivery-panel">
          <h2>Your deliveries</h2>
          <p className="delivery-panel-copy">Track the driver and share the four-digit confirmation code only with the recipient.</p>
          {loading ? <div className="delivery-empty">Loading deliveries...</div> : (
            <div className="delivery-list">
              {deliveries.length === 0 && <div className="delivery-empty">No delivery requests yet.</div>}
              {deliveries.map((delivery) => (
                <DeliveryCard key={delivery.id} delivery={delivery}>
                  {delivery.driver_name && <p><strong>Driver:</strong> {delivery.driver_name} · {delivery.vehicle} · {delivery.plate_number}</p>}
                  {recipientCodes[delivery.id] && (
                    <div className="delivery-code">
                      <span className="delivery-muted">Recipient confirmation code</span>
                      <strong>{recipientCodes[delivery.id]}</strong>
                    </div>
                  )}
                  {["requested", "accepted"].includes(delivery.status) && (
                    <div className="delivery-card-actions">
                      <button className="delivery-button delivery-button-danger" onClick={() => cancelDelivery(delivery.id)}>Cancel delivery</button>
                    </div>
                  )}
                </DeliveryCard>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
