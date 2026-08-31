# Requirements Document

## Introduction

This feature covers **Mission 2 — Phase 0: UI Foundation & Hygiene** for the YALA Driver frontend. It is explicitly **not** a visual redesign. The goal is to remove competitor branding and debug artifacts, document and quarantine legacy dashboard implementations, centralize duplicated styling values, and introduce reusable app-state components — establishing a clean, stable foundation before the YALA Design System is introduced in Mission 3.

The work is strictly frontend-only. It must not touch backend code, APIs, business logic, the ride lifecycle, authentication, permissions, or navigation destinations. All changes must preserve existing Driver behavior with no regressions.

### Scope Boundaries (Hard Constraints)

The following are **out of scope** and must not change:
- Backend code (any file under Django apps)
- API contracts, request/response shapes, endpoints
- Business logic and ride lifecycle
- Authentication and token handling
- Permissions and role gating
- Navigation destinations and routing structure

### Known Codebase Context (for grounding)

- Competitor branding is present via `frontend/src/driver/lyftColors.js`, `frontend/src/driver/lyft-driver.css`, `themeRefresh.js`, and an `isDriverLyftUI` platform flag; many driver components import these and toggle a `--lyft` CSS variant.
- Multiple dashboard implementations coexist: `DriverDashboard.js`, `DriverDashboardNew.js`, `RideDashboard.js`, and the `DriverApp.js` shell.
- Debug/QA artifacts exist (e.g., `utils/driverTripDebug.js`, a `yala_debug_bypass_documents` localStorage bypass, `TEMP-PLATE` values in tests).
- An existing test (`DriverSettings.test.js`) already asserts YALA tier names (`YALA Classic/Pulse/Signature/Express`) and the absence of `/Lyft/i`, indicating the intended naming convention.

---

## Glossary

- **Driver frontend**: React source under `frontend/src/driver/**` and its shared imports used by the Driver app.
- **Competitor branding**: Any "Lyft" (or other competitor) string, class name, identifier, asset, or reference.
- **YALA tiers**: The service/ride tier names `YALA Classic`, `YALA Pulse`, `YALA Signature`, `YALA Express`.
- **Legacy dashboard**: An older, non-production dashboard implementation slated for eventual removal.
- **Production path**: The dashboard implementation actually reached by the Driver app's routing/entry points.
- **App-state components**: Reusable UI for Loading, Empty, Error, Offline, and No-Data states.
- **Style constants**: Centralized shared style values (colors, radius, spacing, typography, shadows).
- **Mission 3**: The subsequent effort that introduces the YALA Design System.

## Requirements

### Requirement 1: Remove Competitor Branding from the Driver App

**User Story:** As a YALA driver, I want the app to show only YALA branding and terminology, so that the product feels like a first-party YALA experience with no competitor references.

#### Acceptance Criteria

1. WHEN the Driver frontend source is searched for the term "Lyft" (case-insensitive) THEN the system SHALL contain no user-facing "Lyft" strings, labels, or brand references in `frontend/src/driver/**`.
2. WHERE ride tier or service names reference a competitor, the system SHALL replace them with the YALA equivalents: `YALA Classic`, `YALA Pulse`, `YALA Signature`, `YALA Express`.
3. WHEN competitor-named identifiers exist in code (e.g., `isDriverLyftUI`, `lyftColors.js`, `lyft-driver.css`, `--lyft` CSS class variants) THEN the system SHALL rename or alias them to neutral YALA-oriented names WITHOUT changing their runtime behavior or the resolved visual output.
4. IF a competitor-named symbol is shared with non-driver code (e.g., rider app), THEN the system SHALL preserve backward compatibility (via alias/re-export) so that no non-driver code breaks.
5. WHEN competitor-branded assets (images, icons, fonts) are referenced by the Driver app THEN the system SHALL remove them or replace them with YALA assets, and no dead references SHALL remain.
6. WHEN the rename is complete THEN existing tests that assert YALA tier names and the absence of `/Lyft/i` (e.g., `DriverSettings.test.js`) SHALL pass.

---

### Requirement 2: Remove Debug and Developer-Only UI

**User Story:** As a YALA driver using a production build, I want no debug or developer-only controls visible, so that the app is clean, safe, and professional.

#### Acceptance Criteria

1. WHEN a driver views any Driver screen THEN the system SHALL NOT display debug login controls, "Allow test login", or developer-only buttons.
2. WHEN a driver views any Driver screen THEN the system SHALL NOT display TEMP values, raw internal IDs, or placeholder labels as user-facing content.
3. WHERE debug logging or QA bypasses exist for internal use only (e.g., `driverTripDebug`, `yala_debug_bypass_documents`), the system SHALL retain functionality that is still used internally but ensure it is not exposed through user-facing UI.
4. IF removing a control would remove functionality still used internally, THEN the system SHALL keep the functionality and only remove or gate its user-facing surface.
5. WHEN a raw internal ID must be shown for support/traceability THEN the system SHALL present it through an intentional, labeled UI element rather than as a leaked placeholder.
6. WHEN debug UI removal is complete THEN the Driver app SHALL retain all production workflows without behavioral regression.

