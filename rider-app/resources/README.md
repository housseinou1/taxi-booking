# Yala Rider - App Resources

Place your source assets in this directory for icon and splash screen generation.

## Required Files

### icon.png
- **Size:** 1024x1024 pixels
- **Format:** PNG with no transparency (App Store requirement)
- **Design:** Green (#00A651) background with white Yala logo centered
- **Corner radius:** None (iOS applies rounding automatically)

### splash.png
- **Size:** 2732x2732 pixels (largest iPad Pro resolution)
- **Format:** PNG
- **Design:** Navy (#0B1220) background with white Yala logo centered
- **Safe area:** Keep logo within center 800x800 to avoid cropping on smaller devices

## Generation

After placing your source files, run:

```bash
node scripts/generate-icons.js --source rider-app/resources/icon.png --app rider
```

Or use Capacitor's built-in asset generation:

```bash
cd rider-app
npx @capacitor/assets generate --iconBackgroundColor '#00A651' --splashBackgroundColor '#0B1220'
```

## Output Locations

- **iOS icons:** `ios/App/App/Assets.xcassets/AppIcon.appiconset/`
- **Android icons:** `android/app/src/main/res/mipmap-*/`
- **iOS splash:** `ios/App/App/Assets.xcassets/Splash.imageset/`
- **Android splash:** `android/app/src/main/res/drawable*/`
