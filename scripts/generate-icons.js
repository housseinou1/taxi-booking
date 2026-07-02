#!/usr/bin/env node

/**
 * Yala App Icon & Splash Screen Generator
 *
 * Generates all required PNG sizes from SVG source files for both
 * Yala Rider and Yala Driver apps.
 *
 * Usage:
 *   npm install sharp  (in project root)
 *   node scripts/generate-icons.js
 *
 * Source files (in assets/):
 *   - yala-rider-icon.svg  → Green + white Y + map pin
 *   - yala-driver-icon.svg → Dark navy + gold + white Y + steering wheel
 *   - yala-rider-splash.svg → Green splash with Yala Rider branding
 *   - yala-driver-splash.svg → Navy/gold splash with Yala Driver branding
 *
 * Output:
 *   - rider-app/resources/icon.png (1024x1024)
 *   - rider-app/resources/splash.png (2732x2732)
 *   - rider-app/android/app/src/main/res/mipmap-{density}/ic_launcher.png
 *   - driver-app/resources/icon.png (1024x1024)
 *   - driver-app/resources/splash.png (2732x2732)
 *   - driver-app/android/app/src/main/res/mipmap-{density}/ic_launcher.png
 *   - frontend/public/favicon-rider.png (32x32)
 *   - frontend/public/favicon-driver.png (32x32)
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

const ANDROID_SIZES = {
  'mipmap-mdpi': 48,
  'mipmap-hdpi': 72,
  'mipmap-xhdpi': 96,
  'mipmap-xxhdpi': 144,
  'mipmap-xxxhdpi': 192,
};

const IOS_SIZES = [20, 29, 40, 58, 60, 76, 80, 87, 120, 152, 167, 180, 1024];

const APPS = {
  rider: {
    iconSvg: 'assets/yala-rider-icon.svg',
    splashSvg: 'assets/yala-rider-splash.svg',
    outputDir: 'rider-app',
    androidResDir: 'rider-app/android/app/src/main/res',
  },
  driver: {
    iconSvg: 'assets/yala-driver-icon.svg',
    splashSvg: 'assets/yala-driver-splash.svg',
    outputDir: 'driver-app',
    androidResDir: 'driver-app/android/app/src/main/res',
  },
  delivery: {
    iconSvg: 'assets/yala-delivery-icon.svg',
    splashSvg: 'assets/yala-delivery-splash.svg',
    outputDir: 'delivery-app',
    androidResDir: 'delivery-app/android/app/src/main/res',
    splashBackground: '#FFF8E8',
  },
};

async function generateIcons() {
  let sharp;
  try {
    sharp = require('sharp');
  } catch (e) {
    console.error('Error: "sharp" package not found.');
    console.error('Install it with: npm install sharp');
    console.error('Then run this script again.');
    process.exit(1);
  }

  for (const [appName, config] of Object.entries(APPS)) {
    const iconPath = path.join(ROOT, config.iconSvg);
    const splashPath = path.join(ROOT, config.splashSvg);

    if (!fs.existsSync(iconPath)) {
      console.error(`Missing: ${config.iconSvg}`);
      continue;
    }

    console.log(`\n=== Generating icons for ${appName} ===`);

    const iconSvg = fs.readFileSync(iconPath);
    const splashSvg = fs.existsSync(splashPath) ? fs.readFileSync(splashPath) : null;

    // 1. Main resource icon (1024x1024)
    const resourcesDir = path.join(ROOT, config.outputDir, 'resources');
    fs.mkdirSync(resourcesDir, { recursive: true });

    await sharp(iconSvg).resize(1024, 1024).png().toFile(path.join(resourcesDir, 'icon.png'));
    console.log(`  ✓ resources/icon.png (1024x1024)`);

    // 2. Splash screen (2732x2732 for iPad Pro)
    if (splashSvg) {
      await sharp(splashSvg).resize(2732, 2732, { fit: 'contain', background: config.splashBackground || (appName === 'rider' ? '#00A651' : '#0B1220') }).png().toFile(path.join(resourcesDir, 'splash.png'));
      console.log(`  ✓ resources/splash.png (2732x2732)`);
    }

    // 3. Android mipmap icons
    for (const [density, size] of Object.entries(ANDROID_SIZES)) {
      const dir = path.join(ROOT, config.androidResDir, density);
      fs.mkdirSync(dir, { recursive: true });

      await sharp(iconSvg).resize(size, size).png().toFile(path.join(dir, 'ic_launcher.png'));
      await sharp(iconSvg).resize(size, size).png().toFile(path.join(dir, 'ic_launcher_round.png'));

      // Foreground (padded for adaptive icon safe zone — 72% of size)
      const fgSize = Math.round(size * 1.5); // 108dp canvas scaled
      await sharp(iconSvg).resize(fgSize, fgSize).png().toFile(path.join(dir, 'ic_launcher_foreground.png'));

      console.log(`  ✓ ${density}/ic_launcher.png (${size}x${size})`);
    }

    // 4. Play Store icon (512x512)
    const playStoreDir = path.join(ROOT, config.outputDir, 'store-assets');
    fs.mkdirSync(playStoreDir, { recursive: true });
    await sharp(iconSvg).resize(512, 512).png().toFile(path.join(playStoreDir, 'play-store-icon.png'));
    console.log(`  ✓ store-assets/play-store-icon.png (512x512)`);

    // 5. iOS App Store icon (1024x1024 — no rounded corners, Apple does that)
    const iosDir = path.join(ROOT, config.outputDir, 'store-assets');
    await sharp(iconSvg).resize(1024, 1024).png().toFile(path.join(iosDir, 'app-store-icon.png'));
    console.log(`  ✓ store-assets/app-store-icon.png (1024x1024)`);

    // 6. Notification icon (96x96, white silhouette on transparent)
    await sharp(iconSvg).resize(96, 96).png().toFile(path.join(playStoreDir, 'notification-icon.png'));
    console.log(`  ✓ store-assets/notification-icon.png (96x96)`);

    // 7. Favicon for web (32x32)
    const faviconDir = path.join(ROOT, 'frontend', 'public');
    fs.mkdirSync(faviconDir, { recursive: true });
    await sharp(iconSvg).resize(32, 32).png().toFile(path.join(faviconDir, `favicon-${appName}.png`));
    console.log(`  ✓ frontend/public/favicon-${appName}.png (32x32)`);

    // 8. PWA icons (192x192, 512x512)
    await sharp(iconSvg).resize(192, 192).png().toFile(path.join(faviconDir, `icon-${appName}-192.png`));
    await sharp(iconSvg).resize(512, 512).png().toFile(path.join(faviconDir, `icon-${appName}-512.png`));
    console.log(`  ✓ frontend/public/icon-${appName}-192.png & 512.png`);

    // 9. Splash screen for Android drawable folders
    if (splashSvg) {
      const splashSizes = {
        'drawable-port-hdpi': { w: 480, h: 800 },
        'drawable-port-mdpi': { w: 320, h: 480 },
        'drawable-port-xhdpi': { w: 720, h: 1280 },
        'drawable-port-xxhdpi': { w: 960, h: 1600 },
        'drawable-port-xxxhdpi': { w: 1280, h: 1920 },
        'drawable-land-hdpi': { w: 800, h: 480 },
        'drawable-land-mdpi': { w: 480, h: 320 },
        'drawable-land-xhdpi': { w: 1280, h: 720 },
        'drawable-land-xxhdpi': { w: 1600, h: 960 },
        'drawable-land-xxxhdpi': { w: 1920, h: 1280 },
      };

      for (const [folder, dims] of Object.entries(splashSizes)) {
        const dir = path.join(ROOT, config.androidResDir, folder);
        fs.mkdirSync(dir, { recursive: true });
        await sharp(splashSvg).resize(dims.w, dims.h, { fit: 'cover' }).png().toFile(path.join(dir, 'splash.png'));
      }
      console.log(`  ✓ Android splash screens (all densities)`);
    }
  }

  console.log('\n✅ All icons generated successfully!');
  console.log('\nNext steps:');
  console.log('  1. Run "npx cap sync" in both rider-app/ and driver-app/');
  console.log('  2. Rebuild Android: npx cap open android');
  console.log('  3. For iOS: add ios platform and run npx cap sync ios');
}

// Run
if (require.main === module) {
  generateIcons().catch(console.error);
}

module.exports = { generateIcons, ANDROID_SIZES, IOS_SIZES, APPS };
