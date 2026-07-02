# Requirements Document

## Introduction

This document specifies requirements for improving the Yala Delivery courier registration onboarding flow. The goal is to provide a clean, Uber-style step-by-step experience where couriers are auto-redirected to the Delivery Profile Setup page after account creation, and only see form fields and document upload requirements that match their selected courier type (Bicycle, Motorcycle, or Vehicle/Car). Bicycle couriers must never be forced to provide vehicle or car information.

## Glossary

- **Onboarding_System**: The backend and frontend components that manage courier registration, profile setup, and application submission in the Yala Delivery app.
- **Courier**: A user who registers to deliver packages via the Yala Delivery platform.
- **Delivery_Profile_Setup**: The multi-step wizard page where couriers complete their profile after account creation (route: `/delivery/profile-setup`).
- **Courier_Type**: One of three delivery modes a courier selects: Bicycle, Motorcycle, or Vehicle/Car.
- **Bicycle_Courier**: A courier who selects the Bicycle delivery type.
- **Motor_Vehicle_Courier**: A courier who selects Motorcycle or Vehicle/Car delivery type.
- **Onboarding_Wizard**: The step-by-step UI component that guides couriers through profile setup (type selection, personal info, vehicle info, documents, submission).
- **Admin**: A Yala platform administrator who reviews and approves courier applications.

## Requirements

### Requirement 1: Auto-redirect After Account Creation

**User Story:** As a courier, I want to be automatically redirected to the Delivery Profile Setup page after creating my account, so that I can complete my onboarding without extra navigation.

#### Acceptance Criteria

1. WHEN a Courier successfully creates a delivery courier account, THE Onboarding_System SHALL redirect the Courier to the Delivery_Profile_Setup page automatically.
2. WHEN an unauthenticated user accesses the Delivery_Profile_Setup page, THE Onboarding_System SHALL redirect the user to the login page with a return path to Delivery_Profile_Setup.
3. THE Onboarding_System SHALL pass the return path `/delivery/profile-setup` as the `next` parameter during courier account registration.

### Requirement 2: Courier Type Selection

**User Story:** As a courier, I want to select my delivery type (Bicycle, Motorcycle, or Vehicle/Car) as the first step, so that the system only shows me relevant fields and documents.

#### Acceptance Criteria

1. WHEN the Courier opens the Delivery_Profile_Setup page, THE Onboarding_Wizard SHALL display the Courier_Type selection as Step 1.
2. THE Onboarding_Wizard SHALL present exactly three Courier_Type options: Bicycle, Motorcycle, and Vehicle/Car.
3. WHEN the Courier selects a Courier_Type, THE Onboarding_System SHALL persist the selection to the server before advancing to the next step.
4. WHEN the Courier has not selected a Courier_Type, THE Onboarding_Wizard SHALL disable the Continue button.

### Requirement 3: Conditional Step Display Based on Courier Type

**User Story:** As a courier, I want the onboarding wizard to show or hide the vehicle step based on my courier type, so that bicycle couriers are not forced to provide vehicle information.

#### Acceptance Criteria

1. WHEN a Bicycle_Courier completes the personal information step, THE Onboarding_Wizard SHALL skip the vehicle information step and advance directly to the documents step.
2. WHEN a Motor_Vehicle_Courier completes the personal information step, THE Onboarding_Wizard SHALL display the vehicle information step before the documents step.
3. THE Onboarding_Wizard SHALL display the step indicator without the vehicle step for Bicycle_Courier profiles.
4. WHEN the Courier navigates back from the documents step as a Bicycle_Courier, THE Onboarding_Wizard SHALL return to the personal information step.

### Requirement 4: Personal Information Collection

**User Story:** As a courier, I want to provide my personal details during onboarding, so that the platform can identify me and contact me.

#### Acceptance Criteria

1. THE Onboarding_Wizard SHALL collect the following fields in the personal information step: full name (first name, last name), phone number, and city.
2. WHEN the Courier_Type is Bicycle, THE Onboarding_Wizard SHALL require a profile photo in the personal information step.
3. WHEN the Courier_Type is Motorcycle or Vehicle/Car, THE Onboarding_Wizard SHALL display the profile photo field as optional in the personal information step.
4. IF any required personal information field is empty, THEN THE Onboarding_System SHALL display a validation error and prevent advancement to the next step.

