#!/usr/bin/env node
/**
 * Production build: patch CRA webpack (CSS ignoreOrder), then react-scripts build
 * with ESLint webpack plugin disabled (legacy codebase has thousands of warnings).
 */
const { execSync } = require("child_process");
const path = require("path");

if (process.env.SKIP_PATCH !== "1") {
  require("./patch-react-scripts-webpack");
}

const cwd = path.join(__dirname, "..");
const env = { ...process.env, NODE_ENV: "production", DISABLE_ESLINT_PLUGIN: "true" };

execSync("npx react-scripts build", { stdio: "inherit", env, cwd, shell: true, windowsHide: true });
