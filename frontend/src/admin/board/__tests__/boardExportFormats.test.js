/**
 * Board report export formats.
 *
 * REGRESSION GUARD: `presentation` was offered as a fourth export format, but the
 * backend answered it with byte-identical PDF bytes (verified live: 3990 == 3990
 * for the full suite), so it duplicated the PDF button. It must not come back
 * without a real, distinct backend format behind it.
 */
import { EXPORT_CONTENT_TYPES, EXPORT_EXTENSIONS } from "../boardReportingApi";

describe("board report export formats", () => {
  test("REGRESSION: presentation is not an offered export format", () => {
    expect(EXPORT_CONTENT_TYPES).not.toHaveProperty("presentation");
    expect(EXPORT_EXTENSIONS).not.toHaveProperty("presentation");
  });

  test("csv, excel and pdf remain supported with correct extensions", () => {
    expect(EXPORT_EXTENSIONS).toEqual({ csv: "csv", excel: "xlsx", pdf: "pdf" });
    expect(EXPORT_CONTENT_TYPES.csv).toContain("text/csv");
    expect(EXPORT_CONTENT_TYPES.pdf).toContain("application/pdf");
    expect(EXPORT_CONTENT_TYPES.excel[0]).toMatch(/spreadsheetml\.sheet/);
  });
});
