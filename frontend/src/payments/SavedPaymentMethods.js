import React, { useCallback, useEffect } from "react";
import axios from "axios";
import { API_URL } from "../apiConfig";

function SavedPaymentMethods({ methods, setMethods, refreshKey }) {
  const fetchMethods = useCallback(async () => {
    try {
      const token = localStorage.getItem("access");

      const response = await axios.get(`${API_URL}/payments/methods/`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      setMethods(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.log("Payment methods error:", error.response?.data || error);
      setMethods([]);
    }
  }, [setMethods]);

  useEffect(() => {
    fetchMethods();
  }, [fetchMethods, refreshKey]);

  return (
    <div style={containerStyle}>
      <h2>💳 Saved Payment Methods</h2>

      {methods.length === 0 ? (
        <p style={emptyStyle}>No saved cards yet.</p>
      ) : (
        methods.map((method) => (
          <div key={method.id} style={cardStyle}>
            <h3>
              {method.card_type.toUpperCase()} •••• {method.card_last4}
            </h3>

            <p>
              <strong>Card Holder:</strong> {method.card_holder_name}
            </p>

            <p>
              <strong>Expires:</strong> {method.expiry_month}/
              {method.expiry_year}
            </p>

            {method.is_default && <span style={defaultBadge}>Default</span>}
          </div>
        ))
      )}
    </div>
  );
}

const containerStyle = {
  marginTop: "25px",
};

const cardStyle = {
  background: "white",
  padding: "18px",
  borderRadius: "16px",
  marginBottom: "14px",
  boxShadow: "0 6px 16px rgba(0,0,0,0.08)",
};

const emptyStyle = {
  color: "#6b7280",
};

const defaultBadge = {
  display: "inline-block",
  padding: "6px 10px",
  borderRadius: "999px",
  background: "#dcfce7",
  color: "#166534",
  fontWeight: "bold",
};

export default SavedPaymentMethods;
