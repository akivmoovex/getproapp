"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { getPgPool, isPgConfigured } = require("../src/db/pg/pool");
const { ensureFieldAgentSchema } = require("../src/db/pg/ensureFieldAgentSchema");
const { ensureCompaniesDirectoryFlagsSchema } = require("../src/db/pg/ensureCompaniesDirectoryFlagsSchema");
const { TENANT_ZM } = require("../src/tenants/tenantIds");

const fieldAgentsRepo = require("../src/db/pg/fieldAgentsRepo");
const fieldAgentSubmissionsRepo = require("../src/db/pg/fieldAgentSubmissionsRepo");
const companiesRepo = require("../src/db/pg/companiesRepo");
const categoriesRepo = require("../src/db/pg/categoriesRepo");

function uniq() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

test("directory filters: speciality + open_now via structured field-agent data", { skip: !isPgConfigured() }, async () => {
  const pool = getPgPool();
  await ensureFieldAgentSchema(pool);
  await ensureCompaniesDirectoryFlagsSchema(pool);

  const suffix = uniq();
  const tenantId = TENANT_ZM;
  const categoryRows = await categoriesRepo.listByTenantId(pool, tenantId);
  const categoryId = categoryRows && categoryRows[0] ? Number(categoryRows[0].id) : null;

  let agentId = null;
  let subOpenId = null;
  let subClosedId = null;
  let openCompanyId = null;
  let closedCompanyId = null;
  let regularCompanyId = null;

  try {
    agentId = await fieldAgentsRepo.insertAgent(pool, {
      tenantId,
      username: `dirflt_fa_${suffix}`,
      passwordHash: "x",
      displayName: "",
      phone: "",
    });

    subOpenId = await fieldAgentSubmissionsRepo.insertSubmission(pool, null, {
      tenantId,
      fieldAgentId: agentId,
      phoneRaw: `26097${String(suffix).replace(/\D/g, "").padEnd(8, "1").slice(0, 8)}`,
      phoneNorm: `26097${String(suffix).replace(/\D/g, "").padEnd(8, "1").slice(0, 8)}`,
      whatsappRaw: "",
      whatsappNorm: "",
      firstName: "Open",
      lastName: "Biz",
      profession: "Plumber",
      city: "Lusaka",
      pacra: "P",
      addressStreet: "S",
      addressLandmarks: "",
      addressNeighbourhood: "",
      addressCity: "Lusaka",
      nrcNumber: "N",
      photoProfileUrl: "",
      workPhotosJson: "[]",
    });
    subClosedId = await fieldAgentSubmissionsRepo.insertSubmission(pool, null, {
      tenantId,
      fieldAgentId: agentId,
      phoneRaw: `26096${String(suffix).replace(/\D/g, "").padEnd(8, "2").slice(0, 8)}`,
      phoneNorm: `26096${String(suffix).replace(/\D/g, "").padEnd(8, "2").slice(0, 8)}`,
      whatsappRaw: "",
      whatsappNorm: "",
      firstName: "Closed",
      lastName: "Biz",
      profession: "Electrician",
      city: "Lusaka",
      pacra: "P",
      addressStreet: "S",
      addressLandmarks: "",
      addressNeighbourhood: "",
      addressCity: "Lusaka",
      nrcNumber: "N",
      photoProfileUrl: "",
      workPhotosJson: "[]",
    });

    await fieldAgentSubmissionsRepo.replaceWebsiteSpecialityEntriesForSubmission(pool, {
      tenantId,
      submissionId: subOpenId,
      entries: [{ name: "Plumbing", isVerified: true }],
      verifiedByAdminUserId: null,
    });
    await fieldAgentSubmissionsRepo.replaceWebsiteSpecialityEntriesForSubmission(pool, {
      tenantId,
      submissionId: subClosedId,
      entries: [{ name: "Electrical", isVerified: false }],
      verifiedByAdminUserId: null,
    });
    await fieldAgentSubmissionsRepo.replaceWebsiteWeeklyHoursForSubmission(pool, {
      tenantId,
      submissionId: subOpenId,
      weeklyHours: {
        sunday: { closed: false, from: "00:00", to: "23:59" },
        monday: { closed: false, from: "00:00", to: "23:59" },
        tuesday: { closed: false, from: "00:00", to: "23:59" },
        wednesday: { closed: false, from: "00:00", to: "23:59" },
        thursday: { closed: false, from: "00:00", to: "23:59" },
        friday: { closed: false, from: "00:00", to: "23:59" },
        saturday: { closed: false, from: "00:00", to: "23:59" },
      },
    });
    await fieldAgentSubmissionsRepo.replaceWebsiteWeeklyHoursForSubmission(pool, {
      tenantId,
      submissionId: subClosedId,
      weeklyHours: {
        sunday: { closed: true, from: "", to: "" },
        monday: { closed: true, from: "", to: "" },
        tuesday: { closed: true, from: "", to: "" },
        wednesday: { closed: true, from: "", to: "" },
        thursday: { closed: true, from: "", to: "" },
        friday: { closed: true, from: "", to: "" },
        saturday: { closed: true, from: "", to: "" },
      },
    });

    const openRow = await companiesRepo.insertFull(pool, {
      tenantId,
      subdomain: `dir-open-${suffix}`.toLowerCase(),
      name: "Directory Open",
      categoryId,
      headline: "",
      about: "",
      services: "",
      phone: "",
      email: "",
      location: "Lusaka",
      featuredCtaLabel: "Call us",
      featuredCtaPhone: "",
      yearsExperience: null,
      serviceAreas: "Plumbing",
      hoursText: "Always open",
      galleryJson: "[]",
      logoUrl: "",
      accountManagerFieldAgentId: agentId,
      sourceFieldAgentSubmissionId: subOpenId,
    });
    openCompanyId = Number(openRow.id);

    const closedRow = await companiesRepo.insertFull(pool, {
      tenantId,
      subdomain: `dir-closed-${suffix}`.toLowerCase(),
      name: "Directory Closed",
      categoryId,
      headline: "",
      about: "",
      services: "",
      phone: "",
      email: "",
      location: "Lusaka",
      featuredCtaLabel: "Call us",
      featuredCtaPhone: "",
      yearsExperience: null,
      serviceAreas: "Electrical",
      hoursText: "Closed",
      galleryJson: "[]",
      logoUrl: "",
      accountManagerFieldAgentId: agentId,
      sourceFieldAgentSubmissionId: subClosedId,
    });
    closedCompanyId = Number(closedRow.id);

    const regularRow = await companiesRepo.insertFull(pool, {
      tenantId,
      subdomain: `dir-regular-${suffix}`.toLowerCase(),
      name: "Directory Regular",
      categoryId,
      headline: "",
      about: "",
      services: "",
      phone: "",
      email: "",
      location: "Lusaka",
      featuredCtaLabel: "Call us",
      featuredCtaPhone: "",
      yearsExperience: null,
      serviceAreas: "",
      hoursText: "",
      galleryJson: "[]",
      logoUrl: "",
      accountManagerFieldAgentId: null,
      sourceFieldAgentSubmissionId: null,
    });
    regularCompanyId = Number(regularRow.id);

    await companiesRepo.updateFullByIdAndTenantId(pool, {
      id: openCompanyId,
      tenantId,
      subdomain: `dir-open-${suffix}`.toLowerCase(),
      name: "Directory Open",
      categoryId,
      headline: "",
      about: "",
      services: "",
      phone: "",
      email: "",
      location: "Lusaka",
      featuredCtaLabel: "Call us",
      featuredCtaPhone: "",
      yearsExperience: null,
      establishedYear: 2012,
      serviceAreas: "Plumbing",
      hoursText: "Always open",
      galleryJson: "[]",
      logoUrl: "",
      accountManagerFieldAgentId: agentId,
      sourceFieldAgentSubmissionId: subOpenId,
    });
    await companiesRepo.updateFullByIdAndTenantId(pool, {
      id: closedCompanyId,
      tenantId,
      subdomain: `dir-closed-${suffix}`.toLowerCase(),
      name: "Directory Closed",
      categoryId,
      headline: "",
      about: "",
      services: "",
      phone: "",
      email: "",
      location: "Lusaka",
      featuredCtaLabel: "Call us",
      featuredCtaPhone: "",
      yearsExperience: null,
      establishedYear: 2008,
      serviceAreas: "Electrical",
      hoursText: "Closed",
      galleryJson: "[]",
      logoUrl: "",
      accountManagerFieldAgentId: agentId,
      sourceFieldAgentSubmissionId: subClosedId,
    });

    const noFilterRows = await companiesRepo.listDirectoryDefault(pool, tenantId, 100);
    assert.ok(noFilterRows.some((r) => Number(r.id) === openCompanyId));
    assert.ok(noFilterRows.some((r) => Number(r.id) === closedCompanyId));
    assert.ok(noFilterRows.some((r) => Number(r.id) === regularCompanyId));

    const specialityRows = await companiesRepo.listDirectoryDefault(pool, tenantId, 100, {
      speciality: "Plumbing",
    });
    assert.ok(specialityRows.some((r) => Number(r.id) === openCompanyId));
    assert.ok(!specialityRows.some((r) => Number(r.id) === closedCompanyId));
    assert.ok(!specialityRows.some((r) => Number(r.id) === regularCompanyId));

    const openNowRows = await companiesRepo.listDirectoryDefault(pool, tenantId, 100, {
      openNow: true,
      dayOfWeek: 1,
      timeHHMM: "12:00",
    });
    assert.ok(openNowRows.some((r) => Number(r.id) === openCompanyId));
    assert.ok(!openNowRows.some((r) => Number(r.id) === closedCompanyId));
    assert.ok(!openNowRows.some((r) => Number(r.id) === regularCompanyId));

    const establishedRows = await companiesRepo.listDirectoryDefault(pool, tenantId, 100, {
      establishedFrom: "2010",
    });
    assert.ok(establishedRows.some((r) => Number(r.id) === openCompanyId));
    assert.ok(!establishedRows.some((r) => Number(r.id) === closedCompanyId));
    assert.ok(!establishedRows.some((r) => Number(r.id) === regularCompanyId));
  } finally {
    try {
      for (const companyId of [openCompanyId, closedCompanyId, regularCompanyId].filter(Boolean)) {
        await pool.query(`DELETE FROM public.companies WHERE id = $1`, [companyId]);
      }
      for (const subId of [subOpenId, subClosedId].filter(Boolean)) {
        await pool.query(`DELETE FROM public.field_agent_provider_submissions WHERE id = $1`, [subId]);
      }
      if (agentId) await pool.query(`DELETE FROM public.field_agents WHERE id = $1`, [agentId]);
    } catch {
      /* ignore cleanup errors */
    }
  }
});
