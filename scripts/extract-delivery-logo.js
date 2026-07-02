#!/usr/bin/env node
/**
 * Extract the Yala Delivery logo from the official promo poster.
 *
 * Source: assets/yala-delivery-promo-official.png
 * Output: frontend/public/yala-delivery-logo.png
 *         delivery-app/www/yala-delivery-logo.png
 *         assets/yala-delivery-pin.png
 */

const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const ROOT = path.resolve(__dirname, "..");
const SOURCE = path.join(ROOT, "assets/yala-delivery-promo-official.png");

async function extractDeliveryLogo() {
  if (!fs.existsSync(SOURCE)) {
    console.error(`Missing source image: ${SOURCE}`);
    process.exit(1);
  }

  const logoOut = path.join(ROOT, "frontend/public/yala-delivery-logo.png");
  const appOut = path.join(ROOT, "delivery-app/www/yala-delivery-logo.png");
  const pinOut = path.join(ROOT, "assets/yala-delivery-pin.png");

  const logoBuffer = await sharp(SOURCE)
    .extract({ left: 380, top: 280, width: 200, height: 320 })
    .trim({ threshold: 18 })
    .png()
    .toBuffer();

  await sharp(logoBuffer)
    .resize(520, null, {
      fit: "inside",
      background: { r: 255, g: 248, b: 232, alpha: 1 },
    })
    .png()
    .toFile(logoOut);

  fs.mkdirSync(path.dirname(appOut), { recursive: true });
  await sharp(logoOut).toFile(appOut);

  await sharp(SOURCE)
    .extract({ left: 38, top: 28, width: 300, height: 340 })
    .png()
    .toFile(pinOut);

  console.log("Yala Delivery logo extracted.");
}

if (require.main === module) {
  extractDeliveryLogo().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { extractDeliveryLogo };
