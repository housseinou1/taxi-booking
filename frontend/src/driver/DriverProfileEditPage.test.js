import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import axios from "axios";

import DriverProfileEditPage from "./DriverProfileEditPage";

jest.mock("axios");
jest.mock("../native/platform", () => ({
  getAppType: jest.fn(() => "driver"),
  isDeliveryCourierApp: jest.fn(() => false),
}));

const profile = {
  first_name: "Ahmed",
  last_name: "Driver",
  email: "ahmed@example.com",
  phone_number: "22200000",
  city_name: "Nouakchott",
  vehicle_make: "Toyota",
  vehicle_model: "Corolla",
  vehicle_plate: "NKC-1234",
};

const citiesResponse = { data: [{ region: "R1", cities: [{ id: 1, name: "Nouakchott" }] }] };

function mockGet() {
  axios.get.mockImplementation((url) => {
    if (url.includes("/cities/")) return Promise.resolve(citiesResponse);
    if (url.includes("/drivers/me/")) return Promise.resolve({ data: profile });
    return Promise.resolve({ data: {} });
  });
}

async function renderEditor() {
  await act(async () => {
    render(<DriverProfileEditPage />);
  });
  await waitFor(() => {
    expect(screen.getByDisplayValue("Ahmed")).toBeInTheDocument();
  });
}

describe("DriverProfileEditPage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Storage.prototype.getItem = jest.fn(() => "test-token");
    mockGet();
  });

  it("renders required-field indicators", async () => {
    await renderEditor();
    // First name is required — its input carries the required attribute
    const firstName = screen.getByDisplayValue("Ahmed");
    expect(firstName).toBeRequired();
  });

  it("shows a loading state while fetching", () => {
    axios.get.mockImplementation(() => new Promise(() => {}));
    render(<DriverProfileEditPage />);
    expect(screen.getByText("Loading profile editor")).toBeInTheDocument();
  });

  it("shows a saving state and success feedback on save", async () => {
    axios.patch.mockResolvedValue({ data: {} });
    await renderEditor();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Save changes/i }));
    });

    await waitFor(() => {
      expect(screen.getByText("Profile changes saved successfully.")).toBeInTheDocument();
    });
    expect(axios.patch).toHaveBeenCalledTimes(2);
  });

  it("shows an error message when save fails", async () => {
    axios.patch.mockRejectedValue({ response: { data: { error: "Profile update failed." } } });
    await renderEditor();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Save changes/i }));
    });

    await waitFor(() => {
      expect(screen.getByText("Profile update failed.")).toBeInTheDocument();
    });
  });
});
