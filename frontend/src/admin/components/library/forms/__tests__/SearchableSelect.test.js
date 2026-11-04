/**
 * SearchableSelect — the shared searchable dropdown.
 *
 * Pins the contract the City Management hierarchy depends on: real combobox ARIA roles,
 * filtering, keyboard navigation, and the guarantee that a disabled option can never be
 * committed (an invalid selection must be impossible, not merely discouraged).
 */
import React, { useState } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";

import SearchableSelect from "../SearchableSelect";

const OPTIONS = [
  { value: "ADR", label: "Adrar", hint: "ADR" },
  { value: "GOR", label: "Gorgol", hint: "GOR" },
  { value: "TRZ", label: "Traralgon", hint: "TRZ", disabled: true, disabledReason: "Not available" },
];

function Harness({ onChange, ...rest }) {
  const [value, setValue] = useState("");
  return (
    <SearchableSelect
      label="Region / Wilaya"
      value={value}
      onChange={(next, option) => {
        setValue(next);
        onChange?.(next, option);
      }}
      options={OPTIONS}
      placeholder="Select a wilaya"
      {...rest}
    />
  );
}

const openMenu = () => fireEvent.click(screen.getByRole("combobox"));

test("exposes combobox semantics and starts collapsed", () => {
  render(<Harness />);
  const trigger = screen.getByRole("combobox");

  expect(trigger).toHaveAttribute("aria-expanded", "false");
  expect(trigger).toHaveAttribute("aria-haspopup", "listbox");
  expect(trigger).toHaveTextContent("Select a wilaya");
  expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
});

test("opens a listbox and shows each option with its code", () => {
  render(<Harness />);
  openMenu();

  expect(screen.getByRole("combobox")).toHaveAttribute("aria-expanded", "true");
  const listbox = screen.getByRole("listbox");
  expect(within(listbox).getAllByRole("option")).toHaveLength(3);
  expect(within(listbox).getByText("Adrar")).toBeInTheDocument();
  expect(within(listbox).getByText("ADR")).toBeInTheDocument();
});

test("filters by label, code or value", () => {
  render(<Harness />);
  openMenu();

  fireEvent.change(screen.getByLabelText("Search…"), { target: { value: "gor" } });

  expect(screen.getByRole("option", { name: /Gorgol/ })).toBeInTheDocument();
  expect(screen.queryByRole("option", { name: /Adrar/ })).not.toBeInTheDocument();
});

test("reports a clear empty state when nothing matches", () => {
  render(<Harness />);
  openMenu();

  fireEvent.change(screen.getByLabelText("Search…"), { target: { value: "zzzz" } });

  expect(screen.getByText(/No match for/)).toBeInTheDocument();
  expect(screen.queryAllByRole("option")).toHaveLength(0);
});

test("reports a loading state instead of a misleading empty list", () => {
  render(<Harness loading loadingLabel="Loading wilayas…" />);
  openMenu();

  expect(screen.getByText("Loading wilayas…")).toBeInTheDocument();
  expect(screen.queryAllByRole("option")).toHaveLength(0);
});

test("selects an option and shows the value with its code", () => {
  const onChange = jest.fn();
  render(<Harness onChange={onChange} />);
  openMenu();

  fireEvent.click(screen.getByRole("option", { name: /Gorgol/ }));

  expect(onChange).toHaveBeenCalledWith("GOR", expect.objectContaining({ label: "Gorgol" }));
  expect(screen.getByRole("combobox")).toHaveTextContent("Gorgol");
  expect(screen.getByRole("combobox")).toHaveTextContent("GOR");
  expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
});

test("a disabled option is visible but can never be committed", () => {
  const onChange = jest.fn();
  render(<Harness onChange={onChange} />);
  openMenu();

  const blocked = screen.getByRole("option", { name: /Traralgon/ });
  expect(blocked).toHaveAttribute("aria-disabled", "true");
  expect(blocked).toHaveClass("ss__option--disabled");

  fireEvent.click(blocked);
  expect(onChange).not.toHaveBeenCalled();
  // The menu stays open because nothing was chosen.
  expect(screen.getByRole("listbox")).toBeInTheDocument();
});

test("keyboard navigation moves the highlight and Enter commits", () => {
  const onChange = jest.fn();
  render(<Harness onChange={onChange} />);

  // ArrowDown on the closed trigger opens the menu.
  fireEvent.keyDown(screen.getByRole("combobox"), { key: "ArrowDown" });
  expect(screen.getByRole("listbox")).toBeInTheDocument();

  const search = screen.getByLabelText("Search…");
  fireEvent.keyDown(search, { key: "ArrowDown" });
  fireEvent.keyDown(search, { key: "Enter" });

  expect(onChange).toHaveBeenCalled();
  expect(onChange.mock.calls[0][0]).toBe("GOR"); // Adrar -> ArrowDown -> Gorgol
});

test("Escape closes without selecting", () => {
  const onChange = jest.fn();
  render(<Harness onChange={onChange} />);
  openMenu();

  fireEvent.keyDown(screen.getByLabelText("Search…"), { key: "Escape" });

  expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  expect(onChange).not.toHaveBeenCalled();
});

test("a disabled select cannot be opened", () => {
  render(<Harness disabled />);
  const trigger = screen.getByRole("combobox");

  expect(trigger).toBeDisabled();
  fireEvent.click(trigger);
  expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
});

test("accepts plain string options as well as objects", () => {
  render(
    <SearchableSelect label="Plain" value="" onChange={() => {}} options={["Alpha", "Beta"]} />
  );
  openMenu();

  expect(screen.getByRole("option", { name: "Alpha" })).toBeInTheDocument();
  expect(screen.getByRole("option", { name: "Beta" })).toBeInTheDocument();
});

test("clearable removes the selection", () => {
  const onChange = jest.fn();
  render(<Harness clearable onChange={onChange} />);
  openMenu();
  fireEvent.click(screen.getByRole("option", { name: /Adrar/ }));
  onChange.mockClear();

  fireEvent.click(screen.getByLabelText("Clear selection"));

  expect(onChange).toHaveBeenCalledWith("", null);
});

test("surfaces an error message and marks the control invalid", () => {
  render(<Harness error="A wilaya is required." />);

  expect(screen.getByRole("alert")).toHaveTextContent("A wilaya is required.");
  expect(screen.getByRole("combobox")).toHaveAttribute("aria-invalid", "true");
});

