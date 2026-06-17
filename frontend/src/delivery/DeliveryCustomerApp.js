import React, { useCallback, useEffect, useMemo, useState } from "react";

import { API_URL } from "../apiConfig";
import { apiRequest, DeliveryCard, DeliveryHeader } from "./DeliveryShared";
import DeliveryTracking from "./DeliveryTracking";
import "./Delivery.css";

const SERVICE_CATEGORIES = [
  { key: "food", label: "Food", icon: "🍕" },
  { key: "package", label: "Package", icon: "📦" },
  { key: "document", label: "Document", icon: "📄" },
  { key: "pharmacy", label: "Pharmacy", icon: "💊" },
  { key: "shopping", label: "Shopping", icon: "🛒" },
];

const initialForm = {
  pickup: "",
  destination: "",
  recipient_name: "",
  recipient_phone: "",
  package_type: "small",
  package_description: "",
  distance_km: "5",
  service_category: "package",
  is_fragile: false,
  is_scheduled: false,
  scheduled_pickup_at: "",
  restaurant_name: "",
  preparation_time_minutes: "",
  prescription_reference: "",
  is_temperature_sensitive: false,
  shopping_list: "",
  max_budget_mru: "",
  customer_notes: "",
};

const emptyStop = { address: "", recipient_name: "", recipient_phone: "", latitude: 18.08, longitude: -15.97 };

