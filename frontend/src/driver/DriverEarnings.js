import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";

import { API_URL } from "../apiConfig";
import { MARKET } from "../marketConfig";
import { bindDriverTheme } from "./themeRefresh";
import authenticatedApi from "../auth/authenticatedApi";

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
          authenticatedApi.get(`${API_URL}/payments/withdrawals/`),
          authenticatedApi.get(`${API_URL}/payments/payout-methods/`),
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
      await authenticatedApi.post(`${API_URL}/payments/withdrawals/send-otp/`, {});
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
      });
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
  };
  const titleStyle = { fontSize: 20, fontWeight: 800, color: COLORS.white, marginBottom: 4 };
  const subStyle = { fontSize: 13, color: COLORS.lightGray, marginBottom: 20 };
  const balStyle = { fontSize: 36, fontWeight: 900, color: COLORS.primaryGreen, marginBottom: 2 };
  const inputStyle = {
    width: "100%", boxSizing: "border-box",
    background: "rgba(255,255,255,0.07)", border: `1px solid ${COLORS.cardBorder}`,
    borderRadius: 12, padding: "14px 16px",
    fontSize: 20, fontWeight: 700, color: COLORS.white,
    marginBottom: 12, outline: "none",
  };
  const btnStyle = (disabled) => ({
    width: "100%", padding: "16px",
    background: disabled ? "#2d3748" : COLORS.primaryGreen,
    color: disabled ? COLORS.textMuted : "#fff",
    border: "none", borderRadius: 999,
    fontSize: 16, fontWeight: 800, cursor: disabled ? "not-allowed" : "pointer",
    marginBottom: 10,
  });
  const cancelStyle = {
    width: "100%", padding: "14px",
    background: "transparent", color: COLORS.lightGray,
    border: `1px solid ${COLORS.cardBorder}`, borderRadius: 999,
    fontSize: 14, fontWeight: 600, cursor: "pointer",
  };

  return (
    <div style={overlayStyle} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={sheetStyle}>
        <div style={{ width: 40, height: 4, background: COLORS.cardBorder, borderRadius: 99, margin: "0 auto 20px" }} />

        {step === "loading" && <p style={{ color: COLORS.lightGray, textAlign: "center" }}>Loading wallet...</p>}
        {step === "error" && <p style={{ color: "#ef4444", textAlign: "center" }}>Could not load wallet. Try again.</p>}

        {step === "idle" && (
          <>
            <p style={titleStyle}>Withdraw earnings</p>
            <p style={subStyle}>via {methodLabel}</p>
            <p style={balStyle}>{formatEarningsMRU(availableBalance)}</p>
            <p style={{ ...subStyle, marginBottom: 24 }}>Available balance</p>
            {err && <p style={{ color: "#ef4444", fontSize: 13, marginBottom: 12 }}>{err}</p>}
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
            {err && <p style={{ color: "#ef4444", fontSize: 13, marginBottom: 8 }}>{err}</p>}
            <input
              type="number"
              style={inputStyle}
              value={amount}
              onChange={(e) => { setErr(""); setAmount(e.target.value); }}
              placeholder={`${minWithdrawal}`}
              min={minWithdrawal}
              max={availableBalance}
              inputMode="decimal"
            />
            <button
              type="button"
              style={btnStyle(working || !amount || Number(amount) < minWithdrawal || Number(amount) > availableBalance)}
              disabled={working || !amount || Number(amount) < minWithdrawal || Number(amount) > availableBalance}
              onClick={sendOtp}
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
            {err && <p style={{ color: "#ef4444", fontSize: 13, marginBottom: 8 }}>{err}</p>}
            <input
              type="text"
              style={{ ...inputStyle, letterSpacing: 8, textAlign: "center" }}
              value={otp}
              onChange={(e) => { setErr(""); setOtp(e.target.value.replace(/\D/g, "").slice(0, 6)); }}
              placeholder="······"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
            />
            <button
              type="button"
              style={btnStyle(working || otp.length < 4)}
              disabled={working || otp.length < 4}
              onClick={submitWithdrawal}
            >
              {working ? "Submitting..." : `Confirm ${formatEarningsMRU(amount)}`}
            </button>
            <button type="button" style={cancelStyle} onClick={() => { setStep("amount"); setOtp(""); setErr(""); }}>Back</button>
          </>
        )}

        {step === "success" && (
          <>
            <div style={{ textAlign: "center", padding: "20px 0" }}>
              <div style={{ fontSize: 56, marginBottom: 16 }}>✅</div>
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
  const [showWithdraw, setShowWithdraw] = useState(false);

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
      const response = await authenticatedApi.get(
        `${API_URL}/drivers/me/earnings/`
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
      const response = await authenticatedApi.get(
        `${API_URL}/drivers/me/earnings/chart/?period=${period}`
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
      {showWithdraw && (
        <WithdrawalSheet
          onClose={() => setShowWithdraw(false)}
          onDone={() => { setShowWithdraw(false); fetchEarnings(); }}
        />
      )}

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

      {/* Wallet / Withdraw Card — Uber/Lyft style */}
      <div style={{
        ...styles.earningsCard,
        background: "linear-gradient(135deg, #00A651 0%, #007a3d 100%)",
        border: "none",
        position: "relative",
        overflow: "hidden",
      }}>
        <span style={{ ...styles.earningsLabel, color: "rgba(255,255,255,0.75)" }}>
          {activePeriod === "today" ? "Today's Earnings" :
           activePeriod === "week" ? "This Week" :
           activePeriod === "month" ? "This Month" :
           activePeriod === "year" ? "This Year" : "Lifetime Earnings"}
        </span>
        <h2 style={{ ...styles.earningsAmount, color: "#fff", fontSize: 38 }}>
          {formatEarningsMRU(getPeriodEarnings(activePeriod))}
        </h2>
        {activePeriod !== "week" && (
          <span style={{ ...styles.weekTotalHint, color: "rgba(255,255,255,0.65)" }}>
            Week total: {formatEarningsMRU(weekTotal)}
          </span>
        )}
        <button
          type="button"
          onClick={() => setShowWithdraw(true)}
          style={{
            marginTop: 20,
            background: "rgba(255,255,255,0.2)",
            border: "2px solid rgba(255,255,255,0.6)",
            borderRadius: 999,
            color: "#fff",
            fontWeight: 800,
            fontSize: 15,
            padding: "12px 32px",
            cursor: "pointer",
            backdropFilter: "blur(4px)",
          }}
        >
          💸 Withdraw
        </button>
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
