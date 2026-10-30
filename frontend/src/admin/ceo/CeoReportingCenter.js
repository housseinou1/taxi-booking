import React, { useCallback, useEffect, useMemo, useState } from "react";

import { AdminShellPage } from "../layouts/AdminShell";
import {
  AlertBanner,
  DataTable,
  InlineError,
  KPICard,
  formatTimestamp,
} from "../components/library";
import {
  fetchCeoCityReport,
  fetchCeoSecurityPosture,
  REPORT_CITY_OPTIONS,
  REPORT_PERIOD_OPTIONS,
} from "./ceoReportingApi";

const COMPARISON_COLUMNS = [
  { id: "city", label: "City" },
  { id: "total_fare", label: "Total fare", render: (row) => `${row.total_fare} MRU` },
  { id: "rides_completed", label: "Rides completed" },
  { id: "deliveries_delivered", label: "Deliveries delivered" },
  {
    id: "withdrawals_pending_amount",
    label: "Withdrawals pending",
    render: (row) => `${row.withdrawals_pending_amount} MRU`,
  },
];

function Stat({ label, value, hint }) {
  return (
    <div className="ceo-report__stat">
      <span className="ceo-report__stat-label">{label}</span>
      <span className="ceo-report__stat-value">{value ?? "N/A"}</span>
      {hint ? <span className="ceo-report__stat-hint">{hint}</span> : null}
    </div>
  );
}

function CityBlock({ title, block }) {
  if (!block) return null;
  return (
    <section className="ceo-report__city">
      <h3 className="ceo-report__heading">{title}</h3>
      <div className="ceo-report__stats">
        <Stat
          label="Rides completed"
          value={block.rides.completed}
          hint={`${block.rides.total} requested`}
        />
        <Stat label="Ride fares" value={`${block.rides.completed_fare} MRU`} />
        <Stat
          label="Deliveries delivered"
          value={block.deliveries.delivered}
          hint={`${block.deliveries.total} requested`}
        />
        <Stat label="Delivery fares" value={`${block.deliveries.delivered_fare} MRU`} />
        <Stat label="Total fare" value={`${block.revenue.total_fare} MRU`} />
        <Stat
          label="Delivery commission"
          value={`${block.commissions.deliveries_platform_commission} MRU`}
          hint="Platform commission (deliveries)"
        />
        <Stat label="Driver earnings" value={`${block.revenue.driver_earnings} MRU`} />
        <Stat label="Courier earnings" value={`${block.revenue.courier_earnings} MRU`} />
        <Stat
          label="Withdrawals pending"
          value={`${block.withdrawals.pending_amount} MRU`}
          hint={`${block.withdrawals.pending} pending · ${block.withdrawals.paid} paid`}
        />
        <Stat
          label="Riders"
          value={block.accounts.riders}
          hint={`${block.accounts.active} active accounts`}
        />
        <Stat label="Drivers" value={block.accounts.drivers} />
        <Stat label="Couriers" value={block.accounts.couriers} />
      </div>
      {!block.commissions.rides_platform_commission_tracked ? (
        <p className="ceo-report__note">
          Ride platform commission is not stored per ride in the current schema; delivery
          commission is reported from stored values.
        </p>
      ) : null}
    </section>
  );
}

/**
 * CEO Reporting Centre (`/admin/ceo-reports`) — read-only.
 *
 * City-separated (Nouakchott / Nouadhibou) and combined performance statistics
 * for a chosen period, plus the protected-CEO security posture. No financial
 * action is available anywhere on this page.
 */
