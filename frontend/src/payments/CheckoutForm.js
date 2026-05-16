import React, { useState } from "react";

import {
  CardElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";

function CheckoutForm() {
  const stripe = useStripe();
  const elements = useElements();

  const savedRideId = localStorage.getItem("currentRideId");

  const [amount, setAmount] = useState(25);
  const [rideId, setRideId] = useState(savedRideId || "");
  const [loading, setLoading] = useState(false);
  const [notification, setNotification] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!stripe || !elements) {
      setNotification("Stripe is not ready yet.");
      return;
    }

    if (!amount || Number(amount) <= 0) {
      setNotification("Please enter a valid amount.");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(
        "http://127.0.0.1:8000/payments/create-payment-intent/",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            amount: amount,
            ride_id: rideId,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setNotification(data.error || "Backend payment error");
        setLoading(false);
        return;
      }

      if (!data.clientSecret) {
        setNotification("No clientSecret received from backend");
        setLoading(false);
        return;
      }

      const cardElement = elements.getElement(CardElement);

      const result = await stripe.confirmCardPayment(data.clientSecret, {
        payment_method: {
          card: cardElement,
        },
      });

      if (result.error) {
        setNotification(result.error.message);
      } else {
        if (result.paymentIntent.status === "succeeded") {
          setNotification("Payment Successful 💳✅");

          localStorage.removeItem("currentRideId");
          localStorage.removeItem("lastRideStatus");

          setTimeout(() => {
            window.location.href = "/history";
          }, 1500);
        } else {
          setNotification("Payment status: " + result.paymentIntent.status);
        }
      }
    } catch (err) {
      console.error("Payment failed:", err);
      setNotification("Payment failed. Check Django terminal for error.");
    }

    setLoading(false);
  };

  return (
    <div style={container}>
      <div style={card}>
        <h1>💳 Ride Payment</h1>

        {notification && (
          <div style={notificationBox}>
            {notification}
          </div>
        )}

        <label style={label}>Ride ID</label>
        <input
          type="number"
          value={rideId}
          onChange={(e) => setRideId(e.target.value)}
          placeholder="Ride ID"
          style={input}
        />

        <label style={label}>Ride Amount</label>
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Ride Amount"
          style={input}
        />

        <div style={stripeBox}>
          <CardElement />
        </div>

        <button
          onClick={handleSubmit}
          disabled={!stripe || loading}
          style={button}
        >
          {loading ? "Processing..." : "Pay Now"}
        </button>
      </div>
    </div>
  );
}

const container = {
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  minHeight: "100vh",
  background: "#f4f7fb",
};

const card = {
  background: "white",
  padding: "40px",
  borderRadius: "20px",
  width: "420px",
  boxShadow: "0 10px 25px rgba(0,0,0,0.1)",
};

const notificationBox = {
  background: "#dcfce7",
  color: "green",
  padding: "14px",
  borderRadius: "10px",
  marginBottom: "20px",
  fontWeight: "bold",
};

const label = {
  display: "block",
  marginBottom: "8px",
  fontWeight: "bold",
};

const input = {
  width: "100%",
  padding: "14px",
  marginBottom: "20px",
  borderRadius: "10px",
  border: "1px solid #ccc",
};

const stripeBox = {
  padding: "20px",
  border: "1px solid #ccc",
  borderRadius: "10px",
  marginBottom: "20px",
};

const button = {
  width: "100%",
  padding: "14px",
  border: "none",
  borderRadius: "10px",
  background: "black",
  color: "white",
  cursor: "pointer",
};

export default CheckoutForm;