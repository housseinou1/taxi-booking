import React, { useState } from "react";
import axios from "axios";
import { API_URL } from "../apiConfig";
import { formatMoney } from "../marketConfig";

function PaymentPage({ ride }) {
  const [payment, setPayment] = useState(null);
  const [tipPercentage, setTipPercentage] = useState(15);
  const [selectedMethod, setSelectedMethod] = useState("cash");

  const [rating, setRating] = useState(0);
  const [review, setReview] = useState("");
  const [ratingSubmitted, setRatingSubmitted] = useState(false);

  const fare = Number(ride?.fare || 0);
  const tipAmount = Math.round((fare * Number(tipPercentage || 0)) / 100);
  const totalAmount = fare + tipAmount;
  const rideStatus = ride?.status || "";
  const paymentStatus = payment?.status || ride?.payment_status || "";
  const isCancelled = rideStatus === "cancelled" || paymentStatus === "cancelled";
  const isAutoPaid = paymentStatus === "paid";
  const isAuthorized = paymentStatus === "authorized";

  const paymentMethods = [
    {
      id: "cash",
      title: "Cash",
      subtitle: "Pay driver after drop-off",
      badge: "Driver confirms",
    },
    {
      id: "bankily",
      title: "Bankily",
      subtitle: "Mobile money transfer",
      badge: "Popular",
    },
    {
      id: "masrvi",
      title: "Masravi",
      subtitle: "Local wallet payment",
      badge: "Wallet",
    },
    {
      id: "card",
      title: "Card",
      subtitle: "Visa or Mastercard",
      badge: "Instant",
    },
  ];

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
      alert(response.data.message || "Payment created");
    } catch (error) {
      const existingPayment = error.response?.data?.payment;

      if (existingPayment) {
        setPayment(existingPayment);
        alert(error.response.data.error || "Payment already exists");
        return;
      }

      console.log("Payment error:", error.response?.data || error);
      alert(error.response?.data?.error || "Could not create payment");
    }
  };

  const submitRating = async () => {
    try {
      const token = localStorage.getItem("access");

      if (!rating) {
        alert("Please select a rating.");
        return;
      }

      await axios.post(
        `${API_URL}/rides/rate/${ride.id}/`,
        {
          rating: rating,
          review: review,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      setRatingSubmitted(true);
      alert("Rating submitted successfully ✅");
    } catch (error) {
      console.log("Rating error:", error.response?.data || error);
      alert("Could not submit rating");
    }
  };

  if (!ride) {
    return (
      <div style={cardStyle}>
        <h2>No ride selected.</h2>
      </div>
    );
  }

  return (
    <div style={pageStyle}>
      <section style={headerStyle}>
        <span style={eyebrowStyle}>Checkout</span>
        <h2 style={titleStyle}>Complete your ride payment</h2>
        <p style={hintStyle}>
          Ride fare is authorized automatically and only captured after the trip is completed.
          If the rider or driver cancels, the payment is cancelled.
        </p>
      </section>

      <div
        style={{
          ...autoPaymentBannerStyle,
          background: isCancelled ? "#fef2f2" : isAutoPaid ? "#ecfdf3" : "#eff6ff",
          color: isCancelled ? "#991b1b" : isAutoPaid ? "#166534" : "#1d4ed8",
          borderColor: isCancelled ? "#fecaca" : isAutoPaid ? "#bbf7d0" : "#bfdbfe",
        }}
      >
        <strong>
          {isCancelled
            ? "Payment cancelled"
            : isAutoPaid
              ? "Payment completed automatically"
              : isAuthorized
                ? "Payment authorized"
                : "Automatic payment protection"}
        </strong>
        <span>
          {isCancelled
            ? "This ride was cancelled, so no rider payment will go through."
            : isAutoPaid
              ? "The ride was completed and the fare was captured."
              : "The app keeps the fare on hold and captures it only after drop-off."}
        </span>
      </div>

      <div style={checkoutGridStyle}>
        <section style={panelStyle}>
          <div style={sectionHeaderStyle}>
            <h3 style={subTitleStyle}>Trip summary</h3>
            <span style={statusBadgeStyle}>Ride #{ride?.id}</span>
          </div>

          <div style={tripRowsStyle}>
            <SummaryRow label="Pickup" value={ride?.pickup || ride?.pickup_address || "N/A"} />
            <SummaryRow
              label="Destination"
              value={ride?.destination || ride?.destination_address || "N/A"}
            />
            <SummaryRow label="Ride fare" value={formatMoney(fare)} />
          </div>

          <div style={dividerStyle} />

          <h3 style={subTitleStyle}>Tip your driver</h3>
          <p style={hintStyle}>Tips go directly to the driver after drop-off.</p>

          <div style={tipGridStyle}>
            {[10, 15, 20].map((percent) => (
              <button
                key={percent}
                onClick={() => setTipPercentage(percent)}
                style={{
                  ...tipButtonStyle,
                  background: tipPercentage === percent ? "#111827" : "#ffffff",
                  color: tipPercentage === percent ? "#ffffff" : "#111827",
                  borderColor: tipPercentage === percent ? "#111827" : "#d0d5dd",
                }}
              >
                <strong>{percent}%</strong>
                <span>{formatMoney(Math.round((fare * percent) / 100))}</span>
              </button>
            ))}
          </div>
        </section>

        <section style={panelStyle}>
          <div style={sectionHeaderStyle}>
            <h3 style={subTitleStyle}>Payment method</h3>
            <span style={statusBadgeStyle}>MRU</span>
          </div>

          <div style={methodGridStyle}>
            {paymentMethods.map((method) => (
              <button
                key={method.id}
                onClick={() => setSelectedMethod(method.id)}
                style={{
                  ...paymentMethodStyle,
                  borderColor:
                    selectedMethod === method.id ? "#111827" : "#e4e7ec",
                  background:
                    selectedMethod === method.id ? "#f9fafb" : "#ffffff",
                }}
              >
                <div>
                  <strong>{method.title}</strong>
                  <span>{method.subtitle}</span>
                </div>
                <em>{method.badge}</em>
              </button>
            ))}
          </div>

          <div style={totalBoxStyle}>
            <SummaryRow label="Ride fare" value={formatMoney(fare)} />
            <SummaryRow label={`Tip (${tipPercentage}%)`} value={formatMoney(tipAmount)} />
            <div style={totalRowStyle}>
              <span>Total</span>
              <strong>{formatMoney(totalAmount)}</strong>
            </div>
          </div>

          <button
            style={{
              ...buttonStyle,
              background: isCancelled || isAutoPaid || isAuthorized ? "#94a3b8" : "#111827",
              cursor: isCancelled || isAutoPaid || isAuthorized ? "not-allowed" : "pointer",
            }}
            disabled={isCancelled || isAutoPaid || isAuthorized}
            onClick={() => makePayment(selectedMethod)}
          >
            {isCancelled
              ? "Ride cancelled"
              : isAutoPaid
                ? "Payment already completed"
                : isAuthorized
                  ? "Payment authorized"
                  : `Pay ${formatMoney(totalAmount)}`}
          </button>
        </section>
      </div>

      {payment && (
        <div style={receiptStyle}>
          <h3 style={subTitleStyle}>Sakho Express Receipt</h3>

          <p>
            <strong>Ride ID:</strong> #{ride?.id}
          </p>

          <p>
            <strong>Pickup:</strong>{" "}
            {ride?.pickup || ride?.pickup_address || "N/A"}
          </p>

          <p>
            <strong>Destination:</strong>{" "}
            {ride?.destination || ride?.destination_address || "N/A"}
          </p>

          <p>
            <strong>Ride Fare:</strong> {formatMoney(payment.amount)}
          </p>

          <p>
            <strong>Driver Tip:</strong> {formatMoney(payment.tip_amount)}
          </p>

          <p>
            <strong>Total Paid:</strong>{" "}
            {formatMoney(Number(payment.amount || 0) + Number(payment.tip_amount || 0))}
          </p>

          <p>
            <strong>Driver Earning:</strong> {formatMoney(payment.driver_earning)}
          </p>

          <p>
            <strong>Payment Method:</strong> {payment.method}
          </p>

          <p>
            <strong>Transaction ID:</strong> {payment.transaction_id}
          </p>

          <p>
            <strong>Status:</strong>{" "}
            {payment.status === "pending_verification"
              ? "Waiting for driver confirmation"
              : payment.status}
          </p>

          <button onClick={() => window.print()} style={secondaryButtonStyle}>
            Print receipt
          </button>
        </div>
      )}

      {payment?.status === "paid" && !ratingSubmitted && (
        <div style={ratingBoxStyle}>
          <h3>⭐ Rate Your Driver</h3>

          <div style={starsBoxStyle}>
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                onClick={() => setRating(star)}
                style={{
                  ...starButtonStyle,
                  background: rating >= star ? "#f59e0b" : "#e5e7eb",
                }}
              >
                ⭐
              </button>
            ))}
          </div>

          <textarea
            value={review}
            onChange={(e) => setReview(e.target.value)}
            placeholder="Write a short review..."
            style={textareaStyle}
          />

          <button
            onClick={submitRating}
            style={{
              ...buttonStyle,
              background: rating ? "#111827" : "#94a3b8",
              cursor: rating ? "pointer" : "not-allowed",
            }}
          >
            Submit rating
          </button>

        </div>
      )}
      {ratingSubmitted && (
        <div style={successStyle}>
          ✅ Thank you! Your rating has been submitted.
        </div>
      )}
    </div>
  );
}

