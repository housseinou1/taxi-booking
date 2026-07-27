import { formatMoney } from "../../marketConfig";

function getAddress(ride, key) {
  return ride[key] || ride[`${key}_address`] || (key === "pickup" ? "Pickup" : "Destination");
}

function formatReceiptDate(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return "Today";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function escapeReceiptText(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function getDriverTripEarning(ride) {
  const fare = Number(ride?.fare || 0);
  const appFee = Number(ride?.app_fee || 0);
  const tip = Number(ride?.payment_tip_amount || 0);
  return Number(ride?.driver_earning ?? fare - appFee + tip);
}

export function buildDriverReceiptText(ride) {
  const riderName = ride.rider_name || "Rider";
  const riderPhone = ride.private_call_number || ride.rider_phone || "Not available";
  const pickup = getAddress(ride, "pickup");
  const destination = getAddress(ride, "destination");
  const fare = Number(ride.fare || 0);
  const tip = Number(ride.payment_tip_amount || 0);
  const earning = getDriverTripEarning(ride);
  const paymentStatus = ride.payment_status || "pending";
  const paidAt = formatReceiptDate(ride.completed_at || ride.updated_at || ride.created_at);

  return [
    `Yala Driver Receipt #${ride.id}`,
    `Rider: ${riderName}`,
    `Phone: ${riderPhone}`,
    `Route: ${pickup} -> ${destination}`,
    `Fare: ${formatMoney(fare)}`,
    `Tip: ${formatMoney(tip)}`,
    `Your earning: ${formatMoney(earning)}`,
    `Payment: ${paymentStatus.replace(/_/g, " ")}`,
    `Completed: ${paidAt}`,
  ].join("\n");
}

export function buildDriverReceiptHtml(ride) {
  const riderName = ride.rider_name || "Rider";
  const riderPhone = ride.private_call_number || ride.rider_phone || "Not available";
  const pickup = getAddress(ride, "pickup");
  const destination = getAddress(ride, "destination");
  const fare = Number(ride.fare || 0);
  const tip = Number(ride.payment_tip_amount || 0);
  const earning = getDriverTripEarning(ride);
  const paymentStatus = ride.payment_status || "pending";
  const paidAt = formatReceiptDate(ride.completed_at || ride.updated_at || ride.created_at);

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Yala Driver Receipt #${escapeReceiptText(ride.id)}</title>
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; padding: 28px; font-family: Inter, Arial, sans-serif; color: #0f172a; }
      .receipt { max-width: 480px; margin: 0 auto; border: 1px solid #dbe4ef; border-radius: 14px; padding: 22px; }
      .head { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #e2e8f0; padding-bottom: 12px; margin-bottom: 14px; }
      .brand { font-size: 24px; font-weight: 800; color: #00a651; }
      .meta { text-align: right; font-size: 12px; color: #64748b; font-weight: 700; }
      .row { display: flex; justify-content: space-between; gap: 12px; padding: 9px 0; border-bottom: 1px solid #f1f5f9; font-size: 14px; }
      .row span { color: #475569; }
      .row strong { text-align: right; }
      .total { margin-top: 14px; border-radius: 10px; background: #0f172a; color: #fff; display: flex; justify-content: space-between; padding: 12px 14px; font-size: 17px; font-weight: 800; }
      .note { margin-top: 14px; color: #64748b; font-size: 12px; font-weight: 600; text-align: center; }
    </style>
  </head>
  <body>
    <main class="receipt">
      <div class="head">
        <div>
          <div class="brand">YALA</div>
          <strong>Driver receipt</strong>
        </div>
        <div class="meta">
          <div>#${escapeReceiptText(ride.id)}</div>
          <div>${escapeReceiptText(paidAt)}</div>
        </div>
      </div>
      <div class="row"><span>Rider</span><strong>${escapeReceiptText(riderName)}</strong></div>
      <div class="row"><span>Phone</span><strong>${escapeReceiptText(riderPhone)}</strong></div>
      <div class="row"><span>Pickup</span><strong>${escapeReceiptText(pickup)}</strong></div>
      <div class="row"><span>Destination</span><strong>${escapeReceiptText(destination)}</strong></div>
      <div class="row"><span>Fare</span><strong>${escapeReceiptText(formatMoney(fare))}</strong></div>
      <div class="row"><span>Tip</span><strong>${escapeReceiptText(formatMoney(tip))}</strong></div>
      <div class="row"><span>Payment</span><strong>${escapeReceiptText(paymentStatus.replace(/_/g, " "))}</strong></div>
      <div class="total"><span>Your earning</span><strong>${escapeReceiptText(formatMoney(earning))}</strong></div>
      <p class="note">Shared by Yala Driver App</p>
    </main>
  </body>
</html>`;
}

export function printDriverReceipt(ride) {
  const frame = document.createElement("iframe");
  frame.style.position = "fixed";
  frame.style.right = "0";
  frame.style.bottom = "0";
  frame.style.width = "0";
  frame.style.height = "0";
  frame.style.border = "0";
  document.body.appendChild(frame);

  const printWindow = frame.contentWindow;
  const printDocument = printWindow?.document;
  if (!printWindow || !printDocument) {
    window.print();
    return;
  }

  printDocument.open();
  printDocument.write(buildDriverReceiptHtml(ride));
  printDocument.close();

  printWindow.focus();
  printWindow.print();

  window.setTimeout(() => {
    document.body.removeChild(frame);
  }, 1000);
}

export function shareDriverReceipt(ride) {
  const receiptText = buildDriverReceiptText(ride);
  if (navigator.share) {
    return navigator.share({ title: `Yala receipt #${ride.id}`, text: receiptText });
  }
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(receiptText);
  }
  window.prompt("Copy this receipt:", receiptText);
  return Promise.resolve();
}

export function filterDriverHistoryRides(rides, query = "") {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return rides;

  return rides.filter((ride) => {
    const haystack = [
      ride.id,
      ride.pickup,
      ride.pickup_address,
      ride.destination,
      ride.destination_address,
      ride.rider_name,
      ride.status,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return haystack.includes(normalizedQuery);
  });
}
