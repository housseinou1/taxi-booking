import React, { useCallback, useEffect, useState } from "react";

import { formatMoney } from "../../marketConfig";
import { fetchBetaDashboard } from "./betaApi";
import "./BetaDashboard.css";

function MetricCard({ label, value, sub }) {
  return (
    <div className="beta__card">
      <div className="beta__card-label">{label}</div>
      <div className="beta__card-value">{value ?? "—"}</div>
      {sub ? <div className="beta__card-sub">{sub}</div> : null}
    </div>
  );
}

function pct(value) {
  if (value === null || value === undefined) return "—";
  return `${value}%`;
}

function StatusBadge({ ok, labelOk = "OK", labelBad = "Open" }) {
  return (
    <span className={`beta__badge ${ok ? "beta__badge--ok" : "beta__badge--fail"}`}>
      {ok ? labelOk : labelBad}
    </span>
  );
}

function CohortPanel({ title, data, cap }) {
  return (
    <div className="beta__panel">
      <h4>{title}</h4>
      <div className="beta__grid">
        <MetricCard label="Invited" value={data?.invited} />
        <MetricCard
          label={title.includes("Rider") ? "Registered" : "Approved"}
          value={data?.approved ?? data?.registered}
          sub={cap != null ? `Cap ${cap}` : undefined}
        />
        <MetricCard label="Active today" value={data?.active_today} sub={`7d: ${data?.active_7d ?? "—"}`} />
      </div>
    </div>
  );
}

function CeoPrintReport({ ceo, overview, generatedAt }) {
  if (!ceo) return null;
  return (
    <div className="beta__print-area" id="beta-ceo-print">
      <h1>Yala — CEO Daily Report (Closed Beta)</h1>
      <p>
        Date: {ceo.date} · Generated: {generatedAt}
      </p>

      <h2>Revenue</h2>
      <p>
        Gross today: {formatMoney(ceo.revenue?.gross_today_mru)} MRU · Refunds:{" "}
        {formatMoney(ceo.revenue?.refunds_today_mru)} MRU
      </p>

      <h2>Trips</h2>
      <p>
        Completed rides today: {ceo.trips?.completed_rides_today} · Completion (7d):{" "}
        {pct(ceo.trips?.ride_completion_rate_7d_pct)} · Cancellation (7d):{" "}
        {pct(ceo.trips?.cancellation_rate_7d_pct)}
      </p>

      <h2>Deliveries</h2>
      <p>
        Completed today: {ceo.deliveries?.completed_deliveries_today} · Completion (7d):{" "}
        {pct(ceo.deliveries?.delivery_completion_rate_7d_pct)}
      </p>

      <h2>Fleet health</h2>
      <p>
        Online drivers: {ceo.fleet_health?.online_drivers} · Online couriers:{" "}
        {ceo.fleet_health?.online_couriers} · Active riders today:{" "}
        {ceo.fleet_health?.active_riders_today} · Drivers approved:{" "}
        {ceo.fleet_health?.drivers_approved}/{ceo.fleet_health?.drivers_cap}
      </p>

      <h2>Payments & withdrawals</h2>
      <p>
        Failed payments today: {ceo.payments?.failed_today} · Payment success (7d):{" "}
        {pct(ceo.payments?.success_rate_7d_pct)} · Withdrawals pending:{" "}
        {ceo.withdrawals?.pending} · Cash Out success (7d):{" "}
        {pct(ceo.withdrawals?.cash_out_success_rate_7d_pct)}
      </p>

      <h2>Incidents</h2>
      <p>Open incidents: {ceo.incidents?.open_count ?? overview?.open_incidents}</p>

      <h2>Infrastructure</h2>
      <p>Platform status: {ceo.infrastructure_status ?? overview?.platform_status}</p>

      <h2>Top action items</h2>
      <ol>
        {(ceo.action_items || []).map((item, index) => (
          <li key={index}>
            [{item.priority}] {item.action} — {item.owner}
          </li>
        ))}
      </ol>
    </div>
  );
}

