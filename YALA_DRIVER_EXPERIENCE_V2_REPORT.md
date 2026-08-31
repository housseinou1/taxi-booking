# Yala Driver Experience 2.0

Full report: [release/YALA_DRIVER_EXPERIENCE_V2_REPORT.md](release/YALA_DRIVER_EXPERIENCE_V2_REPORT.md)

| Metric | Value |
|--------|------:|
| **Score** | **88 / 100** |
| **Modules** | **7 / 7** |
| **Backend changes** | **0** |
| **Recommendation** | **READY FOR CLOSED BETA · DEVICE QA BEFORE GA** |

## Sprint fixes (2026-07-22)

- `/driver/documents` now opens the Document Center (`DriverDocuments.js`), not the profile page
- `/driver/level` route added for `DriverLevelInfo.js`
- Home wallet balance fetched from `GET /payments/withdrawals/`
- Header earnings chip navigates to `/driver/earnings`
- Smart home loading skeleton + scrollable 6-action help grid on home dock
- Design tokens imported on main driver dashboard
