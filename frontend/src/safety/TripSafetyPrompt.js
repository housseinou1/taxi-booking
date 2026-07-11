import React from "react";

export default function TripSafetyPrompt({ event, onSafe, onNeedHelp, busy = false }) {
  if (!event) return null;

  return (
    <div className="trip-safety-prompt" role="alertdialog" aria-labelledby="trip-safety-title">
      <style>{`
        .trip-safety-prompt {
          position: fixed;
          inset: auto 16px 96px 16px;
          z-index: 1200;
          border: 1px solid rgba(248,113,113,.45);
          border-radius: 14px;
          background: rgba(8,17,31,.96);
          color: #fff;
          padding: 16px;
          box-shadow: 0 18px 50px rgba(0,0,0,.35);
        }
        .trip-safety-prompt h3 { margin: 0 0 8px; font-size: 18px; }
        .trip-safety-prompt p { margin: 0 0 12px; color: #cbd5e1; }
        .trip-safety-prompt__actions { display: flex; gap: 8px; }
        .trip-safety-prompt__actions button {
          flex: 1;
          min-height: 42px;
          border: 0;
          border-radius: 10px;
          font-weight: 800;
          cursor: pointer;
        }
        .trip-safety-prompt__safe { background: #16a34a; color: #fff; }
        .trip-safety-prompt__help { background: #dc2626; color: #fff; }
      `}</style>
      <h3 id="trip-safety-title">Are you safe?</h3>
      <p>{event.message || "We noticed an unusual stop or route change on your trip."}</p>
      <div className="trip-safety-prompt__actions">
        <button type="button" className="trip-safety-prompt__safe" disabled={busy} onClick={() => onSafe?.()}>
          I&apos;m safe
        </button>
        <button type="button" className="trip-safety-prompt__help" disabled={busy} onClick={() => onNeedHelp?.()}>
          I need help
        </button>
      </div>
    </div>
  );
}
