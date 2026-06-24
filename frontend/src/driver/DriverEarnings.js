import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";

import { API_URL } from "../apiConfig";
import { MARKET } from "../marketConfig";
import { bindDriverTheme } from "./themeRefresh";

// ─── Constants ──────────────────────────────────────────────────────────────
const PERIODS = ["today", "week", "month", "year", "lifetime"];
const CHART_PERIODS = ["daily", "weekly", "monthly"];
const MAX_RETRIES = 3;
const RETRY_INTERVAL_MS = 5000;
const EARNINGS_REFRESH_INTERVAL_MS = 10000;

const toAmount = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizePeriodTotal = (periodData = {}) =>
  toAmount(periodData.total_earnings ?? periodData.total ?? 0);

function normalizeEarningsPayload(payload = {}) {
  // New backend shape:
  // { earnings: { today: { total_earnings }, ... }, bonus_breakdowns: { ... } }
  if (payload.earnings && typeof payload.earnings === "object") {
    const periods = payload.earnings;
    const breakdowns = payload.bonus_breakdowns || {};

    const mapBreakdown = (entry = {}) => ({
      bonus: toAmount(entry.bonus ?? entry.bonus_earnings ?? 0),
      incentive: toAmount(entry.incentive ?? entry.incentive_earnings ?? 0),
      referral: toAmount(entry.referral ?? entry.referral_earnings ?? 0),
    });

    return {
      today_earnings: normalizePeriodTotal(periods.today),
      week_earnings: normalizePeriodTotal(periods.week),
      month_earnings: normalizePeriodTotal(periods.month),
      year_earnings: normalizePeriodTotal(periods.year),
      total_earnings: normalizePeriodTotal(periods.lifetime),
      breakdown: {
        today: mapBreakdown(breakdowns.today),
        week: mapBreakdown(breakdowns.week),
        month: mapBreakdown(breakdowns.month),
        year: mapBreakdown(breakdowns.year),
        lifetime: mapBreakdown(breakdowns.lifetime),
      },
    };
  }

  // Legacy shape (already flat)
  return {
    ...payload,
    today_earnings: toAmount(payload.today_earnings),
    week_earnings: toAmount(payload.week_earnings),
    month_earnings: toAmount(payload.month_earnings),
    year_earnings: toAmount(payload.year_earnings),
    total_earnings: toAmount(payload.total_earnings),
  };
}

function normalizeChartPayload(payload) {
  // Supports all shapes:
  // - [ ... ]
  // - { data: [ ... ] }
  // - { chart_data: [ ... ] }
  const list = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.data)
      ? payload.data
      : Array.isArray(payload?.chart_data)
        ? payload.chart_data
        : [];

  return list.map((item) => ({
    ...item,
    value: toAmount(item?.value ?? item?.earnings ?? 0),
    earnings: toAmount(item?.earnings ?? item?.value ?? 0),
  }));
}

// ─── Currency Formatter (always 2 decimal places) ───────────────────────────
/**
 * Formats a numeric value as MRU with exactly 2 decimal places.
 * @param {number} amount - The monetary value
 * @returns {string} Formatted string e.g. "1,234.56 MRU"
 */
export function formatEarningsMRU(amount) {
  const value = Number(amount || 0);
  return `${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${MARKET.currency}`;
}

