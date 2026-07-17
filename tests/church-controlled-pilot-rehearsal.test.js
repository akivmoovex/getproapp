"use strict";

/**
 * Tests for controlled V5 pilot seed / rehearsal / cleanup (testing DB only).
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const { isPgConfigured, getPgPool } = require("../src/db/pg/pool");
const { ensureChurchSchema } = require("../src/db/pg/ensureChurchSchema");
const { ensureCanonicalTenantsForTests } = require("./helpers/pgTestSeed");
const organizationsRepo = require("../src/db/pg/church/organizationsRepo");
const {
  normalizePilotId,
  assertControlledPilotSafety,
  seedControlledPilot,
  cleanupControlledPilot,
  previewPilotCleanup,
  foundationSlug,
  growthSlug,
  pilotMarker,
  redactSecrets,
} = require("../src/services/church/churchControlledPilotSeedService");
const {
  runControlledPilotRehearsal,
} = require("../src/services/church/churchControlledPilotRehearsalService");

const skip = !isPgConfigured();

test("normalizePilotId rejects empty and wildcards", () => {
  assert.throws(() => normalizePilotId(""), (e) => e.code === "INVALID_PILOT_ID");
  assert.throws(() => normalizePilotId("*"), (e) => e.code === "INVALID_PILOT_ID");
  assert.throws(() => normalizePilotId("ab/cd"), (e) => e.code === "INVALID_PILOT_ID");
  assert.equal(normalizePilotId("V5R1"), "v5r1");
});

test("redactSecrets never echoes connection strings", () => {
  const out = redactSecrets("db=postgresql://u:p@h/db password=secret");
  assert.ok(!out.includes("postgresql://"));
  assert.ok(!out.includes("secret"));
});

test("production refusal when DEPLOYMENT_ENV is not testing", async () => {
  const prev = process.env.DEPLOYMENT_ENV;
  process.env.DEPLOYMENT_ENV = "production";
  try {
    await assert.rejects(
      () => assertControlledPilotSafety(null, { requireConfirm: false }),
      (e) => e && e.code === "PRODUCTION_REFUSED"
    );
  } finally {
    if (prev == null) delete process.env.DEPLOYMENT_ENV;
    else process.env.DEPLOYMENT_ENV = prev;
  }
});

test(
  "controlled pilot: seed idempotent, conflict refuse, rehearse, cleanup scope",
  { skip },
  async () => {
    const pool = getPgPool();
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);

    const prevEnv = process.env.DEPLOYMENT_ENV;
    process.env.DEPLOYMENT_ENV = "testing";
    const pilotId = `t${Date.now().toString(36).slice(-6)}`;

    try {
      await assert.rejects(
        () =>
          seedControlledPilot(pool, {
            pilotId,
            confirm: false,
            allowTestDatabaseUrl: true,
          }),
        (e) => e && e.code === "CONFIRM_REQUIRED"
      );

      const first = await seedControlledPilot(pool, {
        pilotId,
        confirm: true,
        allowTestDatabaseUrl: true,
      });
      assert.equal(first.ok, true);
      assert.equal(first.foundation.organization.plan_code, "foundation");
      assert.equal(first.growth.organization.plan_code, "growth");
      assert.ok(first.growth.branches.length >= 2);
      assert.equal(first.foundation.organization.data_environment, "pilot");
      assert.equal(first.growth.organization.plan_notes, pilotMarker(pilotId));

      const second = await seedControlledPilot(pool, {
        pilotId,
        confirm: true,
        allowTestDatabaseUrl: true,
      });
      assert.equal(second.idempotent, true);
      assert.equal(second.foundation.organization.id, first.foundation.organization.id);
      assert.equal(second.growth.organization.id, first.growth.organization.id);

      // Conflicting tenant with same foundation slug but different marker
      await assert.rejects(async () => {
        const conflictSlug = foundationSlug(pilotId);
        // Temporarily rename pilot foundation marker to simulate foreign tenant owning slug —
        // instead create a different org then try seed with id that maps to taken slug via hack:
        // use a new pilot id whose growth slug collides by pre-creating org with that slug.
        const otherId = `x${Date.now().toString(36).slice(-5)}`;
        await organizationsRepo.createOrganization(pool, {
          platform_tenant_id: first.foundation.organization.platform_tenant_id,
          slug: growthSlug(otherId),
          name: "Foreign non-pilot org",
          data_environment: "production",
          status: "active",
          plan_code: "foundation",
        });
        await seedControlledPilot(pool, {
          pilotId: otherId,
          confirm: true,
          allowTestDatabaseUrl: true,
        });
      }, (e) => e && e.code === "TENANT_CONFLICT");

      const rehearsal = await runControlledPilotRehearsal(pool, {
        pilotId,
        confirm: true,
        allowTestDatabaseUrl: true,
        requireConfirm: true,
      });
      assert.ok(rehearsal.reportText.includes("verdict="));
      assert.ok(!/postgresql:\/\//i.test(rehearsal.reportText));
      assert.ok(!rehearsal.reportText.includes("PilotRehearsal_TestOnly"));
      const orgIds = new Set([
        rehearsal.report.tenants.foundation.id,
        rehearsal.report.tenants.growth.id,
      ]);
      for (const f of rehearsal.report.flows.details) {
        if (f.organizationId) assert.ok(orgIds.has(f.organizationId));
      }

      const preview = await previewPilotCleanup(pool, pilotId);
      assert.equal(preview.organizations.length, 2);

      await assert.rejects(
        () =>
          cleanupControlledPilot(pool, {
            pilotId,
            confirm: false,
            allowTestDatabaseUrl: true,
          }),
        (e) => e && e.code === "CONFIRM_REQUIRED"
      );

      const cleaned = await cleanupControlledPilot(pool, {
        pilotId,
        confirm: true,
        allowTestDatabaseUrl: true,
      });
      assert.equal(cleaned.deleted.length, 2);

      const gone = await organizationsRepo.findOrganizationById(
        pool,
        first.foundation.organization.id
      );
      assert.equal(gone, null);

      // Cleanup must not touch unrelated orgs — foreign conflict org may remain
      const foreign = await pool.query(
        `SELECT id FROM public.church_organizations WHERE name = 'Foreign non-pilot org' LIMIT 1`
      );
      assert.ok(foreign.rows[0], "unrelated tenant must remain after exact pilot cleanup");
      await pool.query(`DELETE FROM public.church_organizations WHERE id = $1`, [foreign.rows[0].id]);
    } finally {
      try {
        await cleanupControlledPilot(pool, {
          pilotId,
          confirm: true,
          allowTestDatabaseUrl: true,
        });
      } catch {
        /* already cleaned */
      }
      if (prevEnv == null) delete process.env.DEPLOYMENT_ENV;
      else process.env.DEPLOYMENT_ENV = prevEnv;
    }
  }
);
