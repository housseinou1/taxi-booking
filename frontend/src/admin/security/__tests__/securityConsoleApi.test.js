/**
 * Phase 11 — securityConsoleApi unit tests.
 *
 * Verifies the query builder drops empty values and that the status/flag tone maps
 * stay aligned with the backend vocabulary (so the UI never renders an unknown tone).
 */
import {
  ACCESS_FLAG_TONES,
  AUDIT_ACTION_OPTIONS,
  ENTITY_OPTIONS,
  ISSUE_STATUS_TONES,
  buildConsoleQuery,
} from "../securityConsoleApi";

describe("securityConsoleApi (Phase 11)", () => {
  it("builds a query string only from populated values", () => {
    expect(buildConsoleQuery({ action: "refund", entity_type: "", page: 2 })).toBe(
      "?action=refund&page=2"
    );
  });

  it("returns an empty string when nothing is provided", () => {
    expect(buildConsoleQuery()).toBe("");
    expect(buildConsoleQuery({ action: "", date_from: null })).toBe("");
  });

  it("exposes the audit action and entity vocabularies used by the backend", () => {
    const actionValues = AUDIT_ACTION_OPTIONS.map((option) => option.value);
    const entityValues = ENTITY_OPTIONS.map((option) => option.value);
    expect(actionValues).toEqual(expect.arrayContaining(["admin_action", "refund"]));
    expect(entityValues).toEqual(expect.arrayContaining(["system", "driver", "id_card"]));
  });

  it("maps every documented flag and issue status to a tone", () => {
    ["protected", "superuser", "no_totp", "never_logged_in", "stale_login", "inactive"].forEach(
      (flag) => expect(ACCESS_FLAG_TONES[flag]).toBeTruthy()
    );
    [
      "blocked_by_design",
      "blocked_dependency",
      "ready_to_implement",
      "mitigated",
      "ok",
      "action_required_on_deploy",
    ].forEach((status) => expect(ISSUE_STATUS_TONES[status]).toBeTruthy());
  });
});
