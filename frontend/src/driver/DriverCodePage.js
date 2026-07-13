import React, { useCallback, useEffect, useState } from "react";

import { API_URL } from "../apiConfig";
import authenticatedApi from "../auth/authenticatedApi";
import { getDriverColors, isDriverLyftUI } from "./lyftColors";

function formatGeneratedAt(value) {
  if (!value) return "";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return String(value);
  }
}

export default function DriverCodePage() {
  const COLORS = getDriverColors();
  const lyft = isDriverLyftUI();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [qr, setQr] = useState(null);

  const loadQr = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await authenticatedApi.get(`${API_URL}/drivers/me/qr-code/`);
      setQr(response.data || null);
    } catch (err) {
      const detail =
        err.response?.data?.detail ||
        err.response?.data?.error ||
        err.message ||
        "Could not load your driver QR code.";
      setError(detail);
      setQr(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadQr();
  }, [loadQr]);

  const pageStyle = {
    minHeight: "100%",
    background: lyft ? "#f3f4f6" : COLORS.darkNavy,
    color: COLORS.white,
    padding: "20px 16px 40px",
    boxSizing: "border-box",
  };

  const cardStyle = {
    background: COLORS.cardBg,
    border: `1px solid ${COLORS.cardBorder}`,
    borderRadius: 20,
    padding: "24px 20px",
    textAlign: "center",
  };

  return (
    <div style={pageStyle}>
      <p style={{ margin: "0 0 6px", color: COLORS.lightGray, fontSize: 13, fontWeight: 600 }}>
        Rider verification
      </p>
      <h1 style={{ margin: "0 0 18px", fontSize: 26, fontWeight: 800, color: COLORS.white }}>
        Driver Code
      </h1>
      <p style={{ margin: "0 0 20px", color: COLORS.lightGray, fontSize: 14, lineHeight: 1.45 }}>
        Show this QR code so riders can verify you are an approved Yala driver.
      </p>

      <div style={cardStyle}>
        {loading ? (
          <p style={{ color: COLORS.lightGray, margin: 0 }}>Loading QR code...</p>
        ) : error ? (
          <>
            <p style={{ color: COLORS.errorRed, margin: "0 0 16px" }}>{error}</p>
            <button
              type="button"
              onClick={loadQr}
              style={{
                background: COLORS.primaryGreen,
                color: "#fff",
                border: "none",
                borderRadius: 999,
                padding: "12px 22px",
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              Try again
            </button>
          </>
        ) : (
          <>
            <div
              style={{
                background: "#fff",
                borderRadius: 16,
                padding: 16,
                display: "inline-block",
                marginBottom: 18,
              }}
            >
              {qr?.qr_code_image ? (
                <img
                  src={qr.qr_code_image}
                  alt="Driver verification QR code"
                  width={220}
                  height={220}
                  style={{ display: "block", width: 220, height: 220 }}
                />
              ) : (
                <div
                  style={{
                    width: 220,
                    height: 220,
                    display: "grid",
                    placeItems: "center",
                    color: "#6b7280",
                    fontSize: 13,
                  }}
                >
                  QR image unavailable
                </div>
              )}
            </div>

            <p style={{ margin: "0 0 6px", color: COLORS.lightGray, fontSize: 13 }}>
              Your driver code
            </p>
            <p
              style={{
                margin: "0 0 14px",
                fontSize: 34,
                fontWeight: 900,
                letterSpacing: 4,
                color: COLORS.primaryGreen,
              }}
            >
              {qr?.driver_code || "------"}
            </p>
            {qr?.generated_at ? (
              <p style={{ margin: 0, color: COLORS.textMuted, fontSize: 12 }}>
                Generated {formatGeneratedAt(qr.generated_at)}
              </p>
            ) : null}
          </>
        )}
      </div>

      <p style={{ margin: "18px 0 0", color: COLORS.textMuted, fontSize: 12, lineHeight: 1.4 }}>
        Riders scan this code in the Yala app. Do not share screenshots publicly.
      </p>
    </div>
  );
}
