#!/usr/bin/env node
/**
 * Ensures frontend/.env.local exists for `npm run start:admin`.
 * Prefers .env.admin (operator-specific, gitignored), else copies .env.admin.example.
 */
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const target = path.join(root, ".env.local");
const preferred = path.join(root, ".env.admin");
const example = path.join(root, ".env.admin.example");

let src = null;
let label = "";
if (fs.existsSync(preferred)) {
  src = preferred;
  label = ".env.admin";
} else if (fs.existsSync(example)) {
  src = example;
  label = ".env.admin.example";
}

if (src) {
  fs.copyFileSync(src, target);
  process.stdout.write(`[start:admin] Wrote .env.local from ${label}\n`);
} else {
  process.stderr.write(
    "[start:admin] Missing .env.admin and .env.admin.example — create .env.local manually (see .env.admin.example)\n"
  );
}
