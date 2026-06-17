# Bugfix Requirements Document

## Introduction

When users open the Yala Driver App or Yala Rider App and register a new account, they are presented with a choice between "Rider" and "Driver" user types. This is confusing and incorrect because users have already chosen the correct application — the Driver App should only create Driver accounts and the Rider App should only create Rider accounts. The registration endpoint currently accepts `user_type` as a client-provided field without verifying which app is making the request, allowing either app to create either account type.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN a user registers from the Yala Driver App THEN the system presents both "Rider" and "Driver" options and allows the user to register as a Rider

1.2 WHEN a user registers from the Yala Rider App THEN the system presents both "Rider" and "Driver" options and allows the user to register as a Driver

1.3 WHEN a registration request is submitted THEN the system accepts any `user_type` value ("rider" or "driver") regardless of which app (Driver or Rider) is making the request

1.4 WHEN a user registers from the Yala Driver App and selects "Rider" THEN the system creates a Rider account without creating a DriverProfile, resulting in the wrong account type for that app

### Expected Behavior (Correct)

2.1 WHEN a user registers from the Yala Driver App THEN the system SHALL automatically set `user_type = "driver"` and create a DriverProfile without presenting a Rider/Driver choice

2.2 WHEN a user registers from the Yala Rider App THEN the system SHALL automatically set `user_type = "rider"` without presenting a Rider/Driver choice

2.3 WHEN a registration request from the Yala Driver App contains `user_type = "rider"` THEN the system SHALL reject the request or override the value to "driver"

2.4 WHEN a registration request from the Yala Rider App contains `user_type = "driver"` THEN the system SHALL reject the request or override the value to "rider"

2.5 WHEN a user registers from the Yala Driver App THEN the system SHALL display only Driver-specific registration fields (vehicle info, document upload)

2.6 WHEN a user registers from the Yala Rider App THEN the system SHALL display only Rider-specific registration fields (profile photo, national ID)

### Unchanged Behavior (Regression Prevention)

3.1 WHEN a user registers from the Yala Driver App with `user_type = "driver"` THEN the system SHALL CONTINUE TO create a Driver account with a pending DriverProfile

3.2 WHEN a user registers from the Yala Rider App with `user_type = "rider"` THEN the system SHALL CONTINUE TO create a Rider account with `rider_status = "pending"`

3.3 WHEN a user submits registration with an already-used email THEN the system SHALL CONTINUE TO reject the request with a duplicate email error

3.4 WHEN a user submits registration with an already-used phone number THEN the system SHALL CONTINUE TO reject the request with a duplicate phone error

3.5 WHEN a Driver registration is created THEN the system SHALL CONTINUE TO create a DriverProfile with status "pending" and temporary vehicle placeholders

3.6 WHEN a Rider registration is created THEN the system SHALL CONTINUE TO require profile_picture and national_id_document

3.7 WHEN a user attempts to change their account type during registration THEN the system SHALL CONTINUE TO prevent this (the type is determined by the app)
