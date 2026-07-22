import React, { useState } from "react";

import { submitBetaFeedback } from "../services/betaFeedbackApi";
import "./support-mobile.css";

export default function SupportReportForm({
  appType = "rider",
  category,
  categoryLabel = "",
  onSuccess,
  onCancel,
  referenceLabel = "Reference",
  showSubject = true,
  contextFields = [],
}) {
  const [subject, setSubject] = useState(categoryLabel || "");
  const [message, setMessage] = useState("");
  const [contextValues, setContextValues] = useState({});
  const [screenshot, setScreenshot] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const isEmergency = category === "emergency";

  const updateContext = (key, value) => {
    setContextValues((current) => ({ ...current, [key]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!message.trim()) {
      setError("Please describe the issue.");
      return;
    }

    setSubmitting(true);
    setError("");
    setNotice("");

    try {
      const payload = await submitBetaFeedback({
        category,
        description: message.trim(),
        subject: subject.trim() || categoryLabel,
        appType,
        isEmergency,
        metadata: contextValues,
        screenshot,
        ...contextValues,
      });
      const ref = payload?.reference || "submitted";
      setNotice(`${referenceLabel}: ${ref}`);
      if (onSuccess) onSuccess(payload);
      setMessage("");
      setScreenshot(null);
    } catch (err) {
      setError(err?.response?.data?.detail || "Could not submit report. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className={`support-report-form ${isEmergency ? "support-report-form--emergency" : ""}`} onSubmit={handleSubmit}>
      {isEmergency ? (
        <div className="support-report-form__banner">
          Emergency reports are sent to Yala support immediately. For life-threatening danger, call local emergency services first.
        </div>
      ) : null}

      {showSubject ? (
        <label className="support-report-form__field">
          Subject
          <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder={categoryLabel || "Brief summary"} />
        </label>
      ) : null}

      {contextFields.map((field) => (
        <label key={field.key} className="support-report-form__field">
          {field.label}
          <input
            type={field.type || "text"}
            value={contextValues[field.key] || ""}
            onChange={(e) => updateContext(field.key, e.target.value)}
            placeholder={field.placeholder || ""}
          />
        </label>
      ))}

      <label className="support-report-form__field">
        Details
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={5}
          placeholder="What happened? Include trip/delivery ID if available."
          required
        />
      </label>

      <label className="support-report-form__field">
        Screenshot (optional)
        <input type="file" accept="image/*" onChange={(e) => setScreenshot(e.target.files?.[0] || null)} />
      </label>

      {error ? <div className="support-report-form__error">{error}</div> : null}
      {notice ? <div className="support-report-form__success">{notice}</div> : null}

      <div className="support-report-form__actions">
        {onCancel ? (
          <button type="button" className="support-report-form__btn support-report-form__btn--ghost" onClick={onCancel}>
            Back
          </button>
        ) : null}
        <button type="submit" className="support-report-form__btn" disabled={submitting}>
          {submitting ? "Submitting…" : isEmergency ? "Send Emergency Report" : "Submit Report"}
        </button>
      </div>
    </form>
  );
}
