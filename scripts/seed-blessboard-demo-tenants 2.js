#!/usr/bin/env node
"use strict";

/**
 * Explicit seed for BlessBoard catalogue demo tenants (demo + demo2).
 *
 * Safety:
 * - Refuses when DEPLOYMENT_ENV is not testing (unless ALLOW_DEMO_SEED_OUTSIDE_TESTING=1 for local only).
 * - Requires DATABASE_URL (no GETPRO_DATABASE_URL fallback when BlessBoard.org testing).
 * - Idempotent.
 *
 * Usage:
 *   DEPLOYMENT_ENV=testing DATABASE_URL=… node scripts/seed-blessboard-demo-tenants.js
 */

const { getPgPool, isPgConfigured, summarizeDatabaseUrlEnv } = require("../src/db/pg/pool");
const { ensureChurchSchema } = require("../src/db/pg/ensureChurchSchema");
const {
  isTestingDeployment,
  getDeploymentEnvMode,
  getChurchHostDomain,
  isBlessBoardOrgTestingDeployment,
} = require("../src/church/blessBoardEnv");
const {
  seedAllCatalogueDemoOrganizationsIfMissing,
} = require("../src/seeds/seedChurchDemoOrganization");
const { DEMO_TENANT_CATALOGUE, demoTenantPublicHost } = require("../src/church/demoTenantCatalogue");

function allowOutsideTesting() {
  const v = String(process.env.ALLOW_DEMO_SEED_OUTSIDE_TESTING || "")
    .trim()
    .toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

async function main() {
  if (!isTestingDeployment() && !allowOutsideTesting()) {
    console.error(
      `[church:seed-demos] Refusing: DEPLOYMENT_ENV mode is "${getDeploymentEnvMode()}" (need testing). ` +
        `Set DEPLOYMENT_ENV=testing, or ALLOW_DEMO_SEED_OUTSIDE_TESTING=1 for local non-testing only.`
    );
    process.exit(2);
  }

  if (!process.env.DATABASE_URL || !String(process.env.DATABASE_URL).trim()) {
    console.error(
      "[church:seed-demos] Refusing: DATABASE_URL is required. GETPRO_DATABASE_URL fallback is not accepted by this script."
    );
    process.exit(2);
  }

  // Temporarily clear GETPRO fallback visibility: require DATABASE_URL already checked.
  if (isBlessBoardOrgTestingDeployment()) {
    const summary = summarizeDatabaseUrlEnv();
    if (summary.effectiveSource !== "DATABASE_URL") {
      console.error(
        `[church:seed-demos] Refusing: BlessBoard.org testing must use DATABASE_URL (effective=${summary.effectiveSource}).`
      );
      process.exit(2);
    }
  }

  if (!isPgConfigured()) {
    console.error("[church:seed-demos] PostgreSQL is not configured.");
    process.exit(1);
  }

  const pool = getPgPool();
  await ensureChurchSchema(pool);

  console.log(
    `[church:seed-demos] Seeding catalogue demos on church domain=${getChurchHostDomain()} ` +
      `(hosts: ${DEMO_TENANT_CATALOGUE.map((t) => demoTenantPublicHost(t.slug)).join(", ")})`
  );

  const results = await seedAllCatalogueDemoOrganizationsIfMissing(pool);
  const summary = results.map((r) => ({
    organizationId: r.organization.id,
    slug: r.organization.slug,
    name: r.organization.name,
    dataEnvironment: r.organization.data_environment,
    hostSlug: r.branch.host_slug,
    publicHost: demoTenantPublicHost(r.organization.slug),
  }));

  console.log(JSON.stringify({ ok: true, tenants: summary }, null, 2));
  process.exit(0);
}

main().catch((err) => {
  console.error(err && err.message ? err.message : err);
  process.exit(1);
});