// ─── Day/Month Labels ───────────────────────────────────────────────────────
const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// ─── Bar Chart Component ────────────────────────────────────────────────────
function EarningsBarChart({ data, labels, chartPeriod }) {
  const maxValue = Math.max(...data.map((d) => Number(d.value || 0)), 1);
  const CHART_HEIGHT = 160;
  const MIN_BAR_HEIGHT = 6; // baseline height for zero-value bars
  const { styles, COLORS } = driverTheme;

  return (
    <div style={styles.chartContainer} role="img" aria-label={`${chartPeriod} earnings bar chart`}>
      <div style={styles.chartBars}>
        {data.map((item, index) => {
          const value = Number(item.value || 0);
          const barHeight = value > 0
            ? Math.max((value / maxValue) * CHART_HEIGHT, MIN_BAR_HEIGHT)
            : MIN_BAR_HEIGHT;
          const isZero = value === 0;

          return (
            <div key={index} style={styles.barColumn}>
              <div style={styles.barWrapper}>
                <div
                  style={{
                    ...styles.bar,
                    height: `${barHeight}px`,
                    backgroundColor: isZero ? COLORS.barZero : COLORS.primaryGreen,
                    opacity: isZero ? 0.5 : 1,
                  }}
                  title={`${labels[index] || item.label || ""}: ${formatEarningsMRU(value)}`}
                  role="presentation"
                />
              </div>
              <span style={styles.barLabel}>{labels[index] || item.label || ""}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Period Tab Button ──────────────────────────────────────────────────────
function PeriodTab({ label, active, onClick }) {
  const { styles, COLORS } = driverTheme;
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        ...styles.periodTab,
        backgroundColor: active ? COLORS.primaryGreen : "transparent",
        color: active ? COLORS.onPrimary : COLORS.lightGray,
        borderColor: active ? COLORS.primaryGreen : COLORS.cardBorder,
      }}
      aria-pressed={active}
    >
      {label}
    </button>
  );
}

// ─── Chart Period Tab ───────────────────────────────────────────────────────
function ChartPeriodTab({ label, active, onClick }) {
  const { styles, COLORS } = driverTheme;
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        ...styles.chartPeriodTab,
        backgroundColor: active ? COLORS.darkNavy : "transparent",
        color: active ? COLORS.white : COLORS.textMuted,
      }}
    >
      {label}
    </button>
  );
}

// ─── Line Item Component ────────────────────────────────────────────────────
function EarningsLineItem({ label, amount, icon }) {
  const { styles } = driverTheme;
  return (
    <div style={styles.lineItem}>
      <div style={styles.lineItemLeft}>
        <span style={styles.lineItemIcon}>{icon}</span>
        <span style={styles.lineItemLabel}>{label}</span>
      </div>
      <span style={styles.lineItemAmount}>{formatEarningsMRU(amount)}</span>
    </div>
  );
}

