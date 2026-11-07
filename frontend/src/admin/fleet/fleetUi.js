import React from "react";

import FleetKpiIcon from "./FleetKpiIcons";
import { scoreBandMeta } from "./fleetApi";
import { MARKET } from "../../marketConfig";
import {
  formatMoney as sharedFormatMoney,
  formatMoneyOrDash as sharedFormatMoneyOrDash,
} from "../components/library/utils/formatters";

const EM_DASH = "\u2014";

/**
 * YALA Admin — Fleet UI kit (SHARED components).
 *
 * Presentation primitives and formatters shared by both fleet surfaces so their
 * KPI cards, pills, tables, toolbars, states and pagers stay identical:
 *   - Fleet & Driver Performance Center  (/admin/fleet)
 *   - Vehicle Management                 (/admin/vehicles)
 *
 * Pure presentation only: no data fetching, no business logic.
 */

/* eslint-disable-next-line no-unused-vars -- kept for the fleet pages' own MRU suffix if reintroduced */
const CURRENCY = MARKET.currency || "MRU";

/** Formatters are exported so both pages render numbers identically. */

/* â”€â”€ formatting helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

export function isNum(value) {
  return value !== null && value !== undefined && value !== "" && !Number.isNaN(Number(value));
}

export function formatCount(value) {
  if (!isNum(value)) return EM_DASH;
  return Number(value).toLocaleString("en-US");
}

/**
 * Money values arrive as Decimal strings; format them as MRU without inventing
 * precision. Delegates to the shared decimal-safe formatter so the fleet pages
 * agree with every other admin surface — the previous local version routed the
 * value through Number(), which reintroduces binary floating point.
 */
export function formatMoney(value) {
  return sharedFormatMoney(value);
}

/**
 * Money that distinguishes UNAVAILABLE data from a genuine zero.
 *
 * Re-exported here so the fleet pages can keep importing their money helpers from
 * `./fleetUi` while rendering an absent value as the platform em dash instead of a
 * fabricated "0 MRU".
 */
export function formatMoneyOrDash(value) {
  return sharedFormatMoneyOrDash(value);
}

export function formatPct(value) {
  if (!isNum(value)) return EM_DASH;
  return `${Number(value)}%`;
}

export function formatDateTime(value) {
  if (!value) return EM_DASH;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return EM_DASH;
  return date.toLocaleString();
}

export function formatDate(value) {
  if (!value) return EM_DASH;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return EM_DASH;
  return date.toLocaleDateString();
}

