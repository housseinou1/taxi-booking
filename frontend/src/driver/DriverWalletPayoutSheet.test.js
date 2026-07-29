import React from "react";
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";
import DriverWalletPayoutSheet from "./DriverWalletPayoutSheet";
import { savePayoutMethod } from "./wallet/driverWalletApi";

jest.mock("./wallet/driverWalletApi", () => ({
  savePayoutMethod: jest.fn(),
}));

describe("DriverWalletPayoutSheet", () => {
  const onClose = jest.fn();
  const onSaved = jest.fn();

  const defaultProps = {
    payoutMethods: [],
    onClose,
    onSaved,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    savePayoutMethod.mockResolvedValue({ id: "pm1", payout_type: "bankily" });
  });

  it("renders the payout method list and empty state", () => {
    render(<DriverWalletPayoutSheet {...defaultProps} />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Bankily/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Bank account/i })).toBeInTheDocument();
  });

  it("shows bank account fields when bank account is selected", () => {
    render(<DriverWalletPayoutSheet {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: /Bank account/i }));
    expect(screen.getByLabelText(/Bank name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Account number/i)).toBeInTheDocument();
  });

  it("shows validation error for missing fields", async () => {
    render(<DriverWalletPayoutSheet {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: /Save payout method/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/required/i);
    });
  });

  it("saves a payout method and calls onSaved", async () => {
    render(<DriverWalletPayoutSheet {...defaultProps} />);

    fireEvent.change(screen.getByLabelText(/Account holder name/i), {
      target: { value: "Driver One" },
    });
    fireEvent.change(screen.getByLabelText(/Bankily phone number/i), {
      target: { value: "12345678" },
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Save payout method/i }));
    });

    await waitFor(() => {
      expect(savePayoutMethod).toHaveBeenCalledWith(
        expect.objectContaining({
          payout_type: "bankily",
          account_holder_name: "Driver One",
          phone_number: "12345678",
          is_default: true,
        })
      );
    });

    await waitFor(() => {
      expect(onSaved).toHaveBeenCalled();
    });
  });

  it("displays an API error when saving fails", async () => {
    savePayoutMethod.mockRejectedValue({ response: { data: { error: "Could not save." } } });
    render(<DriverWalletPayoutSheet {...defaultProps} />);

    fireEvent.change(screen.getByLabelText(/Account holder name/i), {
      target: { value: "Driver One" },
    });
    fireEvent.change(screen.getByLabelText(/Bankily phone number/i), {
      target: { value: "12345678" },
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Save payout method/i }));
    });

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/Could not save/);
    });
  });

  it("closes the sheet when backdrop is clicked", () => {
    render(<DriverWalletPayoutSheet {...defaultProps} />);
    fireEvent.click(screen.getByLabelText(/Close/i));
    expect(onClose).toHaveBeenCalled();
  });

  it("renders saved method masked details", () => {
    render(
      <DriverWalletPayoutSheet
        {...defaultProps}
        payoutMethods={[
          {
            id: "pm1",
            payout_type: "bankily",
            phone_number: "12345678",
            is_default: true,
          },
        ]}
      />
    );
    expect(screen.getAllByText(/•••• 5678/)).toHaveLength(2);
  });
});
