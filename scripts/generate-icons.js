#!/usr/bin/env node

/**
 * App Icon Generation Guide for Yala
 *
 * This script documents the required icon sizes and creates placeholder
 * directories for both the Rider and Driver apps.
 *
 * To generate actual icons, install `sharp` and provide source SVG/PNG files:
 *   npm install sharp
 *   node scripts/generate-icons.js --source assets/rider-icon.png --app rider
 *   node scripts/generate-icons.js --source assets/driver-icon.png --app driver
 *
 * Required icon sizes:
 *
 * iOS (rider-app/ios/App/App/Assets.xcassets/AppIcon.appiconset/):
 *   - 20x20 (1x iPad notifications)
 *   - 29x29 (1x iPad settings)
 *   - 40x40 (2x iPad notifications, 1x iPad spotlight)
 *   - 58x58 (2x iPhone settings)
 *   - 60x60 (3x iPhone notifications)
 *   - 76x76 (1x iPad app)
 *   - 80x80 (2x iPad spotlight, 2x iPhone spotlight)
 *   - 87x87 (3x iPhone settings)
 *   - 120x120 (2x iPhone app, 3x iPhone spotlight)
 *   - 152x152 (2x iPad app)
 *   - 167x167 (iPad Pro app)
 *   - 180x180 (3x iPhone app)
 *   - 1024x1024 (App Store)
 *
 * Android (rider-app/android/app/src/main/res/):
 *   - mipmap-mdpi: 48x48
 *   - mipmap-hdpi: 72x72
 *   - mipmap-xhdpi: 96x96
 *   - mipmap-xxhdpi: 144x144
 *   - mipmap-xxxhdpi: 192x192
 *   - Play Store: 512x512
 *
 * Branding:
 *   Rider icon: Green (#00A651) background with white Yala logo
 *   Driver icon: Gold (#D4AF37) background with white Yala logo
 */

const fs = require('fs');
const path = require('path');

const IOS_SIZES = [20, 29, 40, 58, 60, 76, 80, 87, 120, 152, 167, 180, 1024];

const ANDROID_DENSITIES = {
  'mipmap-mdpi': 48,
  'mipmap-hdpi': 72,
  'mipmap-xhdpi': 96,
  'mipmap-xxhdpi': 144,
  'mipmap-xxxhdpi': 192,
};

const APPS = ['rider-app', 'driver-app'];

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    console.log(`  Created: ${dirPath}`);
  }
}

function createPlaceholderDirectories() {
  const rootDir = path.resolve(__dirname, '..');

  for (const app of APPS) {
    console.log(`\nSetting up directories for ${app}:`);

    // Resources directory
    const resourcesDir = path.join(rootDir, app, 'resources');
    ensureDir(resourcesDir);

    // iOS icon asset directory
    const iosIconDir = path.join(rootDir, app, 'ios', 'App', 'App', 'Assets.xcassets', 'AppIcon.appiconset');
    ensureDir(iosIconDir);

    // iOS splash asset directory
    const iosSplashDir = path.join(rootDir, app, 'ios', 'App', 'App', 'Assets.xcassets', 'Splash.imageset');
    ensureDir(iosSplashDir);

    // Android mipmap directories
    for (const density of Object.keys(ANDROID_DENSITIES)) {
      const androidDir = path.join(rootDir, app, 'android', 'app', 'src', 'main', 'res', density);
      ensureDir(androidDir);
    }
  }

  console.log('\nDone! Place your source icons in each app\'s resources/ directory.');
  console.log('See rider-app/resources/README.md and driver-app/resources/README.md for details.');
}

// Run if called directly
if (require.main === module) {
  console.log('Yala App Icon Directory Setup');
  console.log('=============================');
  createPlaceholderDirectories();
}

module.exports = { IOS_SIZES, ANDROID_DENSITIES, APPS };
