/**
 * Lists registered admin paths from PATH_MODULE_MAP + App.js pathname hooks.
 * Run: node frontend/qa/admin-route-inventory.cjs
 */
const fs = require("fs");
const path = require("path");

const repo = path.join(__dirname, "..");
const mapSrc = fs.readFileSync(
  path.join(repo, "src/admin/layouts/permissions/adminRouteAccess.js"),
  "utf8"
);
const appSrc = fs.readFileSync(path.join(repo, "src/App.js"), "utf8");

const mapPaths = [...mapSrc.matchAll(/^\s*"(\/admin[^"]+)":/gm)].map((m) => m[1]);
const appPaths = [
  ...new Set(
    [...appSrc.matchAll(/pathname[=:]\s*"(\/admin[^"]+)"/g)].map((m) => m[1])
  ),
];
const currentPath = [...appSrc.matchAll(/currentPath === "(\/admin[^"]+)"/g)].map((m) => m[1]);

const all = [...new Set([...mapPaths, ...appPaths, ...currentPath])].sort();
const unmapped = all.filter((p) => !mapPaths.includes(p));

console.log(JSON.stringify({ total: all.length, mapped: mapPaths.length, unmapped, paths: all }, null, 2));
