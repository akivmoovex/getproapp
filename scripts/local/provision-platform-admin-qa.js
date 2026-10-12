#!/usr/bin/env node
"use strict";

/**
 * Explicit local-only QA bootstrap for a platform_administrator assignment.
 * Credentials are accepted on stdin and never printed.
 */
const { URL } = require("url");
const {
  createProvisionPool,
  requireMatchedIdentity,
  assertNoLegacyPublicTables,
  resolveDatabaseUrlSafe,
  assertNoSecretsInText,
} = require("../../db/scripts/lib/provisionCliSafety");
const { createBlessBoardUser } = require("../../src/blessboard/services/createBlessBoardUser");
const { assignBlessBoardRole } = require("../../src/blessboard/services/assignBlessBoardRole");

const EXPECTED_DB = "getpro_v209_unified_e2e_test";
const EXPECTED_IDENTITY = "moovex-platform-v7";
const EXPECTED_ENV = "testing";

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? String(process.argv[i + 1] || "").trim() : "";
}

function fail(message) {
  console.error(`[platform-admin-qa] BLOCKED ${message}`);
  process.exitCode = 2;
}

function readSecret() {
  return new Promise((resolve, reject) => {
    const chunks = [];
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => chunks.push(chunk));
    process.stdin.on("end", () => resolve(chunks.join("").replace(/\r?\n$/, "")));
    process.stdin.on("error", reject);
  });
}

async function main() {
  if (!process.argv.includes("--qa-confirm")) return fail("explicit_qa_confirm_required");
  if (String(process.env.NODE_ENV || "").toLowerCase() !== "test") return fail("test_mode_required");
  if (String(process.env.DEPLOYMENT_ENV || "").toLowerCase() !== EXPECTED_ENV) {
    return fail("testing_deployment_required");
  }
  if (!process.env.SESSION_SECRET || String(process.env.SESSION_SECRET).length < 32) {
    return fail("session_secret_required");
  }

  const resolved = resolveDatabaseUrlSafe();
  if (!resolved.ok) return fail(resolved.message);
  if (resolved.databaseName !== EXPECTED_DB) return fail("database_name_mismatch");
  let parsed;
  try {
    parsed = new URL(resolved.connectionString);
  } catch {
    return fail("database_url_invalid");
  }
  if (!["localhost", "127.0.0.1", "::1"].includes(parsed.hostname)) {
    return fail("remote_database_rejected");
  }
  if (String(process.env.DATABASE_IDENTITY_EXPECTED || "") !== EXPECTED_IDENTITY) {
    return fail("expected_identity_mismatch");
  }
  const email = arg("--email").toLowerCase();
  const displayName = arg("--display-name");
  const organizationKey = arg("--organization-key");
  if (!email || !displayName || !organizationKey) return fail("email_display_name_and_organization_key_required");
  const password = await readSecret();
  if (!password) return fail("password_stdin_required");

  const pool = createProvisionPool(resolved.connectionString, { max: 2 });
  try {
    const identity = await requireMatchedIdentity(pool);
    if (!identity.ok || identity.environmentCode !== EXPECTED_ENV) return fail("database_identity_mismatch");
    const legacy = await assertNoLegacyPublicTables(pool);
    if (!legacy.ok) return fail("legacy_public_tables_present");

    const created = await createBlessBoardUser(pool, { email, displayName, password });
    if (!created.ok) return fail(`identity_${created.status}`);
    const assigned = await assignBlessBoardRole(pool, {
      email,
      organizationKey,
      roleKey: "platform_administrator",
    });
    if (!assigned.ok) return fail(`role_${assigned.status}`);
    const verify = await pool.query(
      `SELECT 1
         FROM blessboard.user_role_assignments a
         JOIN blessboard.roles r ON r.id = a.role_id
        WHERE a.user_id = $1 AND a.status = 'active'
          AND a.scope_type = 'platform'
          AND r.role_key = 'platform_administrator'
        LIMIT 1`,
      [created.user.id]
    );
    if (!verify.rows[0]) return fail("role_verification_failed");
    console.log(JSON.stringify({
      ok: true,
      email,
      organizationKey,
      identity: EXPECTED_IDENTITY,
      environment: EXPECTED_ENV,
      role: "platform_administrator",
      status: assigned.status,
    }));
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  try { assertNoSecretsInText(String(err && err.message || "")); } catch { /* redact */ }
  fail("provisioner_failure");
});