// ─── Main Earnings Center Component ─────────────────────────────────────────
export default function DriverEarnings() {
  const { lyftUI } = syncDriverTheme();
  const { COLORS, styles } = driverTheme;
  const token = localStorage.getItem("access");

  const [activePeriod, setActivePeriod] = useState("today");
  const [chartPeriod, setChartPeriod] = useState("daily");
  const [earnings, setEarnings] = useState(null);
  const [chartData, setChartData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [chartLoading, setChartLoading] = useState(false);
  const [error, setError] = useState(null);
  const [syncing, setSyncing] = useState(false);

  const retryCountRef = useRef(0);
  const retryTimerRef = useRef(null);
  const refreshTimerRef = useRef(null);

  const authHeaders = useMemo(
    () => ({ headers: { Authorization: `Bearer ${token}` } }),
    [token]
  );

  // ─── Fetch Earnings Data ────────────────────────────────────────────────
  const fetchEarnings = useCallback(async (isRetry = false) => {
    if (!token) return;

    if (!isRetry) {
      setLoading(true);
      setError(null);
    }

    try {
      const response = await axios.get(
        `${API_URL}/drivers/me/earnings/`,
        authHeaders
      );
      setEarnings(normalizeEarningsPayload(response.data || {}));
      retryCountRef.current = 0;
      setSyncing(false);
    } catch (err) {
      if (isRetry && retryCountRef.current < MAX_RETRIES) {
        retryCountRef.current += 1;
        setSyncing(true);
        retryTimerRef.current = setTimeout(() => {
          fetchEarnings(true);
        }, RETRY_INTERVAL_MS);
      } else if (!isRetry) {
        setError("Failed to load earnings. Please try again.");
        console.error("Earnings fetch error:", err);
      } else {
        setSyncing(false);
        setError("Earnings sync failed. Please refresh.");
      }
    } finally {
      if (!isRetry) {
        setLoading(false);
      }
    }
  }, [authHeaders, token]);

  // ─── Fetch Chart Data ───────────────────────────────────────────────────
  const fetchChartData = useCallback(async (period) => {
    if (!token) return;
    setChartLoading(true);

    try {
      const response = await axios.get(
        `${API_URL}/drivers/me/earnings/chart/?period=${period}`,
        authHeaders
      );
      setChartData(normalizeChartPayload(response.data));
    } catch (err) {
      console.error("Chart data fetch error:", err);
      setChartData([]);
    } finally {
      setChartLoading(false);
    }
  }, [authHeaders, token]);

  // ─── Initial Load ───────────────────────────────────────────────────────
  useEffect(() => {
    fetchEarnings();
  }, [fetchEarnings]);

  useEffect(() => () => {
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
  }, []);

  // ─── Auto-refresh earnings (within 10 seconds of ride completion) ───────
  useEffect(() => {
    refreshTimerRef.current = setInterval(() => {
      fetchEarnings(true);
    }, EARNINGS_REFRESH_INTERVAL_MS);

    return () => {
      if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
    };
  }, [fetchEarnings]);

  // ─── Fetch chart data when chart period changes ─────────────────────────
  useEffect(() => {
    fetchChartData(chartPeriod);
  }, [chartPeriod, fetchChartData]);

  // ─── Get period earnings value ──────────────────────────────────────────
  const getPeriodEarnings = (period) => {
    if (!earnings) return 0;
    switch (period) {
      case "today": return toAmount(earnings.today_earnings);
      case "week": return toAmount(earnings.week_earnings);
      case "month": return toAmount(earnings.month_earnings);
      case "year": return toAmount(earnings.year_earnings);
      case "lifetime": return toAmount(earnings.total_earnings);
      default: return 0;
    }
  };

  // ─── Get bonus breakdown for active period ──────────────────────────────
  const getBonusBreakdown = () => {
    if (!earnings || !earnings.breakdown) {
      return { bonus: 0, incentive: 0, referral: 0 };
    }
    const breakdown = earnings.breakdown[activePeriod] || earnings.breakdown || {};
    return {
      bonus: toAmount(breakdown.bonus ?? breakdown.bonus_earnings),
      incentive: toAmount(breakdown.incentive ?? breakdown.incentive_earnings),
      referral: toAmount(breakdown.referral ?? breakdown.referral_earnings),
    };
  };

  // ─── Prepare chart labels ──────────────────────────────────────────────
  const getChartLabels = () => {
    if (chartPeriod === "daily") return DAY_LABELS;
    if (chartPeriod === "monthly") return MONTH_LABELS;
    // Weekly: generate week labels based on data length
    return Array.isArray(chartData) ? chartData.map((_, i) => `W${i + 1}`) : [];
  };

  // ─── Normalize chart data to ensure correct bar count ──────────────────
  const getNormalizedChartData = () => {
    if (chartPeriod === "daily") {
      // Ensure exactly 7 bars
      const normalized = Array.from({ length: 7 }, (_, i) => ({
        value: chartData[i]?.value || chartData[i]?.earnings || 0,
        label: DAY_LABELS[i],
      }));
      return normalized;
    }
    if (chartPeriod === "monthly") {
      // Ensure exactly 12 bars
      const normalized = Array.from({ length: 12 }, (_, i) => ({
        value: chartData[i]?.value || chartData[i]?.earnings || 0,
        label: MONTH_LABELS[i],
      }));
      return normalized;
    }
    // Weekly: variable number of bars (weeks in current month)
    if (chartData.length === 0) {
      return Array.from({ length: 4 }, (_, i) => ({
        value: 0,
        label: `W${i + 1}`,
      }));
    }
    return chartData.map((item, i) => ({
      value: item.value || item.earnings || 0,
      label: item.label || `W${i + 1}`,
    }));
  };

  // ─── Render ─────────────────────────────────────────────────────────────
  const breakdown = getBonusBreakdown();
  const normalizedData = getNormalizedChartData();
  const chartLabels = getChartLabels();
  const weekTotal = getPeriodEarnings("week");

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.loadingContainer}>
          <div style={styles.spinner} />
          <p style={styles.loadingText}>Loading earnings...</p>
        </div>
      </div>
    );
  }

  if (error && !earnings) {
    return (
      <div style={styles.container}>
        <div style={styles.errorContainer}>
          <p style={styles.errorText}>{error}</p>
          <button
            type="button"
            onClick={() => fetchEarnings()}
            style={styles.retryButton}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={lyftUI ? "driver-page--lyft" : undefined}
      style={{
        ...styles.container,
        ...(lyftUI ? { minHeight: "auto", paddingTop: 12 } : null),
      }}
    >
      {/* Header */}
      {!lyftUI && (
      <div style={styles.header}>
        <h1 style={styles.title}>Earnings</h1>
        {syncing && (
          <span style={styles.syncBadge}>Syncing...</span>
        )}
      </div>
      )}
      {lyftUI && syncing && (
        <div style={{ ...styles.header, marginBottom: 12 }}>
          <span style={styles.syncBadge}>Syncing...</span>
        </div>
      )}

      {/* Period Tabs */}
      <div style={styles.periodTabs} role="tablist" aria-label="Earnings period">
        {PERIODS.map((period) => (
          <PeriodTab
            key={period}
            label={period.charAt(0).toUpperCase() + period.slice(1)}
            active={activePeriod === period}
            onClick={() => setActivePeriod(period)}
          />
        ))}
      </div>

      {/* Main Earnings Display */}
      <div style={styles.earningsCard}>
        <span style={styles.earningsLabel}>
          {activePeriod === "today" ? "Today's Earnings" :
           activePeriod === "week" ? "This Week" :
           activePeriod === "month" ? "This Month" :
           activePeriod === "year" ? "This Year" : "Lifetime Earnings"}
        </span>
        <h2 style={styles.earningsAmount}>
          {formatEarningsMRU(getPeriodEarnings(activePeriod))}
        </h2>
        {activePeriod !== "week" && (
          <span style={styles.weekTotalHint}>
            Week total: {formatEarningsMRU(weekTotal)}
          </span>
        )}
      </div>

      {/* Bonus/Incentive/Referral Line Items */}
      <div style={styles.breakdownCard}>
        <h3 style={styles.breakdownTitle}>Breakdown</h3>
        <EarningsLineItem label="Bonus" amount={breakdown.bonus} icon="🎁" />
        <EarningsLineItem label="Incentive" amount={breakdown.incentive} icon="⚡" />
        <EarningsLineItem label="Referral" amount={breakdown.referral} icon="🤝" />
      </div>

      {/* Chart Section */}
      <div style={styles.chartCard}>
        <div style={styles.chartHeader}>
          <h3 style={styles.chartTitle}>Earnings Chart</h3>
          <div style={styles.chartPeriodTabs}>
            {CHART_PERIODS.map((period) => (
              <ChartPeriodTab
                key={period}
                label={period.charAt(0).toUpperCase() + period.slice(1)}
                active={chartPeriod === period}
                onClick={() => setChartPeriod(period)}
              />
            ))}
          </div>
        </div>

        {chartLoading ? (
          <div style={styles.chartLoadingContainer}>
            <div style={styles.spinnerSmall} />
          </div>
        ) : (
          <EarningsBarChart
            data={normalizedData}
            labels={chartLabels}
            chartPeriod={chartPeriod}
          />
        )}
      </div>

      {/* Back to Dashboard */}
      {!lyftUI && (
      <button
        type="button"
        onClick={() => { window.location.href = "/driver"; }}
        style={styles.backButton}
      >
        ← Back to Dashboard
      </button>
      )}
    </div>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────
const theme = bindDriverTheme((COLORS) => ({
  container: {
    minHeight: "100vh",
    backgroundColor: COLORS.darkNavy,
    color: COLORS.white,
    padding: "20px",
    fontFamily: "'Plus Jakarta Sans', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    maxWidth: "428px",
    margin: "0 auto",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: "20px",
  },
  title: {
    fontSize: "26px",
    fontWeight: "800",
    margin: 0,
    color: COLORS.white,
  },
  syncBadge: {
    fontSize: "11px",
    backgroundColor: COLORS.goldAccent,
    color: COLORS.darkNavy,
    padding: "6px 12px",
    borderRadius: "999px",
    fontWeight: "700",
  },
  periodTabs: {
    display: "flex",
    gap: "8px",
    marginBottom: "20px",
    overflowX: "auto",
  },
  periodTab: {
    padding: "8px 16px",
    borderRadius: "999px",
    border: "1px solid",
    fontSize: "13px",
    fontWeight: "700",
    cursor: "pointer",
    whiteSpace: "nowrap",
    transition: "all 0.2s ease",
  },
  earningsCard: {
    backgroundColor: COLORS.cardBg,
    border: `1px solid ${COLORS.cardBorder}`,
    borderRadius: "16px",
    padding: "24px",
    marginBottom: "16px",
    textAlign: "center",
  },
  earningsLabel: {
    fontSize: "14px",
    color: COLORS.lightGray,
    display: "block",
    marginBottom: "8px",
  },
  earningsAmount: {
    fontSize: "32px",
    fontWeight: "800",
    color: COLORS.primaryGreen,
    margin: 0,
  },
  weekTotalHint: {
    display: "block",
    marginTop: "10px",
    fontSize: "12px",
    fontWeight: "700",
    color: COLORS.textMuted,
    letterSpacing: "0.01em",
  },
  breakdownCard: {
    backgroundColor: COLORS.cardBg,
    border: `1px solid ${COLORS.cardBorder}`,
    borderRadius: "16px",
    padding: "20px",
    marginBottom: "16px",
  },
  breakdownTitle: {
    fontSize: "17px",
    fontWeight: "700",
    marginTop: 0,
    marginBottom: "16px",
    color: COLORS.white,
  },
  lineItem: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "10px 0",
    borderBottom: `1px solid ${COLORS.cardBorder}`,
  },
  lineItemLeft: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
  },
  lineItemIcon: {
    fontSize: "18px",
  },
  lineItemLabel: {
    fontSize: "14px",
    color: COLORS.lightGray,
  },
  lineItemAmount: {
    fontSize: "14px",
    fontWeight: "600",
    color: COLORS.white,
  },
  chartCard: {
    backgroundColor: COLORS.cardBg,
    border: `1px solid ${COLORS.cardBorder}`,
    borderRadius: "16px",
    padding: "20px",
    marginBottom: "16px",
  },
  chartHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: "20px",
    flexWrap: "wrap",
    gap: "10px",
  },
  chartTitle: {
    fontSize: "17px",
    fontWeight: "700",
    margin: 0,
    color: COLORS.white,
  },
  chartPeriodTabs: {
    display: "flex",
    gap: "4px",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: "999px",
    padding: "3px",
  },
  chartPeriodTab: {
    padding: "6px 12px",
    borderRadius: "999px",
    border: "none",
    fontSize: "12px",
    fontWeight: "700",
    cursor: "pointer",
    transition: "all 0.2s ease",
  },
  chartContainer: {
    width: "100%",
    padding: "10px 0",
  },
  chartBars: {
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "space-between",
    height: "180px",
    gap: "4px",
    padding: "0 4px",
  },
  barColumn: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    flex: 1,
    gap: "8px",
  },
  barWrapper: {
    display: "flex",
    alignItems: "flex-end",
    height: "160px",
    width: "100%",
    justifyContent: "center",
  },
  bar: {
    width: "100%",
    maxWidth: "32px",
    borderRadius: "4px 4px 0 0",
    transition: "height 0.3s ease, background-color 0.3s ease",
    minHeight: "6px",
  },
  barLabel: {
    fontSize: "10px",
    color: COLORS.textMuted,
    textAlign: "center",
    whiteSpace: "nowrap",
  },
  chartLoadingContainer: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    height: "180px",
  },
  loadingContainer: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "60vh",
    gap: "16px",
  },
  loadingText: {
    color: COLORS.lightGray,
    fontSize: "14px",
  },
  spinner: {
    width: "32px",
    height: "32px",
    border: `3px solid ${COLORS.cardBorder}`,
    borderTopColor: COLORS.primaryGreen,
    borderRadius: "50%",
    animation: "spin 0.8s linear infinite",
  },
  spinnerSmall: {
    width: "20px",
    height: "20px",
    border: `2px solid ${COLORS.cardBorder}`,
    borderTopColor: COLORS.primaryGreen,
    borderRadius: "50%",
    animation: "spin 0.8s linear infinite",
  },
  errorContainer: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "60vh",
    gap: "16px",
  },
  errorText: {
    color: "#EF4444",
    fontSize: "14px",
    textAlign: "center",
  },
  retryButton: {
    padding: "10px 24px",
    backgroundColor: COLORS.primaryGreen,
    color: COLORS.white,
    border: "none",
    borderRadius: "999px",
    fontSize: "14px",
    fontWeight: "700",
    cursor: "pointer",
  },
  backButton: {
    width: "100%",
    padding: "14px",
    backgroundColor: "transparent",
    color: COLORS.lightGray,
    border: `1px solid ${COLORS.cardBorder}`,
    borderRadius: "999px",
    fontSize: "14px",
    fontWeight: "600",
    cursor: "pointer",
    textAlign: "center",
    marginTop: "8px",
  },
}));

const { bag: driverTheme, syncDriverTheme } = theme;
