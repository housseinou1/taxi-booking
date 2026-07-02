import React, { useState } from "react";

import {
  confirmPickupByCustomer,
  reportDeliveryProblem,
  triggerDeliverySos,
} from "./securityApi";

export default function DeliverySafetyPanel({ delivery, onAction }) {
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [reportText, setReportText] = useState("");
  const [showReport, setShowReport] = useState(false);

  if (!delivery?.id) return null;

  const active = ["accepted", "courier_arriving", "picked_up", "in_transit", "delivering"].includes(
    delivery.status,
  );
  const canConfirmPickup = ["accepted", "courier_arriving"].includes(delivery.status);

  const getPosition = () =>
    new Promise((resolve) => {
      if (!navigator.geolocation) return resolve({});
      navigator.geolocation.getCurrentPosition(
        ({ coords }) =>
          resolve({
            latitude: coords.latitude,
            longitude: coords.longitude,
            accuracy: coords.accuracy,
          }),
        () => resolve({}),
        { enableHighAccuracy: true, timeout: 8000 },
      );
    });

  const handleSos = async () => {
    if (!window.confirm("Send emergency SOS to Yala safety team?")) return;
    setBusy("sos");
    setMessage("");
    try {
      const position = await getPosition();
      await triggerDeliverySos(delivery.id, {
        description: "Emergency SOS during delivery",
        ...position,
      });
      setMessage("SOS sent. Safety team has been notified.");
      onAction?.("sos");
    } catch (err) {
      setMessage(err.message || "Could not send SOS.");
    } finally {
      setBusy("");
    }
  };

  const handleReport = async () => {
    if (!reportText.trim()) return;
    setBusy("report");
    setMessage("");
    try {
      const position = await getPosition();
      await reportDeliveryProblem(delivery.id, {
        incident_type: "delivery_problem",
        description: reportText.trim(),
        severity: "medium",
        ...position,
      });
      setMessage("Problem reported. Our team will follow up.");
      setReportText("");
      setShowReport(false);
      onAction?.("report");
    } catch (err) {
      setMessage(err.message || "Could not submit report.");
    } finally {
      setBusy("");
    }
  };

  const handleConfirmPickup = async () => {
    setBusy("pickup");
    setMessage("");
    try {
      await confirmPickupByCustomer(delivery.id);
      setMessage("Pickup confirmed. Courier can collect your package.");
      onAction?.("pickup_confirmed");
    } catch (err) {
      setMessage(err.message || "Could not confirm pickup.");
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="delivery-uber__safety-panel">
      <h4>Safety</h4>
      {message ? <p className="delivery-uber-trip__notes">{message}</p> : null}

      {canConfirmPickup ? (
        <button
          type="button"
          className="delivery-uber__btn delivery-uber__btn--secondary"
          disabled={!!busy}
          onClick={handleConfirmPickup}
        >
          {busy === "pickup" ? "Confirming..." : "Confirm pickup (no PIN)"}
        </button>
      ) : null}

      {active ? (
        <>
          <button
            type="button"
            className="delivery-uber__btn delivery-uber__btn--danger"
            disabled={!!busy}
            onClick={handleSos}
          >
            {busy === "sos" ? "Sending SOS..." : "🆘 Emergency SOS"}
          </button>
          <button
            type="button"
            className="delivery-uber__btn delivery-uber__btn--secondary"
            disabled={!!busy}
            onClick={() => setShowReport((v) => !v)}
          >
            Report a problem
          </button>
        </>
      ) : null}

      {showReport ? (
        <div className="delivery-uber-trip__pickup-proof">
          <textarea
            value={reportText}
            onChange={(e) => setReportText(e.target.value)}
            placeholder="Describe the issue..."
            rows={3}
          />
          <button
            type="button"
            className="delivery-uber__btn"
            disabled={busy === "report" || !reportText.trim()}
            onClick={handleReport}
          >
            {busy === "report" ? "Submitting..." : "Submit report"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
