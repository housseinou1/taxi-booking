import React from "react";
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";
import DriverWallet from "./DriverWallet";
import { fetchWalletData, fetchPayoutMethods } from "./wallet/driverWalletApi";
import { navigateInApp } from "../navigation/inAppNavigation";

jest.mock("./wallet/driverWalletApi", () => ({
  fetchWalletData: jest.fn(),
  fetchPayoutMethods: jest.fn(),
}));

jest.mock("../navigation/inAppNavigation", () => ({
  navigateInApp: jest.fn(),
}));

describe("DriverWallet", () => {
  const walletData = {
    available_balance: 5000,
    pending_balance: 1000,
    today_earnings: 1500,
    week_earnings: 8000,
    month_earnings: 30000,
    lifetime_earnings: 250000,
    ledger: [
      {
        id: "l1",
        label: "Ride fare",
        amount: 1500,
        is_credit: true,
        created_at: "2023-01-01T12:00:00Z",
      },
    ],
    withdrawals: [
      {
        id: "w1",
        amount: 500,
        status: "paid",
        payout_method_display: "Bankily",
        created_at: "2023-01-02T12:00:00Z",
        reference: "WD-1",
      },
    ],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    fetchWalletData.mockResolvedValue(walletData);
    fetchPayoutMethods.mockResolvedValue([
      { id: "pm1", payout_type: "bankily", account_identifier: "1234" },
    ]);
  });

  it("renders loading state initially", () => {
    fetchWalletData.mockImplementation(() => new Promise(() => {}));
    render(<DriverWallet />);
    expect(screen.getByText("Loading wallet...")).toBeInTheDocument();
  });

  it("renders wallet and withdrawal status chip after loading", async () => {
    await act(async () => {
      render(<DriverWallet />);
    });

    await waitFor(() => {
      expect(screen.getByText(/5,000/)).toBeInTheDocument();
    });

    expect(screen.getByRole("button", { name: /cash out/i })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /manage payout method/i })
    ).toBeInTheDocument();
    expect(screen.getByText("Paid")).toBeInTheDocument();
  });

  it("shows shared error state and calls retry handler", async () => {
    fetchWalletData.mockRejectedValue(new Error("Network error"));

    await act(async () => {
      render(<DriverWallet />);
    });

    await waitFor(() => {
      expect(screen.getByText("Unable to load wallet. Please try again.")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    });

    expect(fetchWalletData).toHaveBeenCalledTimes(2);
  });

  it("shows empty states when there is no activity", async () => {
    fetchWalletData.mockResolvedValue({
      ...walletData,
      ledger: [],
      withdrawals: [],
    });

    await act(async () => {
      render(<DriverWallet />);
    });

    await waitFor(() => {
      expect(screen.getByText("No wallet activity yet.")).toBeInTheDocument();
    });
    expect(screen.getByText("No withdrawals yet.")).toBeInTheDocument();
  });

  it("keeps zero values as zero", async () => {
    fetchWalletData.mockResolvedValue({
      ...walletData,
      available_balance: 0,
      pending_balance: 0,
      today_earnings: 0,
      week_earnings: 0,
      month_earnings: 0,
      lifetime_earnings: 0,
      ledger: [],
      withdrawals: [],
    });

    await act(async () => {
      render(<DriverWallet />);
    });

    await waitFor(() => {
      const zeros = screen.getAllByText(/0 MRU/);
      expect(zeros.length).toBeGreaterThanOrEqual(1);
    });
  });

  it("displays the available balance as the hero value", async () => {
    await act(async () => {
      render(<DriverWallet />);
    });

    await waitFor(() => {
      expect(screen.getByText("Available to withdraw")).toBeInTheDocument();
      expect(screen.getByText(/5,000 MRU/)).toBeInTheDocument();
    });
  });

  it("renders supported summary cards", async () => {
    await act(async () => {
      render(<DriverWallet />);
    });

    await waitFor(() => {
      expect(screen.getByText("Pending")).toBeInTheDocument();
      expect(screen.getByText("Today")).toBeInTheDocument();
      expect(screen.getByText("This week")).toBeInTheDocument();
      expect(screen.getByText("This month")).toBeInTheDocument();
      expect(screen.getByText("Lifetime")).toBeInTheDocument();
      expect(screen.getByText(/1,000 MRU/)).toBeInTheDocument();
      expect(screen.getByText(/8,000 MRU/)).toBeInTheDocument();
    });
  });

  it("shows em-dash for missing balances and does not invent summary cards", async () => {
    fetchWalletData.mockResolvedValue({
      available_balance: undefined,
      ledger: [],
      withdrawals: [],
    });

    await act(async () => {
      render(<DriverWallet />);
    });

    await waitFor(() => {
      expect(screen.getByText("—")).toBeInTheDocument();
      expect(screen.queryByText("Pending")).not.toBeInTheDocument();
      expect(screen.queryByText("Today")).not.toBeInTheDocument();
    });
  });

  it("communicates credit and debit independently of color", async () => {
    fetchWalletData.mockResolvedValue({
      ...walletData,
      ledger: [
        {
          id: "l1",
          label: "Ride fare",
          amount: 1500,
          is_credit: true,
          created_at: "2023-01-01T12:00:00Z",
        },
        {
          id: "l2",
          label: "Withdrawal",
          amount: 500,
          is_credit: false,
          created_at: "2023-01-02T12:00:00Z",
        },
      ],
    });

    await act(async () => {
      render(<DriverWallet />);
    });

    await waitFor(() => {
      expect(screen.getByText(/\+ 1,500 MRU/)).toBeInTheDocument();
      expect(screen.getByText(/- 500 MRU/)).toBeInTheDocument();
      expect(screen.getByLabelText("Credit")).toBeInTheDocument();
      expect(screen.getByLabelText("Debit")).toBeInTheDocument();
    });
  });

  it("limits the ledger to eight entries", async () => {
    const many = Array.from({ length: 10 }, (_, i) => ({
      id: `l${i}`,
      label: `Trip ${i}`,
      amount: 100,
      is_credit: true,
      created_at: "2023-01-01T12:00:00Z",
    }));
    fetchWalletData.mockResolvedValue({
      ...walletData,
      ledger: many,
    });

    const { container } = render(<DriverWallet />);

    await waitFor(() => {
      expect(container.querySelectorAll(".dw-activity-row").length).toBe(8);
    });
  });
});
