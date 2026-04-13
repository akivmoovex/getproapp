"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { getPgPool, isPgConfigured } = require("../src/db/pg/pool");
const { TENANT_ZM } = require("../src/tenants/tenantIds");
const { canMutateCompanyFieldAgentLinkage } = require("../src/auth/roles");
const { resolveCompanyFieldAgentLinkage } = require("../src/companies/companyFieldAgentLinkage");
const fieldAgentsRepo = require("../src/db/pg/fieldAgentsRepo");
const fieldAgentSubmissionsRepo = require("../src/db/pg/fieldAgentSubmissionsRepo");
const companiesRepo = require("../src/db/pg/companiesRepo");
const { ensureFieldAgentSchema } = require("../src/db/pg/ensureFieldAgentSchema");
const { ensureCompaniesDirectoryFlagsSchema } = require("../src/db/pg/ensureCompaniesDirectoryFlagsSchema");
const categoriesRepo = require("../src/db/pg/categoriesRepo");

test("canMutateCompanyFieldAgentLinkage: tenant_manager and super_admin only", () => {
  assert.equal(canMutateCompanyFieldAgentLinkage("tenant_manager"), true);
  assert.equal(canMutateCompanyFieldAgentLinkage("super_admin"), true);
  assert.equal(canMutateCompanyFieldAgentLinkage("csr"), false);
  assert.equal(canMutateCompanyFieldAgentLinkage("tenant_editor"), false);
});

test(
  "resolveCompanyFieldAgentLinkage: rejects non-approved submission",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureFieldAgentSchema(pool);
    await ensureCompaniesDirectoryFlagsSchema(pool);
    const u = `link_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const agentId = await fieldAgentsRepo.insertAgent(pool, {
      tenantId: TENANT_ZM,
      username: `fa_${u}`,
      passwordHash: "x",
      displayName: "",
      phone: "",
    });
    const phone = `2609712345${String(u).replace(/\D/g, "").slice(0, 4)}`;
    const subId = await fieldAgentSubmissionsRepo.insertSubmission(pool, null, {
      tenantId: TENANT_ZM,
      fieldAgentId: agentId,
      phoneRaw: phone,
      phoneNorm: phone,
      whatsappRaw: "",
      whatsappNorm: "",
      firstName: "P",
      lastName: "end",
      profession: "X",
      city: "C",
      pacra: "",
      addressStreet: "",
      addressLandmarks: "",
      addressNeighbourhood: "",
      addressCity: "C",
      nrcNumber: "N",
      photoProfileUrl: "",
      workPhotosJson: "[]",
    });
    const r = await resolveCompanyFieldAgentLinkage(pool, {
      tenantId: TENANT_ZM,
      companyId: null,
      canMutate: true,
      existingRow: null,
      body: { source_field_agent_submission_id: String(subId), account_manager_field_agent_id: "" },
    });
    assert.equal(r.ok, false);
    assert.match(String(r.error || ""), /approved/i);
    await pool.query(`DELETE FROM public.field_agent_provider_submissions WHERE id = $1`, [subId]);
    await pool.query(`DELETE FROM public.field_agents WHERE id = $1`, [agentId]);
  }
);

test(
  "resolveCompanyFieldAgentLinkage: approved submission sets account manager",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureFieldAgentSchema(pool);
    await ensureCompaniesDirectoryFlagsSchema(pool);
    const u = `ok_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const agentId = await fieldAgentsRepo.insertAgent(pool, {
      tenantId: TENANT_ZM,
      username: `fa_ok_${u}`,
      passwordHash: "x",
      displayName: "",
      phone: "",
    });
    const phone = `2609723456${String(u).replace(/\D/g, "").slice(0, 4)}`;
    const subId = await fieldAgentSubmissionsRepo.insertSubmission(pool, null, {
      tenantId: TENANT_ZM,
      fieldAgentId: agentId,
      phoneRaw: phone,
      phoneNorm: phone,
      whatsappRaw: "",
      whatsappNorm: "",
      firstName: "Ok",
      lastName: "Sub",
      profession: "X",
      city: "C",
      pacra: "",
      addressStreet: "",
      addressLandmarks: "",
      addressNeighbourhood: "",
      addressCity: "C",
      nrcNumber: "N",
      photoProfileUrl: "",
      workPhotosJson: "[]",
    });
    await fieldAgentSubmissionsRepo.approveFieldAgentSubmission(pool, {
      tenantId: TENANT_ZM,
      submissionId: subId,
      commissionAmount: 0,
    });
    const r = await resolveCompanyFieldAgentLinkage(pool, {
      tenantId: TENANT_ZM,
      companyId: null,
      canMutate: true,
      existingRow: null,
      body: { source_field_agent_submission_id: String(subId), account_manager_field_agent_id: "" },
    });
    assert.equal(r.ok, true);
    assert.equal(r.sourceFieldAgentSubmissionId, subId);
    assert.equal(r.accountManagerFieldAgentId, agentId);
    await pool.query(`DELETE FROM public.field_agent_provider_submissions WHERE id = $1`, [subId]);
    await pool.query(`DELETE FROM public.field_agents WHERE id = $1`, [agentId]);
  }
);

