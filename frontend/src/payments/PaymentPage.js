import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { API_URL } from "../apiConfig";
import { formatMoney } from "../marketConfig";

const PAYMENT_METHODS = [
  {
    id: "cash",
    title: "Cash",
    subtitle: "Pay the driver after drop-off",
    badge: "Confirm with driver",
  },
  {
    id: "card",
    title: "Card",
    subtitle: "Visa or Mastercard",
    badge: "Instant",
  },
  {
    id: "bankily",
    title: "Bankily",
    subtitle: "Mobile money payment",
    badge: "Wallet",
  },
  {
    id: "masrvi",
    title: "Masravi",
    subtitle: "Local wallet transfer",
    badge: "Wallet",
  },
  {
    id: "seddad",
    title: "Seddad",
    subtitle: "Mobile wallet payment",
    badge: "Wallet",
  },
];

const TAX_RATE = 0.03;
const DEFAULT_TIME_MINUTES = 12;

function PaymentPage({ ride }) {
  const [payment, setPayment] = useState(null);
  const [tipPercentage, setTipPercentage] = useState(10);
  const [selectedMethod, setSelectedMethod] = useState("cash");
  const [paymentHistory, setPaymentHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [rating, setRating] = useState(0);
  const [review, setReview] = useState("");
  const [ratingSubmitted, setRatingSubmitted] = useState(false);

  const fare = Number(ride?.fare || 0);
  const distanceKm = Number(ride?.distance_km || ride?.distance || 0);
  const tripMinutes = Number(ride?.duration_minutes || ride?.estimated_minutes || DEFAULT_TIME_MINUTES);
  const baseFare = Math.min(fare || 0, 60);
  const timeFare = Math.round(Math.max(0, tripMinutes) * 1.5);
  const taxes = Math.round(fare * TAX_RATE);
  const platformFee = Math.round(Number(payment?.app_fee ?? ride?.app_fee ?? fare * 0.3));
  const distanceFare = Math.max(0, Math.round(fare - baseFare - timeFare));
  const tipAmount = Math.round((fare * Number(tipPercentage || 0)) / 100);
  const totalAmount = fare + tipAmount;
  const driverEarning = Number(payment?.driver_earning ?? ride?.driver_earning ?? fare - platformFee + tipAmount);
  const rideStatus = ride?.status || "";
  const paymentStatus = payment?.status || ride?.payment_status || "";
  const isCancelled = rideStatus === "cancelled" || paymentStatus === "cancelled";
  const isAutoPaid = paymentStatus === "paid";
  const isAuthorized = paymentStatus === "authorized";

  const walletBalance = useMemo(() => {
    return paymentHistory
      .filter((item) => item.status === "paid")
      .reduce((sum, item) => sum + Number(item.amount || 0) + Number(item.tip_amount || 0), 0);
  }, [paymentHistory]);

  useEffect(() => {
    fetchPaymentHistory();
  }, []);

  const fetchPaymentHistory = async () => {
    try {
      const token = localStorage.getItem("access");
      if (!token) return;

      setHistoryLoading(true);
      const response = await axios.get(`${API_URL}/payments/my-payments/`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      setPaymentHistory(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.log("Payment history error:", error.response?.data || error);
      setPaymentHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  const makePayment = async (method) => {
    try {
      const token = localStorage.getItem("access");

      const response = await axios.post(
        `${API_URL}/payments/create/`,
        {
          ride_id: ride.id,
          amount: ride.fare || 0,
          tip_percentage: tipPercentage,
          method,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      setPayment(response.data.payment);
      setNotice(response.data.message || "Payment created");
      fetchPaymentHistory();
    } catch (error) {
      const existingPayment = error.response?.data?.payment;

      if (existingPayment) {
        setPayment(existingPayment);
        setNotice(error.response.data.error || "Payment already exists");
        return;
      }

      console.log("Payment error:", error.response?.data || error);
      setNotice(error.response?.data?.error || "Could not create payment");
    }
  };

  const submitRating = async () => {
    try {
      const token = localStorage.getItem("access");

      if (!rating) {
        setNotice("Please select a rating.");
        return;
      }

      await axios.post(
        `${API_URL}/rides/rate/${ride.id}/`,
        {
          rating,
          review,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      setRatingSubmitted(true);
      setNotice("Thank you. Your driver rating was submitted.");
    } catch (error) {
      console.log("Rating error:", error.response?.data || error);
      setNotice("Could not submit rating");
    }
  };

  if (!ride) {
    return (
      <main className="sx-payments-page">
        <PaymentStyles />
        <div className="sx-empty-payment">
          <h2>No ride selected</h2>
          <button onClick={() => (window.location.href = "/rider-dashboard")}>
            Back to rider dashboard
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="sx-payments-page">
      <PaymentStyles />

      <section className="sx-payment-hero">
        <div>
          <span className="sx-payment-eyebrow">Yala Pay</span>
          <h1>Choose how you want to pay.</h1>
          <p>
            Your fare is protected. Card payments complete instantly, while cash and wallet
            payments wait for driver verification after drop-off.
          </p>
        </div>

        <WalletCard balance={walletBalance} historyCount={paymentHistory.length} />
      </section>

      <section
        className={`sx-payment-alert ${
          isCancelled ? "is-danger" : isAutoPaid ? "is-success" : "is-info"
        }`}
      >
        <strong>
          {isCancelled
            ? "Payment cancelled"
            : isAutoPaid
              ? "Payment completed"
              : isAuthorized
                ? "Payment authorized"
                : "Automatic payment protection"}
        </strong>
        <span>
          {isCancelled
            ? "This ride was cancelled, so no rider payment will go through."
            : isAutoPaid
              ? "The ride is completed and the fare is captured."
              : "If the rider or driver cancels before completion, the payment is not captured."}
        </span>
      </section>

      {notice && <div className="sx-payment-notice">{notice}</div>}

      {isAutoPaid && (
        <section className="sx-success-stage" aria-label="Payment success">
          <div className="sx-success-check">✓</div>
          <div>
            <span className="sx-payment-eyebrow">Payment success</span>
            <h2>{formatMoney(totalAmount)} paid successfully</h2>
            <p>Your receipt is ready and driver earnings were updated.</p>
          </div>
        </section>
      )}

      <div className="sx-payment-grid">
        <section className="sx-payment-panel">
          <div className="sx-payment-panel-head">
            <div>
              <span>Ride #{ride?.id}</span>
              <h2>Trip summary</h2>
            </div>
            <b>{rideStatus || "selected"}</b>
          </div>

          <div className="sx-trip-line">
            <span className="sx-trip-dot" />
            <div>
              <small>Pickup</small>
              <strong>{ride?.pickup || ride?.pickup_address || "Pickup location"}</strong>
            </div>
          </div>

          <div className="sx-trip-line">
            <span className="sx-trip-dot sx-trip-dot-end" />
            <div>
              <small>Destination</small>
              <strong>{ride?.destination || ride?.destination_address || "Destination"}</strong>
            </div>
          </div>

          <div className="sx-tip-block">
            <div className="sx-payment-panel-head compact">
              <div>
                <span>Tip</span>
                <h2>Thank your driver</h2>
              </div>
              <b>{formatMoney(tipAmount)}</b>
            </div>

            <div className="sx-tip-grid">
              {[0, 5, 10, 15, 20].map((percent) => (
                <button
                  key={percent}
                  className={tipPercentage === percent ? "active" : ""}
                  onClick={() => setTipPercentage(percent)}
                >
                  <strong>{percent}%</strong>
                  <span>{formatMoney(Math.round((fare * percent) / 100))}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="sx-total-card">
            <SummaryRow label="Base fare" value={formatMoney(baseFare)} />
            <SummaryRow label={`Distance (${distanceKm.toFixed(1)} km)`} value={formatMoney(distanceFare)} />
            <SummaryRow label={`Time (${tripMinutes} min)`} value={formatMoney(timeFare)} />
            <SummaryRow label="Taxes" value={formatMoney(taxes)} />
            <SummaryRow label="Yala fee" value={formatMoney(platformFee)} />
            <SummaryRow label={`Tip (${tipPercentage}%)`} value={formatMoney(tipAmount)} />
            <SummaryRow label="Platform protection" value="Included" />
            <div className="sx-grand-total">
              <span>Total</span>
              <strong>{formatMoney(totalAmount)}</strong>
            </div>
          </div>

          <div className="sx-driver-earnings-card">
            <span>Driver earnings</span>
            <strong>{formatMoney(driverEarning)}</strong>
            <small>Fare minus Yala fee plus rider tip</small>
          </div>
        </section>

        <section className="sx-payment-panel">
          <div className="sx-payment-panel-head">
            <div>
              <span>Method</span>
              <h2>Payment cards</h2>
            </div>
            <b>MRU</b>
          </div>

          <div className="sx-method-list">
            {PAYMENT_METHODS.map((method) => (
              <button
                key={method.id}
                className={selectedMethod === method.id ? "selected" : ""}
                onClick={() => setSelectedMethod(method.id)}
              >
                <span className="sx-method-icon">{method.title.slice(0, 1)}</span>
                <span className="sx-method-copy">
                  <strong>{method.title}</strong>
                  <small>{method.subtitle}</small>
                </span>
                <em>{method.badge}</em>
              </button>
            ))}
          </div>

          <button
            className="sx-pay-button"
            disabled={isCancelled}
            onClick={() => makePayment(selectedMethod)}
          >
            {isCancelled
              ? "Ride cancelled"
              : isAutoPaid
                ? `Update tip to ${tipPercentage}%`
                : isAuthorized
                  ? `Save ${tipPercentage}% tip`
                  : `Pay ${formatMoney(totalAmount)}`}
          </button>
        </section>
      </div>

      <div className="sx-payment-grid sx-lower-grid">
        <ReceiptCard
          payment={payment}
          ride={ride}
          fare={fare}
          tipAmount={tipAmount}
          total={totalAmount}
          breakdown={{
            baseFare,
            distanceFare,
            timeFare,
            taxes,
            platformFee,
            driverEarning,
            distanceKm,
            tripMinutes,
          }}
        />
        <PaymentHistory payments={paymentHistory} loading={historyLoading} />
      </div>

      {ride?.status === "completed" && !ratingSubmitted && (
        <section className="sx-rating-panel">
          <div>
            <span className="sx-payment-eyebrow">Driver rating</span>
            <h2>How was your ride?</h2>
          </div>

          <StarRating value={rating} onChange={setRating} />

          <textarea
            value={review}
            onChange={(event) => setReview(event.target.value)}
            placeholder="Write a short review..."
          />

          <button className="sx-pay-button" disabled={!rating} onClick={submitRating}>
            Submit rating
          </button>
        </section>
      )}

      {ratingSubmitted && (
        <section className="sx-payment-alert is-success">
          <strong>Rating submitted</strong>
          <span>Thank you. Your feedback helps keep Yala professional.</span>
        </section>
      )}
    </main>
  );
}

function WalletCard({ balance, historyCount }) {
  return (
    <aside className="sx-wallet-card">
      <span>Wallet balance</span>
      <strong>{formatMoney(balance)}</strong>
      <small>{historyCount} payment records</small>
    </aside>
  );
}

function SummaryRow({ label, value }) {
  return (
    <div className="sx-summary-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ReceiptCard({ payment, ride, fare, tipAmount, total, breakdown }) {
  const activePayment = payment || {};
  const receiptTotal = payment
    ? Number(activePayment.amount || 0) + Number(activePayment.tip_amount || 0)
    : total;

  return (
    <section className="sx-receipt-card">
      <div className="sx-payment-panel-head">
        <div>
          <span>Receipt</span>
          <h2>{payment ? "Yala receipt" : "Receipt preview"}</h2>
        </div>
        <b>{payment?.status || "ready"}</b>
      </div>

      <SummaryRow label="Ride" value={`#${ride?.id}`} />
      <SummaryRow label="Base fare" value={formatMoney(breakdown.baseFare)} />
      <SummaryRow
        label={`Distance (${breakdown.distanceKm.toFixed(1)} km)`}
        value={formatMoney(breakdown.distanceFare)}
      />
      <SummaryRow
        label={`Time (${breakdown.tripMinutes} min)`}
        value={formatMoney(breakdown.timeFare)}
      />
      <SummaryRow label="Taxes" value={formatMoney(breakdown.taxes)} />
      <SummaryRow label="Yala fee" value={formatMoney(payment?.app_fee ?? breakdown.platformFee)} />
      <SummaryRow label="Fare" value={formatMoney(payment?.amount ?? fare)} />
      <SummaryRow label="Tip" value={formatMoney(payment?.tip_amount ?? tipAmount)} />
      <SummaryRow
        label="Driver earning"
        value={formatMoney(payment?.driver_earning ?? breakdown.driverEarning)}
      />
      <SummaryRow label="Method" value={formatMethod(payment?.method || "Select method")} />
      <SummaryRow label="Transaction" value={payment?.transaction_id || "Created after payment"} />

      <div className="sx-grand-total">
        <span>Total receipt</span>
        <strong>{formatMoney(receiptTotal)}</strong>
      </div>

      <button className="sx-receipt-button" onClick={() => window.print()} disabled={!payment}>
        Print receipt
      </button>
    </section>
  );
}

function PaymentHistory({ payments, loading }) {
  return (
    <section className="sx-history-panel">
      <div className="sx-payment-panel-head">
        <div>
          <span>History</span>
          <h2>Payment history</h2>
        </div>
        <b>{payments.length}</b>
      </div>

      {loading ? (
        <div className="sx-history-empty">Loading payments...</div>
      ) : payments.length === 0 ? (
        <div className="sx-history-empty">No payment history yet.</div>
      ) : (
        <div className="sx-history-list">
          {payments.slice(0, 6).map((item) => (
            <div key={item.id} className="sx-history-item">
              <div>
                <strong>Ride #{item.ride_id}</strong>
                <span>{formatMethod(item.method)} - {formatDate(item.created_at)}</span>
              </div>
              <div>
                <b>{formatMoney(Number(item.amount || 0) + Number(item.tip_amount || 0))}</b>
                <small>{item.status}</small>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function StarRating({ value, onChange }) {
  return (
    <div className="sx-stars" aria-label="Choose rating">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => onChange(star)}
          aria-label={`${star} star${star === 1 ? "" : "s"}`}
          className={value >= star ? "active" : ""}
        >
          ★
        </button>
      ))}
    </div>
  );
}

function formatMethod(method) {
  const match = PAYMENT_METHODS.find((item) => item.id === method);
  if (match) return match.title;
  if (method === "bank_account") return "Bank account";
  return String(method || "").replace(/_/g, " ") || "Unknown";
}

function formatDate(value) {
  if (!value) return "Today";

  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(value));
  } catch (error) {
    return "Recent";
  }
}

function PaymentStyles() {
  return (
    <style>{`
      .sx-payments-page {
        min-height: 100vh;
        padding: 24px;
        background:
          radial-gradient(circle at 12% 8%, rgba(249, 181, 35, 0.18), transparent 28%),
          linear-gradient(135deg, #090b12 0%, #10131c 42%, #f5f7fb 42%, #eef2f6 100%);
        color: #0f172a;
      }

      .sx-payment-hero {
        max-width: 1180px;
        margin: 0 auto 18px;
        display: grid;
        grid-template-columns: minmax(0, 1fr) 320px;
        gap: 18px;
        align-items: stretch;
      }

      .sx-payment-hero > div,
      .sx-wallet-card {
        border: 1px solid rgba(255, 255, 255, 0.14);
        background: rgba(15, 23, 42, 0.9);
        color: #fff;
        border-radius: 8px;
        padding: 26px;
        box-shadow: 0 24px 70px rgba(2, 6, 23, 0.24);
      }

      .sx-payment-eyebrow {
        display: block;
        color: #f3bd34;
        font-size: 12px;
        font-weight: 900;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        margin-bottom: 8px;
      }

      .sx-payment-hero h1 {
        margin: 0;
        max-width: 760px;
        font-size: clamp(32px, 5vw, 58px);
        line-height: 1;
        letter-spacing: 0;
      }

      .sx-payment-hero p {
        max-width: 720px;
        color: #cbd5e1;
        line-height: 1.7;
        margin: 16px 0 0;
      }

      .sx-wallet-card {
        display: grid;
        align-content: center;
        gap: 8px;
        background:
          linear-gradient(145deg, rgba(252, 211, 77, 0.2), rgba(16, 185, 129, 0.1)),
          #0b1220;
      }

      .sx-wallet-card span,
      .sx-wallet-card small {
        color: #d1d5db;
        font-weight: 800;
      }

      .sx-wallet-card strong {
        font-size: 38px;
        color: #fff;
      }

      .sx-payment-alert,
      .sx-payment-notice {
        max-width: 1180px;
        margin: 0 auto 14px;
        display: grid;
        gap: 4px;
        border-radius: 8px;
        padding: 14px 16px;
        border: 1px solid transparent;
        font-weight: 800;
      }

      .sx-payment-alert span,
      .sx-payment-notice {
        font-weight: 700;
      }

      .sx-payment-alert.is-info {
        background: #eff6ff;
        color: #1d4ed8;
        border-color: #bfdbfe;
      }

      .sx-payment-alert.is-success {
        background: #ecfdf3;
        color: #166534;
        border-color: #bbf7d0;
      }

      .sx-payment-alert.is-danger {
        background: #fef2f2;
        color: #991b1b;
        border-color: #fecaca;
      }

      .sx-payment-notice {
        background: #fffbeb;
        color: #92400e;
        border-color: #fde68a;
      }

      .sx-payment-grid {
        max-width: 1180px;
        margin: 0 auto;
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 16px;
        align-items: start;
      }

      .sx-lower-grid {
        margin-top: 16px;
      }

      .sx-payment-panel,
      .sx-receipt-card,
      .sx-history-panel,
      .sx-rating-panel,
      .sx-empty-payment {
        background: rgba(255, 255, 255, 0.96);
        border: 1px solid rgba(15, 23, 42, 0.08);
        border-radius: 8px;
        padding: 20px;
        box-shadow: 0 18px 44px rgba(15, 23, 42, 0.1);
      }

      .sx-payment-panel-head {
        display: flex;
        justify-content: space-between;
        gap: 16px;
        align-items: flex-start;
        margin-bottom: 18px;
      }

      .sx-payment-panel-head.compact {
        margin-bottom: 12px;
      }

      .sx-payment-panel-head span {
        color: #64748b;
        font-size: 12px;
        font-weight: 900;
        text-transform: uppercase;
      }

      .sx-payment-panel-head h2 {
        margin: 4px 0 0;
        font-size: 24px;
        letter-spacing: 0;
      }

      .sx-payment-panel-head b {
        border-radius: 999px;
        padding: 7px 11px;
        background: #f1f5f9;
        color: #0f172a;
        font-size: 12px;
        white-space: nowrap;
      }

      .sx-trip-line {
        display: grid;
        grid-template-columns: 20px 1fr;
        gap: 12px;
        padding: 12px 0;
        border-bottom: 1px solid #e5e7eb;
      }

      .sx-trip-dot {
        width: 12px;
        height: 12px;
        border-radius: 50%;
        background: #111827;
        margin-top: 5px;
        box-shadow: 0 0 0 5px #e5e7eb;
      }

      .sx-trip-dot-end {
        background: #f59e0b;
      }

      .sx-trip-line small,
      .sx-summary-row span,
      .sx-history-item span,
      .sx-history-item small {
        color: #64748b;
        font-weight: 700;
      }

      .sx-trip-line strong {
        display: block;
        margin-top: 3px;
        color: #0f172a;
      }

      .sx-tip-block {
        margin-top: 18px;
      }

      .sx-tip-grid {
        display: grid;
        grid-template-columns: repeat(5, minmax(0, 1fr));
        gap: 8px;
      }

      .sx-tip-grid button {
        border: 1px solid #e5e7eb;
        background: #fff;
        border-radius: 8px;
        min-height: 74px;
        display: grid;
        gap: 4px;
        place-items: center;
        cursor: pointer;
        transition: transform 160ms ease, border-color 160ms ease, background 160ms ease;
      }

      .sx-tip-grid button:hover,
      .sx-method-list button:hover,
      .sx-pay-button:hover,
      .sx-receipt-button:hover {
        transform: translateY(-1px);
      }

      .sx-tip-grid button.active {
        background: #0f172a;
        border-color: #0f172a;
        color: #fff;
      }

      .sx-tip-grid span {
        font-size: 12px;
        font-weight: 800;
      }

      .sx-total-card {
        margin-top: 18px;
        border-radius: 8px;
        border: 1px solid #e5e7eb;
        background: #f8fafc;
        padding: 16px;
        display: grid;
        gap: 10px;
      }

      .sx-summary-row,
      .sx-grand-total,
      .sx-history-item {
        display: flex;
        justify-content: space-between;
        gap: 16px;
        align-items: center;
      }

      .sx-grand-total {
        border-top: 1px solid #e5e7eb;
        margin-top: 4px;
        padding-top: 12px;
        font-size: 20px;
      }

      .sx-method-list {
        display: grid;
        gap: 10px;
      }

      .sx-method-list button {
        border: 1px solid #e5e7eb;
        background: #fff;
        border-radius: 8px;
        padding: 14px;
        display: grid;
        grid-template-columns: 46px 1fr auto;
        gap: 12px;
        align-items: center;
        text-align: left;
        cursor: pointer;
        transition: transform 160ms ease, border-color 160ms ease, background 160ms ease;
      }

      .sx-method-list button.selected {
        background: #f8fafc;
        border-color: #0f172a;
        box-shadow: inset 0 0 0 1px #0f172a;
      }

      .sx-method-icon {
        width: 46px;
        height: 46px;
        border-radius: 8px;
        display: grid;
        place-items: center;
        background: #0f172a;
        color: #fff;
        font-weight: 900;
      }

      .sx-method-copy {
        display: grid;
        gap: 3px;
      }

      .sx-method-copy small {
        color: #64748b;
        font-weight: 700;
      }

      .sx-method-list em {
        color: #0f172a;
        background: #f3bd34;
        border-radius: 999px;
        padding: 6px 9px;
        font-size: 11px;
        font-style: normal;
        font-weight: 900;
        white-space: nowrap;
      }

      .sx-pay-button,
      .sx-receipt-button,
      .sx-empty-payment button {
        width: 100%;
        margin-top: 16px;
        border: 0;
        border-radius: 8px;
        padding: 15px 18px;
        background: #0f172a;
        color: #fff;
        font-weight: 900;
        cursor: pointer;
        transition: transform 160ms ease, opacity 160ms ease;
      }

      .sx-pay-button:disabled,
      .sx-receipt-button:disabled {
        cursor: not-allowed;
        opacity: 0.52;
      }

      .sx-receipt-card,
      .sx-history-panel {
        display: grid;
        gap: 10px;
      }

      .sx-receipt-button {
        background: #fff;
        color: #0f172a;
        border: 1px solid #cbd5e1;
      }

      .sx-history-list {
        display: grid;
        gap: 10px;
      }

      .sx-history-item {
        border: 1px solid #e5e7eb;
        border-radius: 8px;
        padding: 13px;
        background: #fff;
      }

      .sx-history-item div {
        display: grid;
        gap: 3px;
      }

      .sx-history-item div:last-child {
        text-align: right;
      }

      .sx-history-empty {
        border: 1px dashed #cbd5e1;
        border-radius: 8px;
        padding: 24px;
        color: #64748b;
        font-weight: 800;
        text-align: center;
      }

      .sx-rating-panel {
        max-width: 1180px;
        margin: 16px auto 0;
        display: grid;
        gap: 14px;
      }

      .sx-rating-panel h2 {
        margin: 0;
      }

      .sx-rating-panel textarea {
        width: 100%;
        min-height: 94px;
        resize: vertical;
        border: 1px solid #cbd5e1;
        border-radius: 8px;
        padding: 13px;
        font: inherit;
        box-sizing: border-box;
      }

      .sx-stars {
        display: flex;
        gap: 8px;
      }

      .sx-stars button {
        width: 48px;
        height: 48px;
        border: 0;
        border-radius: 50%;
        background: #f8fafc;
        color: #cbd5e1;
        font-size: 30px;
        line-height: 1;
        cursor: pointer;
        transition: transform 160ms ease, color 160ms ease;
      }

      .sx-stars button.active {
        color: #f59e0b;
        transform: scale(1.05);
      }

      .sx-empty-payment {
        max-width: 560px;
        margin: 80px auto;
        text-align: center;
      }

      .sx-payments-page {
        background:
          radial-gradient(circle at 12% 8%, rgba(250, 204, 21, 0.18), transparent 28%),
          radial-gradient(circle at 88% 18%, rgba(34, 197, 94, 0.12), transparent 28%),
          linear-gradient(135deg, #030712 0%, #0b1120 48%, #111827 100%);
        color: #f8fafc;
        font-family: Inter, "SF Pro Display", "Segoe UI", Arial, sans-serif;
      }

      .sx-payment-panel,
      .sx-receipt-card,
      .sx-history-panel,
      .sx-rating-panel,
      .sx-empty-payment {
        background: rgba(255, 255, 255, 0.07);
        border-color: rgba(255, 255, 255, 0.12);
        border-radius: 18px;
        color: #f8fafc;
        box-shadow: 0 18px 44px rgba(0, 0, 0, 0.18);
        backdrop-filter: blur(16px);
      }

      .sx-payment-alert.is-info {
        background: rgba(37, 99, 235, 0.14);
        color: #bfdbfe;
        border-color: rgba(96, 165, 250, 0.34);
      }

      .sx-payment-alert.is-success {
        background: rgba(34, 197, 94, 0.14);
        color: #bbf7d0;
        border-color: rgba(74, 222, 128, 0.34);
      }

      .sx-payment-alert.is-danger {
        background: rgba(239, 68, 68, 0.14);
        color: #fecaca;
        border-color: rgba(248, 113, 113, 0.34);
      }

      .sx-payment-notice {
        background: rgba(250, 204, 21, 0.14);
        color: #fde68a;
        border-color: rgba(250, 204, 21, 0.34);
      }

      .sx-payment-panel-head span,
      .sx-trip-line small,
      .sx-summary-row span,
      .sx-history-item span,
      .sx-history-item small,
      .sx-method-copy small {
        color: #cbd5e1;
      }

      .sx-payment-panel-head b {
        background: rgba(250,204,21,0.16);
        color: #fde68a;
      }

      .sx-trip-line {
        border-bottom-color: rgba(255,255,255,0.12);
      }

      .sx-trip-line strong {
        color: #fff;
      }

      .sx-tip-grid button,
      .sx-method-list button,
      .sx-total-card,
      .sx-history-item,
      .sx-stars button {
        background: rgba(255,255,255,0.06);
        border-color: rgba(255,255,255,0.12);
        color: #f8fafc;
      }

      .sx-tip-grid button.active,
      .sx-method-list button.selected {
        background: rgba(250,204,21,0.12);
        border-color: #facc15;
        box-shadow: inset 0 0 0 1px #facc15;
        color: #fff;
      }

      .sx-method-icon,
      .sx-pay-button,
      .sx-empty-payment button {
        background: #facc15;
        color: #111827;
      }

      .sx-pay-button,
      .sx-receipt-button,
      .sx-empty-payment button {
        border-radius: 999px;
      }

      .sx-receipt-button {
        background: rgba(255,255,255,0.08);
        color: #fff;
        border-color: rgba(255,255,255,0.14);
      }

      .sx-grand-total {
        border-top-color: rgba(255,255,255,0.14);
      }

      .sx-history-empty {
        border-color: rgba(255,255,255,0.24);
        color: #cbd5e1;
      }

      .sx-rating-panel textarea {
        background: rgba(255,255,255,0.06);
        border-color: rgba(255,255,255,0.14);
        color: #fff;
      }

      .sx-stars button.active {
        color: #facc15;
      }

      .sx-success-stage {
        max-width: 1180px;
        margin: 0 auto 16px;
        border: 1px solid rgba(74, 222, 128, 0.34);
        border-radius: 18px;
        background: rgba(34, 197, 94, 0.1);
        color: #dcfce7;
        padding: 18px;
        display: grid;
        grid-template-columns: 62px 1fr;
        gap: 14px;
        align-items: center;
        box-shadow: 0 18px 42px rgba(0,0,0,0.22);
      }

      .sx-success-check {
        width: 62px;
        height: 62px;
        border-radius: 50%;
        display: grid;
        place-items: center;
        background: #22c55e;
        color: #052e16;
        font-size: 34px;
        font-weight: 950;
        animation: sx-success-pop 900ms cubic-bezier(.2, .9, .2, 1) infinite alternate;
      }

      .sx-success-stage h2,
      .sx-success-stage p {
        margin: 0;
      }

      .sx-success-stage p {
        margin-top: 4px;
        color: #bbf7d0;
        font-weight: 800;
      }

      .sx-driver-earnings-card {
        margin-top: 14px;
        border-radius: 18px;
        border: 1px solid rgba(250,204,21,0.26);
        background:
          radial-gradient(circle at 85% 20%, rgba(250,204,21,0.22), transparent 34%),
          rgba(250,204,21,0.08);
        padding: 16px;
        display: grid;
        gap: 5px;
      }

      .sx-driver-earnings-card span,
      .sx-driver-earnings-card small {
        color: #fde68a;
        font-weight: 850;
      }

      .sx-driver-earnings-card strong {
        font-size: 30px;
        color: #fff;
      }

      @keyframes sx-success-pop {
        from { transform: scale(0.94); box-shadow: 0 0 0 0 rgba(34,197,94,0.32); }
        to { transform: scale(1.04); box-shadow: 0 0 0 12px rgba(34,197,94,0); }
      }

      @media (max-width: 860px) {
        .sx-payments-page {
          padding: 14px;
          background:
            radial-gradient(circle at 20% 0%, rgba(249, 181, 35, 0.18), transparent 32%),
            #030712;
        }

        .sx-payment-hero,
        .sx-payment-grid {
          grid-template-columns: 1fr;
        }

        .sx-tip-grid {
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }

        .sx-method-list button {
          grid-template-columns: 42px 1fr;
        }

        .sx-method-list em {
          grid-column: 2;
          justify-self: start;
        }
      }

      @media (max-width: 520px) {
        .sx-payment-hero h1 {
          font-size: 36px;
        }

        .sx-tip-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .sx-payment-panel,
        .sx-receipt-card,
        .sx-history-panel,
        .sx-rating-panel {
          padding: 16px;
        }
      }
    `}</style>
  );
}

export default PaymentPage;
