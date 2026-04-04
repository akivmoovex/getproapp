#!/usr/bin/env node
/**
 * Re-inlines public/theme.css into public/styles.css between theme markers.
 * Run after editing theme.css: node scripts/sync-inlined-theme.js
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const stylesPath = path.join(root, "public", "styles.css");
const themePath = path.join(root, "public", "theme.css");

const begin = "/**\n * ========== BEGIN inlined: public/theme.css ==========\n */\n";
const end = "\n/**\n * ========== END inlined: public/theme.css ==========\n";

const styles = fs.readFileSync(stylesPath, "utf8");
const body = fs.readFileSync(themePath, "utf8");

const startIdx = styles.indexOf(begin);
const endIdx = styles.indexOf(end);
if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
  console.error("Could not find theme markers in styles.css");
  process.exit(1);
}

const next = styles.slice(0, startIdx + begin.length) + body + styles.slice(endIdx);
fs.writeFileSync(stylesPath, next);
console.log("Updated public/styles.css with inlined public/theme.css");
