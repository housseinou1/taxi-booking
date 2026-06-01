import React, { useState, useEffect, useCallback, useMemo } from "react";
import axios from "axios";
import { API_URL } from "../../apiConfig";
import { formatMoney } from "../../marketConfig";

const DATE_RANGES = [
  { key: "today", label: "Today" },
  { key: "week", label: "This Week" },
  { key: "month", label: "This Month" },
  { key: "custom", label: "Custom" },
];

function getDateRange(rangeKey) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  switch (rangeKey) {
    case "today":
      return {
        date_from: today.toISOString().split("T")[0],
        date_to: now.toISOString().split("T")[0],
      };
    case "week": {
      const weekStart = new Date(today);
      weekStart.setDate(today.getDate() - today.getDay());
      return {
        date_from: weekStart.toISOString().split("T")[0],
        date_to: now.toISOString().split("T")[0],
      };
    }
    case "month": {
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
      return {
        date_from: monthStart.toISOString().split("T")[0],
        date_to: now.toISOString().split("T")[0],
      };
    }
    default:
      return { date_from: "", date_to: "" };
  }
}

export default function ShareAdminDashboard() {
  const [dateRange, setDateRange] = useState("month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [metrics, setMetrics] = useState(null);
  const [chartData, setChartData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const dateParams = useMemo(() => {
    if (dateRange === "custom") {
      return { date_from: customFrom, date_to: customTo };
    }
    return getDateRange(dateRange);
  }, [dateRange, customFrom, customTo]);

  const fetchData = useCallback(async () => {
    if (!dateParams.date_from || !dateParams.date_to) return;

    setLoading(true);
    setError("");

    try {
      const token = localStorage.getItem("access");
      const headers = { Authorization: `Bearer ${token}` };
      const params = dateParams;

      const [metricsRes, chartRes] = await Promise.all([
        axios.get(`${API_URL}/api/admin/share/analytics/`, { headers, params }),
        axios.get(`${API_URL}/api/admin/share/analytics/chart/`, {
          headers,
          params,
        }),
      ]);

      setMetrics(metricsRes.data);
      setChartData(chartRes.data);
    } catch (err) {
      setError(
        err.response?.data?.error ||
          err.response?.data?.detail ||
          "Failed to load analytics."
      );
    } finally {
      setLoading(false);
    }
  }, [dateParams]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const maxChartValue = useMemo(() => {
    if (!chartData) return 1;
    const values = [
      ...(chartData.share_volume || []),
      ...(chartData.economy_volume || []),
    ];
    return Math.max(...values, 1);
  }, [chartData]);

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <h1 style={styles.title}>Share Analytics</h1>
        <p style={styles.subtitle}>Yala Share ride performance</p>
      </div>

      {/* Date range filter */}
      <div style={styles.filterContainer}>
        <div style={styles.filterButtons}>
          {DATE_RANGES.map((range) => (
            <button
              key={range.key}
              onClick={() => setDateRange(range.key)}
              style={{
                ...styles.filterButton,
                backgroundColor:
                  dateRange === range.key
                    ? "#00A651"
                    : "rgba(255,255,255,0.06)",
                color:
                  dateRange === range.key
                    ? "#FFFFFF"
                    : "rgba(255,255,255,0.7)",
              }}
              aria-label={`Filter by ${range.label}`}
              aria-pressed={dateRange === range.key}
            >
              {range.label}
            </button>
          ))}
        </div>

        {dateRange === "custom" && (
          <div style={styles.customDateRow}>
            <input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              style={styles.dateInput}
              aria-label="Start date"
            />
            <span style={styles.dateSeparator}>to</span>
            <input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              style={styles.dateInput}
              aria-label="End date"
            />
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div style={styles.errorBanner} role="alert">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div style={styles.loadingContainer}>
          <div style={styles.spinner} />
        </div>
      )}

      {/* Metrics cards */}
      {!loading && metrics && (
        <>
          <div style={styles.metricsGrid}>
            <MetricCard
              label="Total Rides"
              value={metrics.total_rides || 0}
              icon="🚗"
            />
            <MetricCard
              label="Money Saved"
              value={formatMoney(metrics.total_savings || 0)}
              icon="💰"
              highlight
            />
            <MetricCard
              label="Revenue"
              value={formatMoney(metrics.platform_revenue || 0)}
              icon="📈"
            />
            <MetricCard
              label="Avg Occupancy"
              value={`${(metrics.avg_occupancy || 0).toFixed(1)} pax`}
              icon="👥"
            />
            <MetricCard
              label="Driver Earnings"
              value={formatMoney(metrics.driver_earnings || 0)}
              icon="🏆"
            />
            <MetricCard
              label="Route Efficiency"
              value={`${Math.round((metrics.route_efficiency || 0) * 100)}%`}
              icon="🗺️"
            />
          </div>

          {/* Chart: Share vs Economy */}
          {chartData && (
            <div style={styles.chartSection}>
              <h3 style={styles.chartTitle}>Share vs Economy Volume</h3>
              <div style={styles.chartLegend}>
                <div style={styles.legendItem}>
                  <span
                    style={{
                      ...styles.legendDot,
                      backgroundColor: "#00A651",
                    }}
                  />
                  <span style={styles.legendLabel}>Share</span>
                </div>
                <div style={styles.legendItem}>
                  <span
                    style={{
                      ...styles.legendDot,
                      backgroundColor: "rgba(255,255,255,0.4)",
                    }}
                  />
                  <span style={styles.legendLabel}>Economy</span>
                </div>
              </div>
              <div style={styles.chartContainer}>
                {(chartData.labels || []).map((label, index) => {
                  const shareVal = chartData.share_volume?.[index] || 0;
                  const econVal = chartData.economy_volume?.[index] || 0;
                  const shareHeight = (shareVal / maxChartValue) * 100;
                  const econHeight = (econVal / maxChartValue) * 100;

                  return (
                    <div key={label} style={styles.chartColumn}>
                      <div style={styles.barsContainer}>
                        <div
                          style={{
                            ...styles.bar,
                            height: `${shareHeight}%`,
                            backgroundColor: "#00A651",
                          }}
                          title={`Share: ${shareVal}`}
                          aria-label={`Share rides ${label}: ${shareVal}`}
                        />
                        <div
                          style={{
                            ...styles.bar,
                            height: `${econHeight}%`,
                            backgroundColor: "rgba(255,255,255,0.3)",
                          }}
                          title={`Economy: ${econVal}`}
                          aria-label={`Economy rides ${label}: ${econVal}`}
                        />
                      </div>
                      <span style={styles.chartLabel}>{label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {/* Empty state */}
      {!loading && !error && !metrics && (
        <div style={styles.emptyState}>
          <p style={styles.emptyText}>No data available for this period.</p>
        </div>
      )}
    </div>
  );
}

function MetricCard({ label, value, icon, highlight }) {
  return (
    <div style={styles.metricCard}>
      <div style={styles.metricIcon}>{icon}</div>
      <div
        style={{
          ...styles.metricValue,
          color: highlight ? "#D4AF37" : "#FFFFFF",
        }}
      >
        {value}
      </div>
      <div style={styles.metricLabel}>{label}</div>
    </div>
  );
}

const styles = {
  container: {
    minHeight: "100vh",
    backgroundColor: "#0B1220",
    color: "#FFFFFF",
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    padding: "24px 20px",
    maxWidth: "1024px",
    margin: "0 auto",
  },
  header: {
    marginBottom: "24px",
  },
  title: {
    fontSize: "26px",
    fontWeight: 700,
    color: "#FFFFFF",
    marginBottom: "4px",
  },
  subtitle: {
    fontSize: "14px",
    color: "rgba(255,255,255,0.5)",
  },
  filterContainer: {
    marginBottom: "24px",
  },
  filterButtons: {
    display: "flex",
    gap: "8px",
    flexWrap: "wrap",
  },
  filterButton: {
    padding: "10px 16px",
    borderRadius: "12px",
    border: "1px solid rgba(255,255,255,0.1)",
    fontSize: "13px",
    fontWeight: 500,
    cursor: "pointer",
    transition: "all 300ms ease",
  },
  customDateRow: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    marginTop: "12px",
  },
  dateInput: {
    padding: "10px 12px",
    borderRadius: "10px",
    border: "1px solid rgba(255,255,255,0.15)",
    backgroundColor: "rgba(255,255,255,0.06)",
    color: "#FFFFFF",
    fontSize: "13px",
    outline: "none",
  },
  dateSeparator: {
    fontSize: "13px",
    color: "rgba(255,255,255,0.5)",
  },
  errorBanner: {
    backgroundColor: "rgba(239,68,68,0.15)",
    border: "1px solid #EF4444",
    borderRadius: "12px",
    padding: "12px 16px",
    color: "#EF4444",
    fontSize: "14px",
    marginBottom: "16px",
    textAlign: "center",
  },
  loadingContainer: {
    display: "flex",
    justifyContent: "center",
    padding: "60px 0",
  },
  spinner: {
    width: "40px",
    height: "40px",
    border: "3px solid rgba(255,255,255,0.1)",
    borderTopColor: "#00A651",
    borderRadius: "50%",
    animation: "spin 1s linear infinite",
  },
  metricsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
    gap: "12px",
    marginBottom: "32px",
  },
  metricCard: {
    backgroundColor: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: "20px",
    padding: "20px 16px",
    textAlign: "center",
    transition: "transform 300ms ease",
  },
  metricIcon: {
    fontSize: "24px",
    marginBottom: "8px",
  },
  metricValue: {
    fontSize: "20px",
    fontWeight: 700,
    marginBottom: "4px",
  },
  metricLabel: {
    fontSize: "11px",
    color: "rgba(255,255,255,0.5)",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
  },
  chartSection: {
    backgroundColor: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: "20px",
    padding: "24px 20px",
  },
  chartTitle: {
    fontSize: "16px",
    fontWeight: 600,
    color: "#FFFFFF",
    marginBottom: "12px",
  },
  chartLegend: {
    display: "flex",
    gap: "16px",
    marginBottom: "20px",
  },
  legendItem: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
  },
  legendDot: {
    width: "10px",
    height: "10px",
    borderRadius: "3px",
  },
  legendLabel: {
    fontSize: "12px",
    color: "rgba(255,255,255,0.7)",
  },
  chartContainer: {
    display: "flex",
    alignItems: "flex-end",
    gap: "8px",
    height: "180px",
    paddingTop: "20px",
  },
  chartColumn: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    height: "100%",
  },
  barsContainer: {
    flex: 1,
    display: "flex",
    gap: "3px",
    alignItems: "flex-end",
    width: "100%",
  },
  bar: {
    flex: 1,
    borderRadius: "4px 4px 0 0",
    minHeight: "4px",
    transition: "height 300ms ease",
  },
  chartLabel: {
    fontSize: "10px",
    color: "rgba(255,255,255,0.5)",
    marginTop: "8px",
    textAlign: "center",
  },
  emptyState: {
    textAlign: "center",
    padding: "60px 20px",
  },
  emptyText: {
    fontSize: "14px",
    color: "rgba(255,255,255,0.5)",
  },
};
