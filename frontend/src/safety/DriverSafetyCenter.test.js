import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

import DriverSafetyCenter from "./DriverSafetyCenter";

jest.mock("../navigation/inAppNavigation", () => ({
  navigateInApp: jest.fn(),
}));

jest.mock("./safetyApi", () => ({
  __esModule: true,
  fetchSafetyIncidents: jest.fn(() =>
    Promise.resolve([
      {
        id: 1,
        reference: "SF-001",
        incident_type: "sos",
        status: "open",
      },
    ])
  ),
  getSafetyPosition: jest.fn(() =>
    Promise.resolve({ latitude: 18.07, longitude: -15.95, accuracy: 10 })
  ),
  reportSafetyIncident: jest.fn(() => Promise.resolve({ reference: "SF-002" })),
  triggerSos: jest.fn(() =>
    Promise.resolve({ incident: { reference: "SF-SOS" } })
  ),
}));

jest.mock("./TrustedContactsSection", () => () => <div>Trusted contacts module</div>);

jest.mock("axios", () => ({
  get: jest.fn(() => Promise.resolve({ data: { results: [] } })),
}));

describe("DriverSafetyCenter", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Storage.prototype.getItem = jest.fn(() => "test-token");
  });

  it("renders safety home sections", async () => {
    await act(async () => {
      render(<DriverSafetyCenter />);
    });

    await waitFor(() => {
      expect(screen.getByText("Safety Center")).toBeInTheDocument();
    });

    expect(screen.getByText(/Driver Safety Status/i)).toBeInTheDocument();
    expect(screen.getByText("Emergency SOS")).toBeInTheDocument();
    expect(screen.getByText("Incident history")).toBeInTheDocument();
    expect(screen.getByText("Trusted contacts module")).toBeInTheDocument();
  });

  it("requires confirmation before sending SOS", async () => {
    const { triggerSos } = require("./safetyApi");

    await act(async () => {
      render(<DriverSafetyCenter />);
    });

    await waitFor(() => {
      expect(screen.getByText("SOS Emergency")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("SOS Emergency"));
    expect(screen.getByText("Send emergency SOS?")).toBeInTheDocument();
    expect(triggerSos).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText("Send SOS now"));

    await waitFor(() => {
      expect(triggerSos).toHaveBeenCalled();
    });
  });
});
