"use strict";

/**
 * Canonical package provisioning + organization usage-count correctness.
 *
 * 1. Foundation provisioning succeeds
 * 2. Growth provisioning succeeds
 * 3. free is rejected
 * 4. standard is rejected
 * 5. pro is rejected
 * 6. Invalid package / mid-provision failure rolls back (no partial org/branch/admin)
 * 7. Three branches + N verified members → N members (not 3N)
 * 8. Mixed member statuses count only verified as active
 * 9. Existing legacy package rows are reported but not rewritten
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const { ensureChurchSchema } = require("../src/db/pg/ensureChurchSchema");
const { requireChurchPgOrSkip } = require("./helpers/churchPgTest");
const { ensureCanonicalTenantsForTests } = require("./helpers/pgTestSeed");
const { TENANT_ZM } = require("../src/tenants/tenantIds");
const {
  validateProvisioningBody,
  assertCanonicalProvisioningPlanCode,
  PLAN_CODES,
} = require("../src/church/platformProvisioningValidation");
const { validatePlanUpdateBody } = require("../src/church/churchPlanValidation");
const platformProvisioningRepo = require("../src/db/pg/church/platformProvisioningRepo");
const organizationsRepo = require("../src/db/pg/church/organizationsRepo");

function suffix(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function baseProvisionPayload(slug, planCode) {
  const s = suffix(slug);
  return {
    platform_tenant_id: TENANT_ZM,
    organization: {
      name: `Pkg Test ${s}`,
      slug: `pkg-${s}`,
      country: "Zambia",
      city: "Lusaka",
      plan_code: planCode,
      status: "active",
      primary_contact_phone: "0977111000",
      primary_contact_email: `contact_${s}@example.com`,
    },
    branch: {
      name: `Main ${s}`,
      slug: `pkg-${s}`,
      host_slug: `pkg-${s}`,
      city: "Lusaka",
      country: "Zambia",
      status: "active",
      contact_phone: "0977111000",
      contact_email: `branch_contact_${s}@example.com`,
      welcome_message: `Welcome to Main ${s}`,
      service_times: "Sunday",
      location_text: "Lusaka",
    },
    hqAdmin: {
      full_name: `HQ ${s}`,
      email: `hq_${s}@example.com`,
      phone: "0977111001",
      temporary_password: "temppass123",
    },
    branchAdmin: {
      full_name: `BA ${s}`,
      email: `ba_${s}@example.com`,
      phone: "0977111002",
      temporary_password: "temppass456",
    },
    onboarding: {
      publishWebsite: false,
      memberRegistrationEnabled: true,
    },
  };
}

async function cleanupOrg(pool, orgId) {
  if (!orgId) return;
  await pool.query(`DELETE FROM public.church_members WHERE organization_id = $1`, [orgId]);
  await pool.query(`DELETE FROM public.church_audit_logs WHERE organization_id = $1`, [orgId]);
  await pool.query(`DELETE FROM public.church_branch_admins WHERE organization_id = $1`, [orgId]);
  await pool.query(`DELETE FROM public.church_hq_admins WHERE organization_id = $1`, [orgId]);
  await pool.query(`DELETE FROM public.church_branches WHERE organization_id = $1`, [orgId]);
  await pool.query(`DELETE FROM public.church_organizations WHERE id = $1`, [orgId]);
}

test("canonical PLAN_CODES are foundation and growth only", () => {
  assert.deepEqual([...PLAN_CODES], ["foundation", "growth"]);
  assert.equal(assertCanonicalProvisioningPlanCode("foundation").ok, true);
  assert.equal(assertCanonicalProvisioningPlanCode("growth").ok, true);
  assert.equal(assertCanonicalProvisioningPlanCode("free").ok, false);
  assert.equal(assertCanonicalProvisioningPlanCode("standard").ok, false);
  assert.equal(assertCanonicalProvisioningPlanCode("pro").ok, false);
  assert.equal(assertCanonicalProvisioningPlanCode("network").ok, false);
  assert.equal(assertCanonicalProvisioningPlanCode("enterprise").ok, false);
  assert.equal(assertCanonicalProvisioningPlanCode("").ok, true);
  assert.equal(assertCanonicalProvisioningPlanCode("").value, "foundation");
  assert.equal(assertCanonicalProvisioningPlanCode(null).value, "foundation");
});

test("validateProvisioningBody rejects free, standard, pro, and network", () => {
  for (const code of ["free", "standard", "pro", "network", "unknown-pkg"]) {
    const result = validateProvisioningBody({
      organization_name: "Reject Legacy",
      organization_slug: `rej-${code}`.slice(0, 40),
      country: "Zambia",
      plan_code: code,
      branch_name: "Main",
      branch_host_slug: `rej-${String(code).replace(/[^a-z0-9-]/gi, "").slice(0, 20) || "x"}`,
      hq_full_name: "HQ Admin",
      hq_email: "hq@example.com",
      hq_temporary_password: "temppass123",
      branch_admin_full_name: "Branch Admin",
      branch_admin_email: "ba@example.com",
      branch_admin_temporary_password: "temppass456",
    });
    assert.equal(result.ok, false, `expected reject for ${code}`);
    assert.match(result.error, /legacy|foundation or growth|invalid package/i);
  }
});

test("validatePlanUpdateBody does not silently map pro to growth", () => {
  const rejected = validatePlanUpdateBody({ plan_code: "pro" });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.data, undefined);
  // Must reject, never rewrite the incoming code to growth.
  assert.notEqual(rejected.ok && rejected.data && rejected.data.plan_code, "growth");
});

test("PG: Foundation provisioning succeeds", async (t) => {
  const pool = await requireChurchPgOrSkip(t);
  if (!pool) return;
  await ensureChurchSchema(pool);
  await ensureCanonicalTenantsForTests(pool);

  const payload = baseProvisionPayload("found", "foundation");
  let orgId = null;
  try {
    const result = await platformProvisioningRepo.provisionChurchOrganization(pool, payload, null);
    orgId = result.organization.id;
    assert.equal(result.organization.plan_code, "foundation");
    assert.ok(result.branch && result.branch.id);
    assert.ok(result.hqAdmin && result.hqAdmin.id);
    assert.ok(result.branchAdmin && result.branchAdmin.id);
  } finally {
    await cleanupOrg(pool, orgId);
  }
});

test("PG: Growth provisioning succeeds", async (t) => {
  const pool = await requireChurchPgOrSkip(t);
  if (!pool) return;
  await ensureChurchSchema(pool);
  await ensureCanonicalTenantsForTests(pool);

  const payload = baseProvisionPayload("growth", "growth");
  let orgId = null;
  try {
    const result = await platformProvisioningRepo.provisionChurchOrganization(pool, payload, null);
    orgId = result.organization.id;
    assert.equal(result.organization.plan_code, "growth");
  } finally {
    await cleanupOrg(pool, orgId);
  }
});

test("PG: free / standard / pro / network / unknown provisioning rejected at service layer", async (t) => {
  const pool = await requireChurchPgOrSkip(t);
  if (!pool) return;
  await ensureChurchSchema(pool);
  await ensureCanonicalTenantsForTests(pool);

  for (const code of ["free", "standard", "pro", "network", "enterprise"]) {
    const payload = baseProvisionPayload(`leg-${code}`, code);
    await assert.rejects(
      () => platformProvisioningRepo.provisionChurchOrganization(pool, payload, null),
      (err) => err && err.code === "INVALID_PLAN_CODE"
    );
    const leftover = await pool.query(
      `SELECT id FROM public.church_organizations WHERE slug = $1`,
      [payload.organization.slug]
    );
    assert.equal(leftover.rowCount, 0, `no partial org for ${code}`);
  }
});

test("PG: missing plan_code defaults to Foundation (documented)", async (t) => {
  const pool = await requireChurchPgOrSkip(t);
  if (!pool) return;
  await ensureChurchSchema(pool);
  await ensureCanonicalTenantsForTests(pool);

  const payload = baseProvisionPayload("def-found", "");
  delete payload.organization.plan_code;
  let orgId = null;
  try {
    const result = await platformProvisioningRepo.provisionChurchOrganization(pool, payload, null);
    orgId = result.organization.id;
    assert.equal(result.organization.plan_code, "foundation");
  } finally {
    await cleanupOrg(pool, orgId);
  }
});

test("PG: HQ admin creation failure rolls back organization and branch", async (t) => {
  const pool = await requireChurchPgOrSkip(t);
  if (!pool) return;
  await ensureChurchSchema(pool);
  await ensureCanonicalTenantsForTests(pool);

  const payload = baseProvisionPayload("hqfail", "foundation");
  const bcrypt = require("bcryptjs");
  const realHash = bcrypt.hash.bind(bcrypt);
  let hashCalls = 0;
  bcrypt.hash = async (...args) => {
    hashCalls += 1;
    // Fail on the first hash (HQ admin password) after org+branch exist.
    if (hashCalls === 1) {
      throw Object.assign(new Error("forced HQ password hash failure"), { code: "FORCED_HQ_FAIL" });
    }
    return realHash(...args);
  };

  try {
    await assert.rejects(() =>
      platformProvisioningRepo.provisionChurchOrganization(pool, payload, null)
    );

    const org = await pool.query(`SELECT id FROM public.church_organizations WHERE slug = $1`, [
      payload.organization.slug,
    ]);
    assert.equal(org.rowCount, 0, "organization rolled back after HQ failure");
    const branches = await pool.query(
      `SELECT id FROM public.church_branches WHERE host_slug = $1`,
      [payload.branch.host_slug]
    );
    assert.equal(branches.rowCount, 0, "branch rolled back after HQ failure");
  } finally {
    bcrypt.hash = realHash;
  }
});

test("PG: branch-admin creation failure rolls back organization, branch, and HQ", async (t) => {
  const pool = await requireChurchPgOrSkip(t);
  if (!pool) return;
  await ensureChurchSchema(pool);
  await ensureCanonicalTenantsForTests(pool);

  const payload = baseProvisionPayload("bafail", "foundation");
  const bcrypt = require("bcryptjs");
  const realHash = bcrypt.hash.bind(bcrypt);
  let hashCalls = 0;
  bcrypt.hash = async (...args) => {
    hashCalls += 1;
    // First hash = HQ (ok); second = branch admin (fail) — role/account assignment step.
    if (hashCalls === 2) {
      throw Object.assign(new Error("forced branch-admin hash failure"), { code: "FORCED_BA_FAIL" });
    }
    return realHash(...args);
  };

  try {
    await assert.rejects(() =>
      platformProvisioningRepo.provisionChurchOrganization(pool, payload, null)
    );

    const org = await pool.query(`SELECT id FROM public.church_organizations WHERE slug = $1`, [
      payload.organization.slug,
    ]);
    assert.equal(org.rowCount, 0);
    const hq = await pool.query(`SELECT id FROM public.church_hq_admins WHERE email = $1`, [
      payload.hqAdmin.email,
    ]);
    assert.equal(hq.rowCount, 0, "HQ admin rolled back with org");
    const ba = await pool.query(`SELECT id FROM public.church_branch_admins WHERE email = $1`, [
      payload.branchAdmin.email,
    ]);
    assert.equal(ba.rowCount, 0);
  } finally {
    bcrypt.hash = realHash;
  }
});

test("PG: mid-provision failure rolls back org, branch, admins", async (t) => {
  const pool = await requireChurchPgOrSkip(t);
  if (!pool) return;
  await ensureChurchSchema(pool);
  await ensureCanonicalTenantsForTests(pool);

  const payload = baseProvisionPayload("rollback", "foundation");
  // Force failure after org INSERT: branch name NOT NULL violation.
  payload.branch.name = null;

  await assert.rejects(() =>
    platformProvisioningRepo.provisionChurchOrganization(pool, payload, null)
  );

  const org = await pool.query(`SELECT id FROM public.church_organizations WHERE slug = $1`, [
    payload.organization.slug,
  ]);
  assert.equal(org.rowCount, 0, "organization rolled back");

  const branches = await pool.query(
    `SELECT id FROM public.church_branches WHERE host_slug = $1 OR slug = $1`,
    [payload.branch.host_slug]
  );
  assert.equal(branches.rowCount, 0, "branch rolled back");

  const hq = await pool.query(`SELECT id FROM public.church_hq_admins WHERE email = $1`, [
    payload.hqAdmin.email,
  ]);
  assert.equal(hq.rowCount, 0, "hq admin rolled back");

  const ba = await pool.query(`SELECT id FROM public.church_branch_admins WHERE email = $1`, [
    payload.branchAdmin.email,
  ]);
  assert.equal(ba.rowCount, 0, "branch admin rolled back");
});

test("PG: three branches and N verified members return N, not 3N", async (t) => {
  const pool = await requireChurchPgOrSkip(t);
  if (!pool) return;
  await ensureChurchSchema(pool);
  await ensureCanonicalTenantsForTests(pool);

  const s = suffix("usage");
  const org = await organizationsRepo.createOrganization(pool, {
    platform_tenant_id: TENANT_ZM,
    slug: `usage-${s}`,
    name: `Usage ${s}`,
    status: "active",
    plan_code: "growth",
    data_environment: "test",
  });

  const branchIds = [];
  try {
    for (let i = 0; i < 3; i += 1) {
      const br = await pool.query(
        `INSERT INTO public.church_branches (organization_id, slug, host_slug, name, status)
         VALUES ($1, $2, $3, $4, 'active')
         RETURNING id`,
        [org.id, `usage-b${i}-${s}`, `usage-b${i}-${s}`, `Branch ${i}`]
      );
      branchIds.push(br.rows[0].id);
    }

    const verifiedN = 5;
    for (let i = 0; i < verifiedN; i += 1) {
      const branchId = branchIds[i % branchIds.length];
      await pool.query(
        `INSERT INTO public.church_members
           (organization_id, branch_id, platform_tenant_id, email, phone, full_name, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'verified')`,
        [
          org.id,
          branchId,
          TENANT_ZM,
          `member${i}_${s}@example.com`,
          `0977${String(100000 + i)}`,
          `Member ${i}`,
        ]
      );
    }

    // Zero-member / zero-branch sanity on a separate empty org
    const empty = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `empty-${s}`,
      name: `Empty ${s}`,
      status: "active",
      plan_code: "foundation",
      data_environment: "test",
    });
    const emptyUsage = await organizationsRepo.getOrganizationUsageCounts(pool, empty.id);
    assert.equal(emptyUsage.branches_count, 0);
    assert.equal(emptyUsage.active_branches_count, 0);
    assert.equal(emptyUsage.active_members_count, 0);
    assert.equal(emptyUsage.total_members_count, 0);
    await cleanupOrg(pool, empty.id);

    const usage = await organizationsRepo.getOrganizationUsageCounts(pool, org.id);
    assert.equal(usage.branches_count, 3);
    assert.equal(usage.active_branches_count, 3);
    assert.equal(usage.active_members_count, verifiedN, "must not multiply by branch count");
    assert.equal(usage.total_members_count, verifiedN);
    assert.notEqual(usage.active_members_count, verifiedN * 3);
  } finally {
    await cleanupOrg(pool, org.id);
  }
});

test("PG: mixed member statuses count only verified as active", async (t) => {
  const pool = await requireChurchPgOrSkip(t);
  if (!pool) return;
  await ensureChurchSchema(pool);
  await ensureCanonicalTenantsForTests(pool);

  const s = suffix("mixed");
  const org = await organizationsRepo.createOrganization(pool, {
    platform_tenant_id: TENANT_ZM,
    slug: `mixed-${s}`,
    name: `Mixed ${s}`,
    status: "active",
    plan_code: "foundation",
    data_environment: "test",
  });

  try {
    const br = await pool.query(
      `INSERT INTO public.church_branches (organization_id, slug, host_slug, name, status)
       VALUES ($1, $2, $3, $4, 'active')
       RETURNING id`,
      [org.id, `mixed-${s}`, `mixed-${s}`, `Mixed Branch`]
    );
    const branchId = br.rows[0].id;

    const statuses = ["verified", "verified", "pending", "rejected"];
    for (let i = 0; i < statuses.length; i += 1) {
      await pool.query(
        `INSERT INTO public.church_members
           (organization_id, branch_id, platform_tenant_id, email, phone, full_name, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          org.id,
          branchId,
          TENANT_ZM,
          `mix${i}_${s}@example.com`,
          `0966${String(100000 + i)}`,
          `Mix ${i}`,
          statuses[i],
        ]
      );
    }

    const usage = await organizationsRepo.getOrganizationUsageCounts(pool, org.id);
    assert.equal(usage.active_members_count, 2);
    assert.equal(usage.total_members_count, 4);
    assert.equal(usage.branches_count, 1);
    assert.equal(usage.active_branches_count, 1);
  } finally {
    await cleanupOrg(pool, org.id);
  }
});

test("PG: legacy package rows are reported but not rewritten", async (t) => {
  const pool = await requireChurchPgOrSkip(t);
  if (!pool) return;
  await ensureChurchSchema(pool);
  await ensureCanonicalTenantsForTests(pool);

  const s = suffix("legacy");
  // Insert legacy rows directly (bypass createOrganization which rejects legacy).
  const inserted = await pool.query(
    `INSERT INTO public.church_organizations
       (platform_tenant_id, slug, name, status, data_environment, plan_code)
     VALUES
       ($1, $2, $3, 'active', 'test', 'free'),
       ($1, $4, $5, 'active', 'test', 'standard'),
       ($1, $6, $7, 'active', 'test', 'pro')
     RETURNING id, plan_code`,
    [
      TENANT_ZM,
      `leg-free-${s}`,
      `Legacy Free ${s}`,
      `leg-std-${s}`,
      `Legacy Std ${s}`,
      `leg-pro-${s}`,
      `Legacy Pro ${s}`,
    ]
  );
  const ids = inserted.rows.map((r) => r.id);

  try {
    const before = inserted.rows.map((r) => r.plan_code).sort();
    assert.deepEqual(before, ["free", "pro", "standard"]);

    const audit = await organizationsRepo.getLegacyPlanCodeAudit(pool);
    assert.ok(audit.legacyTotal >= 3);
    assert.equal(audit.legacyIncompatible, true);
    assert.ok(audit.freeCount >= 1);
    assert.ok(audit.standardCount >= 1);
    assert.ok(audit.proCount >= 1);
    assert.ok(Array.isArray(audit.legacyByCode));
    assert.ok(audit.legacyByCode.some((r) => r.plan_code === "free" && r.organization_count >= 1));
    assert.ok(audit.legacyByCode.every((r) => r.plan_code && typeof r.organization_count === "number"));
    assert.match(audit.note, /not auto-rewritten/i);

    const after = await pool.query(
      `SELECT plan_code FROM public.church_organizations WHERE id = ANY($1::int[]) ORDER BY plan_code`,
      [ids]
    );
    assert.deepEqual(
      after.rows.map((r) => r.plan_code),
      ["free", "pro", "standard"],
      "legacy rows must not be rewritten by the audit"
    );
  } finally {
    for (const id of ids) await cleanupOrg(pool, id);
  }
});

test("PG: index on church_members (organization_id, status) exists", async (t) => {
  const pool = await requireChurchPgOrSkip(t);
  if (!pool) return;
  await ensureChurchSchema(pool);
  const r = await pool.query(
    `SELECT 1
       FROM pg_indexes
      WHERE schemaname = 'public'
        AND indexname = 'idx_church_members_organization_status'`
  );
  assert.equal(r.rowCount, 1);
});
