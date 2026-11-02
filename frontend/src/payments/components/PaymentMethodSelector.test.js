import React, { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";

import "../../i18n";
import PaymentMethodSelector from "./PaymentMethodSelector";

/**
 * Controlled harness: the selector is a controlled component, so the test drives
 * it exactly as a checkout screen does (store the emitted selection, re-render).
 */
function Harness({ spy, initialValue = { category: "", provider: "" }, ...props }) {
  const [value, setValue] = useState(initialValue);
  return (
    <PaymentMethodSelector
      value={value}
      onChange={(selection) => {
        spy?.(selection);
        setValue({ category: selection.category, provider: selection.provider });
      }}
      {...props}
    />
  );
}

function categoryRadio(name) {
  return screen.getByRole("radio", { name });
}

describe("PaymentMethodSelector — categories", () => {
  test("offers the four primary payment categories", () => {
    render(<Harness />);

    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(4);
    expect(categoryRadio(/Credit Card \/ Debit Card/)).toBeInTheDocument();
    expect(categoryRadio(/Mobile Money/)).toBeInTheDocument();
    expect(categoryRadio(/YALA Wallet/)).toBeInTheDocument();
    expect(categoryRadio(/Bank Transfer/)).toBeInTheDocument();
  });

  test("starts with nothing selected", () => {
    render(<Harness />);
    screen.getAllByRole("radio").forEach((radio) => {
      expect(radio).toHaveAttribute("aria-checked", "false");
    });
  });

  test("shows the amount due in MRU", () => {
    render(<Harness amount={138} currency="MRU" />);
    expect(screen.getByText("138 MRU")).toBeInTheDocument();
  });
});

describe("PaymentMethodSelector — Mobile Money dropdown", () => {
  test("does not render a provider dropdown before Mobile Money is chosen", () => {
    render(<Harness />);
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  test("reveals the dropdown with exactly Bankily, Masravi and Sedad", () => {
    render(<Harness />);

    fireEvent.click(categoryRadio(/Mobile Money/));

    const select = screen.getByRole("combobox");
    const options = Array.from(select.options).map((option) => option.value);
    expect(options).toEqual(["", "bankily", "masravi", "sedad"]);

    const labels = Array.from(select.options).map((option) => option.textContent);
    expect(labels).toContain("Bankily");
    expect(labels).toContain("Masravi");
    expect(labels).toContain("Sedad");
  });

  test("selects exactly one provider at a time", () => {
    const spy = jest.fn();
    render(<Harness spy={spy} />);

    fireEvent.click(categoryRadio(/Mobile Money/));
    const select = screen.getByRole("combobox");

    fireEvent.change(select, { target: { value: "bankily" } });
    expect(spy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        ok: true,
        complete: true,
        method: "bankily",
        category: "mobile_money",
        provider: "bankily",
      })
    );
    expect(select.value).toBe("bankily");

    // A <select> holds a single value, so only one provider can ever be active.
    const selected = Array.from(select.options).filter((option) => option.selected);
    expect(selected).toHaveLength(1);
    expect(selected[0].value).toBe("bankily");
  });

  test("lets the customer change provider", () => {
    const spy = jest.fn();
    render(<Harness spy={spy} />);

    fireEvent.click(categoryRadio(/Mobile Money/));
    const select = screen.getByRole("combobox");

    fireEvent.change(select, { target: { value: "bankily" } });
    fireEvent.change(select, { target: { value: "sedad" } });

    expect(spy).toHaveBeenLastCalledWith(
      expect.objectContaining({ method: "sedad", provider: "sedad", complete: true })
    );
    expect(select.value).toBe("sedad");
  });

  test("keeps the chosen provider when the active category is re-selected", () => {
    const spy = jest.fn();
    render(
      <Harness spy={spy} initialValue={{ category: "mobile_money", provider: "masravi" }} />
    );

    fireEvent.click(categoryRadio(/Mobile Money/));

    expect(spy).toHaveBeenLastCalledWith(
      expect.objectContaining({ provider: "masravi", method: "masravi" })
    );
  });
});

describe("PaymentMethodSelector — incomplete selections", () => {
  test("reports an incomplete selection while no provider is chosen", () => {
    const spy = jest.fn();
    render(<Harness spy={spy} />);

    fireEvent.click(categoryRadio(/Mobile Money/));

    expect(spy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        ok: false,
        complete: false,
        method: "",
        category: "mobile_money",
        error: "provider_required",
      })
    );
  });

  test("warns the customer that a provider is required", () => {
    render(<Harness />);

    fireEvent.click(categoryRadio(/Mobile Money/));

    expect(screen.getByRole("alert")).toHaveTextContent(/provider/i);
    expect(screen.getByText(/Select a payment method to continue\./)).toBeInTheDocument();
  });

  test("marks the selection complete once a provider is chosen", () => {
    render(<Harness />);

    fireEvent.click(categoryRadio(/Mobile Money/));
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "bankily" } });

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText(/pending status/i)).toBeInTheDocument();
  });

  test("clears a chosen provider when another category is selected", () => {
    const spy = jest.fn();
    render(
      <Harness spy={spy} initialValue={{ category: "mobile_money", provider: "bankily" }} />
    );

    fireEvent.click(categoryRadio(/Credit Card \/ Debit Card/));

    expect(spy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        ok: true,
        complete: true,
        method: "card",
        category: "card",
        provider: "",
      })
    );
  });
});

describe("PaymentMethodSelector — live payment safety", () => {
  test("shows a sandbox notice while live payments are disabled", () => {
    render(<Harness />);
    expect(screen.getByRole("note")).toHaveTextContent(/not live/i);
  });

  test("hides the sandbox notice when live payments are enabled", () => {
    render(<Harness livePaymentsEnabled />);
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
  });

  test("never claims a payment succeeded from a selection alone", () => {
    const { container } = render(<Harness amount={250} />);

    fireEvent.click(categoryRadio(/Mobile Money/));
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "bankily" } });

    const text = container.textContent;
    expect(text).not.toMatch(/payment successful/i);
    expect(text).not.toMatch(/payment confirmed/i);
    expect(text).not.toMatch(/\bpaid\b/i);
    expect(text).not.toMatch(/receipt/i);
  });
});

describe("PaymentMethodSelector — per-surface limits", () => {
  test("hides categories the surface does not accept", () => {
    // Delivery prepay accepts card + mobile money only.
    render(<Harness availableMethods={["card", "mobile_money"]} />);

    expect(screen.getAllByRole("radio")).toHaveLength(2);
    expect(screen.queryByRole("radio", { name: /YALA Wallet/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: /Bank Transfer/ })).not.toBeInTheDocument();
  });

  test("only offers providers the surface accepts", () => {
    render(<Harness availableMethods={["card", "bankily"]} />);

    fireEvent.click(categoryRadio(/Mobile Money/));

    const options = Array.from(screen.getByRole("combobox").options).map((o) => o.value);
    expect(options).toEqual(["", "bankily"]);
  });

  test("disables every control while a request is in flight", () => {
    render(<Harness disabled initialValue={{ category: "mobile_money", provider: "" }} />);

    screen.getAllByRole("radio").forEach((radio) => {
      expect(radio).toBeDisabled();
    });
    expect(screen.getByRole("combobox")).toBeDisabled();
  });
});
