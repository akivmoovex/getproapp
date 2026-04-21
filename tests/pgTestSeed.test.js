"use strict";

/**
 * Smoke test for tests/helpers/pgTestSeed.js (skipped when Postgres is not configured).
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const { getPgPool, isPgConfigured } = require("../src/db/pg/pool");
const {
  ensureCanonicalTenantsForTests,
  seedFieldAgent,
  seedApprovedProviderSubmission,
  seedWebsiteListingReviewTask,
  TENANT_ZM,
} = require("./helpers/pgTestSeed");

test(
  "pgTestSeed: insert field agent + submission + CRM task, then delete",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    assert.ok(pool);
    await ensureCanonicalTenantsForTests(pool);
    const { id: agentId } = await seedFieldAgent(pool, { tenantId: TENANT_ZM });
    const { submissionId } = await seedApprovedProviderSubmission(pool, {
      tenantId: TENANT_ZM,
      fieldAgentId: agentId,
    });
    const { taskId } = await seedWebsiteListingReviewTask(pool, {
      tenantId: TENANT_ZM,
      submissionId,
      title: "Seed smoke",
      description: "ok",
    });
    assert.ok(Number.isFinite(taskId) && taskId > 0);
    await pool.query(`DELETE FROM public.crm_tasks WHERE id = $1`, [taskId]);
    await pool.query(`DELETE FROM public.field_agent_provider_submissions WHERE id = $1`, [submissionId]);
    await pool.query(`DELETE FROM public.field_agents WHERE id = $1`, [agentId]);
  }
);
