import { formatMoney } from "../marketConfig";
import { getPaymentMethodLabel } from "../rider/utils/paymentMethods";

function escapeReceiptText(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatReceiptDate(value) {
  if (!value) return new Date().toLocaleString();
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : String(value);
}

function getDriverName(ride) {
  return (
    ride?.driver_name ||
    [ride?.driver_first_name, ride?.driver_last_name].filter(Boolean).join(" ").trim() ||
    "Driver"
  );
}

function getVehicleLabel(ride) {
  return (
    [ride?.vehicle_make, ride?.vehicle_model].filter(Boolean).join(" ") ||
    ride?.vehicle ||
    "Yala ride"
  );
}

function getLocationLabel(value, fallback = "—") {
  if (!value) return fallback;
  if (typeof value === "string") return value;
  return value?.label || value?.address || fallback;
}

/**
 * Build receipt rows strictly from backend ride/payment payloads.
 */
export function buildRideReceiptRows({ ride, payment }) {
  const fare = Number(payment?.amount ?? ride?.fare ?? 0);
  const tipAmount = Number(payment?.tip_amount ?? 0);
  const waitingFee = Number(ride?.waiting_fee ?? 0);
  const discount = Number(payment?.discount_amount ?? ride?.discount_amount ?? 0);
  const tax = Number(ride?.tax_amount ?? ride?.tax ?? 0);
  const distanceKm = Number(ride?.distance_km ?? ride?.distance ?? 0);
  const durationMinutes = Number(ride?.duration_minutes ?? ride?.estimated_minutes ?? 0);

  const rows = [
    { label: "Trip ID", value: ride?.id ? `#${ride.id}` : "—" },
    { label: "Pickup", value: getLocationLabel(ride?.pickup, ride?.pickup_address) },
    { label: "Destination", value: getLocationLabel(ride?.destination, ride?.destination_address) },
    { label: "Driver", value: getDriverName(ride) },
    { label: "Vehicle", value: getVehicleLabel(ride) },
  ];

  if (distanceKm > 0) {
    rows.push({ label: "Distance", value: `${distanceKm.toFixed(1)} km` });
  }
  if (durationMinutes > 0) {
    rows.push({ label: "Duration", value: `${Math.round(durationMinutes)} min` });
  }

  rows.push({ label: "Fare", value: formatMoney(fare - tipAmount) });

  if (waitingFee > 0) {
    rows.push({ label: "Waiting fee", value: formatMoney(waitingFee) });
  }
  if (discount > 0) {
    rows.push({ label: "Discount", value: `-${formatMoney(discount)}` });
  }
  if (tax > 0) {
    rows.push({ label: "Tax", value: formatMoney(tax) });
  }
  if (tipAmount > 0) {
    rows.push({ label: "Tip", value: formatMoney(tipAmount) });
  }

  rows.push({
    label: "Payment method",
    value: getPaymentMethodLabel(payment?.method || ride?.payment_method),
  });
  rows.push({
    label: "Date & time",
    value: formatReceiptDate(payment?.created_at || ride?.completed_at || ride?.updated_at),
  });

  if (payment?.transaction_id) {
    rows.push({ label: "Transaction", value: payment.transaction_id });
  }

  const total = fare;
  return { rows, total: formatMoney(total), status: payment?.status || ride?.payment_status || "paid" };
}

export function buildReceiptPrintHtml({ ride, payment }) {
  const { rows, total, status } = buildRideReceiptRows({ ride, payment });

  return `<!doctype html>
    <html>
      <head>
        <title>Yala receipt ${escapeReceiptText(ride?.id ? `#${ride.id}` : "")}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 0; padding: 24px; color: #0f172a; }
          .receipt { max-width: 420px; margin: 0 auto; border: 1px solid #d8dee8; border-radius: 12px; padding: 24px; }
          .brand { display: flex; justify-content: space-between; border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 16px; }
          .row { display: flex; justify-content: space-between; gap: 16px; border-bottom: 1px solid #e5e7eb; padding: 8px 0; font-size: 14px; }
          .total { display: flex; justify-content: space-between; margin-top: 16px; padding: 14px; border-radius: 10px; background: #0f172a; color: #fff; font-weight: 700; }
        </style>
      </head>
      <body>
        <main class="receipt">
          <header class="brand">
            <div><h1>Yala</h1><strong>Ride receipt</strong></div>
            <div>${escapeReceiptText(String(status).toUpperCase())}</div>
          </header>
          ${rows
            .map(
              (row) =>
                `<div class="row"><span>${escapeReceiptText(row.label)}</span><strong>${escapeReceiptText(row.value)}</strong></div>`
            )
            .join("")}
          <div class="total"><span>Total</span><strong>${escapeReceiptText(total)}</strong></div>
        </main>
      </body>
    </html>`;
}

export function printRideReceipt({ ride, payment }) {
  const html = buildReceiptPrintHtml({ ride, payment });
  const printFrame = document.createElement("iframe");
  printFrame.style.position = "fixed";
  printFrame.style.width = "0";
  printFrame.style.height = "0";
  printFrame.style.border = "0";
  document.body.appendChild(printFrame);

  const printWindow = printFrame.contentWindow;
  const printDocument = printWindow?.document;
  if (!printWindow || !printDocument) {
    window.print();
    return;
  }

  printDocument.open();
  printDocument.write(html);
  printDocument.close();
  window.setTimeout(() => {
    printWindow.focus();
    printWindow.print();
    window.setTimeout(() => printFrame.remove(), 1000);
  }, 250);
}

export async function shareRideReceipt({ ride, payment }) {
  const { rows, total } = buildRideReceiptRows({ ride, payment });
  const text = ["Yala ride receipt", ...rows.map((row) => `${row.label}: ${row.value}`), `Total: ${total}`].join("\n");

  if (navigator.share) {
    await navigator.share({
      title: `Yala receipt #${ride?.id || ""}`,
      text,
    });
    return true;
  }

  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return true;
  }

  return false;
}

export function downloadRideReceiptPdf({ ride, payment }) {
  // Browser print-to-PDF is the supported v1 path (no fake PDF generator).
  printRideReceipt({ ride, payment });
}
