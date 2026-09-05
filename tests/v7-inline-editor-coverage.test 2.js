"use strict";

/**
 * Inline website editor coverage: every allowlisted public field that is
 * meant to be editable has a pencil, draft save, and cancel. Field save
 * never publishes. System-derived / structured / boolean content stays
 * non-inline.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
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
const { CSRF_FIELD, CSRF_COOKIE, issueCsrfToken } = require("../src/platform/http/v5Csrf");
const instanceRepo = require("../src/platform/website/instanceRepository");
const contentService = require("../src/platform/website/contentService");
const { INLINE_SAVE_PUBLISHES } = require("../src/platform/website/inlineEditorContract");
const {
  PRODUCT_CODE,
  listEditableFields,
  ensureProductFieldsRegistered,
} = require("../src/platform/website/editableFieldSchema");
const {
  registerActiveClinicWebsiteTemplate,
  ACTIVECLINIC_WEBSITE_KEYS,
} = require("../src/activeclinic/website/activeClinicWebsiteTemplate");
const {
  expectedInlineKeysForPage,
  PUBLIC_PAGES,
  unclassifiedRows,
} = require("../src/activeclinic/website/activeClinicWebsiteEditorCoverage");
const { CONTENT_TYPES } = require("../src/platform/website/contentTypes");
const {
  EDITABLE_FIELDS,
} = require("../src/blessboard/services/websiteInlineEditableFields");

const ROOT = path.join(__dirname, "..");
const IDENTITY_KEY = "blessboard-platform-v5";
const PASSWORD = "inline-cover-pass-12";
const BB_HOST = "blessboard.org";

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

const AC_INLINE_KEYS = Object.entries(ACTIVECLINIC_WEBSITE_KEYS)
  .filter(([, def]) => def.inline !== false && def.type !== CONTENT_TYPES.BOOLEAN && def.type !== CONTENT_TYPES.STRUCTURED)
  .map(([key]) => key);

const AC_PAGE_EXPECT = {
  home: expectedInlineKeysForPage("home"),
  about: expectedInlineKeysForPage("about"),
  contact: expectedInlineKeysForPage("contact"),
  location: expectedInlineKeysForPage("location"),
  services: expectedInlineKeysForPage("services"),
  doctors: expectedInlineKeysForPage("doctors"),
  pricing: expectedInlineKeysForPage("pricing"),
  book: expectedInlineKeysForPage("book"),
  "patient-information": expectedInlineKeysForPage("patient-information"),
};

let pool;
let skipReason = null;
let stamp = 0;
let phoneSeq = 860000000;
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

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function collectEjs(dir) {
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) out.push(...collectEjs(full));
    else if (name.endsWith(".ejs")) out.push(full);
  }
  return out;
}

function acViewCorpus() {
  return collectEjs(path.join(ROOT, "views/activeclinic"))
    .filter((f) => /\/(tenant|booking|partials)\//.test(f))
    .map((f) => fs.readFileSync(f, "utf8"))
    .join("\n");
}

function bbViewCorpus() {
  const publicViews = path.join(ROOT, "views/blessboard/v5/public");
  const partials = path.join(ROOT, "views/blessboard/v5/partials");
  return collectEjs(publicViews)
    .concat(collectEjs(partials))
    .map((f) => fs.readFileSync(f, "utf8"))
    .join("\n");
}

function clinicPayload(overrides) {
  stamp += 1;
  return {
    clinicName: `Cover Clinic ${stamp}`,
    contactName: "Website Admin",
    contactEmail: `cover-${stamp}@example.invalid`,
    contactPhone: nextPhone(),
    province: "Lusaka",
    city: "Lusaka",
    address: `${stamp} Independence Avenue`,
    countryCode: "ZM",
    notes: "inline editor coverage",
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
  const key = `bbic${stamp}${crypto.randomBytes(3).toString("hex")}`;
  return {
    church_name: `Coverage Parish ${stamp} ${key}`,
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
    requestId: `bbic-${Date.now()}-${ipSeq}`,
    get: () => "bbic-test-agent",
  };
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

function websiteKeys(html) {
  return [...String(html).matchAll(/data-website-key="([^"]+)"/g)].map((m) => m[1]);
}

function hasFieldControls(html, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const block = new RegExp(
    `data-website-key="${escaped}"[\\s\\S]{0,4000}data-website-start="1"[\\s\\S]{0,4000}data-website-save="1"[\\s\\S]{0,4000}data-website-cancel="1"`
  );
  return block.test(String(html));
}

function acDraft(slug, suffix) {
  const tail = suffix ? `/${suffix}` : "";
  return `/clinics/${slug}${tail}?website_edit=1&website_mode=draft`;
}

describe("v7 inline editor coverage — static inventory", () => {
  it("shared contract forbids field-level publish", () => {
    assert.equal(INLINE_SAVE_PUBLISHES, false);
    const acJs = read("public/platform/website-inline-edit.js");
    const bbJs = read("public/blessboard/v5/website-inline-edit.js");
    assert.match(acJs, /published === true/);
    assert.match(acJs, /Save must not publish/);
    assert.match(acJs, /data-website-cancel/);
    assert.match(bbJs, /result\.data\.published/);
    assert.match(bbJs, /Unexpected publish response blocked/);
    assert.match(bbJs, /data-bb-inline-cancel/);
    const acRoutes = read("src/activeclinic/http/activeClinicWebsiteRoutes.js");
    assert.match(acRoutes, /published:\s*false/);
    const bbDraft = read("src/blessboard/services/websiteInlineDraftService.js");
    assert.match(bbDraft, /published:\s*false/);
  });

  it("ActiveClinic pencils exist for every inline allowlisted key", () => {
    registerActiveClinicWebsiteTemplate();
    ensureProductFieldsRegistered(PRODUCT_CODE.ACTIVECLINIC);
    const corpus = acViewCorpus();
    const registered = listEditableFields(PRODUCT_CODE.ACTIVECLINIC).filter((f) => f.inline);
    assert.deepEqual(
      registered.map((f) => f.key).sort(),
      [...AC_INLINE_KEYS].sort()
    );
    const navSource = read("src/activeclinic/website/activeClinicClinicWebsiteNav.js");
    const collection = read("views/activeclinic/partials/website-collection-editor.ejs");
    for (const key of AC_INLINE_KEYS) {
      const literal = new RegExp(`contentKey:\\s*'${key.replace(/\./g, "\\.")}'`);
      const inNav = navSource.includes(`"${key}"`) || navSource.includes(`'${key}'`);
      const inCollection = collection.includes(`collectionKey: '${key}'`) || collection.includes(`"${key}"`);
      assert.ok(
        literal.test(corpus) || inNav || inCollection,
        `missing pencil wiring for ${key}`
      );
    }
    assert.match(corpus, /contentKey:\s*item\.labelKey/);
    assert.match(corpus, /data-website-start="1"/);
    assert.match(corpus, /data-website-save="1"/);
    assert.match(corpus, /data-website-cancel="1"/);
    assert.doesNotMatch(corpus, /contentKey:\s*'page\.pricing\.visible'/);
    assert.doesNotMatch(corpus, /contentKey:\s*'home\.faq'/);
    assert.doesNotMatch(corpus, /contentKey:\s*'home\.testimonials'/);
    assert.doesNotMatch(corpus, /contentKey:\s*'services\.examples'/);
    assert.doesNotMatch(corpus, /contentKey:\s*'doctors\.examples'/);
    assert.doesNotMatch(corpus, /contentKey:\s*'clinic\.publicName'/);
    assert.doesNotMatch(corpus, /contentKey:\s*'operational\./);
    assert.equal(unclassifiedRows().length, 0);
    assert.ok(PUBLIC_PAGES.includes("contact"));
  });

  it("BlessBoard registered inline fields have public pencils or shared partials", () => {
    const corpus = bbViewCorpus();
    const about = read("views/blessboard/v5/public/about.ejs");
    const contact = read("views/blessboard/v5/public/contact.ejs");
    const hero = read("views/blessboard/v5/public/partials/page-hero.ejs");
    const heading = read("views/blessboard/v5/public/partials/section-heading.ejs");
    const cta = read("views/blessboard/v5/public/partials/cta-band.ejs");
    const editable = read("views/blessboard/v5/partials/editable-text.ejs");
    assert.match(editable, /data-bb-inline-start="1"/);
    assert.match(editable, /data-bb-inline-save="1"/);
    assert.match(editable, /data-bb-inline-cancel="1"/);
    assert.match(hero, /editFieldKey:\s*'heading'/);
    assert.match(hero, /editFieldKey:\s*'bodyText'/);
    assert.match(hero, /editFieldKey:\s*'eyebrow'/);
    assert.match(hero, /editFieldKey:\s*'buttonText'/);
    assert.match(hero, /editFieldKey:\s*'buttonUrl'/);
    assert.match(hero, /editFieldKey:\s*'secondaryButtonText'/);
    assert.match(hero, /editFieldKey:\s*'secondaryButtonUrl'/);
    assert.match(heading, /editFieldKey:\s*'heading'/);
    assert.match(heading, /editFieldKey:\s*'bodyText'/);
    assert.match(heading, /editFieldKey:\s*'buttonText'/);
    assert.match(cta, /editFieldKey:\s*'buttonUrl'/);
    assert.match(contact, /editSectionKey:\s*'details'/);
    assert.match(contact, /editFieldKey:\s*contactField/);
    assert.match(contact, /card\.kind === 'phone'/);
    assert.match(contact, /card\.kind === 'email'/);
    assert.match(contact, /card\.kind === 'location' \? 'address'/);
    assert.match(corpus, /editSectionKey:\s*'footer'/);
    assert.match(about, /editSectionKey:\s*galleryKey/);
    assert.match(about, /editFieldKey:\s*'heading'/);

    const dynamicSection = /^(gallery_|value_|why_)/;
    const missing = [];
    for (const field of EDITABLE_FIELDS) {
      if (dynamicSection.test(field.sectionKey)) continue;
      const quoted = new RegExp(`['"]${field.sectionKey}['"]`);
      if (!quoted.test(corpus)) missing.push(`${field.pageKey}.${field.sectionKey}.${field.fieldKey}`);
    }
    assert.equal(missing.length, 0, `unwired BlessBoard sections: ${missing.join(", ")}`);
  });
});

describe("v7 inline editor coverage — HTTP draft save / cancel / no publish", () => {
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

  it("ActiveClinic draft pages expose pencils and field save stays draft-only", async () => {
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
      contact: await request(app).get(acDraft(result.slug, "contact")).set("Cookie", cookie),
      location: await request(app).get(acDraft(result.slug, "location")).set("Cookie", cookie),
      services: await request(app).get(acDraft(result.slug, "services")).set("Cookie", cookie),
      doctors: await request(app).get(acDraft(result.slug, "doctors")).set("Cookie", cookie),
      pricing: await request(app).get(acDraft(result.slug, "pricing")).set("Cookie", cookie),
      book: await request(app).get(acDraft(result.slug, "book")).set("Cookie", cookie),
      "patient-information": await request(app)
        .get(acDraft(result.slug, "patient-information"))
        .set("Cookie", cookie),
    };
    for (const [name, res] of Object.entries(pages)) {
      assert.equal(res.status, 200, `${name} ${res.status}`);
      assert.match(res.text, /data-website-start="1"/);
      assert.match(res.text, /data-website-save="1"/);
      assert.match(res.text, /data-website-cancel="1"/);
      assert.match(res.text, /Save to draft/);
      assert.match(res.text, /Cancel/);
      for (const key of AC_PAGE_EXPECT[name]) {
        assert.ok(websiteKeys(res.text).includes(key), `${name} missing ${key}`);
        assert.ok(hasFieldControls(res.text, key), `${name} ${key} missing pencil/save/cancel`);
      }
    }

    const publicLive = await request(app).get(`/clinics/${result.slug}`);
    if (publicLive.status === 200) {
      assert.doesNotMatch(publicLive.text, /data-website-start="1"/);
      assert.doesNotMatch(publicLive.text, /data-website-key=/);
    } else {
      assert.equal(publicLive.status, 403);
    }

    const csrf = extractCsrf(pages.home);
    const marker = `Draft Cover Title ${Date.now()}`;
    const save = await request(app)
      .post(`/clinics/${result.slug}/website/drafts`)
      .set("Cookie", cookieHeader(cookie, pages.home))
      .send({ [CSRF_FIELD]: csrf, contentKey: "home.hero.title", value: marker });
    assert.equal(save.status, 200, save.text);
    const body = JSON.parse(save.text);
    assert.equal(body.ok, true);
    assert.equal(body.published, false);
    assert.equal(body.code, "saved_to_draft");

    const liveAfter = await request(app)
      .get(`/clinics/${result.slug}?website_mode=live`)
      .set("Cookie", cookie);
    assert.equal(liveAfter.status, 200, liveAfter.text.slice(0, 240));
    assert.doesNotMatch(liveAfter.text, /data-website-start="1"/);
    assert.doesNotMatch(
      liveAfter.text,
      new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    );

    const draftAfter = await request(app).get(acDraft(result.slug)).set("Cookie", cookie);
    assert.match(draftAfter.text, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

    const overlay = await request(app)
      .post(`/clinics/${result.slug}/website/drafts`)
      .set("Cookie", cookieHeader(cookie, pages.home))
      .send({ [CSRF_FIELD]: csrf, contentKey: "contact.phone", value: "+260970009991" });
    assert.equal(overlay.status, 200, overlay.text);
    assert.equal(JSON.parse(overlay.text).published, false);

    const unknown = await request(app)
      .post(`/clinics/${result.slug}/website/drafts`)
      .set("Cookie", cookieHeader(cookie, pages.home))
      .send({ [CSRF_FIELD]: csrf, contentKey: "about.introduction", value: "nope" });
    assert.equal(unknown.status, 400);
    assert.equal(JSON.parse(unknown.text).code, "unknown_content_key");

    const operational = await request(app)
      .post(`/clinics/${result.slug}/website/drafts`)
      .set("Cookie", cookieHeader(cookie, pages.home))
      .send({ [CSRF_FIELD]: csrf, contentKey: "contact.address", value: "nope" });
    assert.equal(operational.status, 400);

    const instance = await instanceRepo.findWebsiteInstanceByOrgProduct(pool, {
      organizationId: result.organizationId,
      productCode: "activeclinic",
    });
    const rows = await contentService.listWebsiteContent(pool, instance, result.organizationId);
    const titleRow = rows.find((row) => row.contentKey === "home.hero.title");
    assert.equal(titleRow.draftValue, marker);
    assert.notEqual(titleRow.publishedValue, marker);
  });

  it("BlessBoard public edit mode keeps pencil → draft save without publishing", async () => {
    if (!requireDb()) return;
    const body = churchBody();
    const validation = validatePlatformChurchRegistration(body, { instantFreeEnabled: true });
    assert.equal(validation.ok, true, JSON.stringify(validation));
    const submitted = await submitChurchRegistration(pool, fakeReq(), validation, {
      env: { PLATFORM_DEPLOYMENT_CODE: "blessboard-org-staging" },
      dataEnvironment: "testing",
      deploymentCode: "blessboard-org-staging",
    });
    assert.equal(submitted.ok, true, JSON.stringify(submitted));
    const orgId = submitted.records.organizationId;
    const key = submitted.records.organizationKey || body.organization_key;
    const churchRow = await pool.query(
      `SELECT id FROM blessboard.churches WHERE organization_id = $1`,
      [orgId]
    );
    assert.equal(churchRow.rowCount, 1);
    const userRow = await pool.query(
      `SELECT id FROM blessboard.users WHERE email_normalized = $1 LIMIT 1`,
      [String(body.email).toLowerCase()]
    );
    assert.equal(userRow.rowCount, 1, "registered church user missing");
    const session = await createV5Session(pool, {
      deploymentCode: "blessboard-org-staging",
      userId: userRow.rows[0].id,
      organizationId: orgId,
      churchId: churchRow.rows[0].id,
    });
    assert.equal(session.ok, true, session.code);
    const cookie = `${DEFAULT_V5_COOKIE}=${session.rawToken}`;
    const app = createV5FoundationApp({
      getPool: () => pool,
      env: {
        ...MINIMAL_BB,
        BLESSBOARD_TENANT_ROUTING_MODE: "authoritative",
        BLESSBOARD_AUTHORITATIVE_HOST_ALLOWLIST: "*",
      },
      apexHosts: new Set([BB_HOST, `www.${BB_HOST}`]),
    });
    const edit = await request(app)
      .get(`/c/${key}?website_edit=1`)
      .set("Host", BB_HOST)
      .set("Cookie", cookie);
    assert.equal(edit.status, 200, String(edit.text).slice(0, 400));
    assert.match(edit.text, /data-bb-inline-start="1"/);
    assert.match(edit.text, /data-bb-inline-save="1"/);
    assert.match(edit.text, /data-bb-inline-cancel="1"/);

    const csrfAttr = (edit.text.match(/data-bb-csrf="([^"]+)"/) || [])[1];
    const setCookie = [].concat(edit.headers["set-cookie"] || []);
    const csrfLine = setCookie.find((c) => String(c).startsWith(`${CSRF_COOKIE}=`));
    const csrfCookie = csrfLine ? String(csrfLine).split(";")[0].slice(CSRF_COOKIE.length + 1) : csrfAttr;
    assert.ok(csrfAttr, "csrf attr");
    const marker = `BB Draft Cover ${Date.now()}`;
    const saveUrl =
      (edit.text.match(/data-bb-save-url="([^"]+)"/) || [])[1] || "/hq/content/api/inline-field";
    const save = await request(app)
      .post(saveUrl)
      .set("Host", BB_HOST)
      .set("Cookie", [cookie, `${CSRF_COOKIE}=${csrfCookie}`].join("; "))
      .set("Content-Type", "application/json")
      .set("Accept", "application/json")
      .set("X-CSRF-Token", csrfAttr)
      .send({
        [CSRF_FIELD]: csrfAttr,
        pageKey: "home",
        sectionKey: "hero",
        fieldKey: "heading",
        value: marker,
      });
    assert.equal(save.status, 200, JSON.stringify(save.body || save.text));
    assert.equal(save.body.ok, true);
    assert.equal(save.body.published, false);

    const live = await request(app).get(`/c/${key}`).set("Host", BB_HOST);
    assert.equal(live.status, 200);
    assert.doesNotMatch(live.text, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.doesNotMatch(live.text, /data-bb-inline-start="1"/);
  });
});
