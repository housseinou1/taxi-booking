import React, { useCallback, useEffect, useRef, useState } from "react";

import { API_URL } from "../apiConfig";
import { MARKET } from "../marketConfig";
import { bindDriverTheme } from "./themeRefresh";
import authenticatedApi from "../auth/authenticatedApi";
import { ensureValidAccessToken } from "../auth/session";
import { navigateInApp } from "../navigation/inAppNavigation";
import { DriverLoadingState, DriverErrorState } from "./ui/DriverAppStates";
import "./DriverEarnings.css";

// ─── Constants ──────────────────────────────────────────────────────────────
const PERIODS = ["today", "week", "month", "year", "lifetime"];
const CHART_PERIODS = ["daily", "weekly", "monthly"];
const BREAKDOWN_LABELS = {
  ride_earnings: "Ride earnings",
  waiting_fees: "Waiting fees",
  bonus: "Bonus",
  incentive: "Incentive",
  referral: "Referral",
  tip: "Tips",
};
const BREAKDOWN_ICONS = {
  ride_earnings: "🚗",
  waiting_fees: "⏱️",
  bonus: "🎁",
  incentive: "⚡",
  referral: "🤝",
  tip: "💵",
};
const MAX_RETRIES = 3;
const RETRY_INTERVAL_MS = 5000;
const EARNINGS_REFRESH_INTERVAL_MS = 10000;
const NON_REDIRECTING_AUTH_CONFIG = { suppressAuthRedirect: true };

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
      trips: Array.isArray(payload.trips) ? payload.trips : [],
      last_updated: payload.last_updated ?? payload.updated_at ?? null,
    };
  }

  // Legacy shape (already flat)
  return {
    ...payload,
    trips: Array.isArray(payload.trips) ? payload.trips : [],
    last_updated: payload.last_updated ?? payload.updated_at ?? null,
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

  return (
    <div className="driver-earnings__chart-bars" role="img" aria-label={`${chartPeriod} earnings bar chart`}>
      {data.map((item, index) => {
        const value = Number(item.value || 0);
        const barHeight = value > 0
          ? Math.max((value / maxValue) * CHART_HEIGHT, MIN_BAR_HEIGHT)
          : MIN_BAR_HEIGHT;
        const isZero = value === 0;

        return (
          <div key={index} className="driver-earnings__chart-column">
            <div className="driver-earnings__chart-bar-wrap">
              <div
                className={`driver-earnings__chart-bar${isZero ? " driver-earnings__chart-bar--zero" : ""}`}
                style={{ height: `${barHeight}px` }}
                title={`${labels[index] || item.label || ""}: ${formatEarningsMRU(value)}`}
                role="presentation"
                tabIndex={0}
              />
            </div>
            <span className="driver-earnings__chart-label">{labels[index] || item.label || ""}</span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Period Tab Button ──────────────────────────────────────────────────────
function PeriodTab({ label, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`driver-earnings__tab${active ? " driver-earnings__tab--active" : ""}`}
      aria-pressed={active}
    >
      {label}
    </button>
  );
}

// ─── Chart Period Tab ───────────────────────────────────────────────────────
function ChartPeriodTab({ label, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`driver-earnings__chart-tab${active ? " driver-earnings__chart-tab--active" : ""}`}
      aria-pressed={active}
    >
      {label}
    </button>
  );
}

// ─── Line Item Component ────────────────────────────────────────────────────
function EarningsLineItem({ label, amount, icon }) {
  return (
    <div className="driver-earnings__breakdown-row">
      <div className="driver-earnings__breakdown-left">
        <span className="driver-earnings__breakdown-icon" aria-hidden="true">{icon}</span>
        <span className="driver-earnings__breakdown-label">{label}</span>
      </div>
      <span className="driver-earnings__breakdown-amount">{formatEarningsMRU(amount)}</span>
    </div>
  );
}

// ─── Withdrawal Flow Component ──────────────────────────────────────────────
function WithdrawalSheet({ onClose, onDone }) {
  const { COLORS } = driverTheme;
  const [step, setStep] = useState("loading"); // loading | idle | amount | otp | success
  const [walletData, setWalletData] = useState(null);
  const [amount, setAmount] = useState("");
  const [otp, setOtp] = useState("");
  const [payoutMethod, setPayoutMethod] = useState(null);
  const [working, setWorking] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [wRes, mRes] = await Promise.all([
          authenticatedApi.get(`${API_URL}/payments/withdrawals/`, NON_REDIRECTING_AUTH_CONFIG),
          authenticatedApi.get(`${API_URL}/payments/payout-methods/`, NON_REDIRECTING_AUTH_CONFIG),
        ]);
        if (cancelled) return;
        const wd = wRes.data || {};
        const methods = Array.isArray(mRes.data) ? mRes.data : [];
        setWalletData(wd);
        const def = methods.find((m) => m.is_default) || methods[0] || null;
        setPayoutMethod(def);
        setStep("idle");
      } catch {
        if (!cancelled) setStep("error");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const availableBalance = Number(walletData?.available_balance || 0);
  const minWithdrawal = Number(walletData?.minimum_withdrawal || 500);
  const hasPending = (walletData?.withdrawals || []).some((w) => w.status === "pending");

  const maskPhone = (v = "") => v.length > 4 ? `•••• ${String(v).slice(-4)}` : v;
  const methodLabel = payoutMethod
    ? `${payoutMethod.payout_type?.toUpperCase() || "Mobile money"} · ${maskPhone(payoutMethod.phone_number)}`
    : "No payout method";

  const sendOtp = async () => {
    setWorking(true);
    setErr("");
    try {
      await authenticatedApi.post(`${API_URL}/payments/withdrawals/send-otp/`, {}, NON_REDIRECTING_AUTH_CONFIG);
      setStep("otp");
    } catch (e) {
      setErr(e.response?.data?.error || "Could not send code.");
    } finally { setWorking(false); }
  };

  const submitWithdrawal = async () => {
    if (!otp.trim() || otp.length < 4) { setErr("Enter the verification code."); return; }
    setWorking(true);
    setErr("");
    try {
      await authenticatedApi.post(`${API_URL}/payments/withdrawals/request/`, {
        amount: Number(amount),
        payout_method: payoutMethod?.id,
        otp_code: otp.trim(),
      }, NON_REDIRECTING_AUTH_CONFIG);
      setStep("success");
      onDone?.();
    } catch (e) {
      setErr(e.response?.data?.error || "Could not submit withdrawal.");
    } finally { setWorking(false); }
  };

  const overlayStyle = {
    position: "fixed", inset: 0, zIndex: 9999,
    background: "rgba(0,0,0,0.72)",
    display: "flex", alignItems: "flex-end",
  };
  const sheetStyle = {
    width: "100%", maxWidth: 428, margin: "0 auto",
    background: COLORS.cardBg || "#1a2236",
    borderRadius: "24px 24px 0 0",
    padding: "28px 24px 40px",
    boxSizing: "border-box",
    maxHeight: "90vh",
    overflowY: "auto",
  };
  const titleStyle = { fontSize: 22, lineHeight: 1.2, fontWeight: 800, color: COLORS.white, marginBottom: 4 };
  const subStyle = { fontSize: 13, lineHeight: 1.4, color: COLORS.lightGray, marginBottom: 20 };
  const balStyle = { fontSize: "clamp(28px, 8vw, 36px)", fontWeight: 900, color: COLORS.primaryGreen, marginBottom: 2, wordBreak: "break-word" };
  const inputStyle = {
    width: "100%", boxSizing: "border-box",
    background: "rgba(255,255,255,0.07)", border: `1px solid ${COLORS.cardBorder}`,
    borderRadius: 12, padding: "14px 16px",
    fontSize: 20, fontWeight: 700, color: COLORS.white,
    marginBottom: 12, outline: "none", minHeight: 44,
  };
  const btnStyle = (disabled) => ({
    width: "100%", padding: "16px",
    background: disabled ? "#2d3748" : COLORS.primaryGreen,
    color: disabled ? COLORS.textMuted : "#fff",
    border: "none", borderRadius: 999,
    fontSize: 16, fontWeight: 800, cursor: disabled ? "not-allowed" : "pointer",
    marginBottom: 10, minHeight: 44,
  });
  const cancelStyle = {
    width: "100%", padding: "14px",
    background: "transparent", color: COLORS.lightGray,
    border: `1px solid ${COLORS.cardBorder}`, borderRadius: 999,
    fontSize: 14, fontWeight: 600, cursor: "pointer", minHeight: 44,
  };

  return (
    <div style={overlayStyle} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div
        style={sheetStyle}
        role="dialog"
        aria-modal="true"
        aria-label="Withdraw earnings"
      >
        <div style={{ width: 40, height: 4, background: COLORS.cardBorder, borderRadius: 99, margin: "0 auto 20px" }} />

        {step === "loading" && <p role="status" aria-live="polite" style={{ color: COLORS.lightGray, textAlign: "center" }}>Loading wallet...</p>}
        {step === "error" && <p role="alert" aria-live="assertive" style={{ color: "#ef4444", textAlign: "center" }}>Could not load wallet. Try again.</p>}

        {step === "idle" && (
          <>
            <p style={titleStyle}>Withdraw earnings</p>
            <p style={subStyle}>via {methodLabel}</p>
            <p style={balStyle}>{formatEarningsMRU(availableBalance)}</p>
            <p style={{ ...subStyle, marginBottom: 24 }}>Available balance</p>
            {err && <p style={{ color: "#ef4444", fontSize: 13, marginBottom: 12 }} role="alert" aria-live="assertive">{err}</p>}
            {hasPending && <p style={{ color: "#f59e0b", fontSize: 13, marginBottom: 12 }}>You have a pending withdrawal under review.</p>}
            {!payoutMethod && <p style={{ color: "#ef4444", fontSize: 13, marginBottom: 12 }}>Add a payout method in your profile first.</p>}
            <button
              type="button"
              style={btnStyle(!payoutMethod || hasPending || availableBalance < minWithdrawal)}
              disabled={!payoutMethod || hasPending || availableBalance < minWithdrawal}
              onClick={() => setStep("amount")}
            >
              {availableBalance < minWithdrawal ? `Min. ${formatEarningsMRU(minWithdrawal)} required` : "Withdraw now"}
            </button>
            <button type="button" style={cancelStyle} onClick={onClose}>Cancel</button>
          </>
        )}

        {step === "amount" && (
          <>
            <p style={titleStyle}>How much?</p>
            <p style={subStyle}>Available: {formatEarningsMRU(availableBalance)} · Min: {formatEarningsMRU(minWithdrawal)}</p>
            {err && <p style={{ color: "#ef4444", fontSize: 13, marginBottom: 8 }} role="alert" aria-live="assertive">{err}</p>}
            <input
              type="number"
              style={inputStyle}
              value={amount}
              onChange={(e) => { setErr(""); setAmount(e.target.value); }}
              placeholder={`${minWithdrawal}`}
              min={minWithdrawal}
              max={availableBalance}
              inputMode="decimal"
              aria-label="Withdrawal amount"
            />
            <button
              type="button"
              style={btnStyle(working || !amount || Number(amount) < minWithdrawal || Number(amount) > availableBalance)}
              disabled={working || !amount || Number(amount) < minWithdrawal || Number(amount) > availableBalance}
              onClick={sendOtp}
              aria-busy={working}
            >
              {working ? "Sending code..." : "Continue"}
            </button>
            <button type="button" style={cancelStyle} onClick={() => { setStep("idle"); setErr(""); }}>Back</button>
          </>
        )}

        {step === "otp" && (
          <>
            <p style={titleStyle}>Verify it's you</p>
            <p style={subStyle}>Enter the 6-digit code sent to your phone to confirm {formatEarningsMRU(amount)} withdrawal.</p>
            {err && <p style={{ color: "#ef4444", fontSize: 13, marginBottom: 8 }} role="alert" aria-live="assertive">{err}</p>}
            <input
              type="text"
              style={{ ...inputStyle, letterSpacing: 8, textAlign: "center" }}
              value={otp}
              onChange={(e) => { setErr(""); setOtp(e.target.value.replace(/\D/g, "").slice(0, 6)); }}
              placeholder="······"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              aria-label="One-time verification code"
            />
            <button
              type="button"
              style={btnStyle(working || otp.length < 4)}
              disabled={working || otp.length < 4}
              onClick={submitWithdrawal}
              aria-busy={working}
            >
              {working ? "Submitting..." : `Confirm ${formatEarningsMRU(amount)}`}
            </button>
            <button type="button" style={cancelStyle} onClick={() => { setStep("amount"); setOtp(""); setErr(""); }}>Back</button>
          </>
        )}

        {step === "success" && (
          <>
            <div role="status" aria-live="polite" style={{ textAlign: "center", padding: "20px 0" }}>
              <span aria-hidden="true" style={{ fontSize: 56, marginBottom: 16, display: "block" }}>✅</span>
              <p style={titleStyle}>Withdrawal submitted!</p>
              <p style={subStyle}>{formatEarningsMRU(amount)} is being processed. You'll receive it within 1-2 business days.</p>
            </div>
            <button type="button" style={btnStyle(false)} onClick={onClose}>Done</button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Main Earnings Center Component ─────────────────────────────────────────
export default function DriverEarnings() {
  syncDriverTheme();
  const { styles } = driverTheme;

  const [activePeriod, setActivePeriod] = useState("today");
  const [chartPeriod, setChartPeriod] = useState("daily");
  const [earnings, setEarnings] = useState(null);
  const [chartData, setChartData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [chartLoading, setChartLoading] = useState(false);
  const [error, setError] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [showWithdraw, setShowWithdraw] = useState(false);

  const retryCountRef = useRef(0);
  const retryTimerRef = useRef(null);
  const refreshTimerRef = useRef(null);

  // ─── Fetch Earnings Data ────────────────────────────────────────────────
  const fetchEarnings = useCallback(async (isRetry = false) => {
    if (!isRetry) {
      setLoading(true);
      setError(null);
    }

    const access = await ensureValidAccessToken();
    if (!access) {
      setError("Unable to load earnings. Please try again.");
      setLoading(false);
      setSyncing(false);
      return;
    }

    try {
      const response = await authenticatedApi.get(
        `${API_URL}/drivers/me/earnings/`,
        NON_REDIRECTING_AUTH_CONFIG
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
        setError("Unable to load earnings. Please try again.");
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
  }, []);

  // ─── Fetch Chart Data ───────────────────────────────────────────────────
  const fetchChartData = useCallback(async (period) => {
    const access = await ensureValidAccessToken();
    if (!access) {
      setChartData([]);
      return;
    }

    setChartLoading(true);

    try {
      const response = await authenticatedApi.get(
        `${API_URL}/drivers/me/earnings/chart/?period=${period}`,
        NON_REDIRECTING_AUTH_CONFIG
      );
      setChartData(normalizeChartPayload(response.data));
    } catch (err) {
      console.error("Chart data fetch error:", err);
      setChartData([]);
    } finally {
      setChartLoading(false);
    }
  }, []);

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

  // ─── Get bonus breakdown items for active period ────────────────────────
  const getBreakdownItems = () => {
    if (!earnings || !earnings.breakdown) return [];
    const items = earnings.breakdown[activePeriod] || {};
    return Object.entries(items).map(([key, value]) => {
      const label =
        BREAKDOWN_LABELS[key] ||
        key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      return {
        key,
        label,
        amount: toAmount(value),
        icon: BREAKDOWN_ICONS[key] || "•",
      };
    });
  };

  // ─── Get summary display value with fallback ────────────────────────────
  const getSummaryDisplay = (periodKey) => {
    if (!earnings) return "—";
    const valueKey =
      periodKey === "lifetime" ? "total_earnings" : `${periodKey}_earnings`;
    const raw = earnings[valueKey];
    if (raw === undefined || raw === null) return "—";
    return formatEarningsMRU(toAmount(raw));
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
  const normalizedData = getNormalizedChartData();
  const chartLabels = getChartLabels();
  const weekTotal = getPeriodEarnings("week");
  const hasAnyEarnings = PERIODS.some((period) => getPeriodEarnings(period) > 0);
  const activeAmount = getPeriodEarnings(activePeriod);
  const activeLabel =
    activePeriod === "today" ? "Today's Earnings" :
    activePeriod === "week" ? "This Week" :
    activePeriod === "month" ? "This Month" :
    activePeriod === "year" ? "This Year" : "Lifetime Earnings";
  const summaryPeriods = [
    { key: "today", label: "Today" },
    { key: "week", label: "This Week" },
    { key: "month", label: "This Month" },
    { key: "lifetime", label: "Lifetime" },
  ];
  const breakdownItems = getBreakdownItems();
  const trips = Array.isArray(earnings?.trips) ? earnings.trips : [];
  const lastUpdated = earnings?.last_updated || null;

  if (loading) {
    return (
      <div className="driver-earnings">
        <DriverLoadingState title="Loading earnings..." />
      </div>
    );
  }

  if (error && !earnings) {
    return (
      <div className="driver-earnings">
        <DriverErrorState
          title=""
          message={error}
          actionLabel="Retry"
          onAction={() => fetchEarnings()}
        />
      </div>
    );
  }

  return (
    <main className="driver-earnings">
      {showWithdraw && (
        <WithdrawalSheet
          onClose={() => setShowWithdraw(false)}
          onDone={() => { setShowWithdraw(false); fetchEarnings(); }}
        />
      )}

      <header className="driver-earnings__header">
        <h1 className="driver-earnings__title">Earnings</h1>
        <div className="driver-earnings__actions">
          {syncing && <span className="driver-earnings__sync">Syncing...</span>}
          <button
            type="button"
            className="driver-earnings__refresh"
            aria-label="Refresh earnings"
            onClick={() => fetchEarnings(true)}
            disabled={syncing}
          >
            <span aria-hidden="true">↻</span>
          </button>
        </div>
      </header>

      {lastUpdated && (
        <p className="driver-earnings__last-updated">
          Last updated {new Date(lastUpdated).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
        </p>
      )}

      <div className="driver-earnings__tabs" role="tablist" aria-label="Earnings period">
        {PERIODS.map((period) => (
          <PeriodTab
            key={period}
            label={period.charAt(0).toUpperCase() + period.slice(1)}
            active={activePeriod === period}
            onClick={() => setActivePeriod(period)}
          />
        ))}
      </div>

      <section className="driver-earnings__hero" aria-label={activeLabel}>
        <span className="driver-earnings__hero-label">{activeLabel}</span>
        <h2 className="driver-earnings__hero-amount">{formatEarningsMRU(activeAmount)}</h2>
        {!hasAnyEarnings && (
          <span className="driver-earnings__hero-hint">No earnings yet.</span>
        )}
        {activePeriod !== "week" && hasAnyEarnings && (
          <span className="driver-earnings__hero-hint">
            Week total: {formatEarningsMRU(weekTotal)}
          </span>
        )}
        <button
          type="button"
          onClick={() => navigateInApp("/driver/wallet/withdraw")}
          aria-label="Withdraw earnings"
          className="driver-earnings__withdraw"
        >
          <span aria-hidden="true">💸 </span>
          Withdraw
        </button>
      </section>

      <section className="driver-earnings__summary" aria-label="Earnings summary">
        {summaryPeriods.map(({ key, label }) => {
          const isActive = activePeriod === key;
          return (
            <article
              key={key}
              className={`driver-earnings__summary-card${isActive ? " driver-earnings__summary-card--active" : ""}`}
            >
              <span className="driver-earnings__summary-label">{label}</span>
              <strong className="driver-earnings__summary-amount">{getSummaryDisplay(key)}</strong>
            </article>
          );
        })}
      </section>

      <section className="driver-earnings__section" aria-label="Earnings breakdown">
        <h3 className="driver-earnings__section-title">Breakdown</h3>
        {breakdownItems.length === 0 ? (
          <div className="driver-earnings__empty">No breakdown data for this period.</div>
        ) : (
          breakdownItems.map((item) => (
            <EarningsLineItem
              key={item.key}
              label={item.label}
              amount={item.amount}
              icon={item.icon}
            />
          ))
        )}
      </section>

      <section className="driver-earnings__section" aria-label="Earnings chart">
        <div className="driver-earnings__chart-header">
          <h3 className="driver-earnings__chart-title">Earnings Chart</h3>
          <div className="driver-earnings__chart-tabs" role="tablist" aria-label="Chart period">
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
          <div className="driver-earnings__chart-loading" role="status" aria-live="polite" aria-busy="true" aria-label="Loading chart">
            <div style={styles.spinnerSmall} />
          </div>
        ) : (
          <EarningsBarChart
            data={normalizedData}
            labels={chartLabels}
            chartPeriod={chartPeriod}
          />
        )}
      </section>

      <section className="driver-earnings__section" aria-label="Recent completed trips">
        <h3 className="driver-earnings__section-title">Recent trips</h3>
        {trips.length === 0 ? (
          <div className="driver-earnings__empty">No completed trips yet.</div>
        ) : (
          <ul className="driver-earnings__trip-list" role="list" aria-label="Recent trips list">
            {trips.map((trip) => (
              <li key={trip.id || trip.ride_id} className="driver-earnings__trip-row">
                <div className="driver-earnings__trip-main">
                  <span className="driver-earnings__trip-name">{trip.pickup || trip.name || "Completed ride"}</span>
                  <span className="driver-earnings__trip-meta">
                    {trip.completed_at ? new Date(trip.completed_at).toLocaleDateString() : trip.date || ""}
                    {trip.status ? <span className="driver-earnings__trip-status"> · {trip.status}</span> : null}
                  </span>
                </div>
                <span className="driver-earnings__trip-fare">
                  {trip.fare !== undefined ? formatEarningsMRU(trip.fare) : "—"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <button
        type="button"
        onClick={() => { navigateInApp("/driver"); }}
        aria-label="Back to Dashboard"
        className="driver-earnings__back"
      >
        <span aria-hidden="true">← </span>
        Back to Dashboard
      </button>
    </main>
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
    minHeight: 44,
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
    overflowWrap: "break-word",
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
    overflowWrap: "break-word",
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
    minHeight: 44,
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
