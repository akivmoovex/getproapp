#!/usr/bin/env node
"use strict";

/**
 * Verifies PostgreSQL connectivity and that core tables from db/postgres/000_full_schema.sql exist.
 * Does not print connection strings or passwords.
 *
 * Usage: npm run check:pg
 * Env: DATABASE_URL or GETPRO_DATABASE_URL (required for a real check).
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env"), quiet: true });

const { getPgPool, isPgConfigured, closePgPool } = require("../src/db/pg");

/** Minimal set the app expects after applying 000_full_schema.sql */
const REQUIRED_TABLES = [
  "tenants",
  "admin_users",
  "admin_user_tenant_roles",
  "categories",
  "companies",
  "leads",
  "callback_interests",
  "field_agents",
  "field_agent_provider_submissions",
  "field_agent_callback_leads",
];

async function main() {
  if (!isPgConfigured()) {
    // eslint-disable-next-line no-console
    console.error(
      "[getpro] check:pg — FAILED: set DATABASE_URL or GETPRO_DATABASE_URL (same as server.js)."
    );
    process.exit(1);
  }

  const pool = getPgPool();
  let client;
  try {
    client = await pool.connect();
    const dbRes = await client.query("SELECT current_database() AS database");
    const dbName = dbRes.rows[0].database;
    // eslint-disable-next-line no-console
    console.log("[getpro] check:pg — connected, database:", dbName);

    const r = await client.query(
      `SELECT c.relname AS name
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname = ANY($1::text[])`,
      [REQUIRED_TABLES]
    );
    const found = new Set(r.rows.map((row) => row.name));
    const missing = REQUIRED_TABLES.filter((t) => !found.has(t));

    if (missing.length) {
      // eslint-disable-next-line no-console
      console.error(
        "[getpro] check:pg — FAILED: missing tables:",
        missing.join(", "),
        "\n→ In Supabase: SQL Editor → paste and run db/postgres/000_full_schema.sql (see README)."
      );
      process.exit(1);
    }

    const tenantsCount = await client.query("SELECT COUNT(*)::int AS n FROM public.tenants");
    const n = tenantsCount.rows[0].n;
    if (n === 0) {
      // eslint-disable-next-line no-console
      console.warn(
        "[getpro] check:pg — WARN: public.tenants is empty. Seed data or super-admin region setup may be required."
      );
    }

    // eslint-disable-next-line no-console
    console.log(`[getpro] check:pg — OK (core tables present${n === 0 ? "; tenants empty" : ""})`);
    process.exit(0);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[getpro] check:pg — FAILED:", err.message);
    if (/SSL|ECONNREFUSED|timeout|password authentication/i.test(String(err.message))) {
      // eslint-disable-next-line no-console
      console.error(
        "→ Check: connection string in Supabase, firewall (allow your IP if using direct DB), sslmode, and GETPRO_PG_SSL if needed."
      );
    }
    process.exit(1);
  } finally {
    if (client) client.release();
    await closePgPool();
  }
}

main();
