# Tasks

## Task 1: Backend - Add redirect_to field in registration response for delivery app

- [ ] 1.1 In `RegisterView` or `RegisterSerializer`, detect when the request header `X-App-Type` is `delivery`
- [ ] 1.2 Add `redirect_to: "/delivery/profile-setup"` to the registration success response for delivery app registrations
- [ ] 1.3 Verify existing non-delivery registrations are not affected (no redirect_to field added)

## Task 2: Backend - Add wizard_steps field to onboarding state

- [ ] 2.1 In `build_courier_onboarding_state()`, add a `wizard_steps` field that returns only the 5 wizard-relevant steps (courier_type, profile, vehicle, documents, approval)
- [ ] 2.2 Add a `visible` boolean to the vehicle step that is `False` for bicycle couriers
- [ ] 2.3 Ensure the `wizard_steps` respects bicycle courier logic (vehicle step marked complete and not visible)

## Task 3: Frontend - Auto-redirect after courier account creation

- [ ] 3.1 In the delivery app registration flow, read the `redirect_to` field from the registration API response
- [ ] 3.2 Navigate to the `redirect_to` path (or fallback to `/delivery/profile-setup`) immediately after successful account creation
- [ ] 3.3 Ensure the `next` query parameter is passed as `/delivery/profile-setup` in the registration link from the onboarding dashboard

## Task 4: Frontend - Refine DeliveryCourierProfileSetup wizard

- [ ] 4.1 Verify step labels match the spec: "Courier type", "Personal info", "Vehicle", "Documents", "Submit"
- [ ] 4.2 Ensure bicycle couriers see only 4 steps (vehicle step hidden from progress indicator and navigation)
- [ ] 4.3 Verify the resume-at-incomplete-step logic resumes at the correct first incomplete step on page load
- [ ] 4.4 Ensure the Back button from documents step returns to personal info for bicycle couriers
- [ ] 4.5 Verify the Continue button is disabled when courier type is not selected (step 1), when required fields are empty (step 2/3), or when documents are incomplete (step 4)

## Task 5: Frontend - Conditional field display per courier type

- [ ] 5.1 Verify personal info step requires profile photo for bicycle couriers and marks it optional for motorcycle/car
- [ ] 5.2 Verify vehicle step shows "Motorcycle make/model/color" labels for motorcycle couriers
- [ ] 5.3 Verify vehicle step shows "Vehicle make/model/color" labels for car couriers
- [ ] 5.4 Verify document upload step shows only National ID for bicycle couriers
- [ ] 5.5 Verify document upload step shows National ID, Driver License, Carte Grise, Insurance for motorcycle/car couriers

## Task 6: Frontend - Uber-style UI consistency

- [ ] 6.1 Ensure the wizard uses `DeliveryUberPage` layout with progress bar when Uber UI mode is active
- [ ] 6.2 Verify the progress percentage calculates correctly based on visible steps (4 for bicycle, 5 for motor vehicle)
- [ ] 6.3 Ensure consistent card-based styling (`.delivery-uber-card`) for all step content
- [ ] 6.4 Verify the step indicator highlights the current step and marks completed steps

## Task 7: Backend - Verify bicycle courier exemptions

- [ ] 7.1 Confirm `_vehicle_info_complete()` returns `True` for bicycle couriers without any vehicle data
- [ ] 7.2 Confirm `courier_vehicle_setup` view clears vehicle fields when `delivery_vehicle_type` is bicycle
- [ ] 7.3 Confirm `get_required_courier_document_types("bicycle")` returns only `["national_id"]`
- [ ] 7.4 Confirm `courier_profile_setup_submit` does not reject bicycle couriers for missing vehicle data

## Task 8: End-to-end flow validation

- [ ] 8.1 Test complete bicycle courier flow: register → auto-redirect → type selection → personal info → documents (national ID only) → submit → status is pending_review
- [ ] 8.2 Test complete motorcycle courier flow: register → auto-redirect → type selection → personal info → vehicle info → documents (4 docs) → submit → status is pending_review
- [ ] 8.3 Test complete vehicle/car courier flow: register → auto-redirect → type selection → personal info → vehicle info → documents (4 docs) → submit → status is pending_review
- [ ] 8.4 Verify courier cannot go online while status is pending_review
- [ ] 8.5 Verify courier can go online after admin approval