export default function BetaDashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setError("");
      const response = await fetchBetaDashboard();
      setData(response.data);
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message || "Failed to load beta dashboard");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, 20000);
    return () => clearInterval(timer);
  }, [load]);

  const handlePrintCeo = () => {
    window.print();
  };

  if (loading && !data) {
    return <div className="beta">Loading closed beta dashboard…</div>;
  }

  const overview = data?.overview || {};
  const kpis = data?.live_kpis || {};
  const sevenDay = kpis.seven_day || {};
  const hour = kpis.current_hour || {};
  const api = kpis.api || {};
  const blockers = data?.launch_blockers || {};
  const cohort = data?.pilot_cohort || {};
  const ceo = data?.ceo_summary || {};
  const infra = data?.infrastructure || {};

  return (
    <div className="beta">
      <div className="beta__no-print">
        <a href="/admin" className="beta__back">
          ← Admin
        </a>
        <div className="beta__header">
          <div>
            <h1 className="beta__title">Closed Beta Operations</h1>
            <p className="beta__subtitle">
              {data?.release ?? "RC2"} · Nouakchott · Updated {data?.generated_at ? new Date(data.generated_at).toLocaleString() : "—"}
            </p>
          </div>
          <div className="beta__actions">
            <button type="button" className="beta__btn" onClick={load}>
              Refresh
            </button>
            <button type="button" className="beta__btn beta__btn--primary" onClick={handlePrintCeo}>
              Print CEO Report
            </button>
          </div>
        </div>

        {error ? <div className="beta__error">{error}</div> : null}

        {/* Section 1 — Beta Overview */}
        <section className="beta__section">
          <h2 className="beta__section-title">Beta Overview</h2>
          <div className="beta__grid beta__grid--wide">
            <MetricCard label="Active riders (today)" value={overview.active_riders_today} sub={`7d: ${overview.active_riders_7d ?? "—"}`} />
            <MetricCard label="Active drivers (7d)" value={overview.active_drivers_7d} />
            <MetricCard label="Active couriers (7d)" value={overview.active_couriers_7d} />
            <MetricCard label="Online drivers" value={overview.online_drivers} />
            <MetricCard label="Online couriers" value={overview.online_couriers} />
            <MetricCard label="Completed rides today" value={overview.completed_rides_today} />
            <MetricCard label="Completed deliveries today" value={overview.completed_deliveries_today} />
            <MetricCard label="Revenue today" value={formatMoney(overview.revenue_today)} />
            <MetricCard label="Withdrawals pending" value={overview.withdrawals_pending} />
            <MetricCard label="Open incidents" value={overview.open_incidents} />
            <MetricCard label="Support tickets open" value={overview.support_tickets_open} />
            <MetricCard label="Platform" value={overview.platform_status} />
          </div>
        </section>

        {/* Section 2 — Live KPIs */}
        <section className="beta__section">
          <h2 className="beta__section-title">Live KPIs</h2>
          <div className="beta__grid beta__grid--wide">
            <MetricCard label="Driver acceptance (7d)" value={pct(sevenDay.driver_acceptance_rate_pct)} sub={`This hour: ${pct(hour.acceptance_rate_pct)}`} />
            <MetricCard label="Ride completion (7d)" value={pct(sevenDay.ride_completion_rate_pct)} />
            <MetricCard label="Delivery completion (7d)" value={pct(sevenDay.delivery_completion_rate_pct)} />
            <MetricCard label="Avg pickup time" value={sevenDay.average_pickup_time_minutes != null ? `${sevenDay.average_pickup_time_minutes} min` : "—"} sub={`Wait this hour: ${hour.average_wait_minutes != null ? `${hour.average_wait_minutes} min` : "—"}`} />
            <MetricCard label="Avg ETA (hour)" value={hour.average_eta_minutes != null ? `${hour.average_eta_minutes} min` : "—"} />
            <MetricCard label="Avg trip duration" value={sevenDay.average_trip_duration_minutes != null ? `${sevenDay.average_trip_duration_minutes} min` : "—"} />
            <MetricCard label="Cancellation rate (7d)" value={pct(sevenDay.cancellation_rate_pct)} />
            <MetricCard label="Crash-free sessions" value={sevenDay.crash_free_sessions_pct != null ? pct(sevenDay.crash_free_sessions_pct) : "Manual"} sub={sevenDay.crash_free_source} />
            <MetricCard label="Payment success (7d)" value={pct(sevenDay.payment_success_rate_pct)} />
            <MetricCard label="Cash Out success (7d)" value={pct(sevenDay.cash_out_success_rate_pct)} />
            <MetricCard label="API p50" value={api.p50_ms != null ? `${api.p50_ms} ms` : "—"} sub={api.source} />
            <MetricCard label="API p95" value={api.p95_ms != null ? `${api.p95_ms} ms` : "—"} sub={api.measured_at} />
            <MetricCard label="HTTP 5xx (load test)" value={api.http_5xx ?? "—"} />
          </div>
        </section>

        {/* Section 3 — Launch Blockers */}
        <section className="beta__section">
          <h2 className="beta__section-title">Launch Blockers</h2>
          <div className="beta__grid">
            <MetricCard label="P0 open" value={blockers.p0_open} />
            <MetricCard label="P1 open" value={blockers.p1_open} />
          </div>
          <div className="beta__status-row">
            <div className="beta__status-chip">
              <strong>Physical QA</strong>
              <StatusBadge ok={blockers.physical_qa_status?.signed} labelOk="Signed" labelBad="Unsigned" />
              <div className="beta__card-sub">
                {blockers.physical_qa_status?.pass_count ?? 0}/{blockers.physical_qa_status?.total_tests ?? 80} tests
              </div>
            </div>
            <div className="beta__status-chip">
              <strong>Offsite backup</strong>
              <StatusBadge ok={blockers.offsite_backup_status?.configured} labelOk="Configured" labelBad="Not configured" />
            </div>
            <div className="beta__status-chip">
              <strong>Google Play</strong>
              <span className={`beta__badge beta__badge--${blockers.google_play_status?.status === "live" ? "ok" : "warn"}`}>
                {blockers.google_play_status?.status ?? "partial"}
              </span>
            </div>
            <div className="beta__status-chip">
              <strong>Apple App Store</strong>
              <StatusBadge ok={blockers.apple_app_store_status?.submitted} labelOk="Submitted" labelBad="Not submitted" />
            </div>
          </div>
          {blockers.items?.length ? (
            <div className="beta__panel">
              <h4>Active blockers</h4>
              <table className="beta__table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Priority</th>
                    <th>Title</th>
                    <th>Owner</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {blockers.items.map((item) => (
                    <tr key={item.id}>
                      <td>{item.id}</td>
                      <td>
                        <span className={`beta__badge beta__badge--${item.priority?.toLowerCase()}`}>{item.priority}</span>
                      </td>
                      <td>{item.title}</td>
                      <td>{item.owner}</td>
                      <td>{item.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>

        {/* Section 4 — Pilot Cohort */}
        <section className="beta__section">
          <h2 className="beta__section-title">Pilot Cohort</h2>
          <div className="beta__cohort-grid">
            <CohortPanel title="Drivers" data={cohort.drivers} cap={cohort.caps?.max_drivers} />
            <CohortPanel title="Couriers" data={cohort.couriers} cap={cohort.caps?.max_couriers} />
            <CohortPanel title="Riders" data={cohort.riders} cap={cohort.caps?.max_riders} />
          </div>
        </section>

        {/* Section 5 — CEO Summary */}
        <section className="beta__section">
          <h2 className="beta__section-title">CEO Summary</h2>
          <div className="beta__grid beta__grid--wide">
            <MetricCard label="Revenue today" value={formatMoney(ceo.revenue?.gross_today_mru)} />
            <MetricCard label="Trips today" value={ceo.trips?.completed_rides_today} />
            <MetricCard label="Deliveries today" value={ceo.deliveries?.completed_deliveries_today} />
            <MetricCard label="Fleet — drivers online" value={ceo.fleet_health?.online_drivers} />
            <MetricCard label="Failed payments" value={ceo.payments?.failed_today} />
            <MetricCard label="Withdrawals pending" value={ceo.withdrawals?.pending} />
            <MetricCard label="Incidents open" value={ceo.incidents?.open_count} />
            <MetricCard label="Support — open tickets" value={ceo.support?.open_tickets} />
            <MetricCard label="Support — critical (P0)" value={ceo.support?.critical_issues} />
            <MetricCard
              label="Support — avg response"
              value={ceo.support?.average_response_hours != null ? `${ceo.support.average_response_hours} h` : "—"}
            />
            <MetricCard
              label="Support — avg resolution"
              value={ceo.support?.average_resolution_hours != null ? `${ceo.support.average_resolution_hours} h` : "—"}
            />
            <MetricCard label="Infrastructure" value={ceo.infrastructure_status} />
          </div>
          {ceo.support?.top_categories?.length ? (
            <div className="beta__panel">
              <h4>Top support categories</h4>
              <ul>
                {ceo.support.top_categories.map((row) => (
                  <li key={row.category}>
                    {row.category}: {row.count}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="beta__panel">
            <h4>Top action items</h4>
            <table className="beta__table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Priority</th>
                  <th>Action</th>
                  <th>Owner</th>
                </tr>
              </thead>
              <tbody>
                {(ceo.action_items || []).map((item, index) => (
                  <tr key={index}>
                    <td>{index + 1}</td>
                    <td>
                      <span className={`beta__badge beta__badge--${item.priority?.toLowerCase()}`}>{item.priority}</span>
                    </td>
                    <td>{item.action}</td>
                    <td>{item.owner}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="beta__panel">
            <h4>Infrastructure components</h4>
            <div className="beta__status-row">
              {Object.entries(infra).map(([key, value]) => (
                <div key={key} className="beta__status-chip">
                  <strong>{key}</strong>
                  {typeof value === "object" ? value?.status ?? JSON.stringify(value) : String(value)}
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>

      <CeoPrintReport ceo={ceo} overview={overview} generatedAt={data?.generated_at} />
    </div>
  );
}
