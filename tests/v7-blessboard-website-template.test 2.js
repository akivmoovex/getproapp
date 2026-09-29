"use strict";

/**
 * BlessBoard church-website template parity with ActiveClinic:
 * clone public demo pack into tenant-owned public_pages via shared
 * initializeOrganizationWebsite, inject registration fields, isolate tenants.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");

const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const { ensureDatabaseIdentity } = require("../db/scripts/lib/databaseIdentity");
const {
  submitChurchRegistration,
} = require("../src/blessboard/services/platformChurchRegistrationService");
const {
  validatePlatformChurchRegistration,
} = require("../src/blessboard/services/platformChurchRegistrationValidation");
const { PUBLIC_PAGE_KEYS } = require("../src/blessboard/services/publicContentConstants");
const {
  PLACEHOLDER_LABEL,
  buildBlessBoardWebsiteTemplateSpecs,
} = require("../src/blessboard/services/seedTenantWebsiteTemplateContent");
const {
  buildPublicDemoPack,
} = require("../src/blessboard/services/tenantPublicDemoContent");
const { initializeOrganizationWebsite } = require("../src/platform/registration/initializeOrganizationWebsite");
const blessboardAdapter = require("../src/blessboard/registration/blessboardChurchRegistrationAdapter");
const instanceRepo = require("../src/platform/website/instanceRepository");

const IDENTITY_KEY = "blessboard-platform-v5";
const PASSWORD = "church-admin-pass-12";

let pool;
let skipReason = null;
let stamp = 0;
let phoneSeq = 660000000;
let ipSeq = 40;

function requireDb() {
  if (skipReason) {
    // eslint-disable-next-line no-console
    console.log("skip:", skipReason);
    return false;
  }
  return true;
}

function nextPhone() {
  phoneSeq += 1;
  return `+2609${String(phoneSeq).slice(-8)}`;
}

function churchBody(overrides) {
  stamp += 1;
  const key = `bbtpl${stamp}${crypto.randomBytes(3).toString("hex")}`;
  return {
    church_name: `Template Parish ${stamp} ${key}`,
    country: "Zambia",
    city: "Lusaka",
    contact_name: "Church Administrator",
    role_in_church: "Pastor",
    phone: nextPhone(),
    email: `${key}@example.org`,
    selected_plan: "foundation",
    organization_key: key,
    password: PASSWORD,
    password_confirm: PASSWORD,
    branch_name: "HQ Campus",
    consent_contact: "on",
    ...overrides,
  };
}

function fakeReq() {
  ipSeq += 1;
  return {
    ip: `203.0.113.${ipSeq % 250}`,
    requestId: `bbtpl-${Date.now()}-${ipSeq}`,
    get: () => "bbtpl-test-agent",
  };
}

async function submitChurch(body) {
  const validation = validatePlatformChurchRegistration(body, { instantFreeEnabled: true });
  assert.equal(validation.ok, true, JSON.stringify(validation));
  return submitChurchRegistration(pool, fakeReq(), validation, {
    env: { PLATFORM_DEPLOYMENT_CODE: "blessboard-org-staging" },
    dataEnvironment: "testing",
    deploymentCode: "blessboard-org-staging",
  });
}

async function churchIdForOrg(organizationId) {
  const row = await pool.query(
    `SELECT id FROM blessboard.churches WHERE organization_id = $1`,
    [organizationId]
  );
  assert.equal(row.rowCount, 1);
  return row.rows[0].id;
}

async function sectionsForChurch(churchId) {
  const rows = await pool.query(
    `SELECT pp.id AS page_id, pp.page_key, pp.church_id, ps.id AS section_id,
            ps.section_key, ps.heading, ps.body_text, ps.layout_metadata
       FROM blessboard.public_pages pp
       LEFT JOIN blessboard.page_sections ps ON ps.page_id = pp.id
      WHERE pp.church_id = $1
      ORDER BY pp.page_key, ps.sort_order, ps.section_key`,
    [churchId]
  );
  return rows.rows;
}

function escapeRe(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

describe("V7 BlessBoard website template parity", () => {
  before(async () => {
    try {
      const databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });
      await ensureDatabaseIdentity(pool, {
        connectionString: databaseUrl,
        identityKey: IDENTITY_KEY,
        environmentCode: "testing",
      });
    } catch (err) {
      skipReason = err && err.message ? String(err.message).slice(0, 240) : "no foundation db";
    }
  });

  after(async () => {
    if (pool) await pool.end().catch(() => {});
  });

  it("demo pack specs cover every public page and inject registration fields", () => {
    const pack = buildPublicDemoPack({ publicName: "Sunrise Assembly" });
    const specs = buildBlessBoardWebsiteTemplateSpecs(pack, {
      primaryEmail: "hello@sunrise.invalid",
      primaryPhone: "+260977000001",
      city: "Lusaka",
      address: "Lusaka",
    });
    const pages = new Set(specs.map((row) => row.pageKey));
    for (const pageKey of PUBLIC_PAGE_KEYS) {
      assert.equal(pages.has(pageKey), true, `missing page ${pageKey}`);
    }
    const contact = specs.find((row) => row.pageKey === "contact" && row.spec.sectionKey === "contact");
    assert.match(contact.spec.bodyText, /hello@sunrise.invalid/);
    assert.match(contact.spec.bodyText, /\+260977000001/);
    assert.match(contact.spec.bodyText, /Lusaka/);
    const details = specs.find((row) => row.pageKey === "contact" && row.spec.sectionKey === "details");
    assert.equal(details.spec.layoutMetadata.email, "hello@sunrise.invalid");
    assert.equal(details.spec.layoutMetadata.phone, "+260977000001");
    const leadership = specs.find((row) => row.pageKey === "leadership" && row.spec.sectionKey === "hero");
    assert.match(leadership.spec.bodyText, new RegExp(escapeRe(PLACEHOLDER_LABEL)));
    assert.doesNotMatch(JSON.stringify(specs), /\[Demo\]/);
  });

  it("new church draft is a tenant-owned copy with injected registration data", async () => {
    if (!requireDb()) return;
    const body = churchBody();
    const result = await submitChurch(body);
    assert.equal(result.ok, true, JSON.stringify(result));
    const churchId = await churchIdForOrg(result.records.organizationId);
    const rows = await sectionsForChurch(churchId);
    assert.ok(rows.every((row) => row.church_id === churchId));
    const pageKeys = new Set(rows.map((row) => row.page_key));
    for (const pageKey of PUBLIC_PAGE_KEYS) {
      assert.equal(pageKeys.has(pageKey), true, `missing seeded page ${pageKey}`);
    }
    const welcome = rows.find((row) => row.page_key === "home" && row.section_key === "welcome");
    assert.ok(welcome);
    assert.match(String(welcome.body_text || welcome.heading || ""), new RegExp(escapeRe(body.church_name)));
    assert.notEqual(String(welcome.body_text || "").slice(0, 40), "Church is getting started on BlessBoard");
    const contact = rows.find((row) => row.page_key === "contact" && row.section_key === "contact");
    assert.match(String(contact.body_text || ""), new RegExp(escapeRe(body.email)));
    assert.match(String(contact.body_text || ""), /Lusaka/);
    const about = rows.find((row) => row.page_key === "about" && row.section_key === "story");
    assert.ok(about && String(about.body_text || "").length > 80);
    assert.match(String(about.body_text || ""), new RegExp(escapeRe(PLACEHOLDER_LABEL)));
    assert.match(String(about.body_text || ""), /template copy, not this congregation/i);
    const times = rows.find((row) => row.page_key === "home" && row.section_key === "service_times");
    assert.ok(times);
    const timeEntries =
      times.layout_metadata && Array.isArray(times.layout_metadata.entries)
        ? times.layout_metadata.entries
        : [];
    assert.ok(timeEntries.length >= 2);
    const leaders = await pool.query(
      `SELECT count(*)::int AS n FROM blessboard.leaders WHERE church_id = $1`,
      [churchId]
    );
    assert.equal(leaders.rows[0].n, 0);
    const dumped = JSON.stringify(rows.map((row) => row.body_text));
    assert.doesNotMatch(dumped, /\[Demo\]/);
    assert.match(dumped, new RegExp(escapeRe(PLACEHOLDER_LABEL)));

    const instance = await instanceRepo.findWebsiteInstanceByOrgProduct(pool, {
      organizationId: result.records.organizationId,
      productCode: "blessboard",
    });
    assert.ok(instance);
    const again = await initializeOrganizationWebsite(pool, {
      adapter: blessboardAdapter,
      productCode: "blessboard",
      organizationId: result.records.organizationId,
      application: { church_name: body.church_name, city: body.city, email: body.email },
      provision: result,
    });
    assert.equal(again.ok, true);
    assert.equal(again.existed, true);
    const after = await sectionsForChurch(churchId);
    assert.equal(after.filter((row) => row.section_key === "welcome").length, 1);
  });

  it("demo church, church A, and church B do not share mutable content rows", async () => {
    if (!requireDb()) return;
    const packHeading = buildPublicDemoPack({ publicName: "Our Church" }).home.welcomeHeading;
    const demoBody = churchBody({ church_name: "Demo Source Church Isolation" });
    const aBody = churchBody();
    const bBody = churchBody();
    const demo = await submitChurch(demoBody);
    const a = await submitChurch(aBody);
    const b = await submitChurch(bBody);
    assert.equal(demo.ok, true, JSON.stringify(demo));
    assert.equal(a.ok, true, JSON.stringify(a));
    assert.equal(b.ok, true, JSON.stringify(b));

    const demoId = await churchIdForOrg(demo.records.organizationId);
    const aId = await churchIdForOrg(a.records.organizationId);
    const bId = await churchIdForOrg(b.records.organizationId);
    assert.notEqual(demoId, aId);
    assert.notEqual(aId, bId);

    const demoRows = await sectionsForChurch(demoId);
    const aRows = await sectionsForChurch(aId);
    const bRows = await sectionsForChurch(bId);
    const demoSectionIds = new Set(demoRows.map((row) => row.section_id));
    const aSectionIds = new Set(aRows.map((row) => row.section_id));
    const bSectionIds = new Set(bRows.map((row) => row.section_id));
    for (const id of aSectionIds) {
      assert.equal(demoSectionIds.has(id), false);
      assert.equal(bSectionIds.has(id), false);
    }
    for (const id of bSectionIds) {
      assert.equal(demoSectionIds.has(id), false);
    }
    const demoPageIds = new Set(demoRows.map((row) => row.page_id));
    const aPageIds = new Set(aRows.map((row) => row.page_id));
    assert.ok([...aPageIds].every((id) => !demoPageIds.has(id)));

    const welcomeDemo = demoRows.find((row) => row.page_key === "home" && row.section_key === "welcome");
    const welcomeA = aRows.find((row) => row.page_key === "home" && row.section_key === "welcome");
    const welcomeB = bRows.find((row) => row.page_key === "home" && row.section_key === "welcome");
    await pool.query(`UPDATE blessboard.page_sections SET heading = 'Mutated Demo' WHERE id = $1`, [
      welcomeDemo.section_id,
    ]);
    await pool.query(`UPDATE blessboard.page_sections SET heading = 'Mutated A' WHERE id = $1`, [
      welcomeA.section_id,
    ]);
    const afterDemo = await pool.query(`SELECT heading FROM blessboard.page_sections WHERE id = $1`, [
      welcomeDemo.section_id,
    ]);
    const afterA = await pool.query(`SELECT heading FROM blessboard.page_sections WHERE id = $1`, [
      welcomeA.section_id,
    ]);
    const afterB = await pool.query(`SELECT heading FROM blessboard.page_sections WHERE id = $1`, [
      welcomeB.section_id,
    ]);
    assert.equal(afterDemo.rows[0].heading, "Mutated Demo");
    assert.equal(afterA.rows[0].heading, "Mutated A");
    assert.notEqual(afterB.rows[0].heading, "Mutated A");
    assert.notEqual(afterB.rows[0].heading, "Mutated Demo");
    assert.equal(buildPublicDemoPack({ publicName: "Our Church" }).home.welcomeHeading, packHeading);
  });
});