test(
  "companies: unique source_field_agent_submission_id prevents double link",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureFieldAgentSchema(pool);
    await ensureCompaniesDirectoryFlagsSchema(pool);
    const u = `uq_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const agentId = await fieldAgentsRepo.insertAgent(pool, {
      tenantId: TENANT_ZM,
      username: `fa_uq_${u}`,
      passwordHash: "x",
      displayName: "",
      phone: "",
    });
    const phone = `2609734567${String(u).replace(/\D/g, "").slice(0, 4)}`;
    const subId = await fieldAgentSubmissionsRepo.insertSubmission(pool, null, {
      tenantId: TENANT_ZM,
      fieldAgentId: agentId,
      phoneRaw: phone,
      phoneNorm: phone,
      whatsappRaw: "",
      whatsappNorm: "",
      firstName: "U",
      lastName: "Q",
      profession: "X",
      city: "C",
      pacra: "",
      addressStreet: "",
      addressLandmarks: "",
      addressNeighbourhood: "",
      addressCity: "C",
      nrcNumber: "N",
      photoProfileUrl: "",
      workPhotosJson: "[]",
    });
    await fieldAgentSubmissionsRepo.approveFieldAgentSubmission(pool, {
      tenantId: TENANT_ZM,
      submissionId: subId,
      commissionAmount: 0,
    });
    const cat = await categoriesRepo.listByTenantId(pool, TENANT_ZM);
    const catId = cat && cat[0] ? cat[0].id : null;
    const row1 = await companiesRepo.insertFull(pool, {
      tenantId: TENANT_ZM,
      subdomain: `uq-a-${u}`.slice(0, 40).toLowerCase().replace(/[^a-z0-9-]/g, ""),
      name: "Uq A",
      categoryId: catId,
      headline: "",
      about: "",
      services: "",
      phone: "",
      email: "",
      location: "",
      featuredCtaLabel: "Call us",
      featuredCtaPhone: "",
      yearsExperience: null,
      serviceAreas: "",
      hoursText: "",
      galleryJson: "[]",
      logoUrl: "",
      accountManagerFieldAgentId: agentId,
      sourceFieldAgentSubmissionId: subId,
    });
    let err = null;
    try {
      await companiesRepo.insertFull(pool, {
        tenantId: TENANT_ZM,
        subdomain: `uq-b-${u}`.slice(0, 40).toLowerCase().replace(/[^a-z0-9-]/g, ""),
        name: "Uq B",
        categoryId: catId,
        headline: "",
        about: "",
        services: "",
        phone: "",
        email: "",
        location: "",
        featuredCtaLabel: "Call us",
        featuredCtaPhone: "",
        yearsExperience: null,
        serviceAreas: "",
        hoursText: "",
        galleryJson: "[]",
        logoUrl: "",
        accountManagerFieldAgentId: agentId,
        sourceFieldAgentSubmissionId: subId,
      });
    } catch (e) {
      err = e;
    }
    assert.ok(err);
    assert.equal(err.code, "23505");
    await pool.query(`DELETE FROM public.companies WHERE id = $1`, [row1.id]);
    await pool.query(`DELETE FROM public.field_agent_provider_submissions WHERE id = $1`, [subId]);
    await pool.query(`DELETE FROM public.field_agents WHERE id = $1`, [agentId]);
  }
);

test("resolveCompanyFieldAgentLinkage: preserves existing when canMutate false", async () => {
  const pool = {};
  const r = await resolveCompanyFieldAgentLinkage(pool, {
    tenantId: TENANT_ZM,
    companyId: 1,
    canMutate: false,
    existingRow: {
      account_manager_field_agent_id: 7,
      source_field_agent_submission_id: 42,
    },
    body: { source_field_agent_submission_id: "99", account_manager_field_agent_id: "99" },
  });
  assert.equal(r.ok, true);
  assert.equal(r.accountManagerFieldAgentId, 7);
  assert.equal(r.sourceFieldAgentSubmissionId, 42);
});
