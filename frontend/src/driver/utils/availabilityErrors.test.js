import { formatAvailabilityApiError } from "./availabilityErrors";

describe("formatAvailabilityApiError", () => {
  it("shows a driver-safe service message for HTTP 503", () => {
    expect(formatAvailabilityApiError({ response: { status: 503 } })).toBe(
      "Driver service is temporarily unavailable. You remain in your current status. Please try again."
    );
  });

  it("preserves backend detail messages for non-503 failures", () => {
    expect(
      formatAvailabilityApiError({
        response: {
          status: 400,
          data: { detail: "Upload renewed documents before going online." },
        },
      })
    ).toBe("Upload renewed documents before going online.");
  });

  it("shows timeout copy for aborted requests", () => {
    expect(formatAvailabilityApiError({ code: "ECONNABORTED" })).toBe(
      "Request timed out. Check your connection and try again."
    );
  });
});
