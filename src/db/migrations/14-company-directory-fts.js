"use strict";

const { rebuildCompanySearchFts, FTS_MIGRATION_ID } = require("../../companies/companySearchFts");

/**
 * FTS5 index for public directory text search (name, headline, about).
 * Keeps rowid aligned with companies.id; triggers maintain sync on row changes.
 */
module.exports = function run(db) {
  try {
    if (!db.prepare("SELECT 1 FROM _getpro_migrations WHERE id = ?").get(FTS_MIGRATION_ID)) {
      db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS companies_fts USING fts5(
          name,
          headline,
          about,
          tokenize = 'unicode61 remove_diacritics 2',
          prefix = '2 3 4'
        );

        CREATE TRIGGER IF NOT EXISTS companies_fts_ai AFTER INSERT ON companies BEGIN
          INSERT INTO companies_fts(rowid, name, headline, about)
          VALUES (
            new.id,
            coalesce(new.name, ''),
            coalesce(new.headline, ''),
            coalesce(new.about, '')
          );
        END;

        CREATE TRIGGER IF NOT EXISTS companies_fts_ad AFTER DELETE ON companies BEGIN
          INSERT INTO companies_fts(companies_fts, rowid) VALUES('delete', old.id);
        END;

        CREATE TRIGGER IF NOT EXISTS companies_fts_au AFTER UPDATE OF name, headline, about ON companies BEGIN
          INSERT INTO companies_fts(companies_fts, rowid) VALUES('delete', old.id);
          INSERT INTO companies_fts(rowid, name, headline, about)
          VALUES (
            new.id,
            coalesce(new.name, ''),
            coalesce(new.headline, ''),
            coalesce(new.about, '')
          );
        END;
      `);

      rebuildCompanySearchFts(db);

      db.prepare("INSERT INTO _getpro_migrations (id) VALUES (?)").run(FTS_MIGRATION_ID);
      // eslint-disable-next-line no-console
      console.log(`[getpro] Migration: ${FTS_MIGRATION_ID} (FTS5 directory search + triggers + initial rebuild).`);
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[getpro] company_directory_fts_v1 migration:", e.message);
  }
};