export default function CeoReportingCenter({ pathname = "/admin/ceo-reports" } = {}) {
  const [period, setPeriod] = useState("monthly");
  const [cityFilter, setCityFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [posture, setPosture] = useState(null);
  const [postureError, setPostureError] = useState("");

  const loadReport = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchCeoCityReport({
        period,
        cities: cityFilter,
        date_from: period === "custom" ? dateFrom : "",
        date_to: period === "custom" ? dateTo : "",
      });
      setReport(data);
    } catch (err) {
      setError(err?.response?.data?.detail || "Could not load the city report.");
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [period, cityFilter, dateFrom, dateTo]);

  const loadPosture = useCallback(async () => {
    setPostureError("");
    try {
      setPosture(await fetchCeoSecurityPosture());
    } catch (err) {
      setPostureError(
        err?.response?.data?.detail || "Could not load the security posture."
      );
      setPosture(null);
    }
  }, []);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  useEffect(() => {
    loadPosture();
  }, [loadPosture]);

  const cities = report?.cities || {};
  const combined = report?.combined || null;
  const comparisonRows = useMemo(() => report?.comparison || [], [report]);


  return (
    <AdminShellPage pathname={pathname} title="CEO Reporting">
      <div className="ceo-report">
        <div className="admin-filters">
          <label className="admin-filters__field">
            Period
            <select
              aria-label="Report period"
              value={period}
              onChange={(event) => setPeriod(event.target.value)}
            >
              {REPORT_PERIOD_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="admin-filters__field">
            Cities
            <select
              aria-label="Report cities"
              value={cityFilter}
              onChange={(event) => setCityFilter(event.target.value)}
            >
              {REPORT_CITY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          {period === "custom" ? (
            <>
              <label className="admin-filters__field">
                From
                <input
                  type="date"
                  aria-label="Report from date"
                  value={dateFrom}
                  onChange={(event) => setDateFrom(event.target.value)}
                />
              </label>
              <label className="admin-filters__field">
                To
                <input
                  type="date"
                  aria-label="Report to date"
                  value={dateTo}
                  onChange={(event) => setDateTo(event.target.value)}
                />
              </label>
            </>
          ) : null}
          <button type="button" className="admin-lib-btn admin-lib-btn--ghost" onClick={loadReport}>
            Refresh
          </button>
        </div>

        {error ? <InlineError message={error} /> : null}

        {combined ? (
          <div className="admin-kpi-row">
            <KPICard
              label="Combined total fare"
              value={`${combined.revenue.total_fare} MRU`}
              subtitle={report ? `${report.range.from} → ${report.range.to} (UTC)` : undefined}
              loading={loading}
              error={error}
              onRefresh={loadReport}
            />
            <KPICard
              label="Rides completed"
              value={combined.rides.completed}
              loading={loading}
              error={error}
              onRefresh={loadReport}
            />
            <KPICard
              label="Deliveries delivered"
              value={combined.deliveries.delivered}
              loading={loading}
              error={error}
              onRefresh={loadReport}
            />
            <KPICard
              label="Delivery commission"
              value={`${combined.commissions.deliveries_platform_commission} MRU`}
              loading={loading}
              error={error}
              onRefresh={loadReport}
            />
            <KPICard
              label="Withdrawals pending"
              value={`${combined.withdrawals.pending_amount} MRU`}
              subtitle={`${combined.withdrawals.pending} pending`}
              loading={loading}
              error={error}
              onRefresh={loadReport}
            />
          </div>
        ) : null}

        {report ? (
          <DataTable
            title="City comparison"
            columns={COMPARISON_COLUMNS}
            rows={comparisonRows}
            rowKey="city"
            loading={loading}
            error={error}
            emptyLabel="No city data for this period."
            onRefresh={loadReport}
          />
        ) : null}

        <div className="ceo-report__cities">
          {Object.entries(cities).map(([name, block]) => (
            <CityBlock key={name} title={name} block={block} />
          ))}
          {combined ? <CityBlock title="Combined (all cities)" block={combined} /> : null}
        </div>


        <section className="ceo-report__security">
          <h3 className="ceo-report__heading">CEO access protection</h3>
          {postureError ? <InlineError message={postureError} /> : null}
          {posture ? (
            <>
              <AlertBanner tone={posture.account?.is_ceo_authority ? "success" : "warning"}>
                {posture.account?.is_ceo_authority
                  ? "This account holds protected CEO authority (CEO / Super Admin)."
                  : "This account does not currently hold CEO authority."}
              </AlertBanner>
              <Stat
                label="Strong authentication (TOTP)"
                value={
                  posture.strong_authentication?.totp_confirmed ? "Enabled" : "Not enabled"
                }
                hint={
                  posture.strong_authentication?.totp_confirmed
                    ? `Confirmed ${formatTimestamp(
                        posture.strong_authentication.totp_confirmed_at
                      )}`
                    : "Recommended before acting remotely — enrol at /admin-2fa/setup/"
                }
              />
              <Stat
                label="Sensitive actions (24h)"
                value={posture.recent_sensitive_actions?.count}
                hint="From the platform audit trail"
              />
              <ul className="ceo-report__protection">
                {(posture.protected_permissions?.cannot_be_modified_by_subordinates || []).map(
                  (line) => (
                    <li key={line}>{line}</li>
                  )
                )}
              </ul>
              <p className="ceo-report__note">{posture.protected_permissions?.note}</p>
            </>
          ) : null}
        </section>

        {report?.notes ? <p className="ceo-report__note">{report.notes.read_only}</p> : null}
      </div>
    </AdminShellPage>
  );
}

