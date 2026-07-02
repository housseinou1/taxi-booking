import React, { useState } from "react";

import { API_URL } from "../../apiConfig";
import { apiRequest } from "../DeliveryShared";
import { CHAT_REPORT_REASONS } from "../deliveryChatUtils";

export default function DeliveryChatReportMenu({ deliveryId, messageId = null, onReported, onClose }) {
  const [reason, setReason] = useState(CHAT_REPORT_REASONS[0].key);
  const [details, setDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    if (!deliveryId || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      await apiRequest(`${API_URL}/deliveries/${deliveryId}/messages/report/`, {
        method: "POST",
        body: JSON.stringify({
          reason,
          details: details.trim(),
          message_id: messageId,
        }),
      });
      onReported?.();
      onClose?.();
    } catch (err) {
      setError(err.message || "Could not submit report.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="dcc-report" role="dialog" aria-label="Report message">
      <div className="dcc-report__card">
        <strong>Report {messageId ? "message" : "chat"}</strong>
        <p>Yala support will review this only if there is a dispute, safety issue, or refund case.</p>

        <label className="dcc-report__label" htmlFor="dcc-report-reason">
          Reason
        </label>
        <select
          id="dcc-report-reason"
          className="dcc-report__select"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        >
          {CHAT_REPORT_REASONS.map((item) => (
            <option key={item.key} value={item.key}>
              {item.label}
            </option>
          ))}
        </select>

        <label className="dcc-report__label" htmlFor="dcc-report-details">
          Details (optional)
        </label>
        <textarea
          id="dcc-report-details"
          className="dcc-report__textarea"
          rows={3}
          maxLength={1000}
          value={details}
          onChange={(event) => setDetails(event.target.value)}
          placeholder="What happened?"
        />

        {error ? <p className="dcc-report__error">{error}</p> : null}

        <div className="dcc-report__actions">
          <button type="button" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button type="button" className="is-primary" onClick={submit} disabled={submitting}>
            {submitting ? "Sending…" : "Submit report"}
          </button>
        </div>
      </div>
    </div>
  );
}