---

### Requirement 3: Identify, Document, and Quarantine Legacy Dashboards

**User Story:** As a developer preparing for the redesign, I want the production dashboard path clearly identified and legacy implementations marked, so that the team knows what to build on and what to migrate away from.

#### Acceptance Criteria

1. WHEN the dashboard implementations (`DriverDashboard`, `DriverDashboardNew`, `RideDashboard`, `DriverApp`) are analyzed THEN the system SHALL document which one is the active production path and which are legacy/obsolete.
2. WHEN a component is determined to be obsolete THEN the system SHALL add a clear deprecation comment at the top of the file describing its status and the intended replacement.
3. WHEN legacy components are identified THEN the system SHALL NOT delete their files during this mission.
4. WHERE an import of a legacy component is provably unreachable AND removing it is safe, the system SHALL remove that unreachable import.
5. WHEN quarantine is complete THEN the system SHALL document the migration strategy (what replaces what, and in which mission) in the modernization plan.
6. WHEN determining the production path THEN the analysis SHALL be based on actual routing/entry points in the Driver app, not assumptions.

---

### Requirement 4: Centralize Duplicated Styling Values

**User Story:** As a developer, I want shared style values in one place, so that the upcoming design system can be introduced consistently without hunting through scattered literals.

#### Acceptance Criteria

1. WHEN duplicated style values (colors, border radius, padding, margin, typography, shadows) are found across Driver components THEN the system SHALL move shared values into centralized style constants.
2. WHEN a value is centralized THEN consuming components SHALL reference the constant instead of the inline literal.
3. WHEN styling is standardized THEN the system SHALL NOT change the rendered visual appearance of any screen (consistency only, no redesign).
4. WHERE two nearly-identical values exist due to drift (e.g., `padding: 11px` vs `12px`), the system SHALL consolidate them to a single agreed value only if the visual difference is negligible; otherwise it SHALL preserve them and note the discrepancy.
5. WHEN centralization is complete THEN the constants SHALL be organized so they are ready to map onto the Mission 3 design tokens.
6. WHEN the refactor is complete THEN no unused style constants SHALL be exported without reference (or they SHALL be clearly marked as reserved for Mission 3).

---

### Requirement 5: Reusable App-State Components

**User Story:** As a developer, I want reusable Loading, Empty, Error, Offline, and No-Data components, so that future screens present consistent states without reimplementing them.

#### Acceptance Criteria

1. WHEN the foundation work is complete THEN the system SHALL provide reusable components for the states: Loading, Empty, Error, Offline, and No Data.
2. WHEN these components are created THEN each SHALL accept props for customization (e.g., message, optional action/retry callback) with sensible defaults.
3. WHEN these components are created THEN the system SHALL NOT apply them across existing screens in this mission (build only).
4. WHEN these components render THEN they SHALL be accessible (appropriate roles such as `status`/`alert`, and text alternatives for icons).
5. WHERE existing screens already implement ad-hoc state UI THEN the system SHALL leave them unchanged, documenting them as future migration targets.
6. WHEN the components are created THEN they SHALL live in a discoverable shared location within the Driver frontend.

---

### Requirement 6: Documentation

**User Story:** As a team member, I want the modernization plan updated, so that completed work, remaining issues, and migration notes are recorded in one authoritative document.

#### Acceptance Criteria

1. WHEN the mission work is complete THEN the system SHALL update `docs/design/YALA_DRIVER_MODERNIZATION_PLAN.md`.
2. WHEN the plan is updated THEN it SHALL record: completed fixes, remaining issues, legacy components, and migration notes.
3. IF the plan file does not exist THEN the system SHALL create it with the required sections.
4. WHEN the plan is updated THEN it SHALL clearly state the production dashboard path and the deprecation status of each legacy dashboard.
5. WHEN the plan is updated THEN it SHALL note readiness for Mission 3 (YALA Design System).

---

### Requirement 7: Verification and No-Regression Guarantee

**User Story:** As a maintainer, I want lint, type checks, and the Driver build to pass with no backend/API/routing changes, so that I can trust the foundation is stable.

#### Acceptance Criteria

1. WHEN the changes are complete THEN linting SHALL pass for the Driver frontend.
2. WHEN the changes are complete THEN type checks (if configured) SHALL pass.
3. WHEN the changes are complete THEN the Driver build SHALL succeed.
4. WHEN the changes are complete THEN no backend files SHALL have been modified.
5. WHEN the changes are complete THEN no API contracts SHALL have changed.
6. WHEN the changes are complete THEN no routing/navigation destinations SHALL have changed.
7. WHEN the existing Driver test suite is run THEN it SHALL pass with no regressions in the Driver workflow.
