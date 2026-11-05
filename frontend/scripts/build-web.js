#!/usr/bin/env node
/**
 * Production build of the public YALA website (REACT_APP_TYPE=web).
 *
 * Create React App never lets an .env file override a variable that is already
 * set in the process environment, so setting REACT_APP_TYPE here beats any
 * leftover `.env.local` (written by `start:delivery`, `start:admin` and the
 * native app builds). No .env file is created, changed or deleted, so local
 * development and the native Rider/Driver/Delivery builds keep working.
 *
 * After the build, the bundle is checked: the build fails if the app type
 * compiled into it is anything other than "web".
 */
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const env = { ...process.env, REACT_APP_TYPE: "web" };

const localEnv = path.join(ROOT, ".env.local");
if (fs.existsSync(localEnv)) {
  const m = fs.readFileSync(localEnv, "utf8").match(/^\s*REACT_APP_TYPE\s*=\s*(\S+)/m);
  if (m && m[1] !== "web") {
    console.log(`[build-web] .env.local sets REACT_APP_TYPE=${m[1]}; ignored for this build (forced to web).`);
  }
}

const bin = require.resolve("react-scripts/bin/react-scripts.js", { paths: [ROOT] });
const result = spawnSync(process.execPath, [bin, "build"], { cwd: ROOT, env, stdio: "inherit" });
if (result.status !== 0) process.exit(result.status || 1);

const jsDir = path.join(ROOT, "build", "static", "js");
const bundles = fs.readdirSync(jsDir).filter((f) => f.endsWith(".js"));
const types = new Set();
for (const file of bundles) {
  const code = fs.readFileSync(path.join(jsDir, file), "utf8");
  for (const m of code.matchAll(/REACT_APP_TYPE:"([a-z]*)"/g)) types.add(m[1]);
}
if (types.size !== 1 || !types.has("web")) {
  console.error(`[build-web] FAILED: bundle app type is ${JSON.stringify([...types])}, expected ["web"].`);
  process.exit(1);
}
console.log('[build-web] OK: bundle app type is "web".');
