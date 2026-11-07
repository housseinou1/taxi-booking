import React from "react";

/**
 * Standard admin module page chrome: header → optional KPIs → filters → body.
 * Use inside AdminShell for consistent Mauritanian-themed structure.
 */
export default function AdminModuleLayout({
  title,
  subtitle,
  actions,
  kpis,
  filters,
  children,
  className = "",
  "data-testid": testId = "admin-module-layout",
}) {
  return (
    <div className={`admin-module-layout ${className}`.trim()} data-testid={testId}>
      <header className="admin-module-layout__header admin-module-layout__header--tricolor">
        <div className="admin-module-layout__titles">
          {title ? <h1 className="admin-module-layout__title">{title}</h1> : null}
          {subtitle ? <p className="admin-module-layout__subtitle">{subtitle}</p> : null}
        </div>
        {actions ? <div className="admin-module-layout__actions">{actions}</div> : null}
      </header>
      {kpis ? <section className="admin-module-layout__kpis" aria-label="Key metrics">{kpis}</section> : null}
      {filters ? <section className="admin-module-layout__filters" aria-label="Search and filters">{filters}</section> : null}
      <section className="admin-module-layout__body">{children}</section>
    </div>
  );
}
