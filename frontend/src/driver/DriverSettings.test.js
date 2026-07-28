import React from "react";
import { render, screen, waitFor, act, fireEvent } from "@testing-library/react";
import DriverSettings from "./DriverSettings";
import { DriverProvider } from "./context/DriverContext";

// ─── Mock axios ─────────────────────────────────────────────────────────────
jest.mock("axios");
const axios = require("axios");

// ─── Mock i18n module ───────────────────────────────────────────────────────
jest.mock("../i18n", () => ({
  __esModule: true,
  default: {},
  languageOptions: [
    { code: "en", labelKey: "settings.english", nativeName: "English" },
    { code: "fr", labelKey: "settings.french", nativeName: "Francais" },
    { code: "ar", labelKey: "settings.arabic", nativeName: "العربية" },
  ],
  normalizeLanguageCode: (value) => {
    if (["en", "fr", "ar"].includes(value)) return value;
    const normalized = String(value || "").toLowerCase();
    if (normalized.startsWith("fr") || normalized === "french") return "fr";
    if (normalized.startsWith("ar") || normalized === "arabic") return "ar";
    return "en";
  },
}));

// ─── Mock i18next ───────────────────────────────────────────────────────────
const mockChangeLanguage = jest.fn();
jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key) => key,
    i18n: {
      language: "en",
      changeLanguage: mockChangeLanguage,
    },
  }),
}));

// ─── Mock localStorage ──────────────────────────────────────────────────────
beforeEach(() => {
  Storage.prototype.getItem = jest.fn(() => "test-token");
});

// ─── Helper: render with DriverProvider ─────────────────────────────────────
function renderWithProvider(ui, { initialValues = {} } = {}) {
  return render(
    <DriverProvider initialValues={initialValues}>{ui}</DriverProvider>
  );
}

// ─── Mock API response ──────────────────────────────────────────────────────
const mockSettings = {
  id: 1,
  driver: 1,
  language: "en",
  notifications_rides: true,
  notifications_promotions: true,
  notifications_system: true,
  gps_accuracy: "high",
  dark_mode: false,
  biometric_enabled: false,
  privacy_show_name: true,
  privacy_show_photo: true,
  privacy_show_vehicle: true,
};

