#!/usr/bin/env node
"use strict";

/**
 * Safe cleanup of the Kafue Baptist Church *sample seed* organisation from a V5 testing database.
 *
 * Source of that record: src/seeds/seedChurchSampleOrganization.js (slug kafuebaptist),
 * historically auto-run on server boot. Not a migration and not real production tenant data.
 *
 * Safety gates (all required):
 * - DEPLOYMENT_ENV must resolve to testing
 * - DATABASE_URL must be set (GETPRO_DATABASE_URL fallback refused)
 * - --confirm flag required
 * - --organization-id=<id> required (never deletes by name alone)
 * - Target row must match slug kafuebaptist AND name "Kafue Baptist Church"
 * - Idempotent: missing org exits 0 with ok:false alreadyGone
 *
 * Usage:
 *   DEPLOYMENT_ENV=testing DATABASE_URL=… \
 *     node scripts/cleanup-kafue-sample-seed.js --organization-id=123 --confirm
 *
 * Read-only report (no delete):
 *   DEPLOYMENT_ENV=testing DATABASE_URL=… \
 *     node scripts/cleanup-kafue-sample-seed.js --report
 */

const { getPgPool, isPgConfigured, summarizeDatabaseUrlEnv, redactDatabaseHostFingerprint, getDatabaseUrl } = require("../src/db/pg/pool");
const { ensureChurchSchema } = require("../src/db/pg/ensureChurchSchema");
const {
  isTestingDeployment,
  getDeploymentEnvMode,
  isBlessBoardOrgTestingDeployment,
} = require("../src/church/blessBoardEnv");
const { SAMPLE_ORG_SLUG } = require("../src/seeds/seedChurchSampleOrganization");

const EXPECTED_NAME = "Kafue Baptist Church";

function parseArgs(argv) {
  const out = { confirm: false, report: false, organizationId: null };
  for (const arg of argv) {
    if (arg === "--confirm") out.confirm = true;
    else if (arg === "--report") out.report = true;
    else if (arg.startsWith("--organization-id=")) {
      const n = Number(arg.slice("--organization-id=".length));
      out.organizationId = Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
    }
  }
  return out;
}

function refuse(msg, code = 2) {
  console.error(`[church:cleanup-kafue] ${msg}`);
  process.exit(code);
}

async function assertTestingDatabaseGates() {
  if (!isTestingDeployment()) {
    refuse(
      `Refusing: DEPLOYMENT_ENV mode is "${getDeploymentEnvMode()}" (need testing). Will not modify non-testing deployments.`
    );
  }
  if (!process.env.DATABASE_URL || !String(process.env.DATABASE_URL).trim()) {
    refuse("Refusing: DATABASE_URL is required. GETPRO_DATABASE_URL fallback is not accepted.");
  }
  // Ensure pool will not silently use GETPRO_DATABASE_URL
  if (isBlessBoardOrgTestingDeployment()) {
    const summary = summarizeDatabaseUrlEnv();
    if (summary.effectiveSource !== "DATABASE_URL") {
      refuse(`Refusing: effective DB source is ${summary.effectiveSource}; need DATABASE_URL.`);
    }
  } else {
    // Still refuse if DATABASE_URL unset was somehow bypassed; and warn if GETPRO is also set
    const summary = summarizeDatabaseUrlEnv();
    if (summary.effectiveSource !== "DATABASE_URL") {
      refuse(`Refusing: effective DB source is ${summary.effectiveSource}; need DATABASE_URL only.`);
    }
  }
  if (!isPgConfigured()) {
    refuse("PostgreSQL is not configured.", 1);
  }
}

async function findKafueCandidates(pool) {
  const r = await pool.query(
    `SELECT o.id, o.name, o.slug, o.status, o.data_environment, o.created_at
     FROM public.church_organizations o
     WHERE lower(trim(o.slug)) = $1
        OR lower(trim(o.name)) = lower($2)
     ORDER BY o.id ASC`,
    [SAMPLE_ORG_SLUG, EXPECTED_NAME]
  );
  return r.rows;
}

async function deleteOrganisationCascade(pool, orgId) {
  // Tenant-scoped deletes only — never cross-org.
  const tables = [
    "church_audit_logs",
    "church_branch_website_content",
    "church_sermons",
    "church_resources",
    "church_announcements",
    "church_events",
    "church_ministries",
    "church_ministry_leaders",
    "church_members",
    "church_branch_admins",
    "church_hq_admins",
    "church_branches",
  ];
  for (const table of tables) {
    await pool.query(`DELETE FROM public.${table} WHERE organization_id = $1`, [orgId]).catch(() => {});
  }
  await pool.query(`DELETE FROM public.church_organizations WHERE id = $1`, [orgId]);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  await assertTestingDatabaseGates();

  const pool = getPgPool();
  await ensureChurchSchema(pool);

  const hostFp = redactDatabaseHostFingerprint(getDatabaseUrl());
  console.log(
    `[church:cleanup-kafue] deploymentMode=${getDeploymentEnvMode()} dbHost=${hostFp} (secrets redacted)`
  );

  const candidates = await findKafueCandidates(pool);

  if (args.report || !args.confirm) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          mode: args.report || !args.confirm ? "report" : "delete",
          expectedSlug: SAMPLE_ORG_SLUG,
          expectedName: EXPECTED_NAME,
          candidates: candidates.map((c) => ({
            id: c.id,
            name: c.name,
            slug: c.slug,
            status: c.status,
            data_environment: c.data_environment,
            created_at: c.created_at,
            matchesSampleSeed:
              String(c.slug || "").toLowerCase() === SAMPLE_ORG_SLUG &&
              String(c.name || "").trim() === EXPECTED_NAME,
          })),
          hint:
            candidates.length === 0
              ? "No matching organisations. Nothing to clean."
              : "To delete the sample seed only: pass --organization-id=<id> --confirm for the row that matches slug+name.",
        },
        null,
        2
      )
    );
    if (!args.report && !args.confirm) {
      console.error("[church:cleanup-kafue] Refusing delete without --confirm (and --organization-id).");
      process.exit(2);
    }
    process.exit(0);
  }

  if (!args.organizationId) {
    refuse("Refusing delete without --organization-id=<id> (never deletes by name alone).");
  }

  const target = candidates.find((c) => Number(c.id) === args.organizationId);
  if (!target) {
    console.log(
      JSON.stringify({
        ok: false,
        alreadyGone: true,
        message: `Organisation id=${args.organizationId} not found among Kafue/sample candidates.`,
      })
    );
    process.exit(0);
  }

  const slugOk = String(target.slug || "").toLowerCase() === SAMPLE_ORG_SLUG;
  const nameOk = String(target.name || "").trim() === EXPECTED_NAME;
  if (!slugOk || !nameOk) {
    refuse(
      `Refusing: organisation id=${target.id} does not match both slug="${SAMPLE_ORG_SLUG}" and name="${EXPECTED_NAME}" ` +
        `(got slug="${target.slug}" name="${target.name}"). May be a real tenant — aborting.`
    );
  }

  console.log(
    `[church:cleanup-kafue] Deleting sample seed organisation id=${target.id} name="${target.name}" slug=${target.slug}`
  );
  await deleteOrganisationCascade(pool, target.id);

  const again = await pool.query(`SELECT id FROM public.church_organizations WHERE id = $1`, [target.id]);
  console.log(
    JSON.stringify({
      ok: true,
      deletedOrganizationId: target.id,
      name: target.name,
      slug: target.slug,
      remaining: again.rows.length === 0,
    })
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err && err.message ? err.message : err);
  process.exit(1);
});
