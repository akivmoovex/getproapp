"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("migration 125 declares service_times_mode and supported modes", () => {
  const sql = read("db/migrations/blessboard/125_branch_service_times_mode.sql");
  assert.match(sql, /service_times_mode/);
  assert.match(sql, /inherit/);
  assert.match(sql, /override/);
  assert.match(sql, /hidden/);
  assert.match(sql, /branches_service_times_mode_check/);
  assert.match(sql, /DROP CONSTRAINT IF EXISTS|IF NOT EXISTS/);
});

test("migration 126 declares nullable platform restore provenance", () => {
  const sql = read("db/migrations/blessboard/126_platform_restore_source_reference.sql");
  assert.match(sql, /source_platform_version_id/);
  assert.match(sql, /UUID\s+NULL/i);
  assert.match(sql, /website_publication_versions/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS/);
});

test("migration 127 enforces restoration provenance requirements", () => {
  const sql = read("db/migrations/blessboard/127_restore_provenance_consistency.sql");
  assert.match(sql, /content_restoration/);
  assert.match(sql, /source_platform_version_id/);
  assert.match(sql, /source_version_id/);
  assert.match(sql, /restoration_reason/);
  assert.match(sql, /restored_by/);
  assert.match(sql, /DROP CONSTRAINT IF EXISTS|IF NOT EXISTS/);
});

test("migration 128 backfills only canonical BlessBoard HQ instances", () => {
  const sql = read("db/migrations/blessboard/128_canonical_hq_website_scope_ref.sql");
  assert.match(sql, /product_code\s*=\s*'blessboard'/);
  assert.match(sql, /scope_kind\s*=\s*'church_wide'/);
  assert.match(sql, /scope_ref\s+IS\s+NULL/);
  assert.match(sql, /blessboard\.churches/);
  assert.match(sql, /organization_id/);
  assert.match(sql, /DO \$\$/);
});

test("migrations 125 through 128 have repeat-safe guards", () => {
  for (const file of [
    "125_branch_service_times_mode.sql",
    "126_platform_restore_source_reference.sql",
    "127_restore_provenance_consistency.sql",
    "128_canonical_hq_website_scope_ref.sql",
  ]) {
    const sql = read(`db/migrations/blessboard/${file}`);
    assert.match(sql, /IF NOT EXISTS|DROP CONSTRAINT IF EXISTS|DO \$\$/);
  }
});

test("explicit platform snapshot is forwarded and fallback remains available", () => {
  const source = read("src/platform/website/publicationService.js");
  assert.match(source, /snapshot:\s*input\.snapshot/);
  assert.match(source, /input\.snapshot\s*\|\|/);
});

test("platform version creation persists the selected snapshot", () => {
  const source = read("src/platform/website/publicationService.js");
  assert.match(source, /createPublicationVersion/);
  assert.match(source, /versionService\.createWebsiteVersion/);
  assert.match(source, /snapshot,/);
});

test("platform version creation is transaction-compatible", () => {
  const source = read("src/platform/website/versionService.js");
  assert.match(source, /INSERT INTO platform\.website_versions/);
  assert.match(source, /instance_id/);
  assert.match(source, /organization_id/);
});
