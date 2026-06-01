# Requirements Document

## Introduction

This feature wraps the existing Yala React web application into two separate native mobile apps using Capacitor (by Ionic): **Yala Rider** for passengers and **Yala Driver** for drivers. Both apps will be published on the Apple App Store and Google Play Store, targeting users in Mauritania. The approach avoids a full native rewrite by leveraging the existing React frontend while adding native capabilities such as push notifications, GPS, camera access, biometric authentication, and deep linking.

## Glossary

- **Capacitor**: A cross-platform native runtime by Ionic that wraps web applications into native iOS and Android containers
- **Yala_Rider_App**: The native mobile application for passengers to book and manage rides
- **Yala_Driver_App**: The native mobile application for drivers to accept and manage rides
- **FCM**: Firebase Cloud Messaging, the push notification service for Android devices
- **APNs**: Apple Push Notification service, the push notification service for iOS devices
- **Deep_Link**: A URL that opens a specific screen within the native app
- **Build_System**: The Capacitor build pipeline that produces separate Rider and Driver app binaries
- **Notification_Service**: The backend component that sends push notifications via FCM and APNs
- **Location_Service**: The native plugin that provides GPS coordinates to the application
- **Camera_Plugin**: The native plugin that provides camera and photo library access
- **Biometric_Plugin**: The native plugin that provides Face ID, Touch ID, and fingerprint authentication
- **Offline_Cache**: The local storage layer that persists ride data when the device has no network connectivity
- **Navigation_Plugin**: The native plugin that launches external map applications for turn-by-turn directions
- **Splash_Screen**: The branded loading screen displayed during app startup
- **Store_Listing**: The metadata, screenshots, and descriptions published on app stores

## Requirements

### Requirement 1: Separate App Builds

**User Story:** As a platform operator, I want two separate native apps (Yala Rider and Yala Driver), so that each user type has a focused experience and can find the correct app on the store.

#### Acceptance Criteria

1. THE Build_System SHALL produce a distinct Yala_Rider_App binary with bundle identifier `com.yala.rider`
2. THE Build_System SHALL produce a distinct Yala_Driver_App binary with bundle identifier `com.yala.driver`
3. WHEN the Yala_Rider_App is built, THE Build_System SHALL include only rider routes (`/rider`, `/rider-dashboard`, `/rider-history`, `/rider-reviews`, `/saved-places`, `/rider-profile`, `/rider-payments`, `/ride/share`)
4. WHEN the Yala_Driver_App is built, THE Build_System SHALL include only driver routes (`/driver`, `/driver/profile`, `/driver/earnings`, `/driver/feedback`, `/driver/support`, `/driver/achievements`, `/driver/history`)
5. THE Build_System SHALL produce iOS builds (`.ipa`) for both apps targeting iOS 15.0 or later
6. THE Build_System SHALL produce Android builds (`.aab`) for both apps targeting Android API level 24 (Android 7.0) or later

### Requirement 2: Capacitor Integration

**User Story:** As a developer, I want to wrap the existing React frontend with Capacitor, so that the app runs in native containers without a full rewrite.

#### Acceptance Criteria

1. THE Build_System SHALL use Capacitor to wrap the existing React frontend into native iOS and Android containers
2. WHEN the React app is built, THE Build_System SHALL copy the production build output into the Capacitor web assets directory
3. THE Yala_Rider_App SHALL load the React frontend with the initial route set to `/rider-dashboard`
4. THE Yala_Driver_App SHALL load the React frontend with the initial route set to `/driver`
5. WHILE running inside a Capacitor container, THE Yala_Rider_App SHALL hide the PWA install button
6. WHILE running inside a Capacitor container, THE Yala_Driver_App SHALL hide the PWA install button
7. WHILE running inside a Capacitor container, THE Yala_Rider_App SHALL connect to the backend WebSocket using the production API URL

### Requirement 3: Push Notifications

**User Story:** As a rider, I want to receive push notifications about ride status updates, so that I stay informed without keeping the app open.

#### Acceptance Criteria

1. WHEN the Yala_Rider_App is launched for the first time, THE Notification_Service SHALL request push notification permission from the user
2. WHEN the Yala_Driver_App is launched for the first time, THE Notification_Service SHALL request push notification permission from the user
3. WHEN a push notification permission is granted on Android, THE Notification_Service SHALL register the device token with FCM
4. WHEN a push notification permission is granted on iOS, THE Notification_Service SHALL register the device token with APNs
5. WHEN a ride status changes, THE Notification_Service SHALL send a push notification to the relevant rider device
6. WHEN a new ride request is available, THE Notification_Service SHALL send a push notification to eligible driver devices
7. WHEN a push notification is tapped, THE Yala_Rider_App SHALL navigate to the relevant ride detail screen
8. WHEN a push notification is tapped, THE Yala_Driver_App SHALL navigate to the relevant ride management screen

