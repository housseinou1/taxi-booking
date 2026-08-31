/** Client-side export helpers — no server dependency */

function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function rowsToCsv(rows, columns) {
  const header = columns.map((col) => `"${String(col.label || col.id).replace(/"/g, '""')}"`).join(",");
  const body = rows
    .map((row) =>
      columns
        .map((col) => {
          const raw = col.exportValue ? col.exportValue(row) : row[col.id];
          const value = raw == null ? "" : String(raw);
          return `"${value.replace(/"/g, '""')}"`;
        })
        .join(",")
    )
    .join("\n");
  return `${header}\n${body}`;
}

export function exportCsv(filename, rows, columns) {
  const csv = rowsToCsv(rows, columns);
  const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8;" });
  downloadBlob(filename.endsWith(".csv") ? filename : `${filename}.csv`, blob);
}

export function exportExcel(filename, rows, columns) {
  const csv = rowsToCsv(rows, columns);
  const blob = new Blob(["\uFEFF", csv], {
    type: "application/vnd.ms-excel;charset=utf-8;",
  });
  downloadBlob(filename.endsWith(".xls") ? filename : `${filename}.xls`, blob);
}

export async function copyToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return true;
  }
  const area = document.createElement("textarea");
  area.value = text;
  document.body.appendChild(area);
  area.select();
  const ok = document.execCommand("copy");
  document.body.removeChild(area);
  return ok;
}

export function printElement(element) {
  if (!element) {
    window.print();
    return;
  }
  const win = window.open("", "_blank");
  if (!win) return;
  win.document.write(`<!DOCTYPE html><html><head><title>Print</title></head><body>${element.outerHTML}</body></html>`);
  win.document.close();
  win.focus();
  win.print();
  win.close();
}

export function exportSvgAsPng(svgElement, filename = "chart.png") {
  if (!svgElement) return;
  const serializer = new XMLSerializer();
  const source = serializer.serializeToString(svgElement);
  const svgBlob = new Blob([source], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = svgElement.clientWidth || 800;
    canvas.height = svgElement.clientHeight || 400;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--admin-panel") || "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
    canvas.toBlob((blob) => {
      if (blob) downloadBlob(filename, blob);
      URL.revokeObjectURL(url);
    });
  };
  img.src = url;
}
