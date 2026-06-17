# Yala Driver App Resources

## Branding

- **App Name:** Yala Driver
- **App ID:** com.yala.driver.mr
- **Primary Color:** Gold #D4AF37
- **Background:** Dark Navy #0B1220
- **Icon Design:** White "Y" (Yala logo) + gold steering wheel on dark navy background
- **Splash Screen:** Dark navy background with gold accents + white Yala logo + "YALA DRIVER" text

## Icon Source

Source SVG: `assets/yala-driver-icon.svg`

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