### Requirement 5: Vehicle Information Collection for Motor Vehicle Couriers

**User Story:** As a motorcycle or vehicle courier, I want to provide my vehicle details during onboarding, so that customers can identify my vehicle at pickup.

#### Acceptance Criteria

1. WHEN the Courier_Type is Motorcycle, THE Onboarding_Wizard SHALL collect: motorcycle make, motorcycle model, motorcycle color, and plate number.
2. WHEN the Courier_Type is Vehicle/Car, THE Onboarding_Wizard SHALL collect: vehicle make, vehicle model, vehicle color, and plate number.
3. THE Onboarding_Wizard SHALL label fields using the courier type name (e.g., "Motorcycle make" for motorcycle couriers, "Vehicle make" for car couriers).
4. IF any required vehicle information field is empty, THEN THE Onboarding_System SHALL display a validation error and prevent advancement to the next step.
5. WHEN the Courier_Type is Bicycle, THE Onboarding_System SHALL mark the vehicle information step as complete without requiring any vehicle data.

### Requirement 6: Conditional Document Upload Requirements

**User Story:** As a courier, I want to upload only the documents required for my courier type, so that bicycle couriers are not forced to upload vehicle-related documents.

#### Acceptance Criteria

1. WHEN the Courier_Type is Bicycle, THE Onboarding_Wizard SHALL require only a National ID document.
2. WHEN the Courier_Type is Motorcycle, THE Onboarding_Wizard SHALL require: National ID, driver license, motorcycle registration (carte grise), and insurance.
3. WHEN the Courier_Type is Vehicle/Car, THE Onboarding_Wizard SHALL require: National ID, driver license, vehicle registration (carte grise), and insurance.
4. THE Onboarding_Wizard SHALL display upload status for each required document (not uploaded, uploaded, or rejected).
5. WHEN all required documents for the selected Courier_Type are uploaded, THE Onboarding_Wizard SHALL enable advancement to the submission step.
6. IF any required document is missing or rejected, THEN THE Onboarding_Wizard SHALL disable advancement to the submission step and display which documents are missing.

### Requirement 7: Application Submission and Pending Review Status

**User Story:** As a courier, I want to submit my completed profile for admin approval, so that I know my application is being reviewed.

#### Acceptance Criteria

1. WHEN the Courier submits the application, THE Onboarding_System SHALL set the courier profile status to `pending_review`.
2. WHEN the Courier submits the application, THE Onboarding_System SHALL display a confirmation message indicating the application is under review.
3. WHILE the courier profile status is `pending_review`, THE Onboarding_System SHALL prevent the Courier from going online to accept deliveries.
4. WHEN the Admin approves the courier application, THE Onboarding_System SHALL allow the Courier to go online.
5. THE Onboarding_Wizard SHALL require acceptance of courier terms and conditions before enabling the submit button.

### Requirement 8: Uber-Style Wizard UI

**User Story:** As a courier, I want a clean, modern step-by-step onboarding experience, so that the registration process feels intuitive and professional.

#### Acceptance Criteria

1. THE Onboarding_Wizard SHALL display a progress indicator showing the current step and total steps.
2. THE Onboarding_Wizard SHALL display one step at a time with a Continue button to advance and a Back button to return to the previous step.
3. THE Onboarding_Wizard SHALL calculate the progress percentage based on the number of visible steps for the selected Courier_Type.
4. WHEN the Courier returns to the Delivery_Profile_Setup page after a partial completion, THE Onboarding_Wizard SHALL resume at the first incomplete step.
5. THE Onboarding_Wizard SHALL use the Delivery Uber UI layout and styling when the Uber UI mode is active.

### Requirement 9: Separation from Yala Driver

**User Story:** As a platform architect, I want the courier onboarding flow to remain separate from the Yala Driver taxi flow, so that each product has independent registration paths.

#### Acceptance Criteria

1. THE Onboarding_System SHALL use delivery-specific API endpoints (under `/deliveries/courier/`) for all courier profile setup operations.
2. THE Onboarding_System SHALL store courier type selection in the DriverDeliverySettings model separately from taxi driver settings.
3. THE Onboarding_System SHALL use delivery-specific document context when querying courier documents.
