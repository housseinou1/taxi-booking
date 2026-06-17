import axios from "axios";

import riderApi from "./authenticatedApi";

jest.mock("axios", () => ({
  get: jest.fn(),
  post: jest.fn(),
  patch: jest.fn(),
  delete: jest.fn(),
}));

jest.mock("../../apiConfig", () => ({
  API_URL: "http://localhost:8000",
}));

describe("authenticatedApi", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    localStorage.setItem("access", "expired-access");
    localStorage.setItem("refresh", "valid-refresh");
  });

  it("refreshes an expired access token and retries the request", async () => {
    axios.get
      .mockRejectedValueOnce({
        response: { status: 401, data: { code: "token_not_valid" } },
      })
      .mockResolvedValueOnce({ data: { id: 7 } });
    axios.post.mockResolvedValueOnce({
      data: { access: "new-access", refresh: "rotated-refresh" },
    });

    const response = await riderApi.get("http://localhost:8000/auth/me/");

    expect(axios.post).toHaveBeenCalledWith(
      "http://localhost:8000/auth/token/refresh/",
      { refresh: "valid-refresh" },
      { timeout: 10000 }
    );
    expect(axios.get).toHaveBeenLastCalledWith(
      "http://localhost:8000/auth/me/",
      expect.objectContaining({ headers: { Authorization: "Bearer new-access" } })
    );
    expect(localStorage.getItem("access")).toBe("new-access");
    expect(localStorage.getItem("refresh")).toBe("rotated-refresh");
    expect(response.data.id).toBe(7);
  });

  it("does not refresh non-authentication failures", async () => {
    axios.get.mockRejectedValueOnce({
      response: { status: 400, data: { detail: "Bad request" } },
    });

    await expect(riderApi.get("http://localhost:8000/rides/history/")).rejects.toBeTruthy();
    expect(axios.post).not.toHaveBeenCalled();
  });
});