export function initials(name, email) {
  const source = String(name || email || "?").trim();
  const parts = source.split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

/* â”€â”€ Presentational primitives â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

export function KpiCard({ label, value, unit, sub, icon, tone = "idle", title }) {
  return (
    <div className={`fleet-kpi fleet-kpi--${tone}`} title={title || undefined}>
      <div className="fleet-kpi__top">
        <span className="fleet-kpi__label">{label}</span>
        {icon ? (
          <span className="fleet-kpi__icon" aria-hidden="true">
            {typeof icon === "string" ? <FleetKpiIcon name={icon} className="fleet-kpi__icon-svg" /> : icon}
          </span>
        ) : null}
      </div>
      <div className="fleet-kpi__value">
        <span>{value}</span>
        {unit ? <span className="fleet-kpi__unit">{unit}</span> : null}
      </div>
      {sub ? <div className="fleet-kpi__sub">{sub}</div> : null}
    </div>
  );
}

/** Explicit gap for a metric the API does not provide â€” never a fabricated number. */
export function UnavailableKpi({ label, reason }) {
  return (
    <div className="fleet-kpi fleet-kpi--unavailable" title={reason}>
      <div className="fleet-kpi__top">
        <span className="fleet-kpi__label">{label}</span>
        <span className="fleet-kpi__icon" aria-hidden="true">
          <FleetKpiIcon name="help" className="fleet-kpi__icon-svg" />
        </span>
      </div>
      <div className="fleet-kpi__value">Not available</div>
      <div className="fleet-kpi__sub">{reason}</div>
    </div>
  );
}

export function Pill({ tone = "idle", children }) {
  return <span className={`fleet-pill fleet-pill--${tone}`}>{children}</span>;
}

export function StatusPill({ status, map }) {
  const meta = map?.[status];
  if (!meta) return <Pill tone="idle">{status || "Unknown"}</Pill>;
  return <Pill tone={meta.tone}>{meta.label}</Pill>;
}

export function ScoreMeter({ score, band }) {
  const meta = scoreBandMeta(band);
  const safe = isNum(score) ? Math.max(0, Math.min(100, Number(score))) : 0;
  return (
    <div className={`fleet-score fleet-score--${meta.tone}`}>
      <span className="fleet-score__bar" aria-hidden="true">
        <span className="fleet-score__fill" style={{ width: `${safe}%` }} />
      </span>
      <span className="fleet-score__value">{isNum(score) ? score : "â€”"}</span>
    </div>
  );
}

export function EmptyState({ icon = "doc", title, hint }) {
  return (
    <div className="fleet-state">
      <span className="fleet-state__icon" aria-hidden="true">
        {typeof icon === "string" ? <FleetKpiIcon name={icon} className="fleet-kpi__icon-svg" /> : icon}
      </span>
      <span className="fleet-state__title">{title}</span>
      {hint ? <span className="fleet-state__hint">{hint}</span> : null}
    </div>
  );
}

export function ErrorState({ message, onRetry }) {
  return (
    <div className="fleet-alert" role="alert">
      <span>{message}</span>
      {onRetry ? (
        <button type="button" className="fleet-btn fleet-btn--sm" onClick={onRetry}>
          Try again
        </button>
      ) : null}
    </div>
  );
}

export function LoadingSkeleton() {
  return (
    <div className="fleet-skeleton" aria-busy="true" aria-live="polite">
      <div className="fleet-skeleton__grid">
        {Array.from({ length: 8 }).map((_, index) => (
          <div key={index} className="fleet-skeleton__card" />
        ))}
      </div>
      <div className="fleet-skeleton__line fleet-skeleton__line--wide" />
    </div>
  );
}

export function Pager({ page, pageCount, total, pageSize, onPage }) {
  if (!total) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  return (
    <div className="fleet-pager">
      <span className="fleet-pager__info">
        Showing <strong>{from}</strong>â€“<strong>{to}</strong> of <strong>{total}</strong>
      </span>
      <span className="fleet-pager__btns">
        <button
          type="button"
          className="fleet-btn fleet-btn--sm"
          onClick={() => onPage(page - 1)}
          disabled={page <= 1}
        >
          Previous
        </button>
        <span className="fleet-pager__info">
          Page {page} of {pageCount}
        </span>
        <button
          type="button"
          className="fleet-btn fleet-btn--sm"
          onClick={() => onPage(page + 1)}
          disabled={page >= pageCount}
        >
          Next
        </button>
      </span>
    </div>
  );
}

export function SortHeader({ label, sortKey, sort, onSort, className }) {
  const active = sort.key === sortKey;
  const arrow = active ? (sort.dir === "asc" ? "â–²" : "â–¼") : "â†•";
  return (
    <th
      className={className}
      scope="col"
      aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        className={`fleet-table__sort ${active ? "fleet-table__sort--active" : ""}`}
        onClick={() => onSort(sortKey)}
      >
        {label}
        <span className="fleet-table__sort-arrow" aria-hidden="true">
          {arrow}
        </span>
      </button>
    </th>
  );
}

export function DriverCell({ name, meta }) {
  const display = name || meta || "Unnamed driver";
  return (
    <div className="fleet-driver">
      <span className="fleet-driver__avatar" aria-hidden="true">
        {initials(name, meta)}
      </span>
      <span className="fleet-driver__text">
        {/* Long names are ellipsised; the full value stays available via title. */}
        <span className="fleet-driver__name" title={display}>
          {display}
        </span>
        {meta && meta !== display ? (
          <span className="fleet-driver__meta" title={meta}>
            {meta}
          </span>
        ) : null}
      </span>
    </div>
  );
}

export function SectionHead({ title, hint, actions }) {
  return (
    <div className="fleet-section__head">
      <div>
        <h2 className="fleet-section__title">{title}</h2>
        {hint ? <p className="fleet-section__hint">{hint}</p> : null}
      </div>
      {actions ? <div className="fleet-center__actions">{actions}</div> : null}
    </div>
  );
}

export function Panel({ title, note, actions, children, flush }) {
  return (
    <div className="fleet-panel">
      {title ? (
        <div className="fleet-panel__head">
          <div>
            <h3 className="fleet-panel__title">{title}</h3>
            {note ? <p className="fleet-panel__note">{note}</p> : null}
          </div>
          {actions ? <div className="fleet-action-bar">{actions}</div> : null}
        </div>
      ) : null}
      <div className={`fleet-panel__body ${flush ? "fleet-panel__body--flush" : ""}`}>
        {children}
      </div>
    </div>
  );
}
