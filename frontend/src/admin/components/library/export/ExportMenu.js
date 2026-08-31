import React from "react";

import AdminActionGuard from "../../guards/AdminActionGuard";
import { copyToClipboard, exportCsv, exportExcel, printElement, rowsToCsv } from "../utils/exportUtils";

const ACTIONS = [
  { id: "csv", label: "CSV", scope: "reports" },
  { id: "excel", label: "Excel", scope: "reports" },
  { id: "copy", label: "Copy", scope: "reports" },
  { id: "pdf", label: "PDF", scope: "reports" },
  { id: "print", label: "Print", scope: "reports" },
];

export default function ExportMenu({ filename = "export", rows = [], columns = [], exportScope = "reports" }) {
  const run = async (type) => {
    if (type === "csv") exportCsv(filename, rows, columns);
    if (type === "excel") exportExcel(filename, rows, columns);
    if (type === "copy") await copyToClipboard(rowsToCsv(rows, columns));
    if (type === "print" || type === "pdf") {
      const table = document.createElement("table");
      const thead = document.createElement("thead");
      const headRow = document.createElement("tr");
      columns.forEach((col) => {
        const th = document.createElement("th");
        th.textContent = col.label || col.id;
        headRow.appendChild(th);
      });
      thead.appendChild(headRow);
      table.appendChild(thead);
      const tbody = document.createElement("tbody");
      rows.forEach((row) => {
        const tr = document.createElement("tr");
        columns.forEach((col) => {
          const td = document.createElement("td");
          td.textContent = col.exportValue ? col.exportValue(row) : row[col.id];
          tr.appendChild(td);
        });
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      printElement(table);
    }
  };

  return (
    <details className="admin-export-menu">
      <summary className="admin-lib-btn admin-lib-btn--ghost">Export</summary>
      <div className="admin-export-menu__list" role="menu">
        {ACTIONS.map((action) => (
          <AdminActionGuard key={action.id} exportScope={exportScope} mode="hide">
            <button type="button" className="admin-export-menu__item" role="menuitem" onClick={() => run(action.id)}>
              {action.label}
            </button>
          </AdminActionGuard>
        ))}
      </div>
    </details>
  );
}

export function useExportAction({ filename, rows, columns, exportScope = "reports" }) {
  return {
    exportCsv: () => exportCsv(filename, rows, columns),
    exportExcel: () => exportExcel(filename, rows, columns),
    exportScope,
  };
}