export default function DeliveryCustomerApp() {
  const [form, setForm] = useState(initialForm);
  const [stops, setStops] = useState([]);
  const [deliveries, setDeliveries] = useState([]);
  const [recipientCodes, setRecipientCodes] = useState({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [trackingId, setTrackingId] = useState(null);

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
    () => deliveries.find((d) => !["delivered", "cancelled"].includes(d.status)),
    [deliveries]
  );

  const updateForm = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((prev) => ({ ...prev, [name]: type === "checkbox" ? checked : value }));
  };

  // Multi-stop management
  const addStop = () => {
    if (stops.length < 4) setStops((prev) => [...prev, { ...emptyStop }]);
  };
  const removeStop = (idx) => setStops((prev) => prev.filter((_, i) => i !== idx));
  const updateStop = (idx, field, value) => {
    setStops((prev) => prev.map((s, i) => (i === idx ? { ...s, [field]: value } : s)));
  };

  const submitDelivery = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    setNotice("");
    try {
      const payload = { ...form, stops: stops.length > 0 ? stops : undefined };
      const delivery = await apiRequest(`${API_URL}/deliveries/request/`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setRecipientCodes((prev) => ({ ...prev, [delivery.id]: delivery.recipient_code }));
      setForm(initialForm);
      setStops([]);
      setNotice("Delivery requested! Keep the recipient code private until handoff.");
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

  // Show tracking view
  if (trackingId) {
    return (
      <DeliveryTracking
        deliveryId={trackingId}
        onBack={() => { setTrackingId(null); loadDeliveries(); }}
      />
    );
  }

  return (
    <main className="delivery-shell">
      <DeliveryHeader subtitle="Send packages safely across Mauritania" backPath="/rider-dashboard" />
      <div className="delivery-layout">
        <section className="delivery-panel">
          <h1>Send a delivery</h1>

          {/* Category selector */}
          <div className="delivery-categories">
            {SERVICE_CATEGORIES.map((cat) => (
              <button
                key={cat.key}
                type="button"
                className={`delivery-category-btn ${form.service_category === cat.key ? "active" : ""}`}
                onClick={() => setForm((prev) => ({ ...prev, service_category: cat.key }))}
              >
                <span className="delivery-category-icon">{cat.icon}</span>
                <span>{cat.label}</span>
              </button>
            ))}
          </div>

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
              <label>Distance (km)<input required min="0.1" step="0.1" type="number" name="distance_km" value={form.distance_km} onChange={updateForm} /></label>
            </div>

            {/* Category-specific fields */}
            {form.service_category === "food" && (
              <div className="delivery-form-grid">
                <label>Restaurant name<input name="restaurant_name" value={form.restaurant_name} onChange={updateForm} placeholder="Restaurant name" /></label>
                <label>Prep time (min)<input type="number" name="preparation_time_minutes" value={form.preparation_time_minutes} onChange={updateForm} placeholder="20" /></label>
              </div>
            )}
            {form.service_category === "pharmacy" && (
              <div className="delivery-form-grid">
                <label>Prescription ref<input name="prescription_reference" value={form.prescription_reference} onChange={updateForm} placeholder="Optional" /></label>
                <label className="delivery-checkbox-label">
                  <input type="checkbox" name="is_temperature_sensitive" checked={form.is_temperature_sensitive} onChange={updateForm} />
                  Temperature sensitive
                </label>
              </div>
            )}
            {form.service_category === "shopping" && (
              <>
                <label>Shopping list<textarea name="shopping_list" value={form.shopping_list} onChange={updateForm} placeholder="List items needed..." /></label>
                <label>Max budget (MRU)<input type="number" name="max_budget_mru" value={form.max_budget_mru} onChange={updateForm} placeholder="5000" /></label>
              </>
            )}

            <label>Package details<textarea name="package_description" value={form.package_description} onChange={updateForm} placeholder="Color, size, handling..." /></label>

            {/* Options row */}
            <div className="delivery-options-row">
              <label className="delivery-checkbox-label">
                <input type="checkbox" name="is_fragile" checked={form.is_fragile} onChange={updateForm} />
                Fragile (+30 MRU)
              </label>
              <label className="delivery-checkbox-label">
                <input type="checkbox" name="is_scheduled" checked={form.is_scheduled} onChange={updateForm} />
                Schedule for later
              </label>
            </div>

            {form.is_scheduled && (
              <label>Pickup time<input type="datetime-local" name="scheduled_pickup_at" value={form.scheduled_pickup_at} onChange={updateForm} required={form.is_scheduled} /></label>
            )}

            <label>Notes for driver<input name="customer_notes" value={form.customer_notes} onChange={updateForm} placeholder="Any special instructions..." /></label>

            {/* Multi-stop */}
            {stops.length > 0 && (
              <div className="delivery-stops-section">
                <h3>Additional stops ({stops.length}/4)</h3>
                {stops.map((stop, idx) => (
                  <div key={idx} className="delivery-stop-form">
                    <div className="delivery-form-grid">
                      <label>Stop {idx + 1} address<input required value={stop.address} onChange={(e) => updateStop(idx, "address", e.target.value)} /></label>
                      <label>Recipient<input required value={stop.recipient_name} onChange={(e) => updateStop(idx, "recipient_name", e.target.value)} /></label>
                    </div>
                    <div className="delivery-form-grid">
                      <label>Phone<input required value={stop.recipient_phone} onChange={(e) => updateStop(idx, "recipient_phone", e.target.value)} placeholder="+222..." /></label>
                      <button type="button" className="delivery-button delivery-button-danger delivery-button-sm" onClick={() => removeStop(idx)}>Remove</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {stops.length < 4 && (
              <button type="button" className="delivery-button delivery-button-secondary" onClick={addStop}>
                + Add another stop (+25 MRU each)
              </button>
            )}

            <button className="delivery-button delivery-button-gold" disabled={submitting || Boolean(activeDelivery)}>
              {activeDelivery ? "Complete active delivery first" : submitting ? "Requesting..." : "Request delivery"}
            </button>
          </form>
        </section>

        <section className="delivery-panel">
          <h2>Your deliveries</h2>
          {loading ? <div className="delivery-empty">Loading...</div> : (
            <div className="delivery-list">
              {deliveries.length === 0 && <div className="delivery-empty">No deliveries yet.</div>}
              {deliveries.map((delivery) => (
                <DeliveryCard key={delivery.id} delivery={delivery}>
                  {delivery.service_category && delivery.service_category !== "package" && (
                    <span className="delivery-category-tag">{delivery.service_category}</span>
                  )}
                  {delivery.driver_name && <p><strong>Driver:</strong> {delivery.driver_name} · {delivery.vehicle} · {delivery.plate_number}</p>}
                  {recipientCodes[delivery.id] && (
                    <div className="delivery-code">
                      <span className="delivery-muted">Recipient code</span>
                      <strong>{recipientCodes[delivery.id]}</strong>
                    </div>
                  )}
                  {delivery.stops && delivery.stops.length > 0 && (
                    <p className="delivery-muted">{delivery.stops.length} additional stop{delivery.stops.length > 1 ? "s" : ""}</p>
                  )}
                  <div className="delivery-card-actions">
                    {["accepted", "picked_up", "delivering"].includes(delivery.status) && (
                      <button className="delivery-button" onClick={() => setTrackingId(delivery.id)}>Track delivery</button>
                    )}
                    {["requested", "accepted"].includes(delivery.status) && (
                      <button className="delivery-button delivery-button-danger" onClick={() => cancelDelivery(delivery.id)}>Cancel</button>
                    )}
                  </div>
                </DeliveryCard>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