function SummaryRow({ label, value }) {
  return (
    <div style={summaryRowStyle}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

const cardStyle = {
  background: "#ffffff",
  padding: "20px",
  borderRadius: "8px",
  border: "1px solid #e4e7ec",
};

const pageStyle = {
  background: "#f4f6f9",
  padding: "24px",
  borderRadius: "8px",
};

const headerStyle = {
  marginBottom: "18px",
};

const eyebrowStyle = {
  color: "#0f766e",
  display: "block",
  fontSize: "12px",
  fontWeight: 800,
  textTransform: "uppercase",
  marginBottom: "4px",
};

const titleStyle = {
  margin: 0,
  color: "#101828",
  fontSize: "28px",
};

const checkoutGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(360px, 100%), 1fr))",
  gap: "16px",
  alignItems: "start",
};

const autoPaymentBannerStyle = {
  display: "grid",
  gap: "4px",
  border: "1px solid",
  borderRadius: "8px",
  padding: "14px",
  marginBottom: "16px",
  fontWeight: 800,
};

const panelStyle = {
  background: "#ffffff",
  border: "1px solid #e4e7ec",
  borderRadius: "8px",
  padding: "18px",
  boxShadow: "0 8px 20px rgba(16,24,40,0.06)",
};

const sectionHeaderStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "12px",
  marginBottom: "14px",
};

