const fs = require("fs");
const path = require("path");

const appType = process.argv[2];
const wwwDir = process.argv[3];

if (!appType || !wwwDir) {
  console.error("Usage: node stamp-native-app-type.js <rider|driver|admin> <www-dir>");
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

fs.writeFileSync(indexPath, html);
console.log(`Stamped ${appType} app type into ${indexPath}`);
