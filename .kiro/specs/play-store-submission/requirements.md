# Requirements Document

## Introduction

This specification covers the complete Google Play Store submission process for both Yala Rider and Yala Driver apps. The scope includes finalizing store listing content in English and French, preparing all required visual assets at correct dimensions, verifying legal/compliance pages are live, completing the data safety form, and organizing release notes. The target market is Mauritania (Nouakchott primary, nationwide coverage) with French as the primary store language and English as secondary.

## Glossary

- **Play_Console**: The Google Play Console where developers manage app listings, releases, and compliance
- **Store_Listing**: The public-facing app page on Google Play including descriptions, screenshots, and metadata
- **Feature_Graphic**: A 1024×500 promotional banner displayed at the top of a Play Store listing
- **Data_Safety_Form**: Google Play's required declaration of what data an app collects, shares, and how it is secured
- **Compliance_Site**: The static website at yalataxi.live hosting the Privacy Policy and Account Deletion pages
- **Asset_Pipeline**: The process of converting SVG source files into production-ready PNG images at required dimensions
- **Rider_App**: The Yala Rider mobile application (com.yala.rider) used by passengers to book rides
- **Driver_App**: The Yala Driver mobile application (com.yala.driver) used by drivers to accept and fulfill rides
- **Short_Description**: A max 80-character summary shown in Play Store search results
- **Full_Description**: A max 4000-character detailed description shown on the app's Play Store page
- **Release_Notes**: A max 500-character summary of changes shown to users when updating the app

## Requirements

### Requirement 1: Rider App Store Listing Content

**User Story:** As a product owner, I want a complete and localized Rider App store listing, so that Mauritanian users can understand and discover the app on Google Play in their preferred language.

#### Acceptance Criteria

1. THE Store_Listing SHALL include a Short_Description of 80 characters or fewer in English
2. THE Store_Listing SHALL include a Short_Description of 80 characters or fewer in French
3. THE Store_Listing SHALL include a Full_Description of 4000 characters or fewer in English
4. THE Store_Listing SHALL include a Full_Description of 4000 characters or fewer in French
5. THE Store_Listing SHALL specify the category as "Travel & Local" on Google Play
6. THE Store_Listing SHALL include a contact email address for rider support
7. THE Store_Listing SHALL include the Privacy Policy URL pointing to yalataxi.live/privacy-policy
8. THE Store_Listing SHALL include relevant tags for discoverability including "ride hailing", "taxi", "transport", and "Mauritania"

### Requirement 2: Driver App Store Listing Content

**User Story:** As a product owner, I want a complete and localized Driver App store listing, so that Mauritanian drivers can discover and understand the platform on Google Play.

#### Acceptance Criteria

1. THE Store_Listing SHALL include a Short_Description of 80 characters or fewer in English
2. THE Store_Listing SHALL include a Short_Description of 80 characters or fewer in French
3. THE Store_Listing SHALL include a Full_Description of 4000 characters or fewer in English
4. THE Store_Listing SHALL include a Full_Description of 4000 characters or fewer in French
5. THE Store_Listing SHALL specify the category as "Business" on Google Play
6. THE Store_Listing SHALL include a contact email address for driver support
7. THE Store_Listing SHALL include the Privacy Policy URL pointing to yalataxi.live/privacy-policy
8. THE Store_Listing SHALL include relevant tags for discoverability including "driver", "earn money", "taxi driver", and "Mauritania"

### Requirement 3: Visual Assets — Phone Screenshots

**User Story:** As a product owner, I want phone-sized screenshots for both apps, so that Google Play displays compelling previews of each app's interface.

#### Acceptance Criteria

