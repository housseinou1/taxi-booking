import React, { useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { getVerificationFields } from "./riderSafetyCategories";
import "./RideVerificationPrompt.css";

export default function RideVerificationPrompt({ ride, open, onConfirm, onDismiss }) {
  const { t } = useTranslation();
  const [checked, setChecked] = useState(false);
  if (!open || !ride) return null;

  const fields = getVerificationFields(ride);

  return createPortal(
    <div className="ride-verification" role="dialog" aria-labelledby="ride-verification-title">
      <div className="ride-verification__card">
        <span className="ride-verification__eyebrow">{t("safetyPanel.eyebrow")}</span>
        <h2 id="ride-verification-title">Verify your ride before entering</h2>
        <p>Confirm the driver and vehicle match what Yala shows before you get in.</p>

        <div className="ride-verification__grid">
          {fields.driverPhoto ? (
            <img src={fields.driverPhoto} alt="" className="ride-verification__photo" />
          ) : (
            <div className="ride-verification__photo ride-verification__photo--placeholder">
              {fields.driverName.slice(0, 1)}
            </div>
          )}
          <dl>
            <div><dt>Driver</dt><dd>{fields.driverName}</dd></div>
            <div><dt>Vehicle</dt><dd>{fields.vehicle}</dd></div>
            <div><dt>Color</dt><dd>{fields.color}</dd></div>
            <div><dt>Plate</dt><dd>{fields.plate}</dd></div>
            {fields.verified ? <div><dt>Status</dt><dd>Verified driver</dd></div> : null}
          </dl>
        </div>

        <label className="ride-verification__check">
          <input type="checkbox" checked={checked} onChange={(event) => setChecked(event.target.checked)} />
          <span>I verified the driver photo, name, vehicle, and plate number.</span>
        </label>

        <div className="ride-verification__actions">
          <button type="button" className="ride-verification__secondary" onClick={onDismiss}>
            Not yet
          </button>
          <button
            type="button"
            className="ride-verification__primary"
            disabled={!checked}
            onClick={() => {
              onConfirm?.();
              setChecked(false);
            }}
          >
            Looks correct
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
