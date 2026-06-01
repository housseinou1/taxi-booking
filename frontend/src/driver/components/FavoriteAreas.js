import React, { useCallback, useEffect, useState } from "react";
import axios from "axios";

import { API_URL } from "../../apiConfig";

// ─── Yala Branding Colors ───────────────────────────────────────────────────
const COLORS = {
  primaryGreen: "#00A651",
  goldAccent: "#D4AF37",
  darkNavy: "#0B1220",
  white: "#FFFFFF",
  gray: "#6B7280",
  grayLight: "#9CA3AF",
  errorRed: "#EF4444",
};

// ─── Constants ──────────────────────────────────────────────────────────────
const MAX_FAVORITE_AREAS = 5;
const DEFAULT_RADIUS_KM = 3;

/**
 * Validates whether a new favorite area can be added given the current count.
 * Returns { canAdd: boolean, error: string | null }
 *
 * @param {number} currentCount - Number of existing favorite areas
 * @returns {{ canAdd: boolean, error: string | null }}
 */
export function validateFavoriteAreaLimit(currentCount) {
  if (currentCount >= MAX_FAVORITE_AREAS) {
    return {
      canAdd: false,
      error: `Maximum ${MAX_FAVORITE_AREAS} favorite areas reached. Remove an existing favorite before adding a new one.`,
    };
  }
  return { canAdd: true, error: null };
}

/**
 * Validates the input for a new favorite area.
 * Returns { isValid: boolean, errors: string[] }
 *
 * @param {{ label: string, lat: number|string, lng: number|string }} input
 * @returns {{ isValid: boolean, errors: string[] }}
 */
export function validateFavoriteAreaInput(input) {
  const errors = [];

  if (!input || typeof input !== "object") {
    return { isValid: false, errors: ["Invalid input"] };
  }

  const label = (input.label || "").trim();
  if (!label) {
    errors.push("Label is required");
  } else if (label.length > 100) {
    errors.push("Label must be 100 characters or less");
  }

  const lat = Number(input.lat);
  const lng = Number(input.lng);

  if (isNaN(lat) || lat < -90 || lat > 90) {
    errors.push("Valid latitude is required (-90 to 90)");
  }

  if (isNaN(lng) || lng < -180 || lng > 180) {
    errors.push("Valid longitude is required (-180 to 180)");
  }

  return { isValid: errors.length === 0, errors };
}

/**
 * FavoriteAreas - Manage up to 5 favorite geographic areas.
 *
 * Requirements:
 * - 13.3: Save up to 5 geographic areas with named label and center point (3 km radius)
 * - 13.4: Show error when attempting to add more than 5 favorite areas
 * - 13.5: Center map on selected favorite area
 *
 * @param {Object} props
 * @param {Function} [props.onSelectArea] - Callback when a favorite area is selected (receives { lat, lng, label })
 * @param {Function} [props.onError] - Callback when an error occurs (receives error message)
 */
