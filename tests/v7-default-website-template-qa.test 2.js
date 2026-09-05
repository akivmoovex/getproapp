"use strict";

/**
 * Default mini-website template quality: new-tenant snapshots and data isolation.
 * Template pack edits must not rewrite existing tenant rows.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
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
  submitChurchRegistration,
} = require("../src/blessboard/services/platformChurchRegistrationService");
const {
  validatePlatformChurchRegistration,
} = require("../src/blessboard/services/platformChurchRegistrationValidation");
const {
  createActiveClinicFoundationApp,
} = require("../src/activeclinic/http/activeClinicFoundationServer");
const { createV5FoundationApp } = require("../src/platform/http/v5FoundationServer");
const {
  createPlatformIdentitySession,
} = require("../src/platform/session/createDeploymentSession");
const { createV5Session } = require("../src/platform/session/createV5Session");
const {
  CODE_ACTIVECLINIC_ORG_V6,
  COOKIE_ACTIVECLINIC_ORG,
} = require("../src/platform/config/deploymentProfiles");
const { DEFAULT_V5_COOKIE } = require("../src/platform/session/v5SessionCookie");
const instanceRepo = require("../src/platform/website/instanceRepository");
const contentService = require("../src/platform/website/contentService");
const {
  ACTIVECLINIC_WEBSITE_DEFAULTS,
} = require("../src/activeclinic/website/activeClinicWebsiteTemplate");
const {
  PLACEHOLDER_LABEL: AC_PLACEHOLDER,
  HERO_IMAGE_SRC,
  buildActiveClinicWebsiteTemplateContent,
} = require("../src/activeclinic/website/activeClinicWebsiteTemplateContent");
const {
  PLACEHOLDER_LABEL: BB_PLACEHOLDER,
  seedTenantOwnedWebsiteTemplateContent,
} = require("../src/blessboard/services/seedTenantWebsiteTemplateContent");
const {
  buildPublicDemoPack,
} = require("../src/blessboard/services/tenantPublicDemoContent");
const { initializeOrganizationWebsite } = require("../src/platform/registration/initializeOrganizationWebsite");
const blessboardAdapter = require("../src/blessboard/registration/blessboardChurchRegistrationAdapter");

const IDENTITY_KEY = "blessboard-platform-v5";
const PASSWORD = "template-qa-pass-12";
const BB_HOST = "blessboard.org";
const BANNED_AC = /HPCZ|Registered Facility|Dr\. Demo Chanda|Nurse Demo Mwila|Julflona|Dr\. Julflona/i;
const FAKE_BB_CONTACT = /123 Welcome Way|hello@example\.church|\(555\) 010-2000/;

const MINIMAL_AC = Object.freeze({
  NODE_ENV: "test",
  PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_V6,
  DATABASE_URL: "postgres://unused/local",
  SESSION_SECRET: "a".repeat(40),
});
const MINIMAL_BB = Object.freeze({
  NODE_ENV: "test",
  PLATFORM_DEPLOYMENT_CODE: "blessboard-org-staging",
  SESSION_SECRET: "test-session-secret-at-least-32-chars!!",
  SESSION_COOKIE_NAME: DEFAULT_V5_COOKIE,
  BLESSBOARD_TENANT_ROUTING_MODE: "off",
});

let pool;
let skipReason = null;
let stamp = 0;
let phoneSeq = 790000000;
let ipSeq = 70;

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

function escapeRe(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function clinicPayload(overrides) {
  stamp += 1;
  return {
    clinicName: `QA Clinic ${stamp}`,
    contactName: "Website Admin",
    contactEmail: `qa-clinic-${stamp}@example.invalid`,
    contactPhone: nextPhone(),
    province: "Lusaka",
    city: "Lusaka",
    address: `${stamp} Cairo Road`,
    countryCode: "ZM",
    notes: "default website template qa",
    password: PASSWORD,
    passwordConfirm: PASSWORD,
      acceptTerms: "on",
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    dataEnvironment: "testing",
    env: { NODE_ENV: "test", PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_V6 },
    ...overrides,
  };
}

function churchBody(overrides) {
  stamp += 1;
  const key = `bbqa${stamp}${crypto.randomBytes(3).toString("hex")}`;
  return {
    church_name: `QA Parish ${stamp} ${key}`,
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
    requestId: `bbqa-${Date.now()}-${ipSeq}`,
    get: () => "bbqa-test-agent",
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

async function acCookie(identityId, orgId) {
  const session = await createPlatformIdentitySession(pool, {
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    platformIdentityId: identityId,
    organizationId: orgId,
  });
  assert.equal(session.ok, true, JSON.stringify(session));
  return `${COOKIE_ACTIVECLINIC_ORG}=${session.rawToken}`;
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

function acDraft(slug, suffix) {
  const tail = suffix ? `/${suffix}` : "";
  return `/clinics/${slug}${tail}?website_edit=1&website_mode=draft`;
}

describe("V7 default website template QA", () => {
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

  it("ActiveClinic new clinic HTML is complete, labeled, and uses registration data", async () => {
    if (!requireDb()) return;
    const payload = clinicPayload();
    const result = await submitAndProvisionClinicRegistration(pool, payload);
    assert.equal(result.ok, true, JSON.stringify(result));
    const app = createActiveClinicFoundationApp({
      getPool: () => pool,
      env: MINIMAL_AC,
      log: () => {},
    });
    const cookie = await acCookie(result.identityId, result.organizationId);
    const pages = {
      home: await request(app).get(acDraft(result.slug)).set("Cookie", cookie),
      about: await request(app).get(acDraft(result.slug, "about")).set("Cookie", cookie),
      services: await request(app).get(acDraft(result.slug, "services")).set("Cookie", cookie),
      doctors: await request(app).get(acDraft(result.slug, "doctors")).set("Cookie", cookie),
      location: await request(app).get(acDraft(result.slug, "location")).set("Cookie", cookie),
      contact: await request(app).get(acDraft(result.slug, "contact")).set("Cookie", cookie),
    };
    const nameRe = new RegExp(escapeRe(payload.clinicName));
    const emailRe = new RegExp(escapeRe(payload.contactEmail));
    const addressRe = new RegExp(escapeRe(payload.address));
    for (const [name, res] of Object.entries(pages)) {
      assert.equal(res.status, 200, `${name} ${res.status}`);
      assert.match(res.text, nameRe);
      assert.doesNotMatch(res.text, BANNED_AC);
      assert.match(res.text, /data-ac-public-footer="tenant"/);
      assert.match(res.text, /Request Appointment|Book Appointment/i);
    }
    assert.match(pages.home.text, /Request Appointment|Book Appointment/i);
    assert.match(pages.home.text, new RegExp(escapeRe(HERO_IMAGE_SRC)));
    assert.match(pages.home.text, /Template photo for/);
    assert.doesNotMatch(pages.home.text, /Exterior of /);
    assert.match(pages.home.text, /acp-mobile-bottom-nav/);
    assert.match(pages.about.text, new RegExp(escapeRe(AC_PLACEHOLDER)));
    assert.match(pages.services.text, /data-ac-empty="services"/);
    assert.doesNotMatch(pages.services.text, /Example: General consultation/);
    assert.doesNotMatch(pages.services.text, /data-ac-template-examples="services"/);
    assert.match(pages.doctors.text, /Doctor listings are not available yet|Manage public catalogue/);
    assert.doesNotMatch(pages.doctors.text, /these people do not work at this clinic/i);
    assert.match(pages.location.text, addressRe);
    assert.match(pages.location.text, /Example hours/);
    assert.match(pages.contact.text, emailRe);

    const book = await request(app).get(`/clinics/${result.slug}/book`).set("Cookie", cookie);
    assert.equal(book.status, 403);
    assert.match(book.text, /Booking not available/);
    assert.doesNotMatch(book.text, /This clinic website is not published/);
  });

  it("ActiveClinic template re-seed and clinic B stay isolated from clinic A edits", async () => {
    if (!requireDb()) return;
    const packSnapshot = JSON.stringify(ACTIVECLINIC_WEBSITE_DEFAULTS);
    const payloadA = clinicPayload();
    const payloadB = clinicPayload();
    const a = await submitAndProvisionClinicRegistration(pool, payloadA);
    const b = await submitAndProvisionClinicRegistration(pool, payloadB);
    assert.equal(a.ok && b.ok, true, JSON.stringify({ a, b }));
    const contentA = await contentByKey(a.organizationId);
    const saved = await contentService.saveWebsiteDraft(pool, {
      organizationId: a.organizationId,
      instanceId: contentA.instance.id,
      contentKey: "home.hero.title",
      value: "Mutated QA Clinic A",
    });
    assert.equal(saved.ok, true, JSON.stringify(saved));
    const reseed = await contentService.seedWebsiteContent(
      pool,
      contentA.instance,
      [
        {
          contentKey: "home.hero.title",
          value: "Should not overwrite tenant A",
          publish: true,
        },
      ],
      null
    );
    assert.equal(reseed.ok, true);
    const afterA = await contentByKey(a.organizationId);
    const afterB = await contentByKey(b.organizationId);
    assert.equal(afterA.byKey["home.hero.title"], "Mutated QA Clinic A");
    assert.equal(afterB.byKey["home.hero.title"], payloadB.clinicName);
    assert.equal(JSON.stringify(ACTIVECLINIC_WEBSITE_DEFAULTS), packSnapshot);
    assert.equal(
      buildActiveClinicWebsiteTemplateContent({ publicName: "Pack Clinic" })["home.hero.title"],
      "Pack Clinic"
    );
  });

  it("BlessBoard new church HTML is complete, labeled, and uses registration data", async () => {
    if (!requireDb()) return;
    const body = churchBody();
    const result = await submitChurch(body);
    assert.equal(result.ok, true, JSON.stringify(result));
    const orgId = result.records.organizationId;
    const churchRow = await pool.query(
      `SELECT id FROM blessboard.churches WHERE organization_id = $1`,
      [orgId]
    );
    assert.equal(churchRow.rowCount, 1);
    const churchId = churchRow.rows[0].id;
    const userRow = await pool.query(
      `SELECT id FROM blessboard.users WHERE email_normalized = $1 LIMIT 1`,
      [String(body.email).toLowerCase()]
    );
    assert.equal(userRow.rowCount, 1, "registered church user missing");
    const session = await createV5Session(pool, {
      deploymentCode: "blessboard-org-staging",
      userId: userRow.rows[0].id,
      organizationId: orgId,
      churchId,
    });
    assert.equal(session.ok, true, session.code);
    const cookie = `${DEFAULT_V5_COOKIE}=${session.rawToken}`;
    const app = createV5FoundationApp({
      getPool: () => pool,
      env: MINIMAL_BB,
      apexHosts: new Set([BB_HOST, `www.${BB_HOST}`]),
    });
    const key = body.organization_key;
    const preview = (pageKey) =>
      request(app)
        .get(`/hq/content/preview/${pageKey}`)
        .set("Host", BB_HOST)
        .set("Cookie", cookie);

    const pages = {
      home: await preview("home"),
      about: await preview("about"),
      leadership: await preview("leadership"),
      ministries: await preview("ministries"),
      events: await preview("events"),
      sermons: await preview("sermons"),
      contact: await preview("contact"),
      giving: await preview("giving"),
    };
    const nameRe = new RegExp(escapeRe(body.church_name));
    const emailRe = new RegExp(escapeRe(body.email));
    for (const [name, res] of Object.entries(pages)) {
      assert.equal(res.status, 200, `${name} ${res.status} ${String(res.text).slice(0, 180)}`);
      assert.match(res.text, nameRe);
      assert.match(res.text, /data-bb-footer="1"/);
      assert.doesNotMatch(res.text, FAKE_BB_CONTACT);
    }
    assert.match(pages.home.text, /Plan Your Visit|Plan a visit/);
    assert.match(pages.about.text, new RegExp(escapeRe(BB_PLACEHOLDER)));
    assert.match(pages.about.text, /not this congregation/i);
    assert.match(pages.leadership.text, /data-bb-leadership="1"/);
    if (/Pastor Jordan Hale/.test(pages.leadership.text)) {
      assert.match(pages.leadership.text, /template example/i);
      assert.match(pages.leadership.text, /data-bb-template-example/);
    }
    assert.match(pages.ministries.text, /data-bb-ministries="1"|A Space to Belong/);
    assert.match(pages.events.text, /data-bb-events="1"|Upcoming Gatherings/);
    assert.match(pages.sermons.text, /data-bb-sermons="1"|Recent Teachings/);
    assert.match(pages.contact.text, emailRe);
    assert.match(pages.contact.text, /Lusaka/);
    assert.match(pages.giving.text, /does not process payments/i);
    assert.doesNotMatch(pages.giving.text, /stripe|paypal|iban|account number/i);

    const publicDraft = await request(app)
      .get(`/c/${key}?website_mode=draft`)
      .set("Host", BB_HOST)
      .set("Cookie", cookie);
    assert.equal(publicDraft.status, 200);
    assert.match(publicDraft.text, nameRe);
    assert.match(publicDraft.text, /bb-tp-nav--desktop|data-bb-nav="mobile-drawer"/);

    const packLeaders = buildPublicDemoPack({ publicName: "Pack Church" }).leaders;
    assert.equal(packLeaders[0].displayName, "Pastor Jordan Hale");
    assert.equal(packLeaders[0].templateExample, undefined);
  });

  it("BlessBoard template re-seed does not rewrite church A or church B", async () => {
    if (!requireDb()) return;
    const packHeading = buildPublicDemoPack({ publicName: "Our Church" }).home.welcomeHeading;
    const aBody = churchBody();
    const bBody = churchBody();
    const a = await submitChurch(aBody);
    const b = await submitChurch(bBody);
    assert.equal(a.ok && b.ok, true, JSON.stringify({ a, b }));
    const aId = (
      await pool.query(`SELECT id FROM blessboard.churches WHERE organization_id = $1`, [
        a.records.organizationId,
      ])
    ).rows[0].id;
    const bId = (
      await pool.query(`SELECT id FROM blessboard.churches WHERE organization_id = $1`, [
        b.records.organizationId,
      ])
    ).rows[0].id;
    const welcomeA = await pool.query(
      `SELECT ps.id, ps.heading
         FROM blessboard.page_sections ps
         JOIN blessboard.public_pages pp ON pp.id = ps.page_id
        WHERE pp.church_id = $1 AND pp.page_key = 'home' AND ps.section_key = 'welcome'`,
      [aId]
    );
    assert.equal(welcomeA.rowCount, 1);
    await pool.query(`UPDATE blessboard.page_sections SET heading = 'Mutated QA A' WHERE id = $1`, [
      welcomeA.rows[0].id,
    ]);
    const reseed = await seedTenantOwnedWebsiteTemplateContent(pool, {
      churchId: aId,
      publicName: aBody.church_name,
      primaryEmail: aBody.email,
      primaryPhone: aBody.phone,
      city: aBody.city,
    });
    assert.equal(reseed.ok, true);
    const again = await initializeOrganizationWebsite(pool, {
      adapter: blessboardAdapter,
      productCode: "blessboard",
      organizationId: a.records.organizationId,
      application: { church_name: aBody.church_name, city: aBody.city, email: aBody.email },
      provision: a,
    });
    assert.equal(again.ok, true);
    const afterA = await pool.query(`SELECT heading FROM blessboard.page_sections WHERE id = $1`, [
      welcomeA.rows[0].id,
    ]);
    const welcomeB = await pool.query(
      `SELECT ps.heading
         FROM blessboard.page_sections ps
         JOIN blessboard.public_pages pp ON pp.id = ps.page_id
        WHERE pp.church_id = $1 AND pp.page_key = 'home' AND ps.section_key = 'welcome'`,
      [bId]
    );
    assert.equal(afterA.rows[0].heading, "Mutated QA A");
    assert.notEqual(welcomeB.rows[0].heading, "Mutated QA A");
    assert.equal(buildPublicDemoPack({ publicName: "Our Church" }).home.welcomeHeading, packHeading);
  });
});
