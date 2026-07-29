import React, { useEffect, useMemo, useRef, useState } from "react";

import { navigateInApp } from "../navigation/inAppNavigation";
import {
  createWithdrawalIdempotencyKey,
  fetchPayoutMethods,
  fetchWalletData,
  requestWithdrawal,
  savePayoutMethod,
  sendWithdrawalOtp,
} from "./wallet/driverWalletApi";
import {
  AMOUNT_PRESETS,
  findSavedMethod,
  formatWalletAmount,
  maskAccount,
  maskPayoutMethod,
  MIN_WITHDRAWAL,
  PAYOUT_METHODS,
  toNumber,
  withdrawalReference,
} from "./wallet/walletUtils";
import "./DriverWallet.css";

function WalletSkeleton() {
  return (
    <div className="dw-cashout">
      <div className="dw-skeleton dw-skeleton--hero" />
      <div className="dw-skeleton dw-skeleton--row" />
    </div>
  );
}

export default function DriverWalletCashOut() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [wallet, setWallet] = useState(null);
  const [payoutMethods, setPayoutMethods] = useState([]);
  const [step, setStep] = useState("amount");
  const [amountChoice, setAmountChoice] = useState("custom");
  const [customAmount, setCustomAmount] = useState("");
  const [selectedMethodId, setSelectedMethodId] = useState("bankily");
  const [payoutForm, setPayoutForm] = useState({
    account_holder_name: "",
    phone_number: "",
    bank_name: "",
    account_reference: "",
  });
  const [otpCode, setOtpCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [successPayload, setSuccessPayload] = useState(null);
  const [formError, setFormError] = useState("");
  const idempotencyKeyRef = useRef(null);

  const reloadWallet = async () => {
    setLoading(true);
    setError("");
    try {
      const [walletData, methods] = await Promise.all([
        fetchWalletData(),
        fetchPayoutMethods(),
      ]);
      setWallet(walletData);
      setPayoutMethods(methods);
    } catch {
      setError("Unable to load wallet. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reloadWallet();
  }, []);

  const available = toNumber(wallet?.available_balance);
  const minimum = toNumber(wallet?.minimum_withdrawal) || MIN_WITHDRAWAL;
  const hasPending = (wallet?.withdrawals || []).some((item) => item.status === "pending");

  const resolvedAmount = useMemo(() => {
    if (amountChoice === "all") return available;
    if (amountChoice !== "custom") return toNumber(amountChoice);
    return toNumber(customAmount);
  }, [amountChoice, available, customAmount]);

  const selectedMethodConfig = PAYOUT_METHODS.find((item) => item.id === selectedMethodId);
  const savedMethod = findSavedMethod(payoutMethods, selectedMethodId);

  useEffect(() => {
    if (!savedMethod) return;
    setPayoutForm({
      account_holder_name: savedMethod.account_holder_name || "",
      phone_number: savedMethod.phone_number || savedMethod.wallet_id || "",
      bank_name: savedMethod.bank_name || "",
      account_reference: savedMethod.account_reference || "",
    });
  }, [savedMethod]);

  const validateAmount = () => {
    if (resolvedAmount < minimum) {
      setFormError(`Minimum withdrawal is ${formatWalletAmount(minimum)}.`);
      return false;
    }
    if (resolvedAmount > available) {
      setFormError(`You can withdraw up to ${formatWalletAmount(available)}.`);
      return false;
    }
    if (hasPending) {
      setFormError("You already have a pending withdrawal under review.");
      return false;
    }
    setFormError("");
    return true;
  };

  const goNextFromAmount = () => {
    if (!validateAmount()) return;
    setStep("method");
  };

  const goNextFromMethod = () => {
    if (!selectedMethodConfig?.supported) {
      setFormError("This payout method is not available yet.");
      return;
    }
    if (selectedMethodId === "bank_account") {
      if (!payoutForm.bank_name.trim() || !payoutForm.account_reference.trim()) {
        setFormError("Enter bank name and account number.");
        return;
      }
    } else if (!payoutForm.phone_number.trim()) {
      setFormError("Enter your payout phone number.");
      return;
    }
    setFormError("");
    setStep("confirm");
  };

  const handleSendOtpAndConfirm = async () => {
    if (!validateAmount()) return;
    setSendingOtp(true);
    setFormError("");
    try {
      await sendWithdrawalOtp();
      setStep("otp");
    } catch (requestError) {
      setFormError(
        requestError.response?.data?.error || "Could not send verification code."
      );
    } finally {
      setSendingOtp(false);
    }
  };

  const ensureSavedMethod = async () => {
    if (savedMethod?.id) {
      return savedMethod;
    }
    const payload = {
      payout_type: selectedMethodConfig.backendType,
      account_holder_name: payoutForm.account_holder_name.trim(),
      phone_number: payoutForm.phone_number.trim(),
      bank_name: payoutForm.bank_name.trim(),
      account_reference: payoutForm.account_reference.trim(),
      is_default: true,
    };
    return savePayoutMethod(payload);
  };

  const submitWithdrawal = async (event) => {
    event.preventDefault();
    if (!otpCode.trim() || otpCode.trim().length < 4) {
      setFormError("Enter the verification code sent to your phone.");
      return;
    }
    if (submitting) return;
    if (!validateAmount()) return;

    if (!idempotencyKeyRef.current) {
      idempotencyKeyRef.current = createWithdrawalIdempotencyKey();
    }

    setSubmitting(true);
    setFormError("");
    try {
      const payoutMethod = await ensureSavedMethod();
      const response = await requestWithdrawal({
        amount: resolvedAmount,
        method: selectedMethodId,
        payout_method_id: payoutMethod?.id,
        otp_code: otpCode.trim(),
        idempotency_key: idempotencyKeyRef.current,
      });
      setSuccessPayload(response?.withdrawal || response);
      window.sessionStorage.setItem("yala_wallet_refresh", "1");
      setStep("success");
    } catch (requestError) {
      setFormError(
        requestError.response?.data?.error || "Could not submit withdrawal."
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="dw">
        <WalletSkeleton />
      </div>
    );
  }

  if (error) {
    return (
      <div className="dw">
        <div className="dw-cashout">
          <div className="dw-error">{error}</div>
          <button type="button" className="dw-btn-secondary" onClick={reloadWallet}>
            Try again
          </button>
        </div>
      </div>
    );
  }

  if (step === "success") {
    const withdrawal = successPayload || {};
    return (
      <div className="dw">
        <div className="dw-success">
          <div className="dw-success__icon" aria-hidden="true">
            ✓
          </div>
          <h2>Withdrawal requested</h2>
          <div className="dw-confirm-card">
            <div className="dw-confirm-row">
              <span>Amount</span>
              <strong>{formatWalletAmount(withdrawal.amount || resolvedAmount)}</strong>
            </div>
            <div className="dw-confirm-row">
              <span>Method</span>
              <strong>{selectedMethodConfig?.label || "Payout method"}</strong>
            </div>
            <div className="dw-confirm-row">
              <span>Reference</span>
              <strong>{withdrawalReference(withdrawal)}</strong>
            </div>
            <div className="dw-confirm-row">
              <span>Status</span>
              <strong>Pending</strong>
            </div>
          </div>
          <button
            type="button"
            className="dw-btn-primary"
            onClick={() => {
              window.sessionStorage.setItem("yala_wallet_show_history", "1");
              navigateInApp("/driver/wallet");
            }}
          >
            View withdrawal history
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="dw">
      <div className="dw-cashout">
        <div className="dw-cashout__balance">
          <small>Available balance</small>
          <strong>{formatWalletAmount(available)}</strong>
          <small>Minimum withdrawal: {formatWalletAmount(minimum)}</small>
        </div>

        {formError ? <div id="cashout-form-error" className="dw-error" role="alert" aria-live="assertive" style={{ marginTop: 16 }}>{formError}</div> : null}

        {step === "amount" && (
          <>
            <div className="dw-amount-grid">
              {AMOUNT_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  aria-pressed={amountChoice === String(preset)}
                  className={`dw-amount-chip${amountChoice === String(preset) ? " is-selected" : ""}`}
                  onClick={() => {
                    setAmountChoice(String(preset));
                    setCustomAmount(String(preset));
                  }}
                  disabled={preset > available}
                >
                  {formatWalletAmount(preset)}
                </button>
              ))}
              <button
                type="button"
                aria-pressed={amountChoice === "custom"}
                className={`dw-amount-chip${amountChoice === "custom" ? " is-selected" : ""}`}
                onClick={() => setAmountChoice("custom")}
              >
                Custom amount
              </button>
              <button
                type="button"
                aria-pressed={amountChoice === "all"}
                className={`dw-amount-chip${amountChoice === "all" ? " is-selected" : ""}`}
                onClick={() => setAmountChoice("all")}
                disabled={available < minimum}
              >
                Withdraw all
              </button>
            </div>

            {amountChoice === "custom" ? (
              <label className="dw-input-label" htmlFor="custom-withdraw-amount">
                Enter amount (MRU)
                <input
                  id="custom-withdraw-amount"
                  className="dw-input"
                  type="number"
                  inputMode="decimal"
                  min={minimum}
                  max={available || undefined}
                  step="1"
                  value={customAmount}
                  onChange={(event) => setCustomAmount(event.target.value)}
                  placeholder={`Minimum ${minimum}`}
                  aria-describedby={formError ? "cashout-form-error" : undefined}
                  aria-invalid={formError && amountChoice === "custom" ? "true" : undefined}
                />
              </label>
            ) : null}

            <button type="button" className="dw-btn-primary" onClick={goNextFromAmount}>
              Continue
            </button>
          </>
        )}

        {step === "method" && (
          <>
            <div className="dw-method-list">
              {PAYOUT_METHODS.map((method) => {
                const saved = findSavedMethod(payoutMethods, method.id);
                const masked = saved
                  ? maskPayoutMethod(saved)
                  : "Add account details";
                return (
                  <button
                    key={method.id}
                    type="button"
                    aria-pressed={selectedMethodId === method.id}
                    className={`dw-method-card${
                      selectedMethodId === method.id ? " is-selected" : ""
                    }${method.supported ? "" : " is-disabled"}`}
                    onClick={() => method.supported && setSelectedMethodId(method.id)}
                    disabled={!method.supported}
                    aria-label={method.label}
                  >
                    <span className="dw-method-card__icon" aria-hidden="true">{method.icon}</span>
                    <span>
                      <p className="dw-method-card__title">{method.label}</p>
                      <p className="dw-method-card__subtitle">{masked}</p>
                    </span>
                    {saved?.is_default ? (
                      <span className="dw-method-card__badge">Default</span>
                    ) : null}
                  </button>
                );
              })}
            </div>

            {selectedMethodConfig?.supported ? (
              <>
                <label className="dw-input-label" htmlFor="payout-holder">
                  Account holder name
                  <input
                    id="payout-holder"
                    className="dw-input"
                    value={payoutForm.account_holder_name}
                    onChange={(event) =>
                      setPayoutForm((current) => ({
                        ...current,
                        account_holder_name: event.target.value,
                      }))
                    }
                    placeholder="Full name on account"
                  />
                </label>
                <label className="dw-input-label" htmlFor="payout-phone">
                  {selectedMethodConfig.label} phone number
                  <input
                    id="payout-phone"
                    className="dw-input"
                    value={payoutForm.phone_number}
                    onChange={(event) =>
                      setPayoutForm((current) => ({
                        ...current,
                        phone_number: event.target.value,
                      }))
                    }
                    inputMode="tel"
                    placeholder="Your mobile money number"
                    required={selectedMethodId !== "bank_account"}
                  />
                </label>
                {selectedMethodId === "bank_account" ? (
                  <>
                    <label className="dw-input-label" htmlFor="payout-bank">
                      Bank name
                      <input
                        id="payout-bank"
                        className="dw-input"
                        value={payoutForm.bank_name}
                        onChange={(event) =>
                          setPayoutForm((current) => ({
                            ...current,
                            bank_name: event.target.value,
                          }))
                        }
                        required
                      />
                    </label>
                    <label className="dw-input-label" htmlFor="payout-account">
                      Account number / RIB
                      <input
                        id="payout-account"
                        className="dw-input"
                        value={payoutForm.account_reference}
                        onChange={(event) =>
                          setPayoutForm((current) => ({
                            ...current,
                            account_reference: event.target.value,
                          }))
                        }
                        required
                      />
                    </label>
                  </>
                ) : null}
              </>
            ) : null}

            <button type="button" className="dw-btn-primary" onClick={goNextFromMethod}>
              Continue
            </button>
            <button type="button" className="dw-btn-secondary" onClick={() => setStep("amount")}>
              Back
            </button>
          </>
        )}

        {step === "confirm" && (
          <>
            <h2 className="dw-cashout__title">Review withdrawal</h2>
            <div className="dw-confirm-card">
              <div className="dw-confirm-row">
                <span>Withdrawal amount</span>
                <strong>{formatWalletAmount(resolvedAmount)}</strong>
              </div>
              <div className="dw-confirm-row">
                <span>Method</span>
                <strong>{selectedMethodConfig?.label}</strong>
              </div>
              <div className="dw-confirm-row">
                <span>Account</span>
                <strong>
                  {selectedMethodId === "bank_account"
                    ? `${payoutForm.bank_name} · ${maskAccount(payoutForm.account_reference)}`
                    : maskAccount(payoutForm.phone_number)}
                </strong>
              </div>
            </div>
            <button
              type="button"
              className="dw-btn-primary"
              onClick={handleSendOtpAndConfirm}
              disabled={sendingOtp}
              aria-busy={sendingOtp}
            >
              {sendingOtp ? "Sending code..." : "Confirm Cash Out"}
            </button>
            <button type="button" className="dw-btn-secondary" onClick={() => setStep("method")}>
              Back
            </button>
          </>
        )}

        {step === "otp" && (
          <form onSubmit={submitWithdrawal}>
            <p style={{ color: "#667085", fontSize: 14, fontWeight: 600 }}>
              Enter the 6-digit code sent to your phone to confirm this cash out.
            </p>
            <label className="dw-input-label" htmlFor="withdraw-otp">
              Verification code
              <input
                id="withdraw-otp"
                className="dw-input"
                value={otpCode}
                onChange={(event) => setOtpCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="123456"
                required
                aria-describedby={formError ? "cashout-form-error" : undefined}
                aria-invalid={formError ? "true" : undefined}
              />
            </label>
            <button type="submit" className="dw-btn-primary" disabled={submitting} aria-busy={submitting}>
              {submitting ? "Submitting..." : "Confirm Cash Out"}
            </button>
            <button
              type="button"
              className="dw-btn-secondary"
              onClick={() => setStep("confirm")}
              disabled={submitting}
            >
              Back
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
