"use strict";

const { Pool } = require("pg");
const { readIdentityRow } = require("../../db/scripts/lib/databaseIdentity");

const APPROVED_DB = "getpro_v211_qa_sandbox_02";
const APPROVED_URL = "postgresql://127.0.0.1:5432/getpro_v211_qa_sandbox_02";
const REQUIRED_TABLES = [
  ["platform", "database_identity"],
  ["platform", "tenants"],
  ["blessboard", "churches"],
  ["blessboard", "branches"],
];

function databaseName(url) {
  const parsed = new URL(String(url || "").replace(/^postgresql:/i, "postgres:"));
  return decodeURIComponent(parsed.pathname.replace(/^\//, "").split("/")[0] || "");
}

function assertExplicitApprovedUrl(name, value) {
  if (String(value || "").trim() !== APPROVED_URL) {
    throw new Error(`${name} must explicitly equal ${APPROVED_URL}`);
  }
  if (databaseName(value) !== APPROVED_DB) {
    throw new Error(`${name} database name is not approved`);
  }
}

async function verifyV211Sandbox(options = {}) {
  const databaseUrl = options.databaseUrl || process.env.DATABASE_URL;
  const testDatabaseUrl = options.testDatabaseUrl || process.env.TEST_DATABASE_URL;
  assertExplicitApprovedUrl("DATABASE_URL", databaseUrl);
  assertExplicitApprovedUrl("TEST_DATABASE_URL", testDatabaseUrl);
  if (process.env.NODE_ENV === "production") {
    throw new Error("production environment is forbidden");
  }
  const pool = options.pool || new Pool({ connectionString: databaseUrl });
  const result = await pool.query(
    `SELECT table_schema, table_name
       FROM information_schema.tables
      WHERE (table_schema, table_name) IN (${REQUIRED_TABLES.map((_, i) => `($${i * 2 + 1}, $${i * 2 + 2})`).join(", ")})`,
    REQUIRED_TABLES.flat()
  );
  const present = new Set(result.rows.map((row) => `${row.table_schema}.${row.table_name}`));
  const missing = REQUIRED_TABLES.map(([schema, table]) => `${schema}.${table}`)
    .filter((key) => !present.has(key));
  if (missing.length) throw new Error(`required V2.11 schema missing: ${missing.join(", ")}`);
  const identity = await readIdentityRow(pool);
  if (!identity || identity.identity_key !== "moovex-platform-v7") {
    throw new Error("database identity must be moovex-platform-v7");
  }
  return { pool, databaseUrl, identity, requiredTables: REQUIRED_TABLES };
}

function ownedKey(prefix = "qa70") {
  return `${prefix}-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

module.exports = {
  APPROVED_DB,
  APPROVED_URL,
  REQUIRED_TABLES,
  assertExplicitApprovedUrl,
  verifyV211Sandbox,
  ownedKey,
};