const subTitleStyle = {
  margin: 0,
  color: "#111827",
};

const hintStyle = {
  color: "#667085",
  marginTop: "6px",
  marginBottom: "12px",
};

const statusBadgeStyle = {
  background: "#f2f4f7",
  color: "#344054",
  border: "1px solid #e4e7ec",
  borderRadius: "999px",
  padding: "6px 10px",
  fontSize: "12px",
  fontWeight: 800,
};

const tripRowsStyle = {
  display: "grid",
  gap: "10px",
};

const summaryRowStyle = {
  display: "flex",
  justifyContent: "space-between",
  gap: "16px",
  alignItems: "center",
  color: "#475467",
};

const dividerStyle = {
  height: "1px",
  background: "#e4e7ec",
  margin: "16px 0",
};

const tipGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(3, 1fr)",
  gap: "10px",
};

const tipButtonStyle = {
  border: "1px solid #d0d5dd",
  borderRadius: "8px",
  padding: "12px",
  fontWeight: "bold",
  cursor: "pointer",
  display: "grid",
  gap: "4px",
};

const methodGridStyle = {
  display: "grid",
  gap: "10px",
};

const paymentMethodStyle = {
  width: "100%",
  border: "1px solid #e4e7ec",
  borderRadius: "8px",
  padding: "14px",
  cursor: "pointer",
  textAlign: "left",
  display: "flex",
  justifyContent: "space-between",
  gap: "14px",
  alignItems: "center",
};

const totalBoxStyle = {
  marginTop: "16px",
  background: "#f9fafb",
  border: "1px solid #e4e7ec",
  borderRadius: "8px",
  padding: "14px",
  display: "grid",
  gap: "10px",
};

const totalRowStyle = {
  display: "flex",
  justifyContent: "space-between",
  gap: "16px",
  alignItems: "center",
  color: "#101828",
  borderTop: "1px solid #e4e7ec",
  paddingTop: "10px",
  fontSize: "18px",
};

const buttonStyle = {
  width: "100%",
  background: "#111827",
  color: "white",
  border: "none",
  padding: "14px 18px",
  borderRadius: "8px",
  fontWeight: "bold",
  cursor: "pointer",
  marginTop: "12px",
};

const secondaryButtonStyle = {
  ...buttonStyle,
  background: "#ffffff",
  color: "#111827",
  border: "1px solid #d0d5dd",
};

const receiptStyle = {
  marginTop: "20px",
  background: "white",
  padding: "20px",
  borderRadius: "8px",
  border: "1px solid #e4e7ec",
  color: "#111827",
  fontSize: "15px",
  lineHeight: "28px",
};

const ratingBoxStyle = {
  marginTop: "20px",
  background: "#fff7ed",
  padding: "20px",
  borderRadius: "8px",
  border: "1px solid #fed7aa",
};

const starsBoxStyle = {
  display: "flex",
  gap: "8px",
  marginBottom: "12px",
};

const starButtonStyle = {
  fontSize: "24px",
  padding: "10px",
  border: "none",
  borderRadius: "10px",
  cursor: "pointer",
};

const textareaStyle = {
  width: "100%",
  minHeight: "90px",
  padding: "12px",
  borderRadius: "10px",
  border: "1px solid #d1d5db",
  boxSizing: "border-box",
  marginBottom: "10px",
};

const successStyle = {
  marginTop: "20px",
  background: "#dcfce7",
  color: "#166534",
  padding: "15px",
  borderRadius: "12px",
  fontWeight: "bold",
  textAlign: "center",
};

export default PaymentPage;
