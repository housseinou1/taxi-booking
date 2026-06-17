#!/usr/bin/env node

/**
 * Generate Store Assets from SVG sources.
 *
 * Converts all SVG files in assets/store/ to PNG at the correct sizes
 * for Google Play Store and Apple App Store submission.
 *
 * Usage:
 *   npm install sharp
 *   node scripts/generate-store-assets.js
 *
 * Output goes to assets/store/output/
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const STORE_DIR = path.join(ROOT, 'assets', 'store');
const OUTPUT_DIR = path.join(STORE_DIR, 'output');

const ASSETS = {
  rider: {
    featureGraphic: { file: 'rider/feature-graphic.svg', width: 1024, height: 500 },
    screenshots: [
      { file: 'rider/screenshot-1-booking.svg', width: 1080, height: 1920 },
      { file: 'rider/screenshot-2-tracking.svg', width: 1080, height: 1920 },
      { file: 'rider/screenshot-3-safety.svg', width: 1080, height: 1920 },
    ],
    tabletScreenshots: [
      { file: 'rider/screenshot-1-booking.svg', width: 2048, height: 2732 },
    ],
  },
  driver: {
    featureGraphic: { file: 'driver/feature-graphic.svg', width: 1024, height: 500 },
    screenshots: [
      { file: 'driver/screenshot-1-dashboard.svg', width: 1080, height: 1920 },
      { file: 'driver/screenshot-2-workflow.svg', width: 1080, height: 1920 },
    ],
    tabletScreenshots: [
      { file: 'driver/screenshot-1-dashboard.svg', width: 2048, height: 2732 },
    ],
  },
};

async function generate() {
  let sharp;
  try {
    sharp = require('sharp');
  } catch (e) {
    console.error('Error: "sharp" package not found.');
    console.error('Install it: npm install sharp');
    process.exit(1);
  }

  // Ensure output dirs exist
  for (const app of ['rider', 'driver']) {
    const dirs = ['phone', 'tablet'].map(d => path.join(OUTPUT_DIR, app, d));
    dirs.push(path.join(OUTPUT_DIR, app));
    dirs.forEach(dir => fs.mkdirSync(dir, { recursive: true }));
  }

  for (const [app, config] of Object.entries(ASSETS)) {
    console.log(`\n=== ${app.toUpperCase()} ===`);

    // Feature graphic
    const fgPath = path.join(STORE_DIR, config.featureGraphic.file);
    if (fs.existsSync(fgPath)) {
      const output = path.join(OUTPUT_DIR, app, 'feature-graphic.png');
      await sharp(fs.readFileSync(fgPath))
        .resize(config.featureGraphic.width, config.featureGraphic.height)
        .png()
        .toFile(output);
      console.log(`  ✓ feature-graphic.png (${config.featureGraphic.width}x${config.featureGraphic.height})`);
    }

    // Phone screenshots
    for (let i = 0; i < config.screenshots.length; i++) {
      const ss = config.screenshots[i];
      const ssPath = path.join(STORE_DIR, ss.file);
      if (fs.existsSync(ssPath)) {
        const output = path.join(OUTPUT_DIR, app, 'phone', `screenshot-${i + 1}.png`);
        await sharp(fs.readFileSync(ssPath))
          .resize(ss.width, ss.height)
          .png()
          .toFile(output);
        console.log(`  ✓ phone/screenshot-${i + 1}.png (${ss.width}x${ss.height})`);
      }
    }

    // Tablet screenshots (scaled up)
    for (let i = 0; i < config.tabletScreenshots.length; i++) {
      const ss = config.tabletScreenshots[i];
      const ssPath = path.join(STORE_DIR, ss.file);
      if (fs.existsSync(ssPath)) {
        const bg = app === 'rider' ? { r: 0, g: 166, b: 81 } : { r: 11, g: 18, b: 32 };
        const output = path.join(OUTPUT_DIR, app, 'tablet', `screenshot-${i + 1}.png`);
        await sharp(fs.readFileSync(ssPath))
          .resize(ss.width, ss.height, { fit: 'contain', background: { ...bg, alpha: 1 } })
          .png()
          .toFile(output);
        console.log(`  ✓ tablet/screenshot-${i + 1}.png (${ss.width}x${ss.height})`);
      }
    }
  }

  console.log(`\n✅ All store assets saved to: assets/store/output/`);
  console.log('\nUpload these files to:');
  console.log('  Google Play Console → Store listing → Graphics');
  console.log('  App Store Connect → App Information → Screenshots');
}

if (require.main === module) {
  generate().catch(console.error);
}
