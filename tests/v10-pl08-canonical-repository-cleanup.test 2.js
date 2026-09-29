"use strict";

/**
 * V10 PL08 — Canonical repository cleanup characterization.
 * Asserts Finder forks / scratch noise stay gone; Stitch design dirs may remain.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const { discoverMigrations } = require("../db/scripts/lib/migrator");

function walkFiles(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === "node_modules" || ent.name === ".git") continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walkFiles(full, acc);
    else acc.push(full);
  }
  return acc;
}

describe("PL08 canonical repository cleanup", () => {
  it("has zero Finder * 2.* / * 3.* / * copy.* files under src/public/views/tests/db", () => {
    const roots = ["src", "public", "views", "tests", "db"].map((r) => path.join(ROOT, r));
    const hits = [];
    for (const root of roots) {
      for (const file of walkFiles(root)) {
        const base = path.basename(file);
        if (/\s2\./.test(base) || /\s3\./.test(base) || /\scopy\./i.test(base)) {
          hits.push(path.relative(ROOT, file));
        }
      }
    }
    assert.deepEqual(hits, []);
  });

  it("has zero scripts/local/_tmp_v2_* scratch harnesses", () => {
    const dir = path.join(ROOT, "scripts/local");
    const hits = fs
      .readdirSync(dir)
      .filter((n) => n.startsWith("_tmp_v2_") && n.endsWith(".js"));
    assert.deepEqual(hits, []);
  });

  it("does not keep empty blessboard/rbac stub directory", () => {
    assert.equal(fs.existsSync(path.join(ROOT, "src/blessboard/rbac")), false);
  });

  it("retains Stitch design-reference dirs (not deleted as Finder noise)", () => {
    const stitchRoot = path.join(ROOT, "design-reference/stitch-screens");
    assert.equal(fs.existsSync(stitchRoot), true);
    // Authoritative / design-reference forks may remain as directories.
    const desktop2 = path.join(
      stitchRoot,
      "church-flow/01-public-website/01-public-home-desktop 2"
    );
    assert.equal(fs.existsSync(desktop2), true);
  });

  it("migration discovery excludes Finder junk and reports canonical count", () => {
    const files = discoverMigrations();
    assert.equal(files.some((f) => f.filename.includes(" 2.")), false);
    assert.equal(files.length, 205);
  });

  it("keeps thin BB organizationKey re-export (still test-compat; not UNKNOWN delete)", () => {
    assert.equal(
      fs.existsSync(path.join(ROOT, "src/blessboard/services/organizationKey.js")),
      true
    );
  });
});
