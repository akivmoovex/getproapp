#!/usr/bin/env node
/**
 * Re-inlines public/ds-framework.css into public/styles.css between DS markers.
 * Run after editing ds-framework.css: node scripts/inline-ds-framework.js
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const stylesPath = path.join(root, "public", "styles.css");
const fwPath = path.join(root, "public", "ds-framework.css");

const begin = "/**\n * ========== BEGIN inlined: public/ds-framework.css ==========\n */\n";
const end = "\n/**\n * ========== END inlined: public/ds-framework.css ==========\n";

const styles = fs.readFileSync(stylesPath, "utf8");
const body = fs.readFileSync(fwPath, "utf8");

const startIdx = styles.indexOf(begin);
const endIdx = styles.indexOf(end);
if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
  console.error("Could not find ds-framework markers in styles.css");
  process.exit(1);
}

const next = styles.slice(0, startIdx + begin.length) + body + styles.slice(endIdx);
fs.writeFileSync(stylesPath, next);
console.log("Updated public/styles.css with inlined public/ds-framework.css");
