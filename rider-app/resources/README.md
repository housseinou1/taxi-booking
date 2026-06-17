# Yala Rider App Resources

## Branding

- **App Name:** Yala Rider
- **App ID:** com.yala.rider.mr
- **Primary Color:** Green #00A651
- **Background:** White
- **Icon Design:** White "Y" (Yala logo) + map pin on green background
- **Splash Screen:** Green background with white Yala logo + "YALA RIDER" text

## Icon Source

Source SVG: `assets/yala-rider-icon.svg`

## Generating Icons

From project root:
```bash
npm install sharp
node scripts/generate-icons.js
```

This generates all required PNG sizes:
- `resources/icon.png` (1024×1024) — master icon
- `resources/splash.png` (2732×2732) — splash screen
- Android mipmap icons (48px to 192px)
- Android splash screens (all densities)
- Play Store icon (512×512)
- App Store icon (1024×1024)
- Notification icon (96×96)
- Web favicon and PWA icons

## After Generation

```bash
npx cap sync
npx cap open android
```
