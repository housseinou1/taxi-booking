import React, { useMemo, useState } from "react";

import AdminActionGuard from "../../guards/AdminActionGuard";
import ExportMenu from "../export/ExportMenu";
import InlineError from "../feedback/InlineError";
import { TableSkeleton } from "../feedback/skeletons";

function compareValues(a, b) {
  if (a == null && b == null) return 0;
  if (a == null) return -1;
  if (b == null) return 1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b));
}

export default function DataTable({
  columns,
  rows = [],
  rowKey = "id",
  loading,
  error,
  emptyLabel = "No records found",
  title,
  searchable = true,
  searchPlaceholder = "Search…",
  searchValue,
  onSearchChange,
  sortKey,
  sortDirection = "asc",
  onSortChange,
  serverMode = false,
  page = 1,
  pageSize = 20,
  total,
  onPageChange,
  onPageSizeChange,
  filters,
  onFilterChange,
  rowActions,
  bulkActions,
  exportFilename = "export",
  exportScope = "reports",
  stickyHeader = true,
  onRefresh,
}) {
  const [localSearch, setLocalSearch] = useState("");
  const [visibleColumns, setVisibleColumns] = useState(() => columns.map((c) => c.id));
  const [selected, setSelected] = useState(() => new Set());

  const search = searchValue ?? localSearch;
  const setSearch = onSearchChange || setLocalSearch;

  const filteredRows = useMemo(() => {
    if (serverMode) return rows;
    const query = search.trim().toLowerCase();
    let next = rows;
    if (query) {
      next = next.filter((row) =>
        columns.some((col) => String(row[col.id] ?? "").toLowerCase().includes(query))
      );
    }
    if (sortKey && !serverMode) {
      next = [...next].sort((a, b) => {
        const cmp = compareValues(a[sortKey], b[sortKey]);
        return sortDirection === "desc" ? -cmp : cmp;
      });
    }
    return next;
  }, [rows, columns, search, sortKey, sortDirection, serverMode]);

  const totalCount = serverMode ? total ?? rows.length : filteredRows.length;
  const pageCount = Math.max(1, Math.ceil(totalCount / pageSize));
  const pagedRows = serverMode
    ? rows
    : filteredRows.slice((page - 1) * pageSize, page * pageSize);

  const visibleCols = columns.filter((col) => visibleColumns.includes(col.id));

  const toggleSort = (col) => {
    if (!col.sortable) return;
    const nextDir = sortKey === col.id && sortDirection === "asc" ? "desc" : "asc";
    onSortChange?.(col.id, nextDir);
  };

  const toggleAll = () => {
    if (selected.size === pagedRows.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(pagedRows.map((row) => row[rowKey])));
    }
  };

  if (loading) return <TableSkeleton rows={6} />;

  return (
    <section className="admin-table-wrap" aria-label={title || "Data table"}>
      <div className="admin-table-toolbar">
        <div className="admin-table-toolbar__left">
          {title ? <h3 className="admin-table__title">{title}</h3> : null}
          {searchable ? (
            <label className="admin-table-search">
              <span className="admin-shell__sr-only">Search table</span>
              <input
                type="search"
                value={search}
                placeholder={searchPlaceholder}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
          ) : null}
          {filters}
        </div>
        <div className="admin-table-toolbar__right">
          {onRefresh ? (
            <button type="button" className="admin-lib-btn admin-lib-btn--ghost" onClick={onRefresh}>
              Refresh
            </button>
          ) : null}
          <details className="admin-table-columns">
            <summary className="admin-lib-btn admin-lib-btn--ghost">Columns</summary>
            <div className="admin-table-columns__menu">
              {columns.map((col) => (
                <label key={col.id} className="admin-table-columns__item">
                  <input
                    type="checkbox"
                    checked={visibleColumns.includes(col.id)}
                    onChange={() =>
                      setVisibleColumns((prev) =>
                        prev.includes(col.id) ? prev.filter((id) => id !== col.id) : [...prev, col.id]
                      )
                    }
                  />
                  {col.label}
                </label>
              ))}
            </div>
          </details>
          <ExportMenu filename={exportFilename} rows={filteredRows} columns={visibleCols} exportScope={exportScope} />
        </div>
      </div>

      {error ? <InlineError message={error} /> : null}

      <div className={`admin-table-scroll ${stickyHeader ? "admin-table-scroll--sticky" : ""}`.trim()}>
        <table className="admin-table">
          <thead>
            <tr>
              {bulkActions ? (
                <th scope="col" className="admin-table__check">
                  <input
                    type="checkbox"
                    aria-label="Select all rows"
                    checked={pagedRows.length > 0 && selected.size === pagedRows.length}
                    onChange={toggleAll}
                  />
                </th>
              ) : null}
              {visibleCols.map((col) => (
                <th
                  key={col.id}
                  scope="col"
                  aria-sort={
                    sortKey === col.id ? (sortDirection === "asc" ? "ascending" : "descending") : "none"
                  }
                >
                  {col.sortable ? (
                    <button type="button" className="admin-table__sort" onClick={() => toggleSort(col)}>
                      {col.label}
                    </button>
                  ) : (
                    col.label
                  )}
                </th>
              ))}
              {rowActions ? <th scope="col">Actions</th> : null}
            </tr>
          </thead>
          <tbody>
            {pagedRows.length === 0 ? (
              <tr>
                <td colSpan={visibleCols.length + (rowActions ? 1 : 0) + (bulkActions ? 1 : 0)}>
                  <p className="admin-table__empty">{emptyLabel}</p>
                </td>
              </tr>
            ) : (
              pagedRows.map((row) => {
                const id = row[rowKey];
                return (
                  <tr key={id}>
                    {bulkActions ? (
                      <td className="admin-table__check">
                        <input
                          type="checkbox"
                          aria-label={`Select row ${id}`}
                          checked={selected.has(id)}
                          onChange={() =>
                            setSelected((prev) => {
                              const next = new Set(prev);
                              if (next.has(id)) next.delete(id);
                              else next.add(id);
                              return next;
                            })
                          }
                        />
                      </td>
                    ) : null}
                    {visibleCols.map((col) => (
                      <td key={col.id}>{col.render ? col.render(row) : row[col.id] ?? "—"}</td>
                    ))}
                    {rowActions ? <td className="admin-table__actions">{rowActions(row)}</td> : null}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {bulkActions && selected.size ? (
        <div className="admin-table-bulk">
          <span>{selected.size} selected</span>
          {bulkActions(Array.from(selected))}
        </div>
      ) : null}

      <div className="admin-table-pagination">
        <span>
          Page {page} of {pageCount} · {totalCount} rows
        </span>
        <div className="admin-table-pagination__controls">
          <button
            type="button"
            className="admin-lib-btn admin-lib-btn--ghost"
            disabled={page <= 1}
            onClick={() => onPageChange?.(page - 1)}
          >
            Previous
          </button>
          <button
            type="button"
            className="admin-lib-btn admin-lib-btn--ghost"
            disabled={page >= pageCount}
            onClick={() => onPageChange?.(page + 1)}
          >
            Next
          </button>
          {onPageSizeChange ? (
            <select
              className="admin-lib-select"
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              aria-label="Rows per page"
            >
              {[10, 20, 50, 100].map((size) => (
                <option key={size} value={size}>
                  {size} / page
                </option>
              ))}
            </select>
          ) : null}
        </div>
      </div>
    </section>
  );
}

export function DataTableAction({ action, module, approve, exportScope, children, onClick }) {
  return (
    <AdminActionGuard action={action} module={module} approve={approve} exportScope={exportScope} mode="disable">
      <button type="button" className="admin-lib-btn admin-lib-btn--ghost" onClick={onClick}>
        {children}
      </button>
    </AdminActionGuard>
  );
}
