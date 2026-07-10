#!/usr/bin/env node
"use strict";

/**
 * Idempotent create/update of the BlessBoard demo church branch admin.
 *
 * Manual only — not run on app startup.
 *
 * Usage:
 *   npm run church:demo-admin
 *   node scripts/create-demo-church-admin.js
 *
 * Requires DATABASE_URL or GETPRO_DATABASE_URL.
 *
 * Env overrides (optional):
 *   DEMO_CHURCH_SLUG
 *   DEMO_CHURCH_ADMIN_EMAIL
 *   DEMO_CHURCH_ADMIN_PASSWORD
 *   DEMO_CHURCH_ADMIN_NAME
 */

const { runBootstrap } = require("../src/startup/bootstrap");
const boot = runBootstrap();

const { getPgPool, isPgConfigured, closePgPool, logDatabaseEnvMissingDiagnostics } = require("../src/db/pg");
const branchesRepo = require("../src/db/pg/church/branchesRepo");
const branchAdminsRepo = require("../src/db/pg/church/branchAdminsRepo");
const { hashBranchAdminPassword } = require("../src/church/branchAdminAuth");

const DEMO_HOST_SLUG = String(process.env.DEMO_CHURCH_SLUG || "demo")
  .toLowerCase()
  .trim();
const DEMO_ADMIN_EMAIL = String(process.env.DEMO_CHURCH_ADMIN_EMAIL || "admin@demo.blessboard.com")
  .toLowerCase()
  .trim();
const DEMO_ADMIN_NAME = String(process.env.DEMO_CHURCH_ADMIN_NAME || "Demo Church Admin").trim();
const DEMO_ADMIN_PASSWORD = String(process.env.DEMO_CHURCH_ADMIN_PASSWORD || "DemoAdmin@2026!");

async function upsertDemoBranchAdmin(pool) {
  const branch = await branchesRepo.findBranchByHostSlug(pool, DEMO_HOST_SLUG);
  if (!branch) {
    console.error(
      `[church:demo-admin] No church branch found for host_slug='${DEMO_HOST_SLUG}'. ` +
        `Seed the demo church first (demo.blessboard.com), then re-run this script.`
    );
    process.exitCode = 1;
    return;
  }

  const passwordHash = await hashBranchAdminPassword(DEMO_ADMIN_PASSWORD);
  const email = DEMO_ADMIN_EMAIL;
  const username = email;

  const existing =
    (await branchAdminsRepo.findBranchAdminByEmailForBranch(pool, branch.id, email)) ||
    (
      await pool.query(
        `SELECT * FROM public.church_branch_admins
         WHERE branch_id = $1 AND lower(trim(username)) = $2
         LIMIT 1`,
        [branch.id, username]
      )
    ).rows[0];

  if (existing) {
    await pool.query(
      `UPDATE public.church_branch_admins
       SET full_name = $3,
           display_name = $3,
           email = $4,
           username = $5,
           password_hash = $6,
           role = 'branch_admin',
           status = 'active',
           password_changed_at = now(),
           password_changed_by = 'system',
           updated_at = now(),
           failed_login_attempts = 0,
           login_locked_until = null
       WHERE id = $1 AND branch_id = $2`,
      [existing.id, branch.id, DEMO_ADMIN_NAME, email, username, passwordHash]
    );
    console.log(`[church:demo-admin] Updated branch admin for host_slug='${DEMO_HOST_SLUG}'.`);
  } else {
    await branchAdminsRepo.createBranchAdmin(pool, {
      organization_id: branch.organization_id,
      branch_id: branch.id,
      full_name: DEMO_ADMIN_NAME,
      email,
      phone: "",
      password_hash: passwordHash,
      role: "branch_admin",
      status: "active",
    });
    console.log(`[church:demo-admin] Created branch admin for host_slug='${DEMO_HOST_SLUG}'.`);
  }

  console.log(`[church:demo-admin] Login URL: https://demo.blessboard.com/branch/login`);
  console.log(`[church:demo-admin] Email: ${email}`);
  console.log(`[church:demo-admin] This is a branch admin (not BlessBoard platform admin).`);
  console.log(`[church:demo-admin] Change the temporary password before sharing outside the team.`);
}

async function main() {
  if (!isPgConfigured()) {
    logDatabaseEnvMissingDiagnostics({
      label: "scripts/create-demo-church-admin.js",
      envPath: boot.envPath,
      dotenvKeyCount: boot.dotenvKeyCount,
      dotenvErrorMessage: boot.dotenvErrorMessage,
      startupEntry: boot.startupEntry,
      beforeDbSnapshot: boot.beforeDb,
      envFileExists: boot.envFileExists,
    });
    console.error("[church:demo-admin] DATABASE_URL (or GETPRO_DATABASE_URL) is required.");
    process.exitCode = 1;
    return;
  }

  if (!DEMO_ADMIN_PASSWORD || DEMO_ADMIN_PASSWORD.length < 8) {
    console.error("[church:demo-admin] DEMO_CHURCH_ADMIN_PASSWORD must be at least 8 characters.");
    process.exitCode = 1;
    return;
  }

  const pool = getPgPool();
  try {
    await upsertDemoBranchAdmin(pool);
  } finally {
    await closePgPool();
  }
}

main().catch((err) => {
  console.error("[church:demo-admin] Failed:", err && err.message ? err.message : err);
  process.exitCode = 1;
  closePgPool().catch(() => {});
});
