import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchCeoIdCardSignatureMeta,
  fetchCeoIdCardSignaturePreview,
  uploadCeoIdCardSignature,
} from "./employeesApi";
import { InlineError } from "../components/library";

const ACCEPT = "image/png,image/jpeg";
const PAD_WIDTH = 640;
const PAD_HEIGHT = 140;
const SIGNATURE_FONT =
  '48px "Segoe Script", "Brush Script MT", "Lucida Handwriting", "Apple Chancery", cursive';

const MODES = [
  { id: "drawn", label: "Drawn signature" },
  { id: "writing", label: "Writing signature" },
];

export default function CeoIdCardSignaturePanel({ notify }) {
  const [meta, setMeta] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [authorized, setAuthorized] = useState(false);
  const [mode, setMode] = useState("drawn");
  const [hasInk, setHasInk] = useState(false);
  const [writtenText, setWrittenText] = useState("");
  const fileRef = useRef(null);
  const drawCanvasRef = useRef(null);
  const writeCanvasRef = useRef(null);
  const drawingRef = useRef(false);
  const previewRef = useRef(null);

  const load = useCallback(async () => {
    setError("");
    try {
      const res = await fetchCeoIdCardSignatureMeta();
      setMeta(res.data);
      if (res.data?.has_signature) {
        const blobRes = await fetchCeoIdCardSignaturePreview();
        const url = URL.createObjectURL(blobRes.data);
        if (previewRef.current) URL.revokeObjectURL(previewRef.current);
        previewRef.current = url;
        setPreviewUrl(url);
      } else {
        if (previewRef.current) URL.revokeObjectURL(previewRef.current);
        previewRef.current = null;
        setPreviewUrl("");
      }
    } catch (err) {
      const status = err?.response?.status;
      const detail = err?.response?.data?.detail;
      if (status === 403) {
        setError("Administrator access required.");
      } else {
        setError(detail || "Could not load signature.");
      }
    }
  }, []);

  const renderWrittenPreview = useCallback(() => {
    const canvas = writeCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const text = writtenText.trim();
    if (!text) return;
    ctx.fillStyle = "#0f172a";
    let fontSize = 48;
    const maxWidth = canvas.width - 48;
    while (fontSize > 18) {
      ctx.font = `${fontSize}px "Segoe Script", "Brush Script MT", "Lucida Handwriting", cursive`;
      if (ctx.measureText(text).width <= maxWidth) break;
      fontSize -= 2;
    }
    ctx.textBaseline = "middle";
    ctx.fillText(text, 24, canvas.height / 2);
  }, [writtenText]);

  useEffect(() => {
    load();
    return () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    };
  }, [load]);

  useEffect(() => {
    if (mode === "writing") renderWrittenPreview();
  }, [mode, writtenText, renderWrittenPreview]);

  const drawContext = () => {
    const canvas = drawCanvasRef.current;
    if (!canvas) return null;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.lineWidth = 2.4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#0f172a";
    return ctx;
  };

  const padPoint = (event, canvas) => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  const startStroke = (event) => {
    const canvas = drawCanvasRef.current;
    const ctx = drawContext();
    if (!canvas || !ctx) return;
    event.preventDefault();
    drawingRef.current = true;
    const point = padPoint(event, canvas);
    ctx.beginPath();
    ctx.moveTo(point.x, point.y);
  };

  const extendStroke = (event) => {
    if (!drawingRef.current) return;
    const canvas = drawCanvasRef.current;
    const ctx = drawContext();
    if (!canvas || !ctx) return;
    event.preventDefault();
    const point = padPoint(event, canvas);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
    setHasInk(true);
  };

  const endStroke = () => {
    drawingRef.current = false;
  };

  const clearDrawPad = () => {
    const canvas = drawCanvasRef.current;
    const ctx = drawContext();
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasInk(false);
  };

  const requireAuthorization = () => {
    if (!authorized) {
      setError("Confirm authorization before saving.");
      return false;
    }
    return true;
  };

  const submitFile = async (file) => {
    if (!requireAuthorization()) return;
    setUploading(true);
    setError("");
    try {
      await uploadCeoIdCardSignature(file);
      notify?.({ tone: "success", message: "Signature saved." });
      clearDrawPad();
      setWrittenText("");
      setAuthorized(false);
      await load();
    } catch (err) {
      const detail = err?.response?.data?.detail;
      setError(detail || "Upload failed.");
      notify?.("danger", detail || "Save failed.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const exportCanvas = async (canvas) => {
    if (!canvas) return null;
    return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  };

  const saveFromDrawPad = async () => {
    if (!hasInk) return;
    const blob = await exportCanvas(drawCanvasRef.current);
    if (!blob) return;
    await submitFile(new File([blob], "ceo-drawn-signature.png", { type: "image/png" }));
  };

  const saveFromWriting = async () => {
    if (!writtenText.trim()) return;
    renderWrittenPreview();
    const blob = await exportCanvas(writeCanvasRef.current);
    if (!blob) return;
    await submitFile(new File([blob], "ceo-writing-signature.png", { type: "image/png" }));
  };

  const onUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    await submitFile(file);
  };

  const hasSignature = Boolean(meta?.has_signature);

  return (
    <section className="emp-ceo-card" aria-labelledby="ceo-sig-title">
      <div className="emp-ceo-card__top">
        <h2 id="ceo-sig-title" className="emp-ceo-card__title">
          CEO electronic signature
        </h2>
        <span
          className={`emp-ceo-card__pill ${hasSignature ? "emp-ceo-card__pill--ok" : "emp-ceo-card__pill--pending"}`.trim()}
        >
          {hasSignature ? "On file" : "Not configured"}
        </span>
      </div>

      {previewUrl ? (
        <div className="emp-ceo-card__preview" aria-label="Current signature preview">
          <img src={previewUrl} alt="" />
        </div>
      ) : null}

      {error ? <InlineError message={error} onRetry={load} /> : null}

      <div className="emp-ceo-card__consent">
        <input
          id="ceo-sig-consent"
          type="checkbox"
          checked={authorized}
          onChange={(e) => setAuthorized(e.target.checked)}
        />
        <label htmlFor="ceo-sig-consent">
          I authorize this signature for official YALA TECHNOLOGIES employee ID cards.
        </label>
      </div>

      <div className="emp-ceo-card__tabs" role="tablist" aria-label="Signature method">
        {MODES.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={mode === item.id}
            className={`emp-ceo-card__tab ${mode === item.id ? "emp-ceo-card__tab--on" : ""}`.trim()}
            onClick={() => {
              setMode(item.id);
              setError("");
            }}
            disabled={uploading}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="emp-ceo-card__workspace" role="tabpanel">
        {mode === "writing" ? (
          <input
            type="text"
            className="emp-ceo-card__text"
            value={writtenText}
            onChange={(e) => setWrittenText(e.target.value)}
            placeholder="Official signing name"
            disabled={uploading}
            aria-label="Writing signature text"
          />
        ) : null}

        <canvas
          ref={drawCanvasRef}
          className={`emp-ceo-card__canvas ${mode === "drawn" ? "" : "emp-ceo-card__canvas--hidden"}`.trim()}
          width={PAD_WIDTH}
          height={PAD_HEIGHT}
          aria-hidden={mode !== "drawn"}
          aria-label="Drawn signature pad"
          onPointerDown={startStroke}
          onPointerMove={extendStroke}
          onPointerUp={endStroke}
          onPointerLeave={endStroke}
        />
        <canvas
          ref={writeCanvasRef}
          className={`emp-ceo-card__canvas emp-ceo-card__canvas--preview ${mode === "writing" ? "" : "emp-ceo-card__canvas--hidden"}`.trim()}
          width={PAD_WIDTH}
          height={PAD_HEIGHT}
          aria-hidden={mode !== "writing"}
          aria-label="Writing signature preview"
        />

        <div className="emp-ceo-card__toolbar">
          <button
            type="button"
            className="admin-lib-btn admin-lib-btn--ghost"
            onClick={mode === "drawn" ? clearDrawPad : () => setWrittenText("")}
            disabled={uploading}
          >
            Clear
          </button>
          <button
            type="button"
            className="admin-lib-btn admin-lib-btn--primary"
            onClick={mode === "drawn" ? saveFromDrawPad : saveFromWriting}
            disabled={
              uploading || (mode === "drawn" ? !hasInk : !writtenText.trim())
            }
          >
            {uploading ? "Saving…" : "Save signature"}
          </button>
        </div>
      </div>

      <div className="emp-ceo-card__upload">
        <button
          type="button"
          className="admin-lib-btn admin-lib-btn--ghost emp-ceo-card__upload-btn"
          disabled={uploading}
          onClick={() => fileRef.current?.click()}
        >
          Upload image
        </button>
        <input
          ref={fileRef}
          type="file"
          accept={ACCEPT}
          className="emp-ceo-card__file"
          disabled={uploading}
          onChange={onUpload}
          tabIndex={-1}
          aria-hidden
        />
      </div>
    </section>
  );
}
