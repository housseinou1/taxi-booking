import React from "react";
import QRCode from "react-qr-code";

function QRPayment({ ride, paymentMethod }) {
  if (!ride) return null;

  const qrValue = JSON.stringify({
    app: "Yala",
    ride_id: ride.id,
    amount: ride.fare,
    currency: "MRU",
    method: paymentMethod || "Bankily",
  });

  return (
    <div style={containerStyle}>
      <h2 style={titleStyle}>📱 QR Payment</h2>

      <p style={subtitleStyle}>
        Scan this QR code with your banking application.
      </p>

      <div style={qrBoxStyle}>
        <QRCode
          value={qrValue}
          size={220}
        />
      </div>

      <div style={infoBoxStyle}>
        <p>
          <strong>Ride ID:</strong> #{ride.id}
        </p>

        <p>
          <strong>Amount:</strong> {ride.fare} MRU
        </p>

        <p>
          <strong>Payment:</strong> {paymentMethod}
        </p>
      </div>
    </div>
  );
}

const containerStyle = {
  background: "white",
  padding: "24px",
  borderRadius: "18px",
  boxShadow: "0 8px 24px rgba(0,0,0,0.08)",
  marginTop: "20px",
};

const titleStyle = {
  marginTop: 0,
  color: "#111827",
};

const subtitleStyle = {
  color: "#6b7280",
  marginBottom: "20px",
};

const qrBoxStyle = {
  background: "white",
  padding: "20px",
  borderRadius: "16px",
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
};

const infoBoxStyle = {
  marginTop: "20px",
  background: "#f3f4f6",
  padding: "14px",
  borderRadius: "12px",
};

export default QRPayment;