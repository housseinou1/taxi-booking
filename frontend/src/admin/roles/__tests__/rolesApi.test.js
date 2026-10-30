/**
 * Phase 10 — rolesApi unit tests.
 *
 * Verifies the query builder drops empty values (so the backend never sees
 * `?role=`), and that the client-side protection mirror flags superusers even
 * when the `protected` flag is absent from a payload.
 */
import { buildRoleQuery, isProtectedAccount } from "../rolesApi";

describe("rolesApi (Phase 10)", () => {
  it("builds a query string only from populated values", () => {
    expect(buildRoleQuery({ search: "a@b.c", role: "", page: null, size: undefined })).toBe(
      "?search=a%40b.c"
    );
  });

  it("returns an empty string when nothing is provided", () => {
    expect(buildRoleQuery()).toBe("");
    expect(buildRoleQuery({ role: "" })).toBe("");
  });

  it("mirrors the backend protection rule", () => {
    expect(isProtectedAccount({ protected: true })).toBe(true);
    expect(isProtectedAccount({ is_superuser: true })).toBe(true);
    expect(isProtectedAccount({ protected: false, is_superuser: false })).toBe(false);
    expect(isProtectedAccount(null)).toBe(false);
  });
});
