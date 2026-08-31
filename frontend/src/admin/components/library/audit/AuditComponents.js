import React from "react";

import { formatTimestamp } from "../utils/formatters";

export function ChangeDiff({ oldValue, newValue, label }) {
  return (
    <div className="admin-change-diff">
      {label ? <div className="admin-change-diff__label">{label}</div> : null}
      <div className="admin-change-diff__cols">
        <pre className="admin-change-diff__old">{JSON.stringify(oldValue, null, 2)}</pre>
        <pre className="admin-change-diff__new">{JSON.stringify(newValue, null, 2)}</pre>
      </div>
    </div>
  );
}

export function AuditTimeline({ entries = [] }) {
  return (
    <ol className="admin-audit-timeline">
      {entries.map((entry) => (
        <li key={entry.id || `${entry.timestamp}-${entry.summary}`}>
          <div className="admin-audit-timeline__head">
            <strong>{entry.summary || entry.action}</strong>
            <time dateTime={entry.timestamp}>{formatTimestamp(entry.timestamp)}</time>
          </div>
          <div className="admin-audit-timeline__meta">
            <span>{entry.actor || "System"}</span>
            {entry.reason ? <span>Reason: {entry.reason}</span> : null}
          </div>
          {entry.old_value || entry.new_value ? (
            <ChangeDiff oldValue={entry.old_value} newValue={entry.new_value} />
          ) : null}
        </li>
      ))}
    </ol>
  );
}

export function AuditViewer({ entry }) {
  if (!entry) return <p className="admin-empty">Select an audit entry</p>;
  return (
    <article className="admin-audit-viewer">
      <header>
        <h3>{entry.summary || entry.action}</h3>
        <p>
          {entry.actor} · {formatTimestamp(entry.timestamp)}
        </p>
      </header>
      {entry.reason ? <p className="admin-audit-viewer__reason">Reason: {entry.reason}</p> : null}
      {entry.details ? (
        <pre className="admin-audit-viewer__details">{JSON.stringify(entry.details, null, 2)}</pre>
      ) : null}
      {entry.old_value || entry.new_value ? (
        <ChangeDiff oldValue={entry.old_value} newValue={entry.new_value} />
      ) : null}
    </article>
  );
}

export function ActivityFeed({ items = [], emptyLabel = "No recent activity" }) {
  if (!items.length) return <p className="admin-empty">{emptyLabel}</p>;
  return (
    <ul className="admin-activity-feed">
      {items.map((item) => (
        <li key={item.id || `${item.timestamp}-${item.title}`}>
          <div>
            <strong>{item.title}</strong>
            <p>{item.description}</p>
          </div>
          <time dateTime={item.timestamp}>{formatTimestamp(item.timestamp)}</time>
        </li>
      ))}
    </ul>
  );
}
