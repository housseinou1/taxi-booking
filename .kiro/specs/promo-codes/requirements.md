# Requirements Document

## Introduction

This document defines the requirements for the Promo Codes feature in the Yala taxi booking application. The feature enables administrators to create and manage promotional discount codes that riders can apply when requesting rides. Discount types include percentage-based, fixed-amount, and free-ride promotions. The system also supports referral codes where riders share codes with others and both parties receive a discount.

## Glossary

- **Promo_Code_Service**: The backend service responsible for creating, validating, applying, and tracking promotional codes
- **Admin_Panel**: The administrative interface used by Yala staff to manage promo codes and view analytics
- **Rider_App**: The rider-facing frontend application where riders enter and apply promo codes
- **Promo_Code**: A unique alphanumeric string that riders enter to receive a fare discount
- **Referral_Code**: A unique code assigned to each rider that can be shared; when a new rider uses it, both the referrer and the referee receive a discount
- **Discount_Amount**: The calculated monetary value subtracted from the original fare after applying a promo code
- **Original_Fare**: The fare calculated for a ride before any promo code discount is applied
- **Final_Fare**: The fare amount charged to the rider after the Discount_Amount is subtracted from the Original_Fare
- **Usage_Record**: A database entry tracking each instance of a Promo_Code being redeemed by a rider
- **First_Ride**: The first completed ride by a rider in the system (rider has zero completed rides prior)

## Requirements

### Requirement 1: Admin Creates Promo Codes

**User Story:** As an admin, I want to create promo codes with configurable parameters, so that I can run targeted promotions for riders.

#### Acceptance Criteria

1. WHEN an admin submits a promo code creation request with a code string, discount type, discount value, start date, and end date, THE Promo_Code_Service SHALL create the Promo_Code and return a confirmation with the code details
2. THE Promo_Code_Service SHALL support three discount types: percentage off, fixed amount off, and free ride
3. WHEN the discount type is "percentage off", THE Promo_Code_Service SHALL require a discount value between 1 and 100 inclusive
4. WHEN the discount type is "fixed amount off", THE Promo_Code_Service SHALL require a positive discount value expressed in MRU
5. WHEN the discount type is "free ride", THE Promo_Code_Service SHALL set the Discount_Amount equal to the Original_Fare
6. THE Promo_Code_Service SHALL enforce that each Promo_Code string is unique and case-insensitive
7. IF a promo code creation request contains a duplicate code string, THEN THE Promo_Code_Service SHALL reject the request with a descriptive error message

### Requirement 2: Admin Configures Usage Limits

**User Story:** As an admin, I want to set usage limits on promo codes, so that I can control promotional spending.

#### Acceptance Criteria

1. WHEN creating or editing a Promo_Code, THE Admin_Panel SHALL allow setting a maximum total redemption count (total uses across all riders)
2. WHEN creating or editing a Promo_Code, THE Admin_Panel SHALL allow setting a maximum per-rider redemption count
3. WHEN creating or editing a Promo_Code, THE Admin_Panel SHALL allow setting a minimum fare requirement in MRU
4. WHEN creating or editing a Promo_Code, THE Admin_Panel SHALL allow restricting the code to first-ride-only usage
5. WHERE a maximum total redemption count is configured, THE Promo_Code_Service SHALL reject redemption attempts after the total count is reached
6. WHERE a maximum per-rider redemption count is configured, THE Promo_Code_Service SHALL reject redemption attempts by a rider who has reached the per-rider limit

### Requirement 3: Admin Edits and Deactivates Promo Codes

**User Story:** As an admin, I want to edit and deactivate promo codes, so that I can adjust promotions or stop them early.

#### Acceptance Criteria

1. WHEN an admin submits an edit request for an existing Promo_Code, THE Promo_Code_Service SHALL update the specified fields and return the updated code details
2. WHEN an admin deactivates a Promo_Code, THE Promo_Code_Service SHALL mark the code as inactive and prevent future redemptions
3. WHILE a Promo_Code is inactive, THE Promo_Code_Service SHALL always reject all redemption attempts for that code with a message indicating the code is no longer valid, regardless of system conditions
4. THE Promo_Code_Service SHALL preserve all existing Usage_Records when a Promo_Code is edited or deactivated

### Requirement 4: Rider Applies Promo Code

**User Story:** As a rider, I want to enter a promo code before requesting a ride, so that I can receive a fare discount.

#### Acceptance Criteria

1. WHEN a rider enters a Promo_Code in the Rider_App before requesting a ride, THE Promo_Code_Service SHALL validate the code and return the expected Discount_Amount based on the estimated fare; IF the code is invalid, THEN the returned Discount_Amount SHALL be zero
2. WHEN a Promo_Code is valid, THE Rider_App SHALL display the Discount_Amount and the Final_Fare to the rider before ride confirmation
3. IF the entered Promo_Code is invalid, expired, or has reached its usage limit, THEN THE Promo_Code_Service SHALL return a specific error message indicating the reason for rejection
4. WHEN a rider confirms a ride with a valid Promo_Code applied, THE Promo_Code_Service SHALL create a Usage_Record linking the rider, the code, and the ride
5. IF the Original_Fare is below the minimum fare requirement of the Promo_Code, THEN THE Promo_Code_Service SHALL reject the code with a message stating the minimum fare is not met

### Requirement 5: Promo Code Expiration

**User Story:** As an admin, I want promo codes to expire automatically, so that promotions run for a defined period only.

