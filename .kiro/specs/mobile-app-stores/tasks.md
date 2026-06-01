# Tasks: Mobile App Stores

## Phase 1: Platform Abstraction Layer

- [ ] 1.1 Create `frontend/src/native/platform.js` — isNative(), getPlatform(), getAppType(), shouldShowInstallButton()
- [ ] 1.2 Create `frontend/src/native/storage.js` — setToken(), getToken(), removeToken() with Capacitor secure storage fallback to localStorage
- [ ] 1.3 Create `frontend/src/native/push.js` — initPushNotifications(), getRouteFromNotification()
- [ ] 1.4 Create `frontend/src/native/location.js` — requestLocationPermission(), startBackgroundLocationTracking(), stopBackgroundLocationTracking()
- [ ] 1.5 Create `frontend/src/native/camera.js` — takePhoto(), pickFromGallery() with 2MB compression
- [ ] 1.6 Create `frontend/src/native/biometric.js` — isBiometricAvailable(), performBiometricVerification(), shouldPromptBiometric()
- [ ] 1.7 Create `frontend/src/native/deeplink.js` — parseDeepLink(), initDeepLinkListener()
- [ ] 1.8 Create `frontend/src/native/navigation.js` — formatMapsUrl(), openNavigation()
- [ ] 1.9 Create `frontend/src/native/index.js` — barrel export for all native modules

## Phase 2: Capacitor Project Setup

- [ ] 2.1 Create `rider-app/` Capacitor project with `capacitor.config.ts` (appId: com.yala.rider)
- [ ] 2.2 Create `driver-app/` Capacitor project with `capacitor.config.ts` (appId: com.yala.driver)
- [ ] 2.3 Add Capacitor dependencies to each project's `package.json`
- [ ] 2.4 Configure iOS deployment target (15.0) and Android minSdkVersion (24)

## Phase 3: Build Scripts and Environment Files

- [ ] 3.1 Create `frontend/.env.rider` with REACT_APP_TYPE=rider and production API URL
- [ ] 3.2 Create `frontend/.env.driver` with REACT_APP_TYPE=driver and production API URL
- [ ] 3.3 Create `scripts/build-rider.sh` — build React with rider env, copy to rider-app/www, cap sync
- [ ] 3.4 Create `scripts/build-driver.sh` — build React with driver env, copy to driver-app/www, cap sync
- [ ] 3.5 Add build scripts for Windows (`scripts/build-rider.bat`, `scripts/build-driver.bat`)

## Phase 4: Native Plugins Integration

- [ ] 4.1 Install push notification plugin (`@capacitor/push-notifications`) in both Capacitor projects
- [ ] 4.2 Install geolocation plugins (`@capacitor/geolocation`, `@capacitor-community/background-geolocation`)
- [ ] 4.3 Install camera plugin (`@capacitor/camera`)
- [ ] 4.4 Install secure storage plugin (`capacitor-secure-storage-plugin`)
- [ ] 4.5 Install biometric plugin (`capacitor-native-biometric`)
- [ ] 4.6 Install app plugin (`@capacitor/app`) for deep links and app state
- [ ] 4.7 Install network plugin (`@capacitor/network`) for offline detection
- [ ] 4.8 Configure iOS permissions in Info.plist (location, camera, Face ID)
- [ ] 4.9 Configure Android permissions in AndroidManifest.xml (location, camera, biometric)

## Phase 5: Backend Push Notification Support

- [ ] 5.1 Create `backend/taxi/notifications/` Django app with DeviceToken model
- [ ] 5.2 Create device registration API endpoint (`POST /notifications/register-device/`)
- [ ] 5.3 Integrate Firebase Admin SDK for sending push notifications
- [ ] 5.4 Add push notification triggers for ride status changes
- [ ] 5.5 Add push notification triggers for new ride requests (driver)
- [ ] 5.6 Create database migration for DeviceToken model

## Phase 6: App Icons and Splash Screens

- [ ] 6.1 Generate Yala Rider app icon (green #00A651 primary) in all required sizes (iOS 1024x1024, Android 512x512 adaptive)
- [ ] 6.2 Generate Yala Driver app icon (gold #D4AF37 primary) in all required sizes
- [ ] 6.3 Create splash screen assets with Yala logo on navy (#0B1220) background
- [ ] 6.4 Configure splash screen plugin with 2-second auto-hide
- [ ] 6.5 Place icon assets in iOS `Assets.xcassets` and Android `res/` directories

## Phase 7: Store Listing Preparation

- [ ] 7.1 Write app descriptions in French and Arabic for both apps
- [ ] 7.2 Prepare screenshot templates (5 minimum per platform per app)
- [ ] 7.3 Create privacy policy page at `https://yala.mr/privacy`
- [ ] 7.4 Configure store categories (Rider: Travel/Transportation, Driver: Business/Transportation)
- [ ] 7.5 Set app titles: "Yala Rider - Book a Ride" and "Yala Driver - Earn Money"
- [ ] 7.6 Configure Mauritania as primary market with MRU currency
