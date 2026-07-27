import React, { useCallback, useEffect, useState } from "react";

import { API_URL } from "../apiConfig";
import authenticatedApi from "../auth/authenticatedApi";
import { formatMoney } from "../marketConfig";
import { bindDriverTheme } from "./themeRefresh";

function buildStyles(COLORS) {
  return {
    containerStyle: {
      minHeight: "100vh",
      backgroundColor: COLORS.darkNavy,
      padding: "20px 16px 100px",
      fontFamily: "'Plus Jakarta Sans', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    },
    headerStyle: { marginBottom: "20px" },
    titleStyle: {
      color: COLORS.white,
      fontSize: "24px",
      fontWeight: "800",
      margin: 0,
    },
    filtersStyle: {
      display: "flex",
      gap: "8px",
      marginBottom: "16px",
      flexWrap: "wrap",
    },
    selectStyle: {
      flex: "1 1 120px",
      padding: "10px 12px",
      borderRadius: "12px",
      border: `1px solid ${COLORS.cardBorder}`,
      background: COLORS.cardBg,
      color: COLORS.white,
      fontSize: "13px",
    },
    dateInputStyle: {
      flex: "1 1 120px",
      padding: "10px 12px",
      borderRadius: "12px",
      border: `1px solid ${COLORS.cardBorder}`,
      background: COLORS.cardBg,
      color: COLORS.white,
      fontSize: "13px",
    },
    loadingStyle: {
      color: COLORS.textMuted,
      textAlign: "center",
      padding: "60px 20px",
      fontSize: "15px",
    },
    emptyStyle: { textAlign: "center", padding: "60px 20px" },
    emptyIconStyle: { fontSize: "48px", display: "block", marginBottom: "16px" },
    emptyTextStyle: {
      color: COLORS.white,
      fontSize: "16px",
      fontWeight: "600",
      margin: "0 0 8px",
    },
    emptySubtextStyle: { color: COLORS.textMuted, fontSize: "14px", margin: 0 },
    listStyle: { display: "flex", flexDirection: "column", gap: "10px" },
    rideCardStyle: {
      background: COLORS.cardBg,
      borderRadius: "16px",
      padding: "14px 16px",
      border: `1px solid ${COLORS.cardBorder}`,
    },
    rideHeaderStyle: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: "10px",
    },
    rideDateStyle: { color: COLORS.textMuted, fontSize: "12px" },
    rideStatusStyle: { fontSize: "12px", fontWeight: "800", textTransform: "capitalize" },
    rideBodyStyle: { display: "flex", flexDirection: "column", gap: "6px", marginBottom: "10px" },
    locationRowStyle: { display: "flex", alignItems: "center", gap: "8px" },
    dotPickupStyle: {
      width: "8px",
      height: "8px",
      borderRadius: "50%",
      background: COLORS.primaryGreen,
      flexShrink: 0,
    },
    dotDropoffStyle: {
      width: "8px",
      height: "8px",
      borderRadius: "50%",
      background: COLORS.goldAccent,
      flexShrink: 0,
    },
    locationTextStyle: {
      color: COLORS.white,
      fontSize: "13px",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
    },
    rideFareStyle: {
      color: COLORS.primaryGreen,
      fontSize: "16px",
      fontWeight: "800",
      textAlign: "right",
    },
    paginationStyle: {
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      gap: "16px",
      marginTop: "20px",
    },
    pageButtonStyle: {
      padding: "10px 18px",
      borderRadius: "999px",
      border: `1px solid ${COLORS.cardBorder}`,
      background: COLORS.cardBg,
      color: COLORS.white,
      fontSize: "13px",
      fontWeight: "700",
      cursor: "pointer",
    },
    pageInfoStyle: { color: COLORS.textMuted, fontSize: "13px" },
  };
}

const { bag: driverTheme, syncDriverTheme } = bindDriverTheme(buildStyles);

