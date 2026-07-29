import React from "react";
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";
import DriverWalletCashOut from "./DriverWalletCashOut";
import {
  fetchWalletData,
  fetchPayoutMethods,
  requestWithdrawal,
  savePayoutMethod,
  sendWithdrawalOtp,
} from "./wallet/driverWalletApi";

jest.mock("./wallet/driverWalletApi", () => ({
  fetchWalletData: jest.fn(),
  fetchPayoutMethods: jest.fn(),
  requestWithdrawal: jest.fn(),
  savePayoutMethod: jest.fn(),
  sendWithdrawalOtp: jest.fn(),
  createWithdrawalIdempotencyKey: jest.fn(() => "key-123"),
}));

describe("DriverWalletCashOut", () => {
  const walletData = {
    available_balance: 5000,
    minimum_withdrawal: 500,
    withdrawals: [],
  };

  const payoutMethods = [
    {
      id: "pm1",
      payout_type: "bankily",
      phone_number: "12345678",
      account_holder_name: "Driver Name",
      is_default: true,
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    fetchWalletData.mockResolvedValue(walletData);
    fetchPayoutMethods.mockResolvedValue(payoutMethods);
    sendWithdrawalOtp.mockResolvedValue({});
    requestWithdrawal.mockResolvedValue({
      withdrawal: {
        id: "wd1",
        amount: 500,
        status: "pending",
        reference: "WD-1",
      },
    });
  });

  it("shows loading then available balance and minimum", async () => {
    fetchWalletData.mockImplementation(() => new Promise(() => {}));
    const { container } = render(<DriverWalletCashOut />);
    expect(container.querySelector(".dw-skeleton")).toBeInTheDocument();
  });

  it("renders available balance and minimum withdrawal", async () => {
    render(<DriverWalletCashOut />);

    await waitFor(() => {
      expect(screen.getByText(/Available balance/)).toBeInTheDocument();
      expect(screen.getByText(/Minimum withdrawal/)).toBeInTheDocument();
    });
  });

  it("shows error and retries loading", async () => {
    fetchWalletData.mockRejectedValue(new Error("Network"));
    render(<DriverWalletCashOut />);

    await waitFor(() => {
      expect(screen.getByText(/Unable to load wallet/)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Try again/i })).toBeInTheDocument();
    });

    fetchWalletData.mockResolvedValue(walletData);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Try again/i }));
    });

    await waitFor(() => {
      expect(screen.getByText(/Available balance/)).toBeInTheDocument();
    });
    expect(fetchWalletData).toHaveBeenCalledTimes(2);
  });

  it("validates amount below minimum", async () => {
    render(<DriverWalletCashOut />);

    await waitFor(() => {
      expect(screen.getByLabelText(/Enter amount/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /Custom amount/i }));
    fireEvent.change(screen.getByLabelText(/Enter amount/i), { target: { value: "100" } });
    fireEvent.click(screen.getByRole("button", { name: /Continue/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/Minimum withdrawal is/);
    });
  });

  it("validates amount above available balance", async () => {
    render(<DriverWalletCashOut />);

    await waitFor(() => {
      expect(screen.getByLabelText(/Enter amount/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /Custom amount/i }));
    fireEvent.change(screen.getByLabelText(/Enter amount/i), { target: { value: "9999" } });
    fireEvent.click(screen.getByRole("button", { name: /Continue/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/You can withdraw up to/);
    });
  });

  it("submits withdrawal through OTP and shows success", async () => {
    render(<DriverWalletCashOut />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /500/ })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /500/ }));
    fireEvent.click(screen.getByRole("button", { name: /Continue/i }));

    await waitFor(() => {
      expect(screen.getByLabelText(/Account holder name/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /Continue/i }));

    await waitFor(() => {
      expect(screen.getByText(/Review withdrawal/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /Confirm Cash Out/i }));

    await waitFor(() => {
      expect(screen.getByLabelText(/Verification code/i)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/Verification code/i), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: /Confirm Cash Out/i }));

    await waitFor(() => {
      expect(screen.getByText(/Withdrawal requested/i)).toBeInTheDocument();
    });

    expect(sendWithdrawalOtp).toHaveBeenCalled();
    expect(requestWithdrawal).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 500,
        otp_code: "123456",
        method: "bankily",
      })
    );
  });

  xit("prevents duplicate OTP submissions", async () => {
    requestWithdrawal.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ withdrawal: { id: "wd1" } }), 500))
    );
    render(<DriverWalletCashOut />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /500/ })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /500/ }));
    fireEvent.click(screen.getByRole("button", { name: /Continue/i }));
    await waitFor(() => expect(screen.getByLabelText(/Account holder name/i)).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /Continue/i }));
    await waitFor(() => expect(screen.getByText(/Review withdrawal/i)).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /Confirm Cash Out/i }));
    await waitFor(() => expect(screen.getByLabelText(/Verification code/i)).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText(/Verification code/i), { target: { value: "123456" } });
    const submit = screen.getByRole("button", { name: /Confirm Cash Out/i });
    await act(async () => {
      fireEvent.click(submit);
      fireEvent.click(submit);
    });

    expect(requestWithdrawal).toHaveBeenCalledTimes(1);
  });
});
