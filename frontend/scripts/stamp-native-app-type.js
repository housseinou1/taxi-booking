const fs = require("fs");
const path = require("path");

const appType = process.argv[2];
const wwwDir = process.argv[3];

if (!appType || !wwwDir) {
  console.error("Usage: node stamp-native-app-type.js <rider|driver|delivery|admin> <www-dir>");
  process.exit(1);
}

const indexPath = path.join(wwwDir, "index.html");
if (!fs.existsSync(indexPath)) {
  console.error(`index.html not found: ${indexPath}`);
  process.exit(1);
}

const stamp = `<script>window.__YALA_APP_TYPE__="${appType}"</script>`;
let html = fs.readFileSync(indexPath, "utf8");

html = html.replace(/<script>window\.__YALA_APP_TYPE__="[^"]*"<\/script>/g, "");
html = html.replace("<head>", `<head>${stamp}`);

if (appType === "delivery") {
  html = html
    .replace(/<title>[^<]*<\/title>/, "<title>Yala Delivery</title>")
    .replace(
      /content="Yala — Ride Anywhere[^"]*"/,
      'content="Yala Delivery — deliver packages, food, and parcels across Mauritania."'
    )
    .replace(/apple-mobile-web-app-title" content="[^"]*"/, 'apple-mobile-web-app-title" content="Yala Delivery"')
    .replace(/theme-color" content="[^"]*"/, 'theme-color" content="#FF6B00"');
}

if (appType === "admin") {
  html = html
    .replace(/<title>[^<]*<\/title>/, "<title>Yala Admin</title>")
    .replace(
      /content="Yala — Ride Anywhere[^"]*"/,
      'content="Yala Admin — manage Yala platform operations across Mauritania."'
    )
    .replace(/apple-mobile-web-app-title" content="[^"]*"/, 'apple-mobile-web-app-title" content="Yala Admin"')
    .replace(/theme-color" content="[^"]*"/, 'theme-color" content="#082D84"');
}

if (appType === "driver") {
  html = html
    .replace(/<title>[^<]*<\/title>/, "<title>Yala Driver</title>")
    .replace(
      /content="Yala — Ride Anywhere[^"]*"/,
      'content="Yala Driver — accept rides, navigate, and earn across Mauritania."'
    )
    .replace(/apple-mobile-web-app-title" content="[^"]*"/, 'apple-mobile-web-app-title" content="Yala Driver"')
    .replace(/theme-color" content="[^"]*"/, 'theme-color" content="#00A651"');
}

if (appType === "rider") {
  html = html
    .replace(/<title>[^<]*<\/title>/, "<title>Yala Rider</title>")
    .replace(
      /content="Yala — Ride Anywhere[^"]*"/,
      'content="Yala Rider — book rides, track your driver, and travel across Mauritania."'
    )
    .replace(/apple-mobile-web-app-title" content="[^"]*"/, 'apple-mobile-web-app-title" content="Yala Rider"')
    .replace(/theme-color" content="[^"]*"/, 'theme-color" content="#7C3AED"');
}

fs.writeFileSync(indexPath, html);
console.log(`Stamped ${appType} app type into ${indexPath}`);

const manifestPath = path.join(wwwDir, "manifest.json");
if (!fs.existsSync(manifestPath)) {
  return;
}

if (appType === "delivery") {
  const manifest = {
    short_name: "Yala Delivery",
    name: "Yala Delivery",
    description:
      "Deliver packages, food, groceries, and parcels across Mauritania as a Yala Delivery courier.",
    icons: [
      {
        src: "yala-delivery-logo.png",
        type: "image/png",
        sizes: "512x512",
        purpose: "any maskable",
      },
      {
        src: "favicon.ico",
        sizes: "32x32",
        type: "image/x-icon",
      },
    ],
    start_url: "/delivery/courier",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    theme_color: "#FF6B00",
    background_color: "#08111F",
    categories: ["food", "shopping", "business"],
    shortcuts: [
      {
        name: "Yala Delivery Courier",
        short_name: "Courier",
        description: "Go online and accept deliveries",
        url: "/delivery/courier",
        icons: [{ src: "yala-delivery-logo.png", type: "image/png", sizes: "512x512" }],
      },
    ],
  };

  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Stamped delivery manifest into ${manifestPath}`);
}

if (appType === "admin") {
  const manifest = {
    short_name: "Yala Admin",
    name: "Yala Admin",
    description: "Manage Yala platform operations, users, rides, drivers, and reporting.",
    icons: [
      {
        src: "yala-admin-logo.png",
        type: "image/png",
        sizes: "512x512",
        purpose: "any maskable",
      },
      {
        src: "favicon.ico",
        sizes: "32x32",
        type: "image/x-icon",
      },
    ],
    start_url: "/admin",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    theme_color: "#082D84",
    background_color: "#08111F",
    categories: ["business", "productivity", "navigation"],
    shortcuts: [
      {
        name: "Yala Admin Dashboard",
        short_name: "Dashboard",
        description: "Open platform management dashboard",
        url: "/admin",
        icons: [{ src: "yala-admin-logo.png", type: "image/png", sizes: "512x512" }],
      },
    ],
  };

  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Stamped admin manifest into ${manifestPath}`);
}

if (appType === "driver") {
  const manifest = {
    short_name: "Yala Driver",
    name: "Yala Driver",
    description: "Accept rides, navigate to riders, manage trips, and track driver earnings.",
    icons: [
      {
        src: "yala-driver-logo.png",
        type: "image/png",
        sizes: "512x512",
        purpose: "any maskable",
      },
      {
        src: "favicon.ico",
        sizes: "32x32",
        type: "image/x-icon",
      },
    ],
    start_url: "/driver",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    theme_color: "#00A651",
    background_color: "#08111F",
    categories: ["travel", "navigation", "business"],
    shortcuts: [
      {
        name: "Yala Driver Dashboard",
        short_name: "Driver",
        description: "Go online and manage ride requests",
        url: "/driver",
        icons: [{ src: "yala-driver-logo.png", type: "image/png", sizes: "512x512" }],
      },
    ],
  };

  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Stamped driver manifest into ${manifestPath}`);
}

if (appType === "rider") {
  const manifest = {
    short_name: "Yala Rider",
    name: "Yala Rider",
    description: "Book rides, compare ride types, track your driver, and manage trips.",
    icons: [
      {
        src: "yala-rider-logo.png",
        type: "image/png",
        sizes: "512x512",
        purpose: "any maskable",
      },
      {
        src: "favicon.ico",
        sizes: "32x32",
        type: "image/x-icon",
      },
    ],
    start_url: "/rider-dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    theme_color: "#7C3AED",
    background_color: "#08111F",
    categories: ["travel", "navigation", "business"],
    shortcuts: [
      {
        name: "Yala Rider Dashboard",
        short_name: "Rider",
        description: "Book and track a Yala ride",
        url: "/rider-dashboard",
        icons: [{ src: "yala-rider-logo.png", type: "image/png", sizes: "512x512" }],
      },
    ],
  };

  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Stamped rider manifest into ${manifestPath}`);
}
