import React from "react";

import "./StructuredValue.css";

export function humanizeKey(key) {
  const text = String(key ?? "").replaceAll("_", " ").trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "—";
}

function isPlainObject(value) {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

export function formatScalar(value) {
  if (value == null || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return Number.isFinite(value) ? value.toLocaleString() : "—";
  return String(value);
}

function Scalar({ value }) {
  if (typeof value === "boolean") {
    return <span className={`sv-badge sv-badge--${value ? "yes" : "no"}`}>{value ? "Yes" : "No"}</span>;
  }
  return <span className="sv-scalar">{formatScalar(value)}</span>;
}

function columnsFor(rows) {
  const keys = [];
  rows.forEach((row) => {
    Object.keys(row).forEach((key) => {
      if (!keys.includes(key)) keys.push(key);
    });
  });
  return keys;
}

function NestedCell({ value, depth }) {
  if (value == null || typeof value !== "object") return <Scalar value={value} />;
  const size = Array.isArray(value) ? value.length : Object.keys(value).length;
  const label = Array.isArray(value) ? `${size} item${size === 1 ? "" : "s"}` : `${size} field${size === 1 ? "" : "s"}`;
  if (!size) return <span className="sv-muted">—</span>;
  return (
    <details className="sv-details">
      <summary>{label}</summary>
      <StructuredValue value={value} depth={depth + 1} />
    </details>
  );
}

export default function StructuredValue({ value, depth = 0, emptyLabel = "No data", maxRows = 50 }) {
  if (value == null || (typeof value === "object" && !Object.keys(value).length)) {
    return <span className="sv-muted">{depth ? "—" : emptyLabel}</span>;
  }
  if (typeof value !== "object") return <Scalar value={value} />;

  if (Array.isArray(value)) {
    if (value.every(isPlainObject)) {
      const columns = columnsFor(value);
      return (
        <div className="sv-table-wrap">
          <table className="sv-table">
            <thead>
              <tr>
                {columns.map((column) => (
                  <th key={column}>{humanizeKey(column)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {value.slice(0, maxRows).map((row, index) => (
                <tr key={row.id ?? index}>
                  {columns.map((column) => (
                    <td key={column}>
                      <NestedCell value={row[column]} depth={depth} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {value.length > maxRows ? <p className="sv-muted">Showing {maxRows} of {value.length}</p> : null}
        </div>
      );
    }
    return (
      <ul className="sv-list">
        {value.slice(0, maxRows).map((item, index) => (
          <li key={index}>
            <NestedCell value={item} depth={depth} />
          </li>
        ))}
      </ul>
    );
  }

  return (
    <dl className={`sv-facts ${depth ? "sv-facts--nested" : ""}`}>
      {Object.entries(value).map(([key, item]) => (
        <div key={key} className="sv-facts__item">
          <dt>{humanizeKey(key)}</dt>
          <dd>
            <NestedCell value={item} depth={depth} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function ChangeSummary({ before, after }) {
  if (before == null && after == null) return <span className="sv-muted">—</span>;
  const simple = (v) => v == null || typeof v !== "object";
  if (simple(before) && simple(after)) {
    return (
      <span className="sv-change">
        <span className="sv-change__old">{formatScalar(before)}</span>
        <span aria-hidden="true">→</span>
        <span className="sv-change__new">{formatScalar(after)}</span>
      </span>
    );
  }
  const keys = Array.from(new Set([...Object.keys(before || {}), ...Object.keys(after || {})]));
  const changed = keys.filter((key) => JSON.stringify(before?.[key]) !== JSON.stringify(after?.[key]));
  return (
    <details className="sv-details">
      <summary>{changed.length ? `${changed.length} field${changed.length === 1 ? "" : "s"} changed` : "View details"}</summary>
      <table className="sv-table sv-table--compact">
        <thead>
          <tr>
            <th>Field</th>
            <th>Before</th>
            <th>After</th>
          </tr>
        </thead>
        <tbody>
          {(changed.length ? changed : keys).map((key) => (
            <tr key={key}>
              <td>{humanizeKey(key)}</td>
              <td><NestedCell value={before?.[key]} depth={1} /></td>
              <td><NestedCell value={after?.[key]} depth={1} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}
