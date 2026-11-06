# YALA — Google Play Console Pack (prepared, NOT submitted)

**Status:** prepared for review. **Nothing here has been submitted to Google Play and no
application has been published.** Items marked **[CONFIRM]** need business/legal sign-off —
they are deliberately not asserted, because a Data Safety answer must match verified behaviour.

Source of truth for app behaviour: the manifests and source in this repository. Where a value
was not verified, it is marked rather than guessed.

---

## 1. Applications

| | Yala Rider | Yala Driver | Yala Delivery |
|---|---|---|---|
| Package name | `com.yala.rider.mr` | `com.yala.driver.mr` | `com.yala.delivery.mr` |
| App name | Yala Rider - Book a Ride | Yala Driver - Earn Money | Yala Delivery |
| versionCode / versionName | **35 / 1.3.2** | **49 / 1.3.1** | **13 / 1.1.3** |
| Category | Travel › Transportation | Business › Transportation | Business › Transportation |
| Markets | Mauritania · MRU | Mauritania · MRU | Mauritania · MRU |
| Languages | en, fr, ar | en, fr, ar | en, fr, ar |
| Age rating (proposed) | 4+ **[CONFIRM via questionnaire]** | 4+ **[CONFIRM]** | 4+ **[CONFIRM]** |

## 2. Privacy policy URL

Canonical source prepared: `store-listings/compliance-site/` (static; `vercel.json` and
`netlify.toml` included). It covers all three apps, location permissions, **background
tracking**, personal data, payment information, data retention, account deletion and contact.

**Deployment requirements (not deployed):**
1. Host the directory so `/privacy-policy/` and `/account-deletion/` resolve (absolute
   `/styles.css` link → serve from a domain root, or rebase the link).
2. HTTPS on a stable canonical domain, e.g. `https://yalataxi.live/privacy-policy/`.
3. Then set `privacyPolicyUrl` in `store-listings/metadata.json` and in each Play listing.

## 3. Data Safety — answers to enter per app

Verified from manifests + source:

| Question | Rider | Driver | Delivery | Basis |
|---|---|---|---|---|
| Collects location? | Yes | Yes | Yes | `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION` |
| Location collected in background? | **No** | **Yes** | **Yes** | `ACCESS_BACKGROUND_LOCATION` present in Driver/Delivery manifests only |
| Location shared with third parties? | **[CONFIRM]** | **[CONFIRM]** | **[CONFIRM]** | map tiles are fetched client-side; whether that counts as "shared" is a legal call |
| Collects personal info? | Yes (name, email, phone) | Yes | Yes | registration + profile fields |
| Collects financial info? | **[CONFIRM]** | **[CONFIRM]** | **[CONFIRM]** | payments are processed by a provider; confirm whether the app stores any payment data |
| Data encrypted in transit? | Yes | Yes | Yes | HTTPS enforced (`usesCleartextTraffic="false"`, network security config) |
| Users can request data deletion? | Yes | Yes | Yes | deletion route + `support@yalataxi.live` |
| Data used for advertising? | **No** | **No** | **No** | no ad SDK in any app's `package.json` |
| Data sold? | **[CONFIRM]** | **[CONFIRM]** | **[CONFIRM]** | no technical evidence of sale; needs a legal statement |

## 4. Background-location declaration (Driver + Delivery only)

Required because both apps now track location during an active trip/delivery, including when
minimised or the screen is locked.

| Requirement | Prepared |
|---|---|
| Permissions in manifest | ✅ `ACCESS_BACKGROUND_LOCATION`, `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_LOCATION` |
| Foreground service with `foregroundServiceType="location"` | ✅ declared by `@capacitor-community/background-geolocation` |
| Persistent user-visible notification while tracking | ✅ "Yala Driver is tracking your location" / "Yala Delivery is tracking your location" |
| Tracking limited to an active trip/delivery | ✅ started when the trip/delivery becomes active; stopped on completion, cancellation or logout |
| Privacy-policy disclosure | ✅ dedicated "Background Location" section |
| Play Console background-location declaration form | ☐ **not submitted** |
| In-app disclosure screen / reviewer video | ☐ **not produced** — **[CONFIRM]** required by Play |
| Rider must NOT request background location | ✅ Rider manifest has no background permission |

## 5. Account deletion

| Item | State |
|---|---|
| Public deletion URL | ✅ `https://api.yalataxi.live/yala-account-deletion/` (verified live) |
| Covers all three apps | ✅ names Yala Rider, Yala Driver, Yala Delivery |
| Data deleted / retained / timelines | ✅ documents 30-day document deletion and 3-year record retention |
| Self-serve in-app deletion | ❌ **not implemented** — deletion is by verified support request. Confirm this satisfies Play, or add an in-app path |

## 6. Store listing assets

| Asset | State |
|---|---|
| Short + full description (en/fr/ar) | ✅ under `store-listings/{rider,driver,delivery}/` |
| Screenshot ordering / plan | ✅ `screenshot-order.md` per app |
| **Screenshots** | ☐ not captured from the final builds |
| **Feature graphic (1024×500)** | ☐ not produced |
| App icon (512×512) | ✅ `resources/` present per app — verify export |
| Release notes | ✅ per app (verify they match the versionCodes above) |
| Content rating questionnaire | ☐ **not completed** |

## 7. Final release checklist (per app)

1. ☐ Android toolchain available (§8) and `gradlew bundleRelease` **succeeds**
2. ☐ Web assets rebuilt for the app (`scripts/build-<app>.bat`) — no stale `www/`
3. ☐ versionCode/versionName correct and incremented vs the last uploaded build
4. ☐ Signed AAB produced and verified
5. ☐ Data Safety completed (§3); background-location declaration submitted for Driver/Delivery
6. ☐ Privacy policy URL live and pointed at the deployed compliance site
7. ☐ Account-deletion URL live and referenced in the listing
8. ☐ Content rating, screenshots, feature graphic uploaded
9. ☐ **Device QA passed** — background tracking continues with the screen locked and stops at trip end
10. ☐ Internal testing track upload → verify install → then wider rollout

## 8. Android build prerequisites (not satisfied in this environment)

| Requirement | Present here? |
|---|---|
| `java` (JDK 17) on PATH / `JAVA_HOME` | ❌ not found |
| Android SDK (`ANDROID_SDK_ROOT`, platform 36 + build-tools) | ❌ env unset (SDK folder exists) |
| `adb` (platform-tools on PATH) | ❌ not found |
| `gradlew.bat` in `<app>/android` | ✅ present |
| Signing config + keystores | ✅ present, and `signing/` + `*-signing.properties` are **gitignored** (verified: nothing tracked) |

**No signed AAB has been produced or claimed.** The Delivery AAB currently on disk is
`versionCode 12` while source is `13` — it **must be rebuilt** and must not be reused.

## 9. What is intentionally NOT done

- No Play Console declaration submitted
- No application published or uploaded
- No screenshot / feature graphic produced
- No legal assertion invented — every `[CONFIRM]` needs Product/Legal sign-off

