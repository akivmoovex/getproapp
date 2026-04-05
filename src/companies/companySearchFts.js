"use strict";

/**
 * Directory company text search — SQLite FTS5 (`companies_fts`).
 *
 * SYNC ASSUMPTIONS (must match migration triggers):
 * - One FTS row per company: fts rowid == companies.id
 * - Indexed columns mirror public directory LIKE fields: name, headline, about (not services/location/subdomain)
 * - Triggers on companies: AFTER INSERT, AFTER DELETE, AFTER UPDATE OF name, headline, about
 * - Rebuild (`rebuildCompanySearchFts`) full refresh from companies — use after bulk imports or FTS corruption
 */

const FTS_TABLE = "companies_fts";

/**
 * Full rebuild of FTS from `companies` (idempotent, safe on empty DB).
 */
function rebuildCompanySearchFts(db) {
  // Standard FTS5 tables do not support VALUES('delete-all'); clear with DELETE.
  db.prepare(`DELETE FROM ${FTS_TABLE}`).run();
  db.prepare(
    `
    INSERT INTO ${FTS_TABLE}(rowid, name, headline, about)
    SELECT id, coalesce(name, ''), coalesce(headline, ''), coalesce(about, '')
    FROM companies
    `
  ).run();
}

/**
 * Tokenize user input for FTS5 prefix queries. Removes SQL LIKE wildcards first (same as directory route).
 * @returns {string|null} FTS5 MATCH string or null to fall back to LIKE
 */
function buildCompanyDirectoryFtsMatch(searchQ) {
  const cleaned = String(searchQ || "")
    .replace(/[%_\\]/g, "")
    .trim();
  if (!cleaned) return null;

  const tokens = cleaned
    .split(/\s+/)
    .map((t) => t.replace(/[^\p{L}\p{N}]+/gu, ""))
    .filter((t) => t.length > 0);
  if (!tokens.length) return null;

  const esc = (t) => String(t).replace(/"/g, '""');
  return tokens.map((t) => `"${esc(t)}"*`).join(" AND ");
}

/**
 * True when migration has registered the FTS table (read path can rely on triggers existing).
 */
function companySearchFtsReady(db) {
  const row = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(FTS_TABLE);
  return !!row;
}

const FTS_MIGRATION_ID = "company_directory_fts_v1";

/**
 * After migrations: if FTS is enabled but row counts diverge (failed rebuild, bulk SQL, restored DB),
 * rebuild once. Deterministic and idempotent when already in sync.
 */
function ensureCompanyDirectoryFtsInSync(db) {
  if (!companySearchFtsReady(db)) return;
  const mig = db.prepare("SELECT 1 FROM _getpro_migrations WHERE id = ?").get(FTS_MIGRATION_ID);
  if (!mig) return;

  const companies = Number(db.prepare("SELECT COUNT(*) AS n FROM companies").get().n);
  const ftsRows = Number(db.prepare(`SELECT COUNT(*) AS n FROM ${FTS_TABLE}`).get().n);
  if (companies === ftsRows) return;

  // eslint-disable-next-line no-console
  console.warn(
    `[getpro] ${FTS_TABLE} count (${ftsRows}) != companies (${companies}); rebuilding directory FTS index.`
  );
  rebuildCompanySearchFts(db);
}

module.exports = {
  FTS_TABLE,
  FTS_MIGRATION_ID,
  rebuildCompanySearchFts,
  buildCompanyDirectoryFtsMatch,
  companySearchFtsReady,
  ensureCompanyDirectoryFtsInSync,
};