### Requirement 4: Native GPS and Location Access

**User Story:** As a driver, I want the app to access my GPS location in the background, so that riders can track my position in real time.

#### Acceptance Criteria

1. WHEN the Yala_Rider_App is opened, THE Location_Service SHALL request foreground location permission
2. WHEN the Yala_Driver_App is opened, THE Location_Service SHALL request both foreground and background location permissions
3. WHILE the driver is online, THE Location_Service SHALL transmit the driver GPS coordinates to the backend every 5 seconds via WebSocket
4. WHILE the Yala_Driver_App is in the background and the driver is online, THE Location_Service SHALL continue transmitting GPS coordinates
5. IF location permission is denied, THEN THE Yala_Rider_App SHALL display a message explaining that location is required for ride pickup
6. IF background location permission is denied, THEN THE Yala_Driver_App SHALL display a message explaining that background location is required to receive ride requests

### Requirement 5: Native Camera Access

**User Story:** As a driver, I want to use my phone camera to upload documents and profile photos, so that I can complete my registration.

#### Acceptance Criteria

1. WHEN the user initiates a document upload, THE Camera_Plugin SHALL present options to take a photo or select from the photo library
2. WHEN a photo is captured or selected, THE Camera_Plugin SHALL compress the image to a maximum of 2 MB before upload
3. IF camera permission is denied, THEN THE Camera_Plugin SHALL display a message directing the user to enable camera access in device settings
4. THE Camera_Plugin SHALL support JPEG and PNG image formats

### Requirement 6: Deep Linking

**User Story:** As a rider, I want to open specific app screens from notification links or shared URLs, so that I can quickly access relevant content.

#### Acceptance Criteria

1. WHEN a deep link with scheme `yala-rider://` is opened, THE Yala_Rider_App SHALL navigate to the corresponding screen
2. WHEN a deep link with scheme `yala-driver://` is opened, THE Yala_Driver_App SHALL navigate to the corresponding screen
3. WHEN a universal link matching `https://yala.mr/rider/*` is opened, THE Yala_Rider_App SHALL handle the link and navigate to the corresponding screen
4. WHEN a universal link matching `https://yala.mr/driver/*` is opened, THE Yala_Driver_App SHALL handle the link and navigate to the corresponding screen
5. IF the app is not installed when a universal link is opened, THEN THE device browser SHALL redirect to the appropriate app store listing

### Requirement 7: App Branding and Splash Screens

**User Story:** As a platform operator, I want both apps to display Yala branding with correct colors and icons, so that users have a consistent brand experience.

#### Acceptance Criteria

