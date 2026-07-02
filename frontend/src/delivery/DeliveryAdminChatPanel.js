import React, { useCallback, useEffect, useState } from "react";

import { API_URL } from "../apiConfig";
import { apiRequest } from "./DeliveryShared";
import { formatChatTime } from "./deliveryChatUtils";

function caseReasonLabel(reason) {
  return String(reason || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export default function DeliveryAdminChatPanel({ initialDeliveryId = null }) {
  const [cases, setCases] = useState([]);
  const [openReports, setOpenReports] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [history, setHistory] = useState(null);
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [error, setError] = useState("");
  const [expandedImage, setExpandedImage] = useState(null);

  const loadCases = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await apiRequest(`${API_URL}/deliveries/admin/chat/cases/`);
      setCases(Array.isArray(data?.cases) ? data.cases : []);
      setOpenReports(Array.isArray(data?.open_reports) ? data.open_reports : []);
    } catch (err) {
      setError(err.message || "Could not load chat cases.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadHistory = useCallback(async (deliveryId) => {
    if (!deliveryId) return;
    setHistoryLoading(true);
    setError("");
    try {
      const data = await apiRequest(`${API_URL}/deliveries/admin/chat/${deliveryId}/`);
      setHistory(data);
      setSelectedId(deliveryId);
    } catch (err) {
      setError(err.message || "Could not load chat history.");
      setHistory(null);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCases();
  }, [loadCases]);

  useEffect(() => {
    if (initialDeliveryId) {
      loadHistory(initialDeliveryId);
    }
  }, [initialDeliveryId, loadHistory]);

  const hideMessage = async (messageId) => {
    const reason = window.prompt("Reason for hiding this message?", "Abusive content");
    if (!reason) return;
    try {
      await apiRequest(`${API_URL}/deliveries/admin/chat/messages/${messageId}/hide/`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      });
      await loadHistory(selectedId);
      await loadCases();
    } catch (err) {
      setError(err.message);
    }
  };

  const warnUser = async (target) => {
    const reason = window.prompt(`Warning reason for ${target}?`, "Chat policy violation");
    if (!reason) return;
    try {
      await apiRequest(`${API_URL}/deliveries/admin/chat/${selectedId}/warn/`, {
        method: "POST",
        body: JSON.stringify({ target, reason }),
      });
      window.alert("Warning recorded.");
    } catch (err) {
      setError(err.message);
    }
  };

  const suspendCourier = async () => {
    const reason = window.prompt("Suspension reason?", "Repeated chat abuse");
    if (!reason) return;
    try {
      await apiRequest(`${API_URL}/deliveries/admin/chat/${selectedId}/suspend/`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      });
      window.alert("Courier suspended.");
      await loadCases();
    } catch (err) {
      setError(err.message);
    }
  };

  const reviewReport = async (reportId, action) => {
    try {
      await apiRequest(`${API_URL}/deliveries/admin/chat/reports/${reportId}/review/`, {
        method: "POST",
        body: JSON.stringify({ action }),
      });
      await loadCases();
      if (selectedId) await loadHistory(selectedId);
    } catch (err) {
      setError(err.message);
    }
  };

  const attachReportToDispute = async (reportId) => {
    const disputeId = history?.disputes?.[0]?.id;
    if (!disputeId) {
      window.alert("No dispute found on this delivery.");
      return;
    }
    try {
      await apiRequest(`${API_URL}/deliveries/admin/chat/${selectedId}/attach-dispute/`, {
        method: "POST",
        body: JSON.stringify({ report_id: reportId, dispute_id: disputeId }),
      });
      window.alert("Report attached to dispute.");
      await loadHistory(selectedId);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="delivery-admin-chat">
      {error ? <div className="delivery-admin-uber__error">{error}</div> : null}

      <div className="delivery-admin-chat__layout">
        <aside className="delivery-admin-chat__cases">
          <div className="delivery-admin-chat__cases-head">
            <h3>Chat review queue</h3>
            <button type="button" onClick={loadCases}>
              Refresh
            </button>
          </div>

          {loading ? <p className="delivery-admin-uber__empty">Loading cases…</p> : null}
          {!loading && cases.length === 0 ? (
            <p className="delivery-admin-uber__empty">No chat cases requiring review.</p>
          ) : null}

          {cases.map((item) => (
            <button
              key={item.delivery_id}
              type="button"
              className={`delivery-admin-chat__case ${selectedId === item.delivery_id ? "is-active" : ""}`}
              onClick={() => loadHistory(item.delivery_id)}
            >
              <strong>Delivery #{item.delivery_id}</strong>
              <span>{item.customer_name || item.customer_email} ↔ {item.courier_name || "Courier"}</span>
              <span className="delivery-admin-chat__case-tags">
                {item.case_reasons.map((reason) => (
                  <em key={reason}>{caseReasonLabel(reason)}</em>
                ))}
              </span>
              {item.open_reports > 0 ? <span className="delivery-admin-chat__badge">{item.open_reports} reports</span> : null}
            </button>
          ))}

          {openReports.length > 0 ? (
            <div className="delivery-admin-chat__reports-list">
              <h4>Open reports</h4>
              {openReports.map((report) => (
                <button
                  key={report.id}
                  type="button"
                  className="delivery-admin-chat__report-item"
                  onClick={() => loadHistory(report.delivery_id)}
                >
                  #{report.id} · {caseReasonLabel(report.reason)} · delivery #{report.delivery_id}
                </button>
              ))}
            </div>
          ) : null}
        </aside>

        <section className="delivery-admin-chat__thread">
          {!selectedId ? (
            <p className="delivery-admin-uber__empty">Select a delivery to review chat history.</p>
          ) : null}

          {historyLoading ? <p className="delivery-admin-uber__empty">Loading chat…</p> : null}

          {history?.case ? (
            <>
              <header className="delivery-admin-chat__thread-head">
                <div>
                  <h3>Delivery #{history.case.delivery_id}</h3>
                  <p>
                    {history.case.customer_name || history.case.customer_email} ↔{" "}
                    {history.case.courier_name || history.case.courier_email || "Courier"}
                  </p>
                  <p>
                    {history.case.pickup} → {history.case.destination}
                  </p>
                </div>
                <div className="delivery-admin-chat__admin-actions">
                  <button type="button" onClick={() => warnUser("courier")}>
                    Warn courier
                  </button>
                  <button type="button" onClick={() => warnUser("customer")}>
                    Warn customer
                  </button>
                  <button type="button" className="is-danger" onClick={suspendCourier}>
                    Suspend courier
                  </button>
                </div>
              </header>

              {history.reports?.length ? (
                <div className="delivery-admin-chat__reports-panel">
                  <h4>Safety reports</h4>
                  {history.reports.map((report) => (
                    <article key={report.id} className="delivery-admin-chat__report-card">
                      <strong>{caseReasonLabel(report.reason)}</strong>
                      <p>{report.details || "No details provided."}</p>
                      <small>
                        By {report.reported_by}
                        {report.reported_user ? ` · About ${report.reported_user}` : ""}
                      </small>
                      {report.status === "open" ? (
                        <div className="delivery-admin-chat__report-actions">
                          <button type="button" onClick={() => reviewReport(report.id, "reviewed")}>
                            Mark reviewed
                          </button>
                          <button type="button" onClick={() => reviewReport(report.id, "dismissed")}>
                            Dismiss
                          </button>
                          <button type="button" onClick={() => attachReportToDispute(report.id)}>
                            Attach to dispute
                          </button>
                        </div>
                      ) : (
                        <span className="delivery-admin-chat__status">{report.status}</span>
                      )}
                    </article>
                  ))}
                </div>
              ) : null}

              <div className="delivery-admin-chat__messages">
                {history.messages?.map((msg) => (
                  <article
                    key={msg.id}
                    className={`delivery-admin-chat__message ${
                      msg.sender_role === "courier" ? "is-courier" : "is-customer"
                    } ${msg.is_hidden ? "is-hidden" : ""}`}
                  >
                    <header>
                      <strong>{msg.sender_name}</strong>
                      <span>{msg.sender_role}</span>
                      <time>{formatChatTime(msg.created_at)}</time>
                      <span className={msg.is_read ? "is-read" : ""}>{msg.is_read ? "Read" : "Unread"}</span>
                    </header>
                    {msg.image_url ? (
                      <button type="button" className="delivery-admin-chat__image" onClick={() => setExpandedImage(msg.image_url)}>
                        <img src={msg.image_url} alt="Chat attachment" loading="lazy" />
                      </button>
                    ) : null}
                    {msg.message ? <p>{msg.message}</p> : null}
                    {msg.report_count > 0 ? <small>{msg.report_count} report(s)</small> : null}
                    {!msg.is_hidden ? (
                      <button type="button" className="delivery-admin-chat__hide" onClick={() => hideMessage(msg.id)}>
                        Hide message
                      </button>
                    ) : (
                      <small className="delivery-admin-chat__hidden-note">Hidden: {msg.hidden_reason}</small>
                    )}
                  </article>
                ))}
              </div>
            </>
          ) : null}
        </section>
      </div>

      {expandedImage ? (
        <div className="dcc-lightbox" onClick={() => setExpandedImage(null)} role="presentation">
          <button type="button" className="dcc-lightbox__close" aria-label="Close">
            ×
          </button>
          <img src={expandedImage} alt="Chat attachment" onClick={(event) => event.stopPropagation()} />
        </div>
      ) : null}
    </div>
  );
}
