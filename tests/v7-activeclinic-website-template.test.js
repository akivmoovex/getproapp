"use strict";

/**
 * ActiveClinic clinic-website template: Demo Centre-derived copy,
 * registration injection, placeholder policy, and tenant isolation.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const { ensureDatabaseIdentity } = require("../db/scripts/lib/databaseIdentity");
const {
  submitAndProvisionClinicRegistration,
} = require("../src/activeclinic/services/submitClinicRegistrationService");
const {
  createActiveClinicFoundationApp,
} = require("../src/activeclinic/http/activeClinicFoundationServer");
const {
  createPlatformIdentitySession,
} = require("../src/platform/session/createDeploymentSession");
const {
  CODE_ACTIVECLINIC_ORG_V6,
  COOKIE_ACTIVECLINIC_ORG,
} = require("../src/platform/config/deploymentProfiles");
const { CSRF_FIELD, issueCsrfToken } = require("../src/platform/http/v5Csrf");
const instanceRepo = require("../src/platform/website/instanceRepository");
const contentService = require("../src/platform/website/contentService");
const {
  registerActiveClinicWebsiteTemplate,
  ACTIVECLINIC_WEBSITE_DEFAULTS,
} = require("../src/activeclinic/website/activeClinicWebsiteTemplate");
const {
  PLACEHOLDER_LABEL,
  HERO_IMAGE_SRC,
  buildActiveClinicWebsiteTemplateContent,
} = require("../src/activeclinic/website/activeClinicWebsiteTemplateContent");

const IDENTITY_KEY = "blessboard-platform-v5";
const PASSWORD = "clinic-admin-pass-12";
const MINIMAL_AC = Object.freeze({
  NODE_ENV: "test",
  PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_V6,
  DATABASE_URL: "postgres://unused/local",
  SESSION_SECRET: "a".repeat(40),
});

const BANNED_CLAIM = /HPCZ|Registered Facility|Dr\. Demo Chanda|Nurse Demo Mwila|Julflona|Dr\. Julflona/i;

let pool;
let skipReason = null;
let stamp = 0;
let phoneSeq = 770000000;

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

function clinicPayload(overrides) {
  stamp += 1;
  return {
    clinicName: `Template Clinic ${stamp}`,
    contactName: "Website Admin",
    contactEmail: `tpl-${stamp}@example.invalid`,
    contactPhone: nextPhone(),
    province: "Lusaka Province",
    city: "Lusaka",
    address: `${stamp} Independence Avenue`,
    countryCode: "ZM",
    notes: "activeclinic website template",
    password: PASSWORD,
    passwordConfirm: PASSWORD,
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    dataEnvironment: "testing",
    env: { NODE_ENV: "test", PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_V6 },
    ...overrides,
  };
}

async function sessionCookie(identityId, orgId) {
  const session = await createPlatformIdentitySession(pool, {
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    platformIdentityId: identityId,
    organizationId: orgId,
  });
  assert.equal(session.ok, true, JSON.stringify(session));
  return `${COOKIE_ACTIVECLINIC_ORG}=${session.rawToken}`;
}

function makeApp() {
  return createActiveClinicFoundationApp({
    getPool: () => pool,
    env: MINIMAL_AC,
    log: () => {},
  });
}

function extractCsrf(res) {
  const html = String(res.text || "");
  const meta = html.match(/name="csrf-token"\s+content="([^"]+)"/);
  if (meta) return meta[1];
  const field = html.match(new RegExp(`name="${CSRF_FIELD}"[^>]*value="([^"]+)"`));
  return field ? field[1] : issueCsrfToken(MINIMAL_AC);
}

function cookieHeader(session, pageRes) {
  const parts = [session];
  const set = pageRes && pageRes.headers && pageRes.headers["set-cookie"];
  if (Array.isArray(set)) parts.push(...set);
  else if (set) parts.push(set);
  return parts.join("; ");
}

async function contentByKey(organizationId) {
  const instance = await instanceRepo.findWebsiteInstanceByOrgProduct(pool, {
    organizationId,
    productCode: "activeclinic",
  });
  assert.ok(instance, "website instance missing");
  const rows = await contentService.listWebsiteContent(pool, instance, organizationId);
  return {
    instance,
    rows,
    byKey: Object.fromEntries(rows.map((row) => [row.contentKey, row.draftValue])),
  };
}

function draftPath(slug, suffix) {
  const tail = suffix ? `/${suffix}` : "";
  return `/clinics/${slug}${tail}?website_edit=1&website_mode=draft`;
}

describe("V7 ActiveClinic website template", () => {
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

  it("template pack injects registration fields and labels placeholders", () => {
    registerActiveClinicWebsiteTemplate();
    const pack = buildActiveClinicWebsiteTemplateContent({
      publicName: "Sunrise Medical",
      phone: "+260977000001",
      email: "hello@sunrise.invalid",
      address: "12 Cairo Road",
    });
    assert.equal(pack["home.hero.title"], "Sunrise Medical");
    assert.match(pack["home.hero.subtitle"], /Welcome to Sunrise Medical/);
    assert.match(pack["home.hero.subtitle"], new RegExp(PLACEHOLDER_LABEL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.equal(pack["contact.phone"], "+260977000001");
    assert.equal(pack["contact.email"], "hello@sunrise.invalid");
    assert.equal(pack["location.address"], "12 Cairo Road");
    assert.match(pack["location.hours"], /Example hours/);
    assert.match(pack["location.hours"], /Template example/);
    assert.equal(pack["home.hero.image"].src, HERO_IMAGE_SRC);
    assert.ok(Array.isArray(pack["services.examples"]) && pack["services.examples"].length >= 3);
    assert.ok(Array.isArray(pack["doctors.examples"]) && pack["doctors.examples"].length >= 2);
    assert.ok(Array.isArray(pack["home.faq"]) && pack["home.faq"].length >= 3);
    assert.equal(pack["section.faq.visible"], true);
    assert.equal(pack["section.promo.visible"], true);
    for (const example of pack["doctors.examples"]) {
      assert.match(example.title, /not a member of this clinic/i);
      assert.match(example.bio, /does not work here/i);
      assert.doesNotMatch(example.name, BANNED_CLAIM);
    }
    for (const example of pack["services.examples"]) {
      assert.match(example.name, /^Example:/);
      assert.match(example.summary, /not a published service/i);
    }
    const dumped = JSON.stringify(pack);
    assert.doesNotMatch(dumped, BANNED_CLAIM);
    assert.equal(ACTIVECLINIC_WEBSITE_DEFAULTS["home.hero.title"], null);
    assert.match(String(ACTIVECLINIC_WEBSITE_DEFAULTS["home.hero.subtitle"] || ""), /your clinic/);
  });

  it("new clinic draft is a tenant-owned copy with injected registration data", async () => {
    if (!requireDb()) return;
    const payload = clinicPayload();
    const result = await submitAndProvisionClinicRegistration(pool, payload);
    assert.equal(result.ok, true, JSON.stringify(result));
    const { instance, rows, byKey } = await contentByKey(result.organizationId);
    assert.equal(byKey["home.hero.title"], payload.clinicName);
    assert.match(String(byKey["home.hero.subtitle"] || ""), new RegExp(payload.clinicName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.equal(byKey["contact.email"], payload.contactEmail);
    assert.ok(String(byKey["contact.phone"] || "").length > 4);
    assert.equal(byKey["location.address"], payload.address);
    assert.match(String(byKey["about.story.body"] || ""), /Template example/);
    assert.ok(Array.isArray(byKey["home.faq"]) && byKey["home.faq"].length >= 3);
    assert.ok(Array.isArray(byKey["services.examples"]) && byKey["services.examples"].length >= 3);
    assert.ok(Array.isArray(byKey["doctors.examples"]) && byKey["doctors.examples"].length >= 2);
    assert.match(String(byKey["doctors.examples"][0].bio || ""), /does not work here/);
    assert.match(String(byKey["services.examples"][0].summary || ""), /not a published service/);
    assert.ok(rows.every((row) => row.organizationId === result.organizationId));
    assert.ok(rows.every((row) => row.instanceId === instance.id));
    const dumped = JSON.stringify(byKey);
    assert.doesNotMatch(dumped, BANNED_CLAIM);

    const staff = await pool.query(
      `SELECT display_name FROM activeclinic.staff_members WHERE organization_id = $1`,
      [result.organizationId]
    );
    assert.ok(staff.rowCount >= 1);
    assert.ok(staff.rows.every((row) => !BANNED_CLAIM.test(String(row.display_name || ""))));
    const services = await pool.query(
      `SELECT count(*)::int AS n FROM activeclinic.appointment_service_types WHERE organization_id = $1`,
      [result.organizationId]
    );
    assert.equal(services.rows[0].n, 0);
  });

  it("draft pages render a complete clinic website with placeholder labels", async () => {
    if (!requireDb()) return;
    const payload = clinicPayload();
    const result = await submitAndProvisionClinicRegistration(pool, payload);
    assert.equal(result.ok, true, JSON.stringify(result));
    const app = makeApp();
    const adminCookie = await sessionCookie(result.identityId, result.organizationId);
    const pages = {
      home: await request(app).get(draftPath(result.slug)).set("Cookie", adminCookie),
      about: await request(app).get(draftPath(result.slug, "about")).set("Cookie", adminCookie),
      services: await request(app).get(draftPath(result.slug, "services")).set("Cookie", adminCookie),
      doctors: await request(app).get(draftPath(result.slug, "doctors")).set("Cookie", adminCookie),
      location: await request(app).get(draftPath(result.slug, "location")).set("Cookie", adminCookie),
      contact: await request(app).get(draftPath(result.slug, "contact")).set("Cookie", adminCookie),
    };
    for (const [name, res] of Object.entries(pages)) {
      assert.equal(res.status, 200, `${name} ${res.status}`);
      assert.match(res.text, new RegExp(payload.clinicName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      assert.doesNotMatch(res.text, BANNED_CLAIM);
      assert.match(res.text, /data-ac-public-footer="tenant"/);
      assert.match(res.text, /does not provide emergency medical care/i);
    }
    assert.match(pages.home.text, /Listed on ActiveClinic/);
    assert.match(pages.home.text, /Public clinic website/);
    assert.match(pages.home.text, /Plan your visit/);
    assert.match(pages.home.text, /How do I book/);
    assert.match(pages.home.text, /Book an appointment|Contact the clinic|Request an appointment/);
    const emailRe = new RegExp(payload.contactEmail.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    const addressRe = new RegExp(payload.address.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    assert.match(pages.about.text, /About /);
    assert.match(pages.about.text, emailRe);
    assert.match(pages.services.text, /data-ac-template-examples="services"/);
    assert.match(pages.services.text, /Template examples only/);
    assert.doesNotMatch(pages.services.text, /View details/);
    assert.match(pages.doctors.text, /data-ac-template-examples="doctors"/);
    assert.match(pages.doctors.text, /these people do not work at this clinic/i);
    assert.doesNotMatch(pages.doctors.text, /View profile/);
    assert.match(pages.location.text, addressRe);
    assert.match(pages.location.text, /Example hours/);
    assert.match(pages.contact.text, emailRe);
    assert.match(pages.contact.text, /Send message/);
  });

  it("editing clinic A cannot modify the in-code template or clinic B", async () => {
    if (!requireDb()) return;
    const templateSnapshot = JSON.stringify(ACTIVECLINIC_WEBSITE_DEFAULTS);
    const payloadA = clinicPayload();
    const payloadB = clinicPayload();
    const a = await submitAndProvisionClinicRegistration(pool, payloadA);
    const b = await submitAndProvisionClinicRegistration(pool, payloadB);
    assert.equal(a.ok, true, JSON.stringify(a));
    assert.equal(b.ok, true, JSON.stringify(b));

    const contentA = await contentByKey(a.organizationId);
    const contentB = await contentByKey(b.organizationId);
    assert.notEqual(contentA.instance.id, contentB.instance.id);
    assert.notEqual(a.organizationId, b.organizationId);

    const titleA = contentA.rows.find((row) => row.contentKey === "home.hero.title");
    const titleB = contentB.rows.find((row) => row.contentKey === "home.hero.title");
    assert.ok(titleA && titleB);
    assert.notEqual(titleA.id, titleB.id);
    assert.equal(titleA.organizationId, a.organizationId);
    assert.equal(titleB.organizationId, b.organizationId);
    assert.equal(contentB.byKey["home.hero.title"], payloadB.clinicName);

    const saved = await contentService.saveWebsiteDraft(pool, {
      organizationId: a.organizationId,
      instanceId: contentA.instance.id,
      contentKey: "home.hero.title",
      value: "Mutated Clinic A Title",
    });
    assert.equal(saved.ok, true, JSON.stringify(saved));

    const afterA = await contentByKey(a.organizationId);
    const afterB = await contentByKey(b.organizationId);
    assert.equal(afterA.byKey["home.hero.title"], "Mutated Clinic A Title");
    assert.equal(afterB.byKey["home.hero.title"], payloadB.clinicName);
    assert.equal(JSON.stringify(ACTIVECLINIC_WEBSITE_DEFAULTS), templateSnapshot);
    assert.equal(ACTIVECLINIC_WEBSITE_DEFAULTS["home.hero.title"], null);

    const crossed = await contentService.saveWebsiteDraft(pool, {
      organizationId: b.organizationId,
      instanceId: contentA.instance.id,
      contentKey: "home.hero.title",
      value: "Clinic B rewrite of A",
    });
    assert.equal(crossed.ok, false);
    const stillA = await contentByKey(a.organizationId);
    const stillB = await contentByKey(b.organizationId);
    assert.equal(stillA.byKey["home.hero.title"], "Mutated Clinic A Title");
    assert.equal(stillB.byKey["home.hero.title"], payloadB.clinicName);

    const app = makeApp();
    const adminA = await sessionCookie(a.identityId, a.organizationId);
    const editA = await request(app).get(draftPath(a.slug)).set("Cookie", adminA);
    const csrf = extractCsrf(editA);
    const httpCross = await request(app)
      .post(`/clinics/${b.slug}/website/drafts`)
      .set("Cookie", cookieHeader(adminA, editA))
      .send({ [CSRF_FIELD]: csrf, contentKey: "home.hero.title", value: "HTTP rewrite B" });
    assert.ok(httpCross.status === 403 || httpCross.status === 404, httpCross.text);
    const finalB = await contentByKey(b.organizationId);
    assert.equal(finalB.byKey["home.hero.title"], payloadB.clinicName);
    assert.equal(JSON.stringify(ACTIVECLINIC_WEBSITE_DEFAULTS), templateSnapshot);
  });
});
