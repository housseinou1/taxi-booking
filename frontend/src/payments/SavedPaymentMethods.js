import React, { useCallback, useEffect } from "react";
import axios from "axios";
import { API_URL } from "../apiConfig";

function SavedPaymentMethods({ methods, setMethods, refreshKey }) {
  const removeMethod = async (methodId) => {
    const previousMethods = methods;
    setMethods(methods.filter((method) => method.id !== methodId));

    try {
      const token = localStorage.getItem("access");

      await axios.delete(`${API_URL}/payments/methods/${methodId}/`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      fetchMethods();
    } catch (error) {
      console.log("Remove payment method error:", error.response?.data || error);
      setMethods(previousMethods);
      alert(error.response?.data?.error || "Could not remove payment method.");
    }
  };

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
    <section className="sx-saved-methods">
      <SavedPaymentMethodsStyles />

      <div className="sx-saved-head">
        <span>Wallet</span>
        <h2>Saved payment methods</h2>
      </div>

      {methods.length === 0 ? (
        <div className="sx-method-empty">
          <strong>No saved methods yet</strong>
          <p>Add a card, wallet, bank account, or cash preference before requesting rides.</p>
        </div>
      ) : (
        <div className="sx-saved-grid">
          {methods.map((method) => (
            <article key={method.id} className="sx-saved-card">
              <div className="sx-saved-icon">{getMethodTitle(method).slice(0, 1)}</div>
              <div>
                <h3>{getMethodTitle(method)}</h3>
                <p>{getMethodDescription(method)}</p>
              </div>
              {method.is_default && <span>Default</span>}
              <button
                className="sx-remove-method"
                type="button"
                onClick={() => removeMethod(method.id)}
              >
                Remove
              </button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function getMethodTitle(method) {
  if (method.display_name) {
    return method.display_name.replace("MASRVI", "MASRAVI");
  }

  if (method.payment_type === "card") {
    return `${(method.card_type || "Card").toUpperCase()} •••• ${method.card_last4 || "0000"}`;
  }

  if (method.payment_type === "bank_account") return "Bank account";
  if (method.payment_type === "bankily") return "Bankily";
  if (method.payment_type === "masrvi") return "Masravi";
  if (method.payment_type === "seddad") return "Seddad";
  if (method.payment_type === "cash") return "Cash";

  return "Payment method";
}

function getMethodDescription(method) {
  if (method.payment_type === "card") {
    const expiry = method.expiry_month && method.expiry_year
      ? `Expires ${method.expiry_month}/${method.expiry_year}`
      : "Card on file";
    return `${method.card_holder_name || "Card holder"} - ${expiry}`;
  }

  if (method.payment_type === "bank_account") {
    return `${method.bank_name || "Bank"} - ${method.account_reference || "Account reference"}`;
  }

  if (["bankily", "masrvi", "seddad"].includes(method.payment_type)) {
    return method.phone_number || method.wallet_id || "Mobile wallet";
  }

  if (method.payment_type === "cash") {
    return "Pay driver directly after drop-off";
  }

  return "Saved for checkout";
}

function SavedPaymentMethodsStyles() {
  return (
    <style>{`
      .sx-saved-methods {
        margin-top: 26px;
        color: #f8fafc;
      }

      .sx-saved-head {
        display: flex;
        justify-content: space-between;
        align-items: end;
        gap: 16px;
        margin-bottom: 14px;
      }

      .sx-saved-head span {
        color: #facc15;
        font-size: 12px;
        font-weight: 900;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      .sx-saved-head h2 {
        margin: 0;
        font-size: 28px;
        letter-spacing: 0;
      }

      .sx-method-empty {
        border: 1px dashed rgba(255,255,255,0.24);
        border-radius: 8px;
        background: rgba(255,255,255,0.06);
        padding: 22px;
      }

      .sx-method-empty p {
        color: #cbd5e1;
        margin: 6px 0 0;
        line-height: 1.6;
      }

      .sx-saved-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
        gap: 12px;
      }

      .sx-saved-card {
        position: relative;
        display: grid;
        grid-template-columns: 48px 1fr;
        gap: 12px;
        align-items: center;
        min-height: 112px;
        border: 1px solid rgba(255,255,255,0.12);
        border-radius: 8px;
        background: rgba(255,255,255,0.07);
        padding: 16px;
        box-shadow: 0 12px 32px rgba(0,0,0,0.16);
      }

      .sx-saved-icon {
        width: 48px;
        height: 48px;
        border-radius: 8px;
        background: #facc15;
        color: #111827;
        display: grid;
        place-items: center;
        font-weight: 900;
      }

      .sx-saved-card h3 {
        margin: 0;
        font-size: 17px;
      }

      .sx-saved-card p {
        margin: 5px 0 0;
        color: #cbd5e1;
        font-size: 13px;
        font-weight: 700;
      }

      .sx-saved-card span {
        position: absolute;
        top: 12px;
        right: 12px;
        background: #dcfce7;
        color: #166534;
        border-radius: 999px;
        padding: 5px 9px;
        font-size: 11px;
        font-weight: 900;
      }

      .sx-remove-method {
        grid-column: 2;
        justify-self: start;
        width: fit-content;
        border: 1px solid rgba(248,113,113,0.35);
        border-radius: 999px;
        background: rgba(248,113,113,0.12);
        color: #fecaca;
        padding: 7px 10px;
        font-weight: 900;
        cursor: pointer;
      }
    `}</style>
  );
}

export default SavedPaymentMethods;
