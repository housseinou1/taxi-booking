import React from "react";

export function AdminPageLoader({ label = "Loading admin workspace…" }) {
  return (
    <div className="admin-shell__loader" role="status" aria-live="polite">
      <div className="admin-shell__loader-spinner" aria-hidden="true" />
      <p>{label}</p>
    </div>
  );
}

export function AdminInlineLoader({ label = "Loading…" }) {
  return (
    <span className="admin-shell__inline-loader" role="status" aria-live="polite">
      <span className="admin-shell__loader-spinner admin-shell__loader-spinner--sm" aria-hidden="true" />
      {label}
    </span>
  );
}

export function AdminSkeleton({ className = "", style }) {
  return <div className={`admin-skeleton ${className}`.trim()} style={style} aria-hidden="true" />;
}

export function DashboardSkeleton() {
  return (
    <div className="admin-skeleton-dashboard">
      <div className="admin-skeleton-row">
        {Array.from({ length: 4 }).map((_, i) => (
          <AdminSkeleton key={i} className="admin-skeleton-card" />
        ))}
      </div>
      <AdminSkeleton className="admin-skeleton-panel" />
      <AdminSkeleton className="admin-skeleton-panel admin-skeleton-panel--tall" />
    </div>
  );
}

export function TableSkeleton({ rows = 5 }) {
  return (
    <div className="admin-skeleton-table">
      <AdminSkeleton className="admin-skeleton-table__head" />
      {Array.from({ length: rows }).map((_, i) => (
        <AdminSkeleton key={i} className="admin-skeleton-table__row" />
      ))}
    </div>
  );
}

export function ChartSkeleton() {
  return <AdminSkeleton className="admin-skeleton-chart" />;
}

export function FormSkeleton() {
  return (
    <div className="admin-skeleton-form">
      {Array.from({ length: 4 }).map((_, i) => (
        <AdminSkeleton key={i} className="admin-skeleton-form__field" />
      ))}
      <AdminSkeleton className="admin-skeleton-form__button" />
    </div>
  );
}

export function CardSkeleton() {
  return <AdminSkeleton className="admin-skeleton-card admin-skeleton-card--lg" />;
}
