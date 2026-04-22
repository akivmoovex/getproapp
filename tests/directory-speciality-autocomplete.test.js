"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { getPgPool, isPgConfigured } = require("../src/db/pg/pool");
const { TENANT_ZM } = require("../src/tenants/tenantIds");
const { ensureFieldAgentSchema } = require("../src/db/pg/ensureFieldAgentSchema");
const { ensureCompaniesDirectoryFlagsSchema } = require("../src/db/pg/ensureCompaniesDirectoryFlagsSchema");
const companiesRepo = require("../src/db/pg/companiesRepo");
const fieldAgentsRepo = require("../src/db/pg/fieldAgentsRepo");
const fieldAgentSubmissionsRepo = require("../src/db/pg/fieldAgentSubmissionsRepo");
const categoriesRepo = require("../src/db/pg/categoriesRepo");

function read(rel) {
  return fs.readFileSync(path.join(__dirname, "..", rel), "utf8");
}

function uniq() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

test("directory UI wires speciality datalist autocomplete", () => {
  const searchBar = read("views/partials/components/search_bar.ejs");
  assert.match(searchBar, /<datalist id="<%= _pre %>-search-speciality-options">/);
  assert.match(searchBar, /list="<%= _pre %>-search-speciality-options"/);
  assert.match(searchBar, /name="speciality"/);
});

test("directory view passes speciality suggestions to form partial", () => {
  const directory = read("views/directory.ejs");
  assert.match(directory, /specialitySuggestions:/);
});

test("public route loads directory speciality suggestions", () => {
  const route = read("src/routes/public.js");
  assert.match(route, /listDirectorySpecialitySuggestionsPublic/);
  assert.match(route, /directorySpecialitySuggestions/);
});

test("repo suggestions use published public-facing speciality rows", { skip: !isPgConfigured() }, async () => {
  const pool = getPgPool();
  await ensureFieldAgentSchema(pool);
  await ensureCompaniesDirectoryFlagsSchema(pool);
  const tenantId = TENANT_ZM;
  const u = uniq();
  let agentId = null;
  let subId = null;
  let companyId = null;
  try {
    agentId = await fieldAgentsRepo.insertAgent(pool, {
      tenantId,
      username: `fa_auto_${u}`,
      passwordHash: "x",
      displayName: "",
      phone: "",
    });
    subId = await fieldAgentSubmissionsRepo.insertSubmission(pool, null, {
      tenantId,
      fieldAgentId: agentId,
      phoneRaw: `26097${String(u).replace(/\D/g, "").padEnd(8, "1").slice(0, 8)}`,
      phoneNorm: `26097${String(u).replace(/\D/g, "").padEnd(8, "1").slice(0, 8)}`,
      whatsappRaw: "",
      whatsappNorm: "",
      firstName: "Auto",
      lastName: "Complete",
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
    await fieldAgentSubmissionsRepo.replaceWebsiteSpecialityEntriesForSubmission(pool, {
      tenantId,
      submissionId: subId,
      entries: [{ name: "Plumbing", isVerified: false }],
      verifiedByAdminUserId: null,
    });
    const cats = await categoriesRepo.listByTenantId(pool, tenantId);
    const categoryId = cats && cats[0] ? Number(cats[0].id) : null;
    const row = await companiesRepo.insertFull(pool, {
      tenantId,
      subdomain: `auto-${u}`.toLowerCase(),
      name: "Auto Co",
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
      establishedYear: null,
      serviceAreas: "",
      hoursText: "",
      galleryJson: "[]",
      logoUrl: "",
      accountManagerFieldAgentId: agentId,
      sourceFieldAgentSubmissionId: subId,
    });
    companyId = Number(row.id);
    const list = await companiesRepo.listDirectorySpecialitySuggestionsPublic(pool, tenantId, 50);
    assert.ok(Array.isArray(list));
    assert.ok(list.map((x) => String(x).toLowerCase()).includes("plumbing"));
  } finally {
    try {
      if (companyId) await pool.query(`DELETE FROM public.companies WHERE id = $1`, [companyId]);
      if (subId) await pool.query(`DELETE FROM public.field_agent_provider_submissions WHERE id = $1`, [subId]);
      if (agentId) await pool.query(`DELETE FROM public.field_agents WHERE id = $1`, [agentId]);
    } catch {
      /* ignore cleanup */
    }
  }
});