1. THE Yala_Rider_App SHALL display an app icon featuring the Yala logo with green (#00A651) as the primary color
2. THE Yala_Driver_App SHALL display an app icon featuring the Yala logo with gold (#D4AF37) as the primary color
3. WHEN the Yala_Rider_App is launched, THE Splash_Screen SHALL display the Yala logo on a navy (#0B1220) background
4. WHEN the Yala_Driver_App is launched, THE Splash_Screen SHALL display the Yala logo on a navy (#0B1220) background
5. THE Splash_Screen SHALL be displayed for no longer than 3 seconds before transitioning to the app content
6. THE Yala_Rider_App SHALL provide app icons in all required sizes for iOS (1024x1024) and Android (512x512 adaptive icon)
7. THE Yala_Driver_App SHALL provide app icons in all required sizes for iOS (1024x1024) and Android (512x512 adaptive icon)

### Requirement 8: Offline Support

**User Story:** As a rider, I want to view my recent ride history even when offline, so that I can access trip details without connectivity.

#### Acceptance Criteria

1. WHEN ride data is fetched from the backend, THE Offline_Cache SHALL store the 20 most recent rides locally on the device
2. WHILE the device has no network connectivity, THE Yala_Rider_App SHALL display cached ride history data
3. WHILE the device has no network connectivity, THE Yala_Driver_App SHALL display cached earnings and ride history data
4. WHEN network connectivity is restored, THE Offline_Cache SHALL synchronize with the backend and update cached data
5. IF the app is opened without network connectivity and no cached data exists, THEN THE Yala_Rider_App SHALL display a message indicating that an internet connection is required

### Requirement 9: Biometric Authentication

**User Story:** As a user, I want to unlock the app with my fingerprint or face, so that I can access the app quickly and securely.

#### Acceptance Criteria

1. WHEN the user enables biometric authentication in settings, THE Biometric_Plugin SHALL register the user's biometric credentials
2. WHEN the Yala_Rider_App is opened after being in the background for more than 5 minutes, THE Biometric_Plugin SHALL prompt for biometric verification
3. WHEN the Yala_Driver_App is opened after being in the background for more than 5 minutes, THE Biometric_Plugin SHALL prompt for biometric verification
4. THE Biometric_Plugin SHALL support Face ID and Touch ID on iOS devices
5. THE Biometric_Plugin SHALL support fingerprint authentication on Android devices
6. IF biometric verification fails three consecutive times, THEN THE Biometric_Plugin SHALL fall back to JWT re-authentication with username and password
7. IF the device does not support biometric authentication, THEN THE Biometric_Plugin SHALL hide the biometric option in settings

### Requirement 10: Native Navigation Integration

**User Story:** As a driver, I want to open turn-by-turn directions in my preferred maps app, so that I can navigate to pickup and dropoff locations efficiently.

#### Acceptance Criteria

1. WHEN the driver taps "Navigate" on a ride, THE Navigation_Plugin SHALL open the device default maps application with the destination coordinates
2. THE Navigation_Plugin SHALL support opening Google Maps on Android devices
3. THE Navigation_Plugin SHALL support opening Apple Maps on iOS devices
4. IF Google Maps is installed on an iOS device, THEN THE Navigation_Plugin SHALL offer the user a choice between Apple Maps and Google Maps
5. THE Navigation_Plugin SHALL pass the destination coordinates in a format compatible with both mapping applications

### Requirement 11: Store Listing Assets

**User Story:** As a platform operator, I want professional store listings for both apps, so that users can discover and trust the apps on the Apple App Store and Google Play Store.

#### Acceptance Criteria

1. THE Store_Listing SHALL include a minimum of 5 screenshots for each app on each platform (iPhone, iPad, Android phone)
2. THE Store_Listing SHALL include app descriptions in both French and Arabic languages
3. THE Store_Listing SHALL categorize Yala_Rider_App under "Travel" or "Transportation" category
4. THE Store_Listing SHALL categorize Yala_Driver_App under "Business" or "Transportation" category
5. THE Store_Listing SHALL include a privacy policy URL for each app
6. THE Store_Listing SHALL specify Mauritania as the primary market with MRU as the displayed currency
7. THE Store_Listing SHALL include the Yala brand name in the app title: "Yala Rider - Book a Ride" and "Yala Driver - Earn Money"

### Requirement 12: WebSocket Connectivity in Native Container

**User Story:** As a rider, I want real-time ride updates in the native app, so that I can track my driver and ride status live.

#### Acceptance Criteria

1. WHILE running inside a Capacitor container, THE Yala_Rider_App SHALL maintain a WebSocket connection to the backend for real-time ride updates
2. WHILE running inside a Capacitor container, THE Yala_Driver_App SHALL maintain a WebSocket connection to the backend for real-time ride requests and status updates
3. WHEN the app transitions from background to foreground, THE Yala_Rider_App SHALL reconnect the WebSocket if the connection was lost
4. WHEN the app transitions from background to foreground, THE Yala_Driver_App SHALL reconnect the WebSocket if the connection was lost
5. IF the WebSocket connection fails, THEN THE Yala_Rider_App SHALL retry with exponential backoff up to a maximum interval of 30 seconds

### Requirement 13: Authentication Token Management

**User Story:** As a user, I want my login session to persist securely in the native app, so that I do not need to log in every time I open the app.

#### Acceptance Criteria

1. WHILE running inside a Capacitor container, THE Yala_Rider_App SHALL store JWT tokens in the native secure storage (Keychain on iOS, Keystore on Android) instead of localStorage
2. WHILE running inside a Capacitor container, THE Yala_Driver_App SHALL store JWT tokens in the native secure storage (Keychain on iOS, Keystore on Android) instead of localStorage
3. WHEN the access token expires, THE Yala_Rider_App SHALL use the refresh token to obtain a new access token without user interaction
4. WHEN the access token expires, THE Yala_Driver_App SHALL use the refresh token to obtain a new access token without user interaction
5. IF the refresh token is expired or invalid, THEN THE Yala_Rider_App SHALL redirect the user to the login screen
