import { render, screen, waitFor } from "@testing-library/react";

import MoosylPaymentPanel from "./MoosylPaymentPanel";
import { fetchMoosylOverview } from "./moosylApi";

jest.mock("./moosylApi", () => ({
  fetchMoosylOverview: jest.fn(),
}));

const OVERVIEW = {
  provider: "moosyl",
  environment: "sandbox",
  mode: "sandbox",
  settlement_enabled: false,
  fee_percent: "1",
  settles_to: "yala_iban",
  driver_payout_via_moosyl: false,
  refunds_via_api: false,
  webhook_url: "/payments/webhooks/moosyl/",
  bank_apps: ["bankily", "masravi", "sedad"],
  events: { settled: 3, duplicate: 1, ignored: 2, rejected: 0 },
  recent_events: [
    {
      event_type: "payment-created",
      transaction_id: "YALA-RIDE-1043",
      status: "completed",
      amount: "121.00",
      outcome: "settled",
    },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
});

test("shows the Moosyl environment and that settlement is gated", async () => {
  fetchMoosylOverview.mockResolvedValue({ data: OVERVIEW });
  render(<MoosylPaymentPanel />);

  await waitFor(() =>
    expect(screen.getByTestId("moosyl-environment")).toHaveTextContent("sandbox")
  );
  expect(screen.getByTestId("moosyl-settlement")).toHaveTextContent(
    /events are recorded only/i
  );
  expect(screen.getByTestId("moosyl-webhook-url")).toHaveTextContent(
    "/payments/webhooks/moosyl/"
  );
});

test("states explicitly that Moosyl does not pay drivers", async () => {
  fetchMoosylOverview.mockResolvedValue({ data: OVERVIEW });
  render(<MoosylPaymentPanel />);

  await waitFor(() => expect(screen.getByTestId("moosyl-panel")).toBeInTheDocument());
  expect(
    screen.getByText(/drivers are paid through YALA's own withdrawal flow/i)
  ).toBeInTheDocument();
  expect(screen.getByText(/not available from Moosyl/i)).toBeInTheDocument();
});

test("reports the webhook outcome counts", async () => {
  fetchMoosylOverview.mockResolvedValue({ data: OVERVIEW });
  render(<MoosylPaymentPanel />);

  await waitFor(() => expect(screen.getByTestId("moosyl-outcomes")).toBeInTheDocument());
  const outcomes = screen.getByTestId("moosyl-outcomes").textContent;
  expect(outcomes).toMatch(/settled: 3/);
  expect(outcomes).toMatch(/duplicate: 1/);
  expect(outcomes).toMatch(/ignored: 2/);
  expect(outcomes).toMatch(/rejected: 0/);
});

test("lists recent webhook events with their transaction id", async () => {
  fetchMoosylOverview.mockResolvedValue({ data: OVERVIEW });
  render(<MoosylPaymentPanel />);

  await waitFor(() =>
    expect(screen.getByText("YALA-RIDE-1043")).toBeInTheDocument()
  );
  expect(screen.getByText("payment-created")).toBeInTheDocument();
});

test("shows an empty state before any webhook has arrived", async () => {
  fetchMoosylOverview.mockResolvedValue({
    data: { ...OVERVIEW, events: {}, recent_events: [] },
  });
  render(<MoosylPaymentPanel />);

  await waitFor(() =>
    expect(screen.getByText(/no moosyl webhooks received yet/i)).toBeInTheDocument()
  );
});

test("surfaces a load failure instead of showing stale data", async () => {
  fetchMoosylOverview.mockRejectedValue(new Error("Forbidden"));
  render(<MoosylPaymentPanel />);

  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Forbidden"));
});