#### Acceptance Criteria

1. THE Promo_Code_Service SHALL store a start date and an end date for each Promo_Code
2. WHILE the current date-time is before the start date of a Promo_Code, THE Promo_Code_Service SHALL reject redemption attempts with a message indicating the code is not yet active
3. WHILE the current date-time is after the end date of a Promo_Code, THE Promo_Code_Service SHALL reject redemption attempts with a message indicating the code has expired
4. WHEN an admin queries the list of Promo_Codes, THE Admin_Panel SHALL display the expiration status (active, scheduled, expired) for each code

### Requirement 6: First-Ride-Only Codes

**User Story:** As an admin, I want to create codes restricted to first-time riders, so that I can incentivize new user acquisition.

#### Acceptance Criteria

1. WHERE a Promo_Code is marked as first-ride-only, THE Promo_Code_Service SHALL allow redemption only by riders who have zero completed rides in the system
2. IF a rider with one or more completed rides attempts to redeem a first-ride-only Promo_Code, THEN THE Promo_Code_Service SHALL reject the attempt with a message indicating the code is valid for first rides only; this message SHALL also be shown to eligible first-time riders when their redemption is rejected for other reasons (e.g., expired code, usage limit reached)
3. WHEN a first-ride-only Promo_Code is successfully applied and the ride completes, THE Promo_Code_Service SHALL record the Usage_Record with a first-ride flag; IF the Usage_Record creation fails due to a system error, THEN the ride completion SHALL still proceed normally

### Requirement 7: Referral Codes

**User Story:** As a rider, I want to share my referral code with friends, so that both of us receive a discount when they take their first ride.

#### Acceptance Criteria

1. WHEN a rider account is created, THE Promo_Code_Service SHALL generate a unique Referral_Code for that rider
2. THE Rider_App SHALL display the rider's Referral_Code on a dedicated sharing screen
3. WHEN a new rider enters a Referral_Code during sign-up or before their first ride, THE Promo_Code_Service SHALL validate that the code belongs to an active rider and is not the new rider's own code
4. WHEN a referred rider completes their first ride with the Referral_Code applied, THE Promo_Code_Service SHALL credit the configured discount to both the referrer and the referee
5. THE Promo_Code_Service SHALL credit the referee discount as a reduction on the first ride fare
6. THE Promo_Code_Service SHALL credit the referrer discount as a stored credit applicable to the referrer's next ride
7. IF a rider attempts to use their own Referral_Code, THEN THE Promo_Code_Service SHALL reject the attempt with a descriptive error message

### Requirement 8: Discount Calculation and Payment Integration

**User Story:** As a rider, I want the discount applied before payment is captured, so that I am only charged the discounted fare.

#### Acceptance Criteria

1. WHEN a ride with an applied Promo_Code is completed, THE Promo_Code_Service SHALL calculate the Discount_Amount based on the final actual fare
2. WHEN the discount type is "percentage off", THE Promo_Code_Service SHALL calculate the Discount_Amount as the percentage of the Original_Fare rounded to two decimal places
3. WHEN the discount type is "fixed amount off" and the fixed amount exceeds the Original_Fare, THE Promo_Code_Service SHALL cap the Discount_Amount at the Original_Fare so that the Final_Fare is zero
4. THE Promo_Code_Service SHALL compute the Final_Fare as Original_Fare minus Discount_Amount
5. WHEN payment is authorized for a discounted ride, THE Promo_Code_Service SHALL pass the Final_Fare to the payment authorization step instead of the Original_Fare
6. THE Promo_Code_Service SHALL record the Discount_Amount in the Payment record for audit purposes
7. THE Promo_Code_Service SHALL ensure the driver_earning is calculated based on the Original_Fare, not the Final_Fare

### Requirement 9: Admin Analytics on Code Usage

**User Story:** As an admin, I want to view analytics on promo code usage, so that I can measure the effectiveness of promotions.

#### Acceptance Criteria

1. WHEN an admin requests analytics for a specific Promo_Code, THE Admin_Panel SHALL display the total number of redemptions, total discount amount given, and number of unique riders who used the code
2. WHEN an admin requests the promo code list, THE Admin_Panel SHALL display each code with its current redemption count relative to the maximum total redemption count
3. THE Admin_Panel SHALL allow filtering promo codes by status (active, inactive, expired, scheduled), discount type, and date range
4. WHEN an admin requests overall promo analytics, THE Admin_Panel SHALL display the total promotional spend across all codes for a selected date range

### Requirement 10: Promo Code Validation Rules

**User Story:** As a system operator, I want comprehensive validation on promo codes, so that invalid or conflicting configurations are prevented.

#### Acceptance Criteria

1. IF a Promo_Code creation request has an end date earlier than or equal to the start date, THEN THE Promo_Code_Service SHALL reject the request with a validation error
2. IF a Promo_Code creation request has a percentage discount value outside the range of 1 to 100, THEN THE Promo_Code_Service SHALL reject the request with a validation error
3. IF a Promo_Code creation request has a negative or zero fixed discount value, THEN THE Promo_Code_Service SHALL reject the request with a validation error
4. THE Promo_Code_Service SHALL accept code strings containing only alphanumeric characters, hyphens, and underscores with a length between 3 and 30 characters
5. IF a Promo_Code creation request contains characters outside the allowed set or violates the length constraint, THEN THE Promo_Code_Service SHALL reject the request with a validation error
