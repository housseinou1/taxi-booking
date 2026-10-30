import React, { useEffect, useRef, useState } from "react";

import { InlineError } from "../components/library";
import { fetchPhoto, uploadPhoto } from "./employeesApi";

const ACCEPT = "image/jpeg,image/png";

/**
 * Employee photograph view + upload/replace. Photos are fetched as
 * authenticated blobs, rendered via object URLs, and never persisted to
 * localStorage/sessionStorage. Object URLs are revoked on unmount and before
 * each refetch to avoid leaks.
 */
// Photo upload is an HR Staff capability (same tier as reading the profile),
// so the control is shown to any viewer who can reach this profile; 403 from
// the backend is still handled gracefully if the server disagrees.
export default function EmployeePhotoPanel({ employeeNumber, notify }) {
  const [objectUrl, setObjectUrl] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const urlRef = useRef(null);
  const fileInputRef = useRef(null);

  // Camera capture state (browser APIs only — no new dependency).
  const [camera, setCamera] = useState({ open: false, error: "", starting: false });
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  const revoke = () => {
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
  };

  const loadPhoto = async () => {
    // Capture the URL currently in use so it can be revoked once the new photo
    // is ready (or the fetch fails) — avoids a flicker-to-placeholder and
    // guarantees the previous object URL is released.
    const previous = urlRef.current;
    try {
      const response = await fetchPhoto(employeeNumber);
      const url = URL.createObjectURL(response.data);
      urlRef.current = url;
      setObjectUrl(url);
    } catch (err) {
      // 404 (none) / 403 (not permitted) → placeholder, no crash.
      urlRef.current = null;
      setObjectUrl(null);
    } finally {
      if (previous) URL.revokeObjectURL(previous);
    }
  };

  useEffect(() => {
    let active = true;
    (async () => {
      if (active) await loadPhoto();
    })();
    return () => {
      active = false;
      revoke();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeNumber]);

  const stopCamera = () => {
    // Always release the hardware: a live stream keeps the camera light on.
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setCamera({ open: false, error: "", starting: false });
  };

  useEffect(
    () => () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    },
    []
  );

  const startCamera = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCamera({
        open: false,
        starting: false,
        error: "This browser does not support camera capture. Upload a photo instead.",
      });
      return;
    }
    setCamera({ open: true, starting: true, error: "" });
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: false,
      });
      streamRef.current = stream;
      setCamera({ open: true, starting: false, error: "" });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      streamRef.current = null;
      setCamera({
        open: false,
        starting: false,
        error:
          "Camera unavailable or permission denied. Upload a photo instead.",
      });
    }
  };

  const submitPhoto = async (file) => {
    setError("");
    setUploading(true);
    try {
      await uploadPhoto(employeeNumber, file);
      // Revoke the old object URL and refetch the new photo.
      await loadPhoto();
      notify?.({ tone: "success", message: "Photograph updated." });
    } catch (err) {
      const status = err?.response?.status;
      const detail = err?.response?.data?.detail;
      if (status === 403) {
        setError("You are not authorized to update this photograph.");
        notify?.("danger", "You are not authorized to update this photograph.");
      } else if (status === 400) {
        setError(detail || "Invalid photograph. Please upload a JPEG or PNG.");
      } else {
        setError(detail || err?.message || "Photograph upload failed.");
      }
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const capturePhoto = async () => {
    const video = videoRef.current;
    if (!video) return;
    const width = video.videoWidth || 640;
    const height = video.videoHeight || 480;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) {
      setCamera((prev) => ({ ...prev, error: "Could not capture the photo." }));
      return;
    }
    context.drawImage(video, 0, 0, width, height);

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
    if (!blob) {
      setCamera((prev) => ({ ...prev, error: "Could not capture the photo." }));
      return;
    }

    const file = new File([blob], `employee-${employeeNumber}.jpg`, { type: "image/jpeg" });
    stopCamera();
    await submitPhoto(file);
  };

  const handleFileChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    await submitPhoto(file);
  };

  return (
    <div className="emp-photo-panel">
      {objectUrl ? (
        <img className="emp-photo" src={objectUrl} alt="Employee photograph" />
      ) : (
        <span className="emp-photo emp-photo__placeholder" aria-label="No photograph">
          No photograph
        </span>
      )}

      <div className="emp-photo-panel__controls">
        <label className="admin-field" htmlFor="emp-photo-input">
          <span className="admin-field__label">
            {objectUrl ? "Replace photograph" : "Upload photograph"}
          </span>
          <input
            id="emp-photo-input"
            ref={fileInputRef}
            type="file"
            accept={ACCEPT}
            onChange={handleFileChange}
            disabled={uploading}
          />
        </label>
        {uploading ? <p className="emp-note">Uploading…</p> : null}
        {error ? <InlineError message={error} /> : null}

        {/* Camera capture — browser-only (getUserMedia + canvas). No dependency,
            and it degrades to file upload when the API or device is unavailable. */}
        <div className="emp-photo-camera">
          {!camera.open ? (
            <button
              type="button"
              className="admin-lib-btn admin-lib-btn--ghost"
              onClick={startCamera}
              disabled={uploading}
            >
              Take photo
            </button>
          ) : (
            <>
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <video
                ref={videoRef}
                className="emp-photo-camera__video"
                autoPlay
                playsInline
                muted
                aria-label="Camera preview"
              />
              <div className="emp-form__actions">
                <button
                  type="button"
                  className="admin-lib-btn"
                  onClick={capturePhoto}
                  disabled={uploading || camera.starting}
                >
                  {camera.starting ? "Starting…" : "Capture photo"}
                </button>
                <button
                  type="button"
                  className="admin-lib-btn admin-lib-btn--ghost"
                  onClick={stopCamera}
                  disabled={uploading}
                >
                  Cancel
                </button>
              </div>
            </>
          )}
          {camera.error ? <InlineError message={camera.error} /> : null}
        </div>
      </div>
    </div>
  );
}