1. THE Asset_Pipeline SHALL produce phone screenshots at 1080×1920 pixels in PNG format for the Rider_App
2. THE Asset_Pipeline SHALL produce phone screenshots at 1080×1920 pixels in PNG format for the Driver_App
3. THE Rider_App SHALL have a minimum of 4 phone screenshots covering booking, tracking, safety, and delivery features
4. THE Driver_App SHALL have a minimum of 4 phone screenshots covering the earnings dashboard, ride workflow, delivery mode, and level system
5. WHEN a phone screenshot is generated, THE Asset_Pipeline SHALL produce a file no larger than 8 MB

### Requirement 4: Visual Assets — Tablet Screenshots

**User Story:** As a product owner, I want tablet-sized screenshots for both apps, so that the listing meets Google Play requirements for tablet-compatible apps.

#### Acceptance Criteria

1. THE Asset_Pipeline SHALL produce 7-inch tablet screenshots at 1024×600 pixels minimum in PNG format for the Rider_App
2. THE Asset_Pipeline SHALL produce 10-inch tablet screenshots at 1920×1200 pixels minimum in PNG format for the Rider_App
3. THE Asset_Pipeline SHALL produce 7-inch tablet screenshots at 1024×600 pixels minimum in PNG format for the Driver_App
4. THE Asset_Pipeline SHALL produce 10-inch tablet screenshots at 1920×1200 pixels minimum in PNG format for the Driver_App
5. WHEN a tablet screenshot is generated, THE Asset_Pipeline SHALL produce a file no larger than 8 MB

### Requirement 5: Visual Assets — Feature Graphic and Icon

**User Story:** As a product owner, I want a Feature Graphic and high-resolution app icon for each app, so that the store listing has the mandatory promotional imagery.

#### Acceptance Criteria

