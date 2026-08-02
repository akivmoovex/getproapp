#!/usr/bin/env node
"use strict";

/**
 * Prompt 8 RBAC E2E fixture CLI (testing only).
 *
 * Usage:
 *   node db/scripts/blessboard-rbac-e2e.js discover
 *   node db/scripts/blessboard-rbac-e2e.js seed
 *   node db/scripts/blessboard-rbac-e2e.js verify
 *   node db/scripts/blessboard-rbac-e2e.js reset
 *
 * Never prints passwords or tokens.
 */

require("dotenv").config({ path: ".env.testing.local" });
const { Pool } = require("pg");
const {
  assertTestingIdentity,
  discoverCanonicalRecords,
  seedRbacE2eFixtures,
  verifyRbacE2eFixtures,
  resetRbacE2eFixtures,
  FIXTURE_PREFIX,
} = require("../../src/blessboard/services/rbacE2eFixtureService");

function usage() {
  console.log(`Usage: node db/scripts/blessboard-rbac-e2e.js <discover|seed|verify|reset>
Fixture prefix: ${FIXTURE_PREFIX}*
Environment must be testing with blessboard-platform-v5.`);
}

async function main() {
  const cmd = String(process.argv[2] || "").trim().toLowerCase();
  if (!["discover", "seed", "verify", "reset"].includes(cmd)) {
    usage();
    process.exit(2);
  }

  const envOk =
    process.env.DEPLOYMENT_ENV === "testing" &&
    process.env.DATABASE_IDENTITY_EXPECTED === "blessboard-platform-v5" &&
    process.env.DATABASE_IDENTITY_ENV === "testing" &&
    process.env.PLATFORM_DEPLOYMENT_CODE === "blessboard-org-v5";
  if (!envOk) {
    console.error("ABORT: testing environment variables not confirmed.");
    process.exit(1);
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const identity = await assertTestingIdentity(pool, { allowCreate: false });
    if (!identity.ok) {
      console.error("ABORT: identity/deployment guard failed:", identity.reason);
      process.exit(1);
    }
    console.log(
      JSON.stringify(
        {
          event: "rbac_e2e_env",
          deployment_env: process.env.DEPLOYMENT_ENV,
          identity_key: identity.identity.row.identity_key,
          environment_code: identity.identity.row.environment_code,
          deployment_code: identity.deployment.deployment_code,
          canonical_domain: identity.deployment.canonical_domain,
          domain_env: process.env.DOMAIN || "(absent)",
        },
        null,
        2
      )
    );

    if (cmd === "discover") {
      const d = await discoverCanonicalRecords(pool, {});
      console.log(
        JSON.stringify(
          {
            ok: d.ok,
            reason: d.reason,
            organizationKey: d.organizationKey,
            organizationId: d.organizationId,
            churchId: d.churchId,
            dataEnvironment: d.dataEnvironment,
            websiteStatus: d.websiteStatus,
            missingBranches: d.missingBranches,
            inactiveBranches: d.inactiveBranches,
            branches: (d.branches || []).map((b) => ({
              id: b.id,
              branch_key: b.branch_key,
              status: b.status,
              is_primary: b.is_primary,
            })),
            domains: d.domains,
          },
          null,
          2
        )
      );
      process.exit(d.ok ? 0 : 1);
    }

    if (cmd === "seed") {
      const result = await seedRbacE2eFixtures(pool, {
        skipIdentityGuard: true,
      });
      if (!result.ok) {
        console.error(JSON.stringify({ event: "seed_failed", ...result }, null, 2));
        process.exit(1);
      }
      console.log(
        JSON.stringify(
          {
            event: "seed_ok",
            fixturePrefix: result.fixturePrefix,
            createdUsers: result.createdUsers,
            createdAssignments: result.createdAssignments,
            context: {
              organizationKey: result.context.organizationKey,
              organizationId: result.context.organizationId,
              churchId: result.context.churchId,
              lusakaKey: result.context.lusakaKey,
              ndolaKey: result.context.ndolaKey,
              websiteStatus: result.context.websiteStatus,
            },
            structures: result.structures,
            assignmentCount: result.assignments.length,
            personas: result.assignments.map((a) => ({
              label: a.label,
              roleKey: a.roleKey,
              scopeType: a.scopeType,
              scopeTarget: a.scopeTarget,
              source: a.source,
              status: a.status,
              sensitivity: a.sensitivity,
            })),
          },
          null,
          2
        )
      );
      process.exit(0);
    }

    if (cmd === "verify") {
      const result = await verifyRbacE2eFixtures(pool, {});
      console.log(
        JSON.stringify(
          {
            event: "verify",
            ok: result.ok,
            failed: result.failed,
            structures: result.structures,
            checks: result.checks,
          },
          null,
          2
        )
      );
      process.exit(result.ok ? 0 : 1);
    }

    if (cmd === "reset") {
      const result = await resetRbacE2eFixtures(pool, {
        skipIdentityGuard: true,
        deactivateUsers: false,
      });
      console.log(JSON.stringify({ event: "reset", ...result }, null, 2));
      process.exit(result.ok ? 0 : 1);
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err && err.message ? err.message : err);
  process.exit(1);
});