describe("DriverSettings", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("shows loading state initially", async () => {
    axios.get.mockImplementation(() => new Promise(() => {}));

    await act(async () => {
      renderWithProvider(<DriverSettings />);
    });

    expect(screen.getByText("Loading settings…")).toBeInTheDocument();
  });

  it("displays all settings sections after loading", async () => {
    axios.get.mockResolvedValue({ data: mockSettings });

    await act(async () => {
      renderWithProvider(<DriverSettings />);
    });

    await waitFor(() => {
      expect(screen.getByText("⚙️ Settings")).toBeInTheDocument();
    });

    // Language section
    expect(screen.getByText("🌐 Language")).toBeInTheDocument();
    expect(screen.getAllByText("English").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Français")).toBeInTheDocument();
    expect(screen.getAllByText("العربية").length).toBeGreaterThanOrEqual(1);

    // Notifications section
    expect(screen.getByText("🔔 Notifications")).toBeInTheDocument();
    expect(screen.getByText("Ride Requests")).toBeInTheDocument();
    expect(screen.getByText("Promotions")).toBeInTheDocument();
    expect(screen.getByText("System Alerts")).toBeInTheDocument();

    // YALA notification sound branding (no competitor names)
    expect(screen.getByText("YALA Classic")).toBeInTheDocument();
    expect(screen.getByText("YALA Pulse")).toBeInTheDocument();
    expect(screen.getByText("YALA Signature")).toBeInTheDocument();
    expect(screen.getByText("YALA Express")).toBeInTheDocument();
    expect(screen.queryByText(/Lyft/i)).not.toBeInTheDocument();

    // GPS section
    expect(screen.getByText("📍 GPS Accuracy")).toBeInTheDocument();
    expect(screen.getByText("High Accuracy")).toBeInTheDocument();
    expect(screen.getByText("Battery Saver")).toBeInTheDocument();

    // Dark mode section (shown when commercial light UI flag is off in test env)
    expect(screen.getByText("🌙 Appearance")).toBeInTheDocument();
    expect(screen.getByText("Dark Mode")).toBeInTheDocument();

    // Security section
    expect(screen.getByText("🔒 Security")).toBeInTheDocument();
    expect(screen.getByText("PIN Lock")).toBeInTheDocument();
    expect(screen.getByText("Biometric Authentication")).toBeInTheDocument();

    // Privacy section
    expect(screen.getByText("👁️ Privacy")).toBeInTheDocument();
    expect(screen.getByText("Show Name")).toBeInTheDocument();
    expect(screen.getByText("Show Photo")).toBeInTheDocument();
    expect(screen.getByText("Show Vehicle")).toBeInTheDocument();
  });

  it("changes language and calls i18n.changeLanguage", async () => {
    axios.get.mockResolvedValue({ data: mockSettings });
    axios.patch.mockResolvedValue({ data: { ...mockSettings, language: "fr" } });

    await act(async () => {
      renderWithProvider(<DriverSettings />);
    });

    await waitFor(() => {
      expect(screen.getByText("Français")).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByLabelText("Select Francais"));
    });

    expect(mockChangeLanguage).toHaveBeenCalledWith("fr");
    expect(axios.patch).toHaveBeenCalledWith(
      expect.stringContaining("/drivers/me/settings/"),
      { language: "fr" },
      expect.any(Object)
    );
  });

  it("toggles notification preferences independently", async () => {
    axios.get.mockResolvedValue({ data: mockSettings });
    axios.patch.mockResolvedValue({
      data: { ...mockSettings, notifications_rides: false },
    });

    await act(async () => {
      renderWithProvider(<DriverSettings />);
    });

    await waitFor(() => {
      expect(screen.getByText("Ride Requests")).toBeInTheDocument();
    });

    const rideToggle = screen.getByLabelText("Ride Requests toggle");
    expect(rideToggle).toHaveAttribute("aria-checked", "true");

    await act(async () => {
      fireEvent.click(rideToggle);
    });

    expect(axios.patch).toHaveBeenCalledWith(
      expect.stringContaining("/drivers/me/settings/"),
      { notifications_rides: false },
      expect.any(Object)
    );
  });

  it("toggles GPS accuracy between high and battery saver", async () => {
    axios.get.mockResolvedValue({ data: mockSettings });
    axios.patch.mockResolvedValue({
      data: { ...mockSettings, gps_accuracy: "battery_saver" },
    });

    await act(async () => {
      renderWithProvider(<DriverSettings />);
    });

    await waitFor(() => {
      expect(screen.getByText("Battery Saver")).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByText("Battery Saver"));
    });

    expect(axios.patch).toHaveBeenCalledWith(
      expect.stringContaining("/drivers/me/settings/"),
      { gps_accuracy: "battery_saver" },
      expect.any(Object)
    );
  });

  it("toggles dark mode", async () => {
    axios.get.mockResolvedValue({ data: mockSettings });
    axios.patch.mockResolvedValue({
      data: { ...mockSettings, dark_mode: true },
    });

    await act(async () => {
      renderWithProvider(<DriverSettings />);
    });

    await waitFor(() => {
      expect(screen.getByText("Dark Mode")).toBeInTheDocument();
    });

    const darkModeToggle = screen.getByLabelText("Dark Mode toggle");
    expect(darkModeToggle).toHaveAttribute("aria-checked", "false");

    await act(async () => {
      fireEvent.click(darkModeToggle);
    });

    expect(axios.patch).toHaveBeenCalledWith(
      expect.stringContaining("/drivers/me/settings/"),
      { dark_mode: true },
      expect.any(Object)
    );
  });

  it("opens PIN modal and validates 4-6 digit input", async () => {
    axios.get.mockResolvedValue({ data: mockSettings });

    await act(async () => {
      renderWithProvider(<DriverSettings />);
    });

    await waitFor(() => {
      expect(screen.getByText("Set PIN")).toBeInTheDocument();
    });

    // Open PIN modal
    await act(async () => {
      fireEvent.click(screen.getByText("Set PIN"));
    });

    expect(screen.getByText("Set PIN Lock")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Enter PIN (4-6 digits)")).toBeInTheDocument();

    // Enter invalid PIN (too short)
    const pinInput = screen.getByLabelText("PIN input");
    await act(async () => {
      fireEvent.change(pinInput, { target: { value: "12" } });
    });

    await act(async () => {
      fireEvent.click(screen.getByText("Save"));
    });

    expect(screen.getByText("PIN must be 4 to 6 numeric digits.")).toBeInTheDocument();
  });

  it("saves valid PIN (4-6 digits)", async () => {
    axios.get.mockResolvedValue({ data: mockSettings });
    axios.patch.mockResolvedValue({ data: mockSettings });

    await act(async () => {
      renderWithProvider(<DriverSettings />);
    });

    await waitFor(() => {
      expect(screen.getByText("Set PIN")).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByText("Set PIN"));
    });

    const pinInput = screen.getByLabelText("PIN input");
    await act(async () => {
      fireEvent.change(pinInput, { target: { value: "1234" } });
    });

    await act(async () => {
      fireEvent.click(screen.getByText("Save"));
    });

    expect(axios.patch).toHaveBeenCalledWith(
      expect.stringContaining("/drivers/me/settings/"),
      { pin_lock: "1234" },
      expect.any(Object)
    );
  });

  it("toggles privacy controls independently", async () => {
    axios.get.mockResolvedValue({ data: mockSettings });
    axios.patch.mockResolvedValue({
      data: { ...mockSettings, privacy_show_name: false },
    });

    await act(async () => {
      renderWithProvider(<DriverSettings />);
    });

    await waitFor(() => {
      expect(screen.getByText("Show Name")).toBeInTheDocument();
    });

    const nameToggle = screen.getByLabelText("Show Name toggle");
    expect(nameToggle).toHaveAttribute("aria-checked", "true");

    await act(async () => {
      fireEvent.click(nameToggle);
    });

    expect(axios.patch).toHaveBeenCalledWith(
      expect.stringContaining("/drivers/me/settings/"),
      { privacy_show_name: false },
      expect.any(Object)
    );
  });

  it("shows error state and retry button on API failure", async () => {
    axios.get.mockRejectedValue(new Error("Network error"));

    await act(async () => {
      renderWithProvider(<DriverSettings />);
    });

    await waitFor(() => {
      expect(screen.getByText("Couldn’t load settings")).toBeInTheDocument();
      expect(screen.getByText("Please try again.")).toBeInTheDocument();
    });

    expect(screen.getByText("Retry")).toBeInTheDocument();
  });
});
