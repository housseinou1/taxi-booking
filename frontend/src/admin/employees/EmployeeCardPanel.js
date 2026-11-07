import React, { useCallback, useEffect, useRef, useState } from "react";

import {
  StatusChip,
  ConfirmationDialog,
  AuditTimeline,
  InlineError,
  TableSkeleton,
  Modal,
  formatTimestamp,
} from "../components/library";
import {
  fetchCards,
  fetchCardQr,
  fetchCardPdf,
  fetchCeoIdCardSignaturePreview,
  fetchEmployee,
  fetchPhoto,
  fetchSignature,
  issueCard,
  renewCard,
  replaceCard,
  activateCard,
  deactivateCard,
  revokeCard,
  resolveCardDisplayStatus,
} from "./employeesApi";
import MauritaniaFlag from "./MauritaniaFlag";

/**
 * Official company slogan shown at the bottom of the card BACK.
 *
 * The authoritative value for the PDF lives in the backend setting ``YALA_CARD_SLOGAN``; this
 * constant only mirrors it for the on-screen preview, exactly as the contact lines above are
 * mirrored in this preview. Keep the two in step when the slogan changes.
 */
export const CARD_SLOGAN = "YALA TECHNOLOGIES — FAST • SAFE • RELIABLE";

function splitEmployeeName(fullName) {
  const parts = String(fullName || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return { first: "—", last: "—" };
  if (parts.length === 1) return { first: parts[0], last: "—" };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

function dateOnly(iso) {
  if (!iso) return "—";
  const formatted = formatTimestamp(iso);
  return formatted.split(",")[0] || formatted;
}

// Sensitive actions require a confirmation dialog; some accept an optional
// reason. `tier` is which derived tier gates the action.
const ACTIONS = {
  issue: { label: "Issue card", tier: "manage", reason: false, confirmTone: "success" },
  renew: { label: "Renew card", tier: "manage", reason: false, confirmTone: "success" },
  replace: { label: "Replace card", tier: "manage", reason: true, confirmTone: "warning" },
  activate: { label: "Activate", tier: "administer", reason: false, confirmTone: "success" },
  deactivate: { label: "Deactivate", tier: "administer", reason: false, confirmTone: "warning" },
  revoke: { label: "Revoke", tier: "administer", reason: true, confirmTone: "danger" },
};

export default function EmployeeCardPanel({
  employeeNumber,
  canManage,
  canAdminister,
  canViewDob = false,
  notify,
}) {
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(null); // { action, card, reason }
  const [reason, setReason] = useState("");
  const [working, setWorking] = useState(false);
  // Verification QR for the current card (authenticated PNG blob).
  const [qr, setQr] = useState({ loading: false, error: "", url: null });
  const qrUrlRef = useRef(null);
  // Card output: the CR80 PDF (front + back) and the front/back preview modal.
  const [pdf, setPdf] = useState({ loading: false, error: "", url: null });
  const [previewOpen, setPreviewOpen] = useState(false);
  const pdfUrlRef = useRef(null);
  // The photograph gates official card printing: without one the preview shows a
  // clear placeholder and Download/Print stay disabled, because a printed card that
  // cannot identify its holder is not a valid credential.
  const [photo, setPhoto] = useState({ loading: true, url: null });

  // Employee signature (authenticated blob; never a public URL).
  const [signature, setSignature] = useState({ loading: true, url: null });
  const photoUrlRef = useRef(null);
  const signatureUrlRef = useRef(null);
  // Employee record for the card faces (loaded from the backend — never hardcoded).
  const [employee, setEmployee] = useState(null);
  const [ceoSignature, setCeoSignature] = useState({ loading: false, url: null });
  const ceoSigUrlRef = useRef(null);

  const notifyRef = useRef(notify);
  notifyRef.current = notify;

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetchCards(employeeNumber);
      const data = response.data;
      setCards(Array.isArray(data) ? data : data?.results || []);
    } catch (err) {
      if (err?.response?.status === 403) {
        setError("You are not authorized to view ID card history.");
      } else {
        setError(err?.response?.data?.detail || err?.message || "Failed to load cards");
      }
      setCards([]);
    } finally {
      setLoading(false);
    }
  }, [employeeNumber]);

  useEffect(() => {
    load();
  }, [load]);

  // Cards arrive newest-first; the current card is the most recent one.
  const currentCard = cards[0] || null;
  const currentDisplay = currentCard ? resolveCardDisplayStatus(currentCard) : null;

  // Load the current card's verification QR as an authenticated blob. The QR is
  // fetched (not linked) because the endpoint requires the Bearer token; the
  // object URL is revoked whenever the card changes or the panel unmounts.
  useEffect(() => {
    if (!currentCard?.id) {
      if (qrUrlRef.current) {
        URL.revokeObjectURL(qrUrlRef.current);
        qrUrlRef.current = null;
      }
      setQr({ loading: false, error: "", url: null });
      return undefined;
    }

    let active = true;
    setQr({ loading: true, error: "", url: null });
    (async () => {
      try {
        const response = await fetchCardQr(employeeNumber, currentCard.id);
        const url = URL.createObjectURL(response.data);
        if (!active) {
          URL.revokeObjectURL(url);
          return;
        }
        if (qrUrlRef.current) URL.revokeObjectURL(qrUrlRef.current);
        qrUrlRef.current = url;
        setQr({ loading: false, error: "", url });
      } catch (err) {
        if (!active) return;
        setQr({
          loading: false,
          error:
            err?.response?.status === 403
              ? "You are not authorized to view the card QR."
              : err?.response?.data?.detail || "Could not load the card QR code.",
          url: null,
        });
      }
    })();

    return () => {
      active = false;
    };
  }, [employeeNumber, currentCard?.id]);

  useEffect(
    () => () => {
      if (qrUrlRef.current) {
        URL.revokeObjectURL(qrUrlRef.current);
        qrUrlRef.current = null;
      }
      if (pdfUrlRef.current) {
        URL.revokeObjectURL(pdfUrlRef.current);
        pdfUrlRef.current = null;
      }
      if (photoUrlRef.current) {
        URL.revokeObjectURL(photoUrlRef.current);
        photoUrlRef.current = null;
      }
      if (signatureUrlRef.current) {
        URL.revokeObjectURL(signatureUrlRef.current);
        signatureUrlRef.current = null;
      }
      if (ceoSigUrlRef.current) {
        URL.revokeObjectURL(ceoSigUrlRef.current);
        ceoSigUrlRef.current = null;
      }
    },
    []
  );

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const response = await fetchCeoIdCardSignaturePreview();
        const url = URL.createObjectURL(response.data);
        if (!active) {
          URL.revokeObjectURL(url);
          return;
        }
        if (ceoSigUrlRef.current) URL.revokeObjectURL(ceoSigUrlRef.current);
        ceoSigUrlRef.current = url;
        setCeoSignature({ loading: false, url });
      } catch {
        if (active) setCeoSignature({ loading: false, url: null });
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // Load the employee record so the card faces show real backend data (name, employee
  // number, job title, department, employment status) — never sample values.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const response = await fetchEmployee(employeeNumber);
        if (active) setEmployee(response.data || null);
      } catch (err) {
        if (active) setEmployee(null);
      }
    })();
    return () => {
      active = false;
    };
  }, [employeeNumber]);

  // Load the employee signature once (authenticated blob). A missing signature is a normal
  // state, not an error: the card front then states "Signature not provided".
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const response = await fetchSignature(employeeNumber);
        const url = URL.createObjectURL(response.data);
        if (!active) {
          URL.revokeObjectURL(url);
          return;
        }
        if (signatureUrlRef.current) URL.revokeObjectURL(signatureUrlRef.current);
        signatureUrlRef.current = url;
        setSignature({ loading: false, url });
      } catch (err) {
        if (active) setSignature({ loading: false, url: null });
      }
    })();
    return () => {
      active = false;
    };
  }, [employeeNumber]);

  // Load the employee photograph once (authenticated blob) so the preview can show it
  // and so official printing can be gated on its presence.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const response = await fetchPhoto(employeeNumber);
        const url = URL.createObjectURL(response.data);
        if (!active) {
          URL.revokeObjectURL(url);
          return;
        }
        if (photoUrlRef.current) URL.revokeObjectURL(photoUrlRef.current);
        photoUrlRef.current = url;
        setPhoto({ loading: false, url });
      } catch (err) {
        if (active) setPhoto({ loading: false, url: null });
      }
    })();
    return () => {
      active = false;
    };
  }, [employeeNumber]);

  // ── Card output: preview, PDF download, printing ────────────────────────────
  // All three are READ-ONLY: the backend renders the PDF per request and never
  // renews, replaces, activates, deactivates or revokes the card, and never changes
  // the employee record.
  const loadPdf = useCallback(async () => {
    if (!currentCard?.id) return null;
    setPdf({ loading: true, error: "", url: null });
    try {
      const response = await fetchCardPdf(employeeNumber, currentCard.id);
      const url = URL.createObjectURL(response.data);
      if (pdfUrlRef.current) URL.revokeObjectURL(pdfUrlRef.current);
      pdfUrlRef.current = url;
      setPdf({ loading: false, error: "", url });
      return url;
    } catch (err) {
      setPdf({
        loading: false,
        error:
          err?.response?.status === 403
            ? "You are not authorized to generate ID card documents."
            : err?.response?.data?.detail || "Could not generate the ID card PDF.",
        url: null,
      });
      return null;
    }
  }, [employeeNumber, currentCard]);

  const openPreview = useCallback(async () => {
    setPreviewOpen(true);
    if (!pdf.url) await loadPdf();
  }, [pdf.url, loadPdf]);

  const downloadPdf = useCallback(async () => {
    const url = pdf.url || (await loadPdf());
    if (!url) return;
    const link = document.createElement("a");
    link.href = url;
    link.download = `${currentCard?.card_number || "employee"}-id-card.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    notifyRef.current?.({ tone: "success", message: "ID card PDF generated (front + back)." });
  }, [pdf.url, loadPdf, currentCard]);

  const printCard = useCallback(async () => {
    setPreviewOpen(true);
    if (!pdf.url) await loadPdf();
    // Let the true-size card render before the print dialog opens.
    window.setTimeout(() => window.print(), 200);
  }, [pdf.url, loadPdf]);

  const printBlocked = !photo.loading && !photo.url;

  const openAction = (action, card = null) => {
    setReason("");
    setPending({ action, card });
  };

  const runAction = async () => {
    if (!pending) return;
    const { action, card } = pending;
    setWorking(true);
    try {
      if (action === "issue") await issueCard(employeeNumber);
      else if (action === "renew") await renewCard(employeeNumber);
      else if (action === "replace") await replaceCard(employeeNumber, reason ? { reason } : {});
      else if (action === "activate") await activateCard(employeeNumber, card.id);
      else if (action === "deactivate") await deactivateCard(employeeNumber, card.id);
      else if (action === "revoke") await revokeCard(employeeNumber, card.id, reason ? { reason } : {});

      notifyRef.current?.({ tone: "success", message: `Card ${action} completed.` });
      setPending(null);
      setReason("");
      await load();
    } catch (err) {
      const status = err?.response?.status;
      const detail = err?.response?.data?.detail;
      if (status === 403) {
        notifyRef.current?.("danger", "You are not authorized to perform this action.");
      } else {
        notifyRef.current?.("danger", detail || `Card ${action} failed.`);
      }
      setPending(null);
      setReason("");
    } finally {
      setWorking(false);
    }
  };

  const canRun = (tier) => (tier === "manage" ? canManage : canAdminister);

  const historyEntries = cards.map((card) => ({
    id: card.id,
    summary: `${card.card_number || "Card"} — ${card.status_display || card.status}`,
    timestamp: card.issued_at,
    actor: `Renewals: ${card.renewal_count ?? 0}`,
    reason: card.expires_at ? `Expires ${dateOnly(card.expires_at)}` : undefined,
  }));

  if (loading) return <TableSkeleton rows={4} />;

  return (
    <div className="emp-card-panel">
      {error ? <InlineError message={error} /> : null}

      <div className="emp-card-current">
        <h3 className="beta__section-title">Current ID card</h3>
        {currentCard ? (
          <>
            <div className="emp-card-current__row">
              <div>
                <div className="emp-detail__label">Card number</div>
                <div className="emp-detail__value">{currentCard.card_number || "—"}</div>
              </div>
              <div>
                <div className="emp-detail__label">Issue date</div>
                <div className="emp-detail__value">{dateOnly(currentCard.issued_at)}</div>
              </div>
              <div>
                <div className="emp-detail__label">Expiration date</div>
                <div className="emp-detail__value">{dateOnly(currentCard.expires_at)}</div>
              </div>
              <div>
                <div className="emp-detail__label">Status</div>
                <StatusChip label={currentDisplay.label} tone={currentDisplay.tone} />
              </div>
            </div>

            {/* Verification QR — authenticated blob, never a public URL. It
                encodes only the card's opaque uuid. */}
            <div className="emp-card-qr">
              <div className="emp-detail__label">Verification QR</div>
              {qr.loading ? <p className="emp-note">Loading QR…</p> : null}
              {qr.error ? <InlineError message={qr.error} /> : null}
              {qr.url ? (
                <>
                  <img className="emp-card-qr__image" src={qr.url} alt="ID card verification QR" />
                  <a
                    className="admin-lib-btn admin-lib-btn--ghost"
                    href={qr.url}
                    download={`${currentCard.card_number || "employee"}-qr.png`}
                  >
                    Download QR
                  </a>
                </>
              ) : null}
            </div>
          </>
        ) : (
          <p className="emp-note">No ID card has been issued yet.</p>
        )}

        {currentCard ? (
          <div className="emp-card-output">
            <div className="emp-card-output__buttons">
              <button type="button" className="admin-lib-btn" onClick={openPreview}>
                Preview ID Card
              </button>
              <button
                type="button"
                className="admin-lib-btn admin-lib-btn--success"
                onClick={downloadPdf}
                disabled={printBlocked || pdf.loading}
                title={
                  printBlocked
                    ? "Add an employee photograph before downloading the official card."
                    : "Download the CR80 PDF (page 1 front, page 2 back)"
                }
              >
                {pdf.loading ? "Preparing PDF…" : "Download ID Card (PDF)"}
              </button>
              <button
                type="button"
                className="admin-lib-btn admin-lib-btn--success"
                onClick={printCard}
                disabled={printBlocked || pdf.loading}
                title={
                  printBlocked
                    ? "Add an employee photograph before printing the official card."
                    : "Print both faces at true CR80 size"
                }
              >
                Print ID Card
              </button>
            </div>
            {printBlocked ? (
              <p className="emp-note">
                An employee photograph is required before the official card can be printed or
                downloaded. Upload one in the Photograph section first.
              </p>
            ) : null}
            {pdf.error ? <InlineError message={pdf.error} /> : null}
            <p className="emp-note">
              Read-only: generating or printing the card never renews, replaces, activates,
              deactivates or revokes it. The PDF is CR80 (85.60 × 53.98 mm) — front on page 1,
              back on page 2.
            </p>
          </div>
        ) : null}

        <div className="emp-card-actions">
          {canManage ? (
            <>
              {!currentCard || currentCard.status !== "valid" ? (
                <button
                  type="button"
                  className="admin-lib-btn admin-lib-btn--success"
                  onClick={() => openAction("issue")}
                >
                  {ACTIONS.issue.label}
                </button>
              ) : null}
              <button
                type="button"
                className="admin-lib-btn"
                onClick={() => openAction("renew")}
                disabled={!currentCard}
              >
                {ACTIONS.renew.label}
              </button>
              <button
                type="button"
                className="admin-lib-btn admin-lib-btn--warning"
                onClick={() => openAction("replace")}
                disabled={!currentCard}
              >
                {ACTIONS.replace.label}
              </button>
            </>
          ) : null}

          {canAdminister && currentCard ? (
            <>
              <button
                type="button"
                className="admin-lib-btn admin-lib-btn--success"
                onClick={() => openAction("activate", currentCard)}
              >
                {ACTIONS.activate.label}
              </button>
              <button
                type="button"
                className="admin-lib-btn admin-lib-btn--warning"
                onClick={() => openAction("deactivate", currentCard)}
              >
                {ACTIONS.deactivate.label}
              </button>
              <button
                type="button"
                className="admin-lib-btn admin-lib-btn--danger"
                onClick={() => openAction("revoke", currentCard)}
              >
                {ACTIONS.revoke.label}
              </button>
            </>
          ) : null}
        </div>
      </div>

      <section>
        <h3 className="beta__section-title">Card history</h3>
        {historyEntries.length ? (
          <AuditTimeline entries={historyEntries} />
        ) : (
          <p className="emp-note">No card history.</p>
        )}
      </section>

      <Modal
        open={previewOpen && Boolean(currentCard)}
        title="Employee ID card preview"
        onClose={() => setPreviewOpen(false)}
        footer={
          <>
            <button
              type="button"
              className="admin-lib-btn admin-lib-btn--success"
              onClick={downloadPdf}
              disabled={printBlocked || pdf.loading}
            >
              Download PDF
            </button>
            <button
              type="button"
              className="admin-lib-btn admin-lib-btn--success"
              onClick={() => window.print()}
              disabled={printBlocked}
            >
              Print Card
            </button>
            <button
              type="button"
              className="admin-lib-btn admin-lib-btn--ghost"
              onClick={() => setPreviewOpen(false)}
            >
              Close
            </button>
          </>
        }
      >
        {currentCard ? (
          <div className="emp-card-preview">
            <p className="emp-note">
              Both faces are shown at true CR80 size (85.60 × 53.98 mm). When printing, keep
              the browser at 100% / actual size and enable two-sided printing for the back.
            </p>
            <div className="emp-card-preview__faces emp-card-print-area">
              <div className="emp-idcard emp-idcard--front">
                <div className="emp-idcard__band">
                  <img src="/yala-admin-logo.png" alt="" className="emp-idcard__logo" />
                  <div className="emp-idcard__band-text">
                    <strong>YALA TECHNOLOGIES</strong>
                    <span>OFFICIAL EMPLOYEE IDENTIFICATION</span>
                  </div>
                </div>
                <div className="emp-idcard__body">
                  <div className="emp-idcard__photo">
                    {photo.url ? (
                      <img src={photo.url} alt="Employee photograph" />
                    ) : (
                      <span>NO PHOTO</span>
                    )}
                  </div>
                  <div className="emp-idcard__fields">
                    <strong className="emp-idcard__name">
                      {employee?.full_name || "—"}
                    </strong>
                    {(() => {
                      const { first, last } = splitEmployeeName(employee?.full_name);
                      return (
                        <>
                          <div className="emp-idcard__field">
                            <span>Last name</span>
                            <b>{last}</b>
                          </div>
                          <div className="emp-idcard__field">
                            <span>First name</span>
                            <b>{first}</b>
                          </div>
                        </>
                      );
                    })()}
                    <div className="emp-idcard__field">
                      <span>Employee ID</span>
                      <b>{employee?.employee_number || "—"}</b>
                    </div>
                    <div className="emp-idcard__field">
                      <span>Job title</span>
                      <b>{employee?.job_title || "—"}</b>
                    </div>
                    <div className="emp-idcard__field">
                      <span>Department</span>
                      <b>{employee?.department || "—"}</b>
                    </div>
                    {canViewDob && employee?.date_of_birth ? (
                      <div className="emp-idcard__field">
                        <span>Date of birth</span>
                        <b>{dateOnly(employee.date_of_birth)}</b>
                      </div>
                    ) : null}
                    <div className="emp-idcard__field">
                      <span>Issue date</span>
                      <b>{dateOnly(currentCard.issued_at)}</b>
                    </div>
                    <div className="emp-idcard__field">
                      <span>Expires</span>
                      <b>{dateOnly(currentCard.expires_at)}</b>
                    </div>
                  </div>
                </div>
                <div className="emp-idcard__sig-row">
                  <div className="emp-idcard__sig-slot emp-idcard__sig-slot--employee">
                    <span className="emp-idcard__signature-label">Employee signature</span>
                    {signature.url ? (
                      <img src={signature.url} alt="Employee signature" />
                    ) : (
                      <span className="emp-idcard__signature-empty">Not provided</span>
                    )}
                  </div>
                  <div className="emp-idcard__sig-slot emp-idcard__sig-slot--ceo">
                    <span className="emp-idcard__signature-label">CEO authorization</span>
                    {ceoSignature.url ? (
                      <img src={ceoSignature.url} alt="CEO authorized signature" />
                    ) : (
                      <span className="emp-idcard__signature-empty">Not provided</span>
                    )}
                  </div>
                </div>
                <div className="emp-idcard__footer">
                  <span>{`CARD ${currentCard.card_number}`}</span>
                  <span>{currentDisplay.label}</span>
                </div>
              </div>

              <div className="emp-idcard emp-idcard--back">
                <div className="emp-idcard__band">
                  <img src="/yala-admin-logo.png" alt="" className="emp-idcard__logo" />
                  <div className="emp-idcard__band-text">
                    <strong>YALA TECHNOLOGIES</strong>
                  </div>
                </div>
                <div className="emp-idcard__body">
                  <div className="emp-idcard__qr">
                    {qr.url ? <img src={qr.url} alt="Verification QR code" /> : <span>QR</span>}
                    <small>SCAN TO VERIFY</small>
                    <span className="emp-idcard__contact">Phone: +222 22 11 43 73</span>
                    <span className="emp-idcard__contact">Email: sakho@admin.mr</span>
                  </div>
                  <div className="emp-idcard__fields">
                    <div className="emp-idcard__field">
                      <span>Card number</span>
                      <b>{currentCard.card_number}</b>
                    </div>
                    <div className="emp-idcard__field">
                      <span>Employee ID</span>
                      <b>{employee?.employee_number || "—"}</b>
                    </div>
                    <div className="emp-idcard__field">
                      <span>Issued</span>
                      <b>{dateOnly(currentCard.issued_at)}</b>
                    </div>
                    <div className="emp-idcard__field">
                      <span>Expires</span>
                      <b>{dateOnly(currentCard.expires_at)}</b>
                    </div>
                    <div className="emp-idcard__notice-block">
                      <strong>EMPLOYEE VERIFICATION:</strong>
                      <span>
                        Scan the QR code using the authorized Yala verification system.
                      </span>
                    </div>
                    <div className="emp-idcard__notice-block">
                      <strong>IF FOUND, PLEASE CONTACT US</strong>
                      <span>This identification card is the property of Yala Technologies.</span>
                      <span>
                        If found, please contact our administration office to arrange its safe
                        return.
                      </span>
                    </div>
                    <div className="emp-idcard__notice-block">
                      <strong>IMPORTANT NOTICE:</strong>
                      <ul className="emp-idcard__bullets">
                        <li>This card is non-transferable.</li>
                        <li>Present upon request by authorized personnel.</li>
                        <li>Report lost or stolen cards immediately.</li>
                        <li>Unauthorized use is prohibited.</li>
                      </ul>
                    </div>
                  </div>
                </div>
                <div className="emp-idcard__footer">
                  <span>This identification card is the property of Yala Technologies.</span>
                </div>
                {/* Founder/CEO directive: official slogan at the bottom of the back, with the
                    Mauritanian flag beside it. Mirrors the PDF's slogan band. */}
                <div className="emp-idcard__slogan">
                  <MauritaniaFlag className="emp-idcard__slogan-flag" />
                  <span>{CARD_SLOGAN}</span>
                </div>
              </div>
            </div>
            {printBlocked ? (
              <p className="emp-note">
                Printing and PDF download are disabled until an employee photograph exists.
              </p>
            ) : null}
          </div>
        ) : null}
      </Modal>

      {pending ? (
        <ConfirmationDialog
          open
          title={ACTIONS[pending.action].label}
          message={
            <span>
              {`Are you sure you want to ${pending.action} this card?`}
              {ACTIONS[pending.action].reason ? (
                <span className="emp-reason-field">
                  <label htmlFor="emp-card-reason">Reason (optional)</label>
                  <textarea
                    id="emp-card-reason"
                    rows={3}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </span>
              ) : null}
            </span>
          }
          confirmLabel={working ? "Working…" : ACTIONS[pending.action].label}
          tone={ACTIONS[pending.action].confirmTone}
          onConfirm={canRun(ACTIONS[pending.action].tier) && !working ? runAction : undefined}
          onCancel={() => {
            setPending(null);
            setReason("");
          }}
        />
      ) : null}
    </div>
  );
}
