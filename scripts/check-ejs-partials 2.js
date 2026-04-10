#!/usr/bin/env node
"use strict";

/**
 * Verifies that static include('...') paths in all views .ejs files resolve to files under views/.
 * Catches missing partials after merges or incomplete deploys (same class of error as EJS "Could not find the include file").
 *
 * Usage: node scripts/check-ejs-partials.js
 * Exit 1 if any referenced file is missing.
 */

const fs = require("fs");
const path = require("path");

const repoRoot = path.join(__dirname, "..");
const viewsDir = path.join(repoRoot, "views");

function walk(dir, acc) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, acc);
    else if (e.isFile() && e.name.endsWith(".ejs")) acc.push(full);
  }
}

const ejsFiles = [];
walk(viewsDir, ejsFiles);

// Matches ejs.resolveInclude: path is resolved from the *including file's directory*, not views root.
const includeRe = /include\s*\(\s*['"]([^'"]+)['"]/g;
const missing = [];

for (const file of ejsFiles) {
  const text = fs.readFileSync(file, "utf8");
  let m;
  while ((m = includeRe.exec(text)) !== null) {
    const rel = m[1].trim();
    if (!rel || rel.startsWith("http") || rel.includes("${")) continue;
    if (rel.startsWith("/")) continue;
    const dir = path.dirname(file);
    let target = path.resolve(dir, rel);
    if (!path.extname(rel)) target += ".ejs";
    if (!fs.existsSync(target)) {
      missing.push({ from: path.relative(repoRoot, file), include: rel, expected: path.relative(repoRoot, target) });
    }
  }
}

if (missing.length) {
  // eslint-disable-next-line no-console
  console.error("[getpro] check-ejs-partials — MISSING files for include():");
  for (const row of missing) {
    // eslint-disable-next-line no-console
    console.error(`  ${row.from}: include('${row.include}') → expected ${row.expected}`);
  }
  process.exit(1);
}

// eslint-disable-next-line no-console
console.log(`[getpro] check-ejs-partials — OK (${ejsFiles.length} templates scanned)`);