// ─── Main Component ─────────────────────────────────────────────────────────
export default function DriverRideHistory() {
  const { yalaUI } = syncDriverTheme();
  const styles = driverTheme.styles;
  const COLORS = driverTheme.COLORS;
  const [rides, setRides] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const fetchRides = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ page: String(page) });
      if (statusFilter) params.append("status", statusFilter);
      if (dateFrom) params.append("date_from", dateFrom);
      if (dateTo) params.append("date_to", dateTo);

      const response = await authenticatedApi.get(
        `${API_URL}/drivers/me/rides/?${params.toString()}`
      );

      const data = response.data;
      const results = Array.isArray(data) ? data : data.results || [];
      setRides(results);
      setHasMore(Boolean(data.next));
    } catch (error) {
      console.log("Ride history fetch error:", error.response?.data || error);
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, dateFrom, dateTo]);

  useEffect(() => {
    fetchRides();
  }, [fetchRides]);

  const getStatusColor = (status) => {
    switch (status) {
      case "completed": return "#10B981";
      case "cancelled": return "#EF4444";
      case "in_progress": return COLORS.goldAccent;
      default: return COLORS.textMuted;
    }
  };

  return (
    <div
      className={yalaUI ? "driver-page--lyft" : undefined}
      style={{
        ...styles.containerStyle,
        ...(yalaUI ? { minHeight: "auto", paddingTop: 12 } : null),
      }}
    >
      {!yalaUI && (
      <header style={styles.headerStyle}>
        <h1 style={styles.titleStyle}>Ride History</h1>
      </header>
      )}

      {/* Filters */}
      <div style={styles.filtersStyle}>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          style={styles.selectStyle}
          aria-label="Filter by status"
        >
          <option value="">All statuses</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
          <option value="in_progress">In Progress</option>
        </select>
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
          style={styles.dateInputStyle}
          aria-label="From date"
        />
        <input
          type="date"
          value={dateTo}
          onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
          style={styles.dateInputStyle}
          aria-label="To date"
        />
      </div>

      {loading ? (
        <div style={styles.loadingStyle}>Loading ride history...</div>
      ) : rides.length === 0 ? (
        <div style={styles.emptyStyle}>
          <span style={styles.emptyIconStyle}>🚗</span>
          <p style={styles.emptyTextStyle}>No rides found.</p>
          <p style={styles.emptySubtextStyle}>Your completed rides will appear here.</p>
        </div>
      ) : (
        <div style={styles.listStyle}>
          {rides.map((ride) => (
            <div key={ride.id} style={styles.rideCardStyle}>
              <div style={styles.rideHeaderStyle}>
                <span style={styles.rideDateStyle}>
                  {ride.created_at
                    ? new Date(ride.created_at).toLocaleDateString()
                    : ""}
                </span>
                <span style={{ ...styles.rideStatusStyle, color: getStatusColor(ride.status) }}>
                  {ride.status}
                </span>
              </div>
              <div style={styles.rideBodyStyle}>
                <div style={styles.locationRowStyle}>
                  <span style={styles.dotPickupStyle} />
                  <span style={styles.locationTextStyle}>{ride.pickup_address || ride.pickup || "Pickup"}</span>
                </div>
                <div style={styles.locationRowStyle}>
                  <span style={styles.dotDropoffStyle} />
                  <span style={styles.locationTextStyle}>{ride.destination_address || ride.destination || "Destination"}</span>
                </div>
              </div>
              <div style={styles.rideFareStyle}>
                {formatMoney(ride.fare || ride.driver_earning || 0)}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      <div style={styles.paginationStyle}>
        <button
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page <= 1}
          style={{ ...styles.pageButtonStyle, opacity: page <= 1 ? 0.4 : 1 }}
        >
          Previous
        </button>
        <span style={styles.pageInfoStyle}>Page {page}</span>
        <button
          onClick={() => setPage((p) => p + 1)}
          disabled={!hasMore}
          style={{ ...styles.pageButtonStyle, opacity: !hasMore ? 0.4 : 1 }}
        >
          Next
        </button>
      </div>
    </div>
  );
}
