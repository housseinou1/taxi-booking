import { headersForFormData } from "../multipartRequest";

test("form uploads do not send a boundary-less multipart content type", () => {
  const headers = headersForFormData({
    Authorization: "Bearer token",
    "Content-Type": "multipart/form-data",
  });

  expect(headers.Authorization).toBe("Bearer token");
  expect(headers["Content-Type"]).toBeUndefined();
  expect(headers["content-type"]).toBeUndefined();
});
