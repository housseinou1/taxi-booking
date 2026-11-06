#!/usr/bin/env node
/**
 * Patches Create React App's webpack config so production CSS extraction does not
 * fail on "Conflicting order" across async chunks (mini-css-extract-plugin).
 *
 * Safe: only sets MiniCssExtractPlugin({ ignoreOrder: true }) when missing.
 * Idempotent: safe to run on every `npm install`.
 */
const fs = require("fs");
const path = require("path");

const TARGET = path.join(__dirname, "..", "node_modules", "react-scripts", "config", "webpack.config.js");

const NEEDLE = "new MiniCssExtractPlugin({";
const MARKER = "ignoreOrder: true";

function main() {
  if (!fs.existsSync(TARGET)) {
    console.warn("[patch-react-scripts-webpack] skip: webpack.config.js not found");
    return;
  }
  let src = fs.readFileSync(TARGET, "utf8");
  if (src.includes(MARKER) && src.includes("ignoreOrder")) {
    return;
  }
  const idx = src.indexOf(NEEDLE);
  if (idx === -1) {
    console.warn("[patch-react-scripts-webpack] skip: MiniCssExtractPlugin block not found");
    return;
  }
  const openBrace = idx + NEEDLE.length - 1;
  const afterOpen = src.slice(openBrace + 1, openBrace + 80);
  if (afterOpen.includes("ignoreOrder")) {
    return;
  }
  const insertAt = openBrace + 1;
  const injection = "\n          // Patched by scripts/patch-react-scripts-webpack.js — avoids CSS order deadlocks across chunks.\n          ignoreOrder: true,\n";
  src = src.slice(0, insertAt) + injection + src.slice(insertAt);
  fs.writeFileSync(TARGET, src, "utf8");
  console.log("[patch-react-scripts-webpack] applied ignoreOrder to MiniCssExtractPlugin");
}

main();
