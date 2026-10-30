import React, { useCallback, useEffect, useRef, useState } from "react";

import { InlineError } from "../components/library";
import { fetchSignature, removeSignature, uploadSignature } from "./employeesApi";

const ACCEPT = "image/png,image/jpeg";

/**
 * Employee electronic signature — capture, upload, preview, replace, remove.
 *
 * The signature is the EMPLOYEE'S OWN. This panel can only transmit an image the employee
 * provided (drawn on the pad or uploaded); it contains no code that generates, synthesises or
 * imitates a signature. Employee consent is mandatory: the save button stays disabled until
 * consent is confirmed, and the backend rejects an upload without it.
 *
 * Signatures are fetched as authenticated blobs and rendered from object URLs (never a public
 * URL, never persisted to storage). Object URLs are revoked on unmount and before refetching.
 *
 * Write tiers (enforced server-side): recording/replacing requires the HR Manager tier;
 * removing requires the Employee Administrator tier.
 */
export default function EmployeeSignaturePanel({
  employeeNumber,
  canManage = false,
  canAdminister = false,
  notify,
}) {
  const [objectUrl, setObjectUrl] = useState(null);
  const [hasSignature, setHasSignature] = useState(false);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [consent, setConsent] = useState(false);
  const [source, setSource] = useState("pad");
  const [hasInk, setHasInk] = useState(false);

  const urlRef = useRef(null);
  const fileInputRef = useRef(null);
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);

  const revoke = () => {
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
  };

  const loadSignature = useCallback(async () => {
    const previous = urlRef.current;
    try {
      const response = await fetchSignature(employeeNumber);
      const url = URL.createObjectURL(response.data);
      urlRef.current = url;
      setObjectUrl(url);
      setHasSignature(true);
    } catch (err) {
      // 404 (none on file) / 403 (not permitted) -> placeholder, never a crash.
      urlRef.current = null;
      setObjectUrl(null);
      setHasSignature(false);
    } finally {
      if (previous) URL.revokeObjectURL(previous);
      setLoading(false);
    }
  }, [employeeNumber]);

  useEffect(() => {
    let active = true;
    (async () => {
      if (active) await loadSignature();
    })();
    return () => {
      active = false;
      revoke();
    };
  }, [loadSignature]);

  // ── Signature pad (pointer events; no new dependency) ──────────────────────
  const padContext = () => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    let ctx = null;
    try {
      ctx = canvas.getContext("2d");
    } catch (err) {
      // Environments without a 2D context (or a locked canvas) must not break saving: the
      // pad simply cannot be drawn on, and uploads still work.
      return null;
    }
    if (!ctx) return null;
    ctx.lineWidth = 2.4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#0f172a";
    return ctx;
  };

  const padPoint = (event) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  const startStroke = (event) => {
    const ctx = padContext();
    if (!ctx) return;
    event.preventDefault();
    drawingRef.current = true;
    const point = padPoint(event);
    ctx.beginPath();
    ctx.moveTo(point.x, point.y);
    setSource("pad");
  };

  const extendStroke = (event) => {
    if (!drawingRef.current) return;
    const ctx = padContext();
    if (!ctx) return;
    event.preventDefault();
    const point = padPoint(event);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
    setHasInk(true);
  };

  const endStroke = () => {
    drawingRef.current = false;
  };

  const clearPad = () => {
    const canvas = canvasRef.current;
    const ctx = padContext();
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasInk(false);
  };

  const canvasBlob = () =>
    new Promise((resolve) => {
      const canvas = canvasRef.current;
      if (!canvas) {
        resolve(null);
        return;
      }
      canvas.toBlob((blob) => resolve(blob), "image/png");
    });

  const save = async (file, uploadSource) => {
    setWorking(true);
    setError("");
    try {
      await uploadSignature(employeeNumber, file, { source: uploadSource, consent });
      await loadSignature();
      clearPad();
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (notify) notify("Signature saved.", "success");
    } catch (err) {
      const detail = err?.response?.data?.detail;
      setError(
        typeof detail === "string"
          ? detail
          : err?.response?.status === 403
            ? "You are not authorized to record a signature."
            : "Could not save the signature."
      );
    } finally {
      setWorking(false);
    }
  };

  const saveFromPad = async () => {
    const blob = await canvasBlob();
    if (!blob) {
      setError("The signature pad is empty.");
      return;
    }
    const file = new File([blob], "signature.png", { type: "image/png" });
    await save(file, "pad");
  };

  const onFilePicked = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setSource("upload");
    await save(file, "upload");
  };

  const remove = async () => {
    setWorking(true);
    setError("");
    try {
      await removeSignature(employeeNumber);
      await loadSignature();
      if (notify) notify("Signature removed.", "success");
    } catch (err) {
      setError(
        err?.response?.status === 403
          ? "Removing a signature requires the Employee Administrator tier."
          : "Could not remove the signature."
      );
    } finally {
      setWorking(false);
    }
  };

  return (
    <section className="emp-signature">
      <header>
        <h3>Employee signature</h3>
        <p>
          The signature shown on the ID card. It must be provided or approved by the employee —
          Yala never generates or imitates a signature.
        </p>
      </header>

      {error ? <InlineError message={error} /> : null}

      <div className="emp-signature__preview">
        {loading ? (
          <span>Loading signature...</span>
        ) : objectUrl ? (
          <img src={objectUrl} alt="Employee signature" />
        ) : (
          <span className="emp-idcard__signature-empty">Signature not provided</span>
        )}
      </div>

      {canManage ? (
        <>
          <label className="emp-signature__consent">
            <input
              type="checkbox"
              checked={consent}
              onChange={(event) => setConsent(event.target.checked)}
            />
            <span>
              The employee has provided or approved this signature (consent required before it
              can be recorded).
            </span>
          </label>

          <canvas
            ref={canvasRef}
            width={640}
            height={200}
            className="emp-signature__pad"
            aria-label="Signature pad"
            onPointerDown={startStroke}
            onPointerMove={extendStroke}
            onPointerUp={endStroke}
            onPointerLeave={endStroke}
          />

          <div className="emp-signature__actions">
            <button type="button" onClick={clearPad} disabled={working}>
              Clear pad
            </button>
            <button
              type="button"
              onClick={saveFromPad}
              disabled={working || !consent || !hasInk}
              title={!consent ? "Confirm employee consent first" : undefined}
            >
              {hasSignature ? "Replace with pad signature" : "Save pad signature"}
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={working || !consent}
            >
              Upload signature image
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPT}
              onChange={onFilePicked}
              style={{ display: "none" }}
            />
          </div>
          <p className="emp-signature__hint">
            Accepted formats: PNG or JPEG (transparent PNG recommended). Original proportions are
            preserved on the card — nothing is stretched.
          </p>
        </>
      ) : (
        <p className="emp-signature__hint">
          Recording a signature requires the HR Manager tier.
        </p>
      )}

      {canAdminister && hasSignature ? (
        <div className="emp-signature__actions">
          <button type="button" onClick={remove} disabled={working}>
            Remove signature
          </button>
        </div>
      ) : null}
    </section>
  );
}