1. THE Asset_Pipeline SHALL produce a Feature_Graphic at exactly 1024×500 pixels in PNG format for the Rider_App
2. THE Asset_Pipeline SHALL produce a Feature_Graphic at exactly 1024×500 pixels in PNG format for the Driver_App
3. THE Asset_Pipeline SHALL produce an app icon at exactly 512×512 pixels in PNG format with no alpha channel for the Rider_App
4. THE Asset_Pipeline SHALL produce an app icon at exactly 512×512 pixels in PNG format with no alpha channel for the Driver_App
5. THE Rider_App Feature_Graphic SHALL use the green brand color (#00A651) and include the app name
6. THE Driver_App Feature_Graphic SHALL use the gold brand color (#D4AF37) on dark navy (#0B1220) and include the app name

### Requirement 6: Privacy Policy Verification

**User Story:** As a product owner, I want to verify the Privacy Policy page is live and accessible, so that Google Play review does not reject the submission for missing legal compliance.

#### Acceptance Criteria

1. WHEN a reviewer accesses yalataxi.live/privacy-policy, THE Compliance_Site SHALL return an HTTP 200 response with the Privacy Policy content
2. THE Compliance_Site Privacy Policy page SHALL state the effective date of the policy
3. THE Compliance_Site Privacy Policy page SHALL list the types of data collected by the app
4. THE Compliance_Site Privacy Policy page SHALL describe how user data is used and shared
5. THE Compliance_Site Privacy Policy page SHALL describe data retention periods
6. THE Compliance_Site Privacy Policy page SHALL provide a contact email for privacy requests

### Requirement 7: Account Deletion Page Verification

**User Story:** As a product owner, I want to verify the Account Deletion page is live and accessible, so that Google Play review confirms users can request data deletion as required by policy.

#### Acceptance Criteria

1. WHEN a reviewer accesses yalataxi.live/account-deletion, THE Compliance_Site SHALL return an HTTP 200 response with the Account Deletion content
2. THE Compliance_Site Account Deletion page SHALL describe the process for requesting account deletion
3. THE Compliance_Site Account Deletion page SHALL state the timeframe for completing a deletion request
4. THE Compliance_Site Account Deletion page SHALL provide at least one method to submit a deletion request (email or in-app)

### Requirement 8: Data Safety Form Content

**User Story:** As a product owner, I want prepared answers for the Google Play Data Safety form, so that the submission accurately declares data collection and handling practices.

#### Acceptance Criteria

1. THE Data_Safety_Form content SHALL declare all categories of personal data collected by the Rider_App (location, contacts, personal identifiers, financial information)
2. THE Data_Safety_Form content SHALL declare all categories of personal data collected by the Driver_App (location, contacts, personal identifiers, financial information, files/documents)
3. THE Data_Safety_Form content SHALL state whether data is encrypted in transit
4. THE Data_Safety_Form content SHALL state whether users can request data deletion
5. THE Data_Safety_Form content SHALL declare whether data is shared with third parties and identify those parties
6. THE Data_Safety_Form content SHALL state the purpose for each type of data collected (app functionality, analytics, fraud prevention, account management)

### Requirement 9: French Localization of Store Listings

**User Story:** As a product owner, I want all store listing content professionally translated to French, so that the primary Mauritanian audience can read the listing in their preferred language.

#### Acceptance Criteria

1. THE Store_Listing SHALL provide a French translation of the Rider_App Short_Description that does not exceed 80 characters
2. THE Store_Listing SHALL provide a French translation of the Rider_App Full_Description that does not exceed 4000 characters
3. THE Store_Listing SHALL provide a French translation of the Driver_App Short_Description that does not exceed 80 characters
4. THE Store_Listing SHALL provide a French translation of the Driver_App Full_Description that does not exceed 4000 characters
5. THE Store_Listing French translations SHALL use terminology consistent with Mauritanian French usage
6. THE Store_Listing SHALL provide French Release_Notes that do not exceed 500 characters

### Requirement 10: Release Notes

**User Story:** As a product owner, I want release notes in English and French for the initial submission, so that users see a professional changelog on the store listing.

#### Acceptance Criteria

1. THE Release_Notes SHALL be 500 characters or fewer in English
2. THE Release_Notes SHALL be 500 characters or fewer in French
3. THE Release_Notes SHALL summarize the key features available in the initial release
4. THE Rider_App Release_Notes SHALL mention ride booking, live tracking, safety features, and delivery
5. THE Driver_App Release_Notes SHALL mention earnings tracking, ride workflow, delivery mode, and the level system

### Requirement 11: Content Rating Questionnaire

**User Story:** As a product owner, I want the content rating questionnaire completed accurately, so that the apps receive the correct age rating on Google Play.

#### Acceptance Criteria

1. THE Play_Console content rating questionnaire SHALL be answered to indicate no violence, sexual content, or controlled substances
2. THE Play_Console content rating questionnaire SHALL declare that the app shares user location with other users (driver location to rider, rider pickup to driver)
3. THE Play_Console content rating questionnaire SHALL declare that the app processes financial transactions (fare payments)
4. WHEN the questionnaire is completed, THE Play_Console SHALL assign a content rating of "Everyone" or equivalent

### Requirement 12: Store Listing Asset Organization

**User Story:** As a developer, I want all store listing assets organized in a predictable directory structure, so that the submission process is repeatable and assets are easy to locate.

#### Acceptance Criteria

1. THE Asset_Pipeline SHALL output Rider_App phone screenshots to assets/store/output/rider/phone/ directory
2. THE Asset_Pipeline SHALL output Rider_App tablet screenshots to assets/store/output/rider/tablet/ directory
3. THE Asset_Pipeline SHALL output Driver_App phone screenshots to assets/store/output/driver/phone/ directory
4. THE Asset_Pipeline SHALL output Driver_App tablet screenshots to assets/store/output/driver/tablet/ directory
5. THE Asset_Pipeline SHALL output feature graphics to assets/store/output/{app}/feature-graphic.png
6. THE Asset_Pipeline SHALL output app icons to assets/store/output/{app}/icon-512.png
7. THE Asset_Pipeline SHALL maintain a README documenting the conversion process from SVG source to PNG output