export default function FavoriteAreas({ onSelectArea, onError }) {
  const [areas, setAreas] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [formData, setFormData] = useState({ label: "", lat: "", lng: "" });
  const [formErrors, setFormErrors] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const token = localStorage.getItem("access");
  const authHeaders = { headers: { Authorization: `Bearer ${token}` } };

  // ─── Fetch Favorite Areas ───────────────────────────────────────────────
  const fetchAreas = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    try {
      const response = await axios.get(`${API_URL}/drivers/me/favorites/`, authHeaders);
      setAreas(Array.isArray(response.data) ? response.data : []);
      setError(null);
    } catch (err) {
      const msg = err.response?.data?.error || err.response?.data?.detail || "Failed to load favorite areas.";
      setError(msg);
      if (onError) onError(msg);
    } finally {
      setIsLoading(false);
    }
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchAreas();
  }, [fetchAreas]);

  // ─── Add Favorite Area ──────────────────────────────────────────────────
  const handleAdd = useCallback(async () => {
    // Check limit
    const limitCheck = validateFavoriteAreaLimit(areas.length);
    if (!limitCheck.canAdd) {
      setError(limitCheck.error);
      if (onError) onError(limitCheck.error);
      return;
    }

    // Validate input
    const validation = validateFavoriteAreaInput(formData);
    if (!validation.isValid) {
      setFormErrors(validation.errors);
      return;
    }

    setIsSubmitting(true);
    setFormErrors([]);
    setError(null);

    try {
      const response = await axios.post(
        `${API_URL}/drivers/me/favorites/`,
        {
          label: formData.label.trim(),
          lat: Number(formData.lat),
          lng: Number(formData.lng),
        },
        authHeaders
      );

      setAreas((prev) => [...prev, response.data]);
      setFormData({ label: "", lat: "", lng: "" });
      setShowAddForm(false);
    } catch (err) {
      const msg =
        err.response?.data?.error ||
        err.response?.data?.detail ||
        "Failed to add favorite area.";
      setError(msg);
      if (onError) onError(msg);
    } finally {
      setIsSubmitting(false);
    }
  }, [areas.length, formData, onError]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Remove Favorite Area ───────────────────────────────────────────────
  const handleRemove = useCallback(async (areaId) => {
    try {
      await axios.delete(`${API_URL}/drivers/me/favorites/${areaId}/`, authHeaders);
      setAreas((prev) => prev.filter((a) => a.id !== areaId));
      setError(null);
    } catch (err) {
      const msg =
        err.response?.data?.error ||
        err.response?.data?.detail ||
        "Failed to remove favorite area.";
      setError(msg);
      if (onError) onError(msg);
    }
  }, [onError]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Select Favorite Area (center map) ──────────────────────────────────
  const handleSelect = useCallback(
    (area) => {
      if (onSelectArea) {
        onSelectArea({
          lat: area.center_lat,
          lng: area.center_lng,
          label: area.label,
        });
      }
    },
    [onSelectArea]
  );

  // ─── Handle Add Button Click ────────────────────────────────────────────
  const handleAddButtonClick = useCallback(() => {
    const limitCheck = validateFavoriteAreaLimit(areas.length);
    if (!limitCheck.canAdd) {
      setError(limitCheck.error);
      if (onError) onError(limitCheck.error);
      return;
    }
    setShowAddForm(true);
    setFormErrors([]);
    setError(null);
  }, [areas.length, onError]);

  // ─── Render ─────────────────────────────────────────────────────────────
  return (
    <div style={containerStyle} aria-label="Favorite Areas">
      {/* Header */}
      <div style={headerStyle}>
        <h3 style={titleStyle}>Favorite Areas</h3>
        <span style={countStyle}>
          {areas.length}/{MAX_FAVORITE_AREAS}
        </span>
      </div>

      {/* Error Banner */}
      {error && (
        <div style={errorBannerStyle} role="alert" aria-label="Favorite areas error">
          {error}
        </div>
      )}

      {/* Loading State */}
      {isLoading && (
        <div style={loadingStyle} aria-label="Loading favorite areas">
          Loading...
        </div>
      )}

      {/* Areas List */}
      {!isLoading && (
        <div style={listStyle} role="list" aria-label="Favorite areas list">
          {areas.length === 0 && !showAddForm && (
            <p style={emptyStyle}>No favorite areas saved yet.</p>
          )}

          {areas.map((area) => (
            <div
              key={area.id}
              style={areaItemStyle}
              role="listitem"
              aria-label={`Favorite area: ${area.label}`}
            >
              <button
                style={areaSelectButtonStyle}
                onClick={() => handleSelect(area)}
                aria-label={`Center map on ${area.label}`}
              >
                <span style={areaIconStyle}>📍</span>
                <div style={areaInfoStyle}>
                  <span style={areaLabelStyle}>{area.label}</span>
                  <span style={areaCoordStyle}>
                    {Number(area.center_lat).toFixed(4)}, {Number(area.center_lng).toFixed(4)} • {DEFAULT_RADIUS_KM} km
                  </span>
                </div>
              </button>
              <button
                style={removeButtonStyle}
                onClick={() => handleRemove(area.id)}
                aria-label={`Remove ${area.label}`}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add Form */}
      {showAddForm && (
        <div style={addFormStyle} aria-label="Add favorite area form">
          {formErrors.length > 0 && (
            <div style={formErrorStyle} role="alert">
              {formErrors.map((err, i) => (
                <p key={i} style={formErrorTextStyle}>{err}</p>
              ))}
            </div>
          )}

          <input
            type="text"
            placeholder="Area label (e.g., Airport)"
            value={formData.label}
            onChange={(e) => setFormData((prev) => ({ ...prev, label: e.target.value }))}
            style={inputStyle}
            aria-label="Area label"
            maxLength={100}
          />

          <div style={coordRowStyle}>
            <input
              type="number"
              placeholder="Latitude"
              value={formData.lat}
              onChange={(e) => setFormData((prev) => ({ ...prev, lat: e.target.value }))}
              style={{ ...inputStyle, flex: 1 }}
              aria-label="Latitude"
              step="any"
            />
            <input
              type="number"
              placeholder="Longitude"
              value={formData.lng}
              onChange={(e) => setFormData((prev) => ({ ...prev, lng: e.target.value }))}
              style={{ ...inputStyle, flex: 1 }}
              aria-label="Longitude"
              step="any"
            />
          </div>

          <p style={radiusInfoStyle}>
            Radius: {DEFAULT_RADIUS_KM} km (fixed)
          </p>

          <div style={formActionsStyle}>
            <button
              style={cancelButtonStyle}
              onClick={() => {
                setShowAddForm(false);
                setFormData({ label: "", lat: "", lng: "" });
                setFormErrors([]);
              }}
              aria-label="Cancel adding area"
            >
              Cancel
            </button>
            <button
              style={saveButtonStyle}
              onClick={handleAdd}
              disabled={isSubmitting}
              aria-label="Save favorite area"
            >
              {isSubmitting ? "Saving..." : "Save Area"}
            </button>
          </div>
        </div>
      )}

      {/* Add Button */}
      {!showAddForm && !isLoading && (
        <button
          style={addButtonStyle}
          onClick={handleAddButtonClick}
          aria-label="Add favorite area"
        >
          + Add Favorite Area
        </button>
      )}
    </div>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const containerStyle = {
  padding: "16px",
  backgroundColor: "rgba(11, 18, 32, 0.95)",
  borderRadius: "16px",
  border: "1px solid rgba(255, 255, 255, 0.08)",
  backdropFilter: "blur(12px)",
};

const headerStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: "12px",
};

const titleStyle = {
  margin: 0,
  color: COLORS.white,
  fontSize: "16px",
  fontWeight: 800,
};

const countStyle = {
  color: COLORS.grayLight,
  fontSize: "12px",
  fontWeight: 700,
};

const errorBannerStyle = {
  marginBottom: "12px",
  padding: "10px 14px",
  borderRadius: "10px",
  backgroundColor: "rgba(239, 68, 68, 0.15)",
  border: `1px solid ${COLORS.errorRed}`,
  color: COLORS.errorRed,
  fontSize: "12px",
  fontWeight: 700,
  textAlign: "center",
};

const loadingStyle = {
  color: COLORS.grayLight,
  fontSize: "13px",
  textAlign: "center",
  padding: "16px 0",
};

const listStyle = {
  display: "flex",
  flexDirection: "column",
  gap: "8px",
  marginBottom: "12px",
};

const emptyStyle = {
  color: COLORS.grayLight,
  fontSize: "13px",
  textAlign: "center",
  margin: "8px 0",
};

const areaItemStyle = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
  padding: "10px 12px",
  borderRadius: "12px",
  backgroundColor: "rgba(255, 255, 255, 0.05)",
  border: "1px solid rgba(255, 255, 255, 0.08)",
  transition: "background-color 0.2s ease",
};

const areaSelectButtonStyle = {
  flex: 1,
  display: "flex",
  alignItems: "center",
  gap: "10px",
  background: "none",
  border: "none",
  padding: 0,
  cursor: "pointer",
  textAlign: "left",
};

const areaIconStyle = {
  fontSize: "18px",
  flexShrink: 0,
};

const areaInfoStyle = {
  display: "flex",
  flexDirection: "column",
  gap: "2px",
};

const areaLabelStyle = {
  color: COLORS.white,
  fontSize: "14px",
  fontWeight: 700,
};

const areaCoordStyle = {
  color: COLORS.grayLight,
  fontSize: "11px",
  fontWeight: 600,
};

const removeButtonStyle = {
  width: "28px",
  height: "28px",
  borderRadius: "50%",
  border: "1px solid rgba(239, 68, 68, 0.3)",
  backgroundColor: "rgba(239, 68, 68, 0.1)",
  color: COLORS.errorRed,
  fontSize: "12px",
  fontWeight: 900,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
  transition: "background-color 0.2s ease",
};

const addFormStyle = {
  marginTop: "12px",
  padding: "14px",
  borderRadius: "12px",
  backgroundColor: "rgba(255, 255, 255, 0.04)",
  border: `1px solid ${COLORS.goldAccent}33`,
};

const formErrorStyle = {
  marginBottom: "10px",
  padding: "8px 12px",
  borderRadius: "8px",
  backgroundColor: "rgba(239, 68, 68, 0.1)",
  border: `1px solid ${COLORS.errorRed}`,
};

const formErrorTextStyle = {
  margin: "2px 0",
  color: COLORS.errorRed,
  fontSize: "11px",
  fontWeight: 700,
};

const inputStyle = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: "10px",
  border: "1px solid rgba(255, 255, 255, 0.12)",
  backgroundColor: "rgba(255, 255, 255, 0.06)",
  color: COLORS.white,
  fontSize: "13px",
  fontWeight: 600,
  outline: "none",
  marginBottom: "8px",
  boxSizing: "border-box",
};

const coordRowStyle = {
  display: "flex",
  gap: "8px",
};

const radiusInfoStyle = {
  color: COLORS.grayLight,
  fontSize: "11px",
  fontWeight: 600,
  margin: "4px 0 12px",
};

const formActionsStyle = {
  display: "flex",
  gap: "8px",
};

const cancelButtonStyle = {
  flex: 1,
  padding: "10px",
  borderRadius: "10px",
  border: "1px solid rgba(255, 255, 255, 0.15)",
  backgroundColor: "transparent",
  color: COLORS.white,
  fontWeight: 700,
  fontSize: "13px",
  cursor: "pointer",
};

const saveButtonStyle = {
  flex: 1,
  padding: "10px",
  borderRadius: "10px",
  border: "none",
  backgroundColor: COLORS.primaryGreen,
  color: COLORS.white,
  fontWeight: 800,
  fontSize: "13px",
  cursor: "pointer",
  transition: "opacity 0.2s ease",
};

const addButtonStyle = {
  width: "100%",
  padding: "12px",
  borderRadius: "12px",
  border: `1px dashed ${COLORS.goldAccent}55`,
  backgroundColor: "transparent",
  color: COLORS.goldAccent,
  fontWeight: 700,
  fontSize: "13px",
  cursor: "pointer",
  transition: "background-color 0.2s ease, border-color 0.2s ease",
};
