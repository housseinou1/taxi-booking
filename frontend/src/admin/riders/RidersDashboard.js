import React, { useCallback, useEffect, useMemo, useState } from "react";

import { API_URL } from "../../apiConfig";
import { apiRequest } from "../../delivery/DeliveryShared";
import { describeLoadFailure } from "../layouts/errors/apiErrorMessage";
import { AlertBanner, KPICard, StatusChip, formatTimestamp } from "../components/library";
import "../components/library/adminDashboardViews.css";

/**
 * Riders Dashboard — the dedicated rider overview.
 *
 * Totals come from the EXISTING admin rider service
 * (`GET /auth/admin/riders/`, the same endpoint that powers /admin/riders).
 * The verification panel is computed from the rows that endpoint returns, and
 * the coverage line states exactly how many rows were loaded, so a page sample
 * is never presented as a platform total.
 */

const PAGE_SIZE = 100; // backend maximum page size
const MAX_PAGES = 5; // safety cap so a bad `count` cannot loop forever

/**
 * Read every page of the admin rider list.
 *
 * The service paginates (100 rows per page, 155 riders today). The KPI totals
 * come from the server-computed `summary`, but the verification counts are
 * derived from the rows, so they must cover ALL riders — not just the first
 * page. `page_size=200` is silently capped at 100 by the backend, which is why
 * a single request previously covered only 100 of 155 riders.
 */
async function fetchAllRiders() {
  const build = (page) =>
    `${API_URL}/auth/admin/riders/?page_size=${PAGE_SIZE}&ordering=-date_joined&page=${page}`;

  const first = await apiRequest(build(1));
  const total = Number(first?.count ?? (first?.results || []).length);
  let results = first?.results || [];
  let page = 2;

  while (results.length < total && page <= MAX_PAGES) {
    const next = await apiRequest(build(page));
    const rows = next?.results || [];
    if (!rows.length) break;
    results = results.concat(rows);
    page += 1;
  }

  return { ...first, results, loaded: results.length, total };
}

const QUICK_LINKS = [
  { label: "Rider Management", path: "/admin/riders", description: "Rider directory, documents and account actions." },
  { label: "Support Dashboard", path: "/admin/support", description: "Support conversations and feedback." },
  { label: "Trust & Safety", path: "/admin/trust-safety", description: "Rider safety incidents and reports." },
  { label: "Customer Growth", path: "/admin/customer-growth", description: "Rider growth and retention." },
];

export default function RidersDashboard() {
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setPayload(await fetchAllRiders());
    } catch (err) {
      setPayload(null);
      setError(describeLoadFailure(err, { resource: "riders dashboard" }));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const summary = payload?.summary || {};
  const rows = useMemo(() => payload?.results || [], [payload]);

  const derived = useMemo(() => {
    const verifiedPhone = rows.filter((r) => r.phone_verified).length;
    const withIdDocument = rows.filter((r) => r.has_national_id_document).length;
    const withPhoto = rows.filter((r) => r.has_profile_picture).length;
    const cities = new Set(rows.map((r) => r.city_name).filter(Boolean));
    return {
      verifiedPhone,
      withIdDocument,
      withPhoto,
      cityCount: cities.size,
      loaded: payload?.loaded ?? rows.length,
      total: payload?.total ?? rows.length,
    };
  }, [rows, payload]);

  return (
    <div className="admin-dash">
      <p className="admin-dash__note">
        Totals from the rider service (server-computed).{" "}
        {derived.loaded >= derived.total
          ? `Verification counts cover all ${derived.total} riders.`
          : `Verification counts cover ${derived.loaded} of ${derived.total} riders.`}
      </p>

      {error ? (
        <AlertBanner tone="danger" title="Riders dashboard unavailable">
          {error}
        </AlertBanner>
      ) : null}

      <div className="admin-dash-grid">
        <KPICard label="Total Riders" value={summary.total} loading={loading} />
        <KPICard label="Active" value={summary.active} tone="success" loading={loading} />
        <KPICard label="Approved" value={summary.approved} tone="success" loading={loading} />
        <KPICard label="Pending Review" value={summary.pending} tone="warning" loading={loading} />
        <KPICard label="Rejected" value={summary.rejected} tone="danger" loading={loading} />
        <KPICard label="Blocked" value={summary.blocked} tone="danger" loading={loading} />
        <KPICard label="Phone Verified" value={derived.verifiedPhone} subtitle={`of ${derived.loaded} loaded`} loading={loading} />
        <KPICard label="National ID on File" value={derived.withIdDocument} subtitle={`of ${derived.loaded} loaded`} loading={loading} />
        <KPICard label="Profile Photo" value={derived.withPhoto} subtitle={`of ${derived.loaded} loaded`} loading={loading} />
        <KPICard label="Cities Covered" value={derived.cityCount} subtitle="within loaded rows" loading={loading} />
      </div>

      <section className="admin-dash-panel" aria-labelledby="riders-recent-title">
        <h3 className="admin-dash-panel__title" id="riders-recent-title">
          Recently joined riders
        </h3>
        {loading ? (
          <p className="admin-dash__note">Loading riders…</p>
        ) : rows.length ? (
          <div className="admin-dash-table-wrap">
            <table className="admin-dash-table">
              <thead>
                <tr>
                  <th scope="col">Rider</th>
                  <th scope="col">City</th>
                  <th scope="col">Status</th>
                  <th scope="col">Phone verified</th>
                  <th scope="col">National ID</th>
                  <th scope="col">Joined</th>
                  <th scope="col">Last login</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 10).map((rider) => (
                  <tr key={rider.id}>
                    <td>{rider.full_name || rider.email || `#${rider.id}`}</td>
                    <td>{rider.city_name || "—"}</td>
                    <td>
                      <StatusChip
                        label={rider.rider_status_label || rider.rider_status || "unknown"}
                        tone={rider.is_active ? "success" : "danger"}
                      />
                    </td>
                    <td>{rider.phone_verified ? "Yes" : "No"}</td>
                    <td>{rider.has_national_id_document ? "Yes" : "No"}</td>
                    <td>{formatTimestamp(rider.date_joined)}</td>
                    <td>{rider.last_login ? formatTimestamp(rider.last_login) : "Never"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="admin-dash__note">The rider service returned no rows.</p>
        )}
      </section>

      <section className="admin-dash-panel" aria-labelledby="riders-links-title">
        <h3 className="admin-dash-panel__title" id="riders-links-title">
          Rider modules
        </h3>
        <div className="admin-dash-links">
          {QUICK_LINKS.map((link) => (
            <a className="admin-dash-link" href={link.path} key={link.path}>
              <span className="admin-dash-link__label">{link.label}</span>
              <span className="admin-dash-link__desc">{link.description}</span>
            </a>
          ))}
        </div>
      </section>
    </div>
  );
}
