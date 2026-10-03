import { acceptRideLegal, acceptRiderLegal } from "./legalApi";
import authenticatedApi from "../auth/authenticatedApi";
import { apiRequest } from "../delivery/DeliveryShared";

// The native-HTTP-aware authenticated client (used by rider ride requests).
jest.mock("../auth/authenticatedApi", () => ({
  __esModule: true,
  default: {
    post: jest.fn(),
    get: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
  },
}));

// The legacy delivery raw-fetch client. Rider legal acceptance must NOT use this.
jest.mock("../delivery/DeliveryShared", () => ({
  __esModule: true,
  apiRequest: jest.fn(),
  CONNECTION_ERROR_MESSAGE: "Connection error. Check your internet and try again.",
}));

describe("legalApi rider acceptance (native-capable client)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("acceptRiderLegal posts /legal/ride/accept/ via authenticatedApi, not the delivery apiRequest", async () => {
    authenticatedApi.post.mockResolvedValue({ data: { ok: true } });

    const result = await acceptRiderLegal({ ride_terms_accepted: true });

    expect(authenticatedApi.post).toHaveBeenCalledTimes(1);
    const [url, body] = authenticatedApi.post.mock.calls[0];
    expect(url).toMatch(/\/legal\/ride\/accept\/$/);
    expect(body).toEqual(
      expect.objectContaining({ ride_terms_accepted: true, device_info: expect.any(String) })
    );

    // The delivery raw-fetch client must never be used for rider legal acceptance.
    expect(apiRequest).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: true });
  });

  it("acceptRideLegal delegates to the native client and sends terms + privacy flags", async () => {
    authenticatedApi.post.mockResolvedValue({ data: {} });

    await acceptRideLegal({ device_info: "jest-agent" });

    expect(authenticatedApi.post).toHaveBeenCalledTimes(1);
    const [url, body] = authenticatedApi.post.mock.calls[0];
    expect(url).toMatch(/\/legal\/ride\/accept\/$/);
    expect(body).toEqual(
      expect.objectContaining({
        ride_terms_accepted: true,
        privacy_accepted: true,
        device_info: "jest-agent",
      })
    );
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it("preserves the backend error detail instead of a generic connection-error string", async () => {
    authenticatedApi.post.mockRejectedValue({
      response: { status: 400, data: { detail: "Rider account must be approved by admin before requesting a ride." } },
    });

    await expect(acceptRideLegal({})).rejects.toThrow(
      "Rider account must be approved by admin before requesting a ride."
    );
  });

  it("surfaces a network error (no response) without masking it as the delivery connection string", async () => {
    authenticatedApi.post.mockRejectedValue({ request: {} });

    await expect(acceptRideLegal({})).rejects.toThrow(/unable to reach server/i);
    // It must not reuse the delivery module's fixed connection-error message.
    await expect(acceptRideLegal({})).rejects.not.toThrow(
      "Connection error. Check your internet and try again."
    );
  });
});
