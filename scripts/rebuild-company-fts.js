#!/usr/bin/env node
"use strict";

/**
 * Operator script: full refresh of companies_fts from companies.
 * Uses the same SQLITE_PATH resolution as the app (via db bootstrap).
 *
 * Usage: npm run rebuild-company-fts
 */

const { db } = require("../src/db");
const { rebuildCompanySearchFts, companySearchFtsReady } = require("../src/companies/companySearchFts");

if (!companySearchFtsReady(db)) {
  // eslint-disable-next-line no-console
  console.error("[getpro] companies_fts is missing. Start the app once so migration company_directory_fts_v1 can run.");
  process.exit(1);
}

rebuildCompanySearchFts(db);
const companies = db.prepare("SELECT COUNT(*) AS n FROM companies").get().n;
const fts = db.prepare("SELECT COUNT(*) AS n FROM companies_fts").get().n;
// eslint-disable-next-line no-console
console.log(`[getpro] Rebuilt companies_fts: ${fts} rows (${companies} companies).`);
