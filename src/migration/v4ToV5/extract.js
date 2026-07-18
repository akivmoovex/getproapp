"use strict";

/**
 * Extraction interface — local fixtures or local PG only.
 * Hosted / production URLs must be rejected by callers.
 */

const fs = require("fs");
const path = require("path");

function assertNotHostedUrl(connectionString) {
  if (!connectionString) return;
  const s = String(connectionString).toLowerCase();
  if (s.includes("supabase.co") || s.includes("amazonaws.com") || s.includes("neon.tech")) {
    throw new Error("hosted_database_forbidden");
  }
}

/**
 * @param {string} [fixturesDir]
 */
function createFixtureExtractor(fixturesDir) {
  const root =
    fixturesDir ||
    path.join(__dirname, "fixtures");

  return {
    /**
     * @param {string} entity
     * @param {string|null} cursor
     */
    async extract(entity, cursor) {
      const file = path.join(root, `${entity}.json`);
      if (!fs.existsSync(file)) {
        return { rows: [], nextCursor: null };
      }
      const all = JSON.parse(fs.readFileSync(file, "utf8"));
      if (!Array.isArray(all)) {
        throw new Error(`fixture_not_array:${entity}`);
      }
      const start = cursor ? Number(cursor) : 0;
      const pageSize = 100;
      const rows = all.slice(start, start + pageSize);
      const next = start + pageSize < all.length ? String(start + pageSize) : null;
      return { rows, nextCursor: next };
    },
  };
}

/**
 * Placeholder for a future local-PG extractor. Not wired to write path.
 * @param {{ connectionString: string }} options
 */
function createLocalPgExtractor(options) {
  assertNotHostedUrl(options && options.connectionString);
  return {
    async extract() {
      throw new Error("local_pg_extractor_not_implemented");
    },
  };
}

module.exports = {
  assertNotHostedUrl,
  createFixtureExtractor,
  createLocalPgExtractor,
};
