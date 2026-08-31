import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "./SosCountdownModal.css";

const DEFAULT_SECONDS = 5;

export default function SosCountdownModal({
  open,
  onCancel,
  onConfirm,
  busy = false,
  seconds = DEFAULT_SECONDS,
}) {
  const [remaining, setRemaining] = useState(seconds);
  const firedRef = useRef(false);
  const onConfirmRef = useRef(onConfirm);

  useEffect(() => {
    onConfirmRef.current = onConfirm;
  }, [onConfirm]);

  useEffect(() => {
    if (!open) {
      setRemaining(seconds);
      firedRef.current = false;
      return undefined;
    }

    firedRef.current = false;
    setRemaining(seconds);
    const intervalId = window.setInterval(() => {
      setRemaining((value) => {
        if (value <= 1) {
          window.clearInterval(intervalId);
          if (!firedRef.current) {
            firedRef.current = true;
            onConfirmRef.current?.();
          }
          return 0;
        }
        return value - 1;
      });
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [open, seconds]);

  if (!open) return null;

  return createPortal(
    <div className="sos-countdown" role="alertdialog" aria-labelledby="sos-countdown-title">
      <div className="sos-countdown__card">
        <span className="sos-countdown__eyebrow">Emergency SOS</span>
        <h2 id="sos-countdown-title">Send emergency alert?</h2>
        <p>
          Yala operations will be notified with your ride ID and GPS location. Call local emergency
          services if you are in immediate danger.
        </p>
        <div className="sos-countdown__timer" aria-live="polite">
          {busy ? "Sending…" : remaining > 0 ? `Sending in ${remaining}s` : "Sending now…"}
        </div>
        <div className="sos-countdown__actions">
          <button type="button" className="sos-countdown__cancel" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className="sos-countdown__confirm"
            onClick={() => {
              if (firedRef.current) return;
              firedRef.current = true;
              onConfirm?.();
            }}
            disabled={busy}
          >
            {busy ? "Sending…" : "Send SOS now"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
