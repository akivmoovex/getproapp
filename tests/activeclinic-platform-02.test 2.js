"use strict";

/**
 * ActiveClinic Platform 02 — locations, registration edit, success URL, slugs, website hub, legal layout.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const {
  createActiveClinicFoundationApp,
} = require("../src/activeclinic/http/activeClinicFoundationServer");
const {
  CODE_ACTIVECLINIC_ORG_V6,
  resetDeploymentProfileWarningsForTests,
  COOKIE_ACTIVECLINIC_ORG,
  CSRF_COOKIE_ACTIVECLINIC_ORG,
} = require("../src/platform/config/deploymentProfiles");
const { CSRF_FIELD, getCsrfCookieName } = require("../src/platform/http/v5Csrf");
const {
  allocateUniqueOrganizationKey,
} = require("../src/platform/organization/allocateUniqueOrganizationKey");
const {
  withOrganizationKeySuffix,
} = require("../src/blessboard/services/organizationKey");
const {
  searchLocations,
  persistRegistrationLocation,
  normalizeLocationName,
  autocompleteLocations,
  parseLocationAutocompleteInput,
} = require("../src/platform/geography/locationService");
const {
  submitAndProvisionClinicRegistration,
} = require("../src/activeclinic/services/submitClinicRegistrationService");
const {
  buildPublicOrganizationWebsitePath,
  PRODUCT_CODE,
} = require("../src/platform/website/publicWebsiteUrl");
const instanceRepo = require("../src/platform/website/instanceRepository");

let pool;
let databaseUrl;
let skipReason = null;

function extractCsrf(res, env) {
  const cookies = [].concat(res.headers["set-cookie"] || []);
  const name = getCsrfCookieName(env);
  const raw = cookies.find((c) => String(c).startsWith(`${name}=`)) || "";
  const match = String(raw).match(new RegExp(`${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : "";
}

function extractFormCsrf(html) {
  const m = String(html).match(/name="_csrf"[^>]*value="([^"]+)"/);
  return m ? m[1] : "";
}

describe("ActiveClinic platform 02", () => {
  const env = {
    NODE_ENV: "test",
    PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_V6,
    SESSION_SECRET: "a".repeat(48),
  };

  before(async () => {
    resetDeploymentProfileWarningsForTests();
    try {
      databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });
    } catch (err) {
      skipReason = err && err.message ? err.message : String(err);
    }
  });

  after(async () => {
    if (pool) await pool.end().catch(() => {});
  });

  function requireDb() {
    if (skipReason) assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
  }

  function makeApp() {
    return createActiveClinicFoundationApp({
      getPool: () => pool,
      env: { ...env, DATABASE_URL: databaseUrl },
    });
  }

  const basePayload = {
    clinicName: "Juflona Clinic",
    clinicType: "clinic",
    contactName: "Platform Admin",
    contactEmail: "ac-platform-02@example.invalid",
    contactPhone: "+260970000123",
    province: "Lusaka",
    city: "Lusaka",
    address: "Independence Ave",
    countryCode: "ZM",
    notes: "platform 02",
    password: "clinic-admin-pass-12",
    passwordConfirm: "clinic-admin-pass-12",
    acceptTerms: "on",
  };

  it("locations: Zambia autocomplete and one-character query", async () => {
    requireDb();
    const lResults = await searchLocations(pool, { countryCode: "ZM", query: "l", limit: 10 });
    assert.ok(lResults.some((row) => row.name === "Lusaka"));
    assert.ok(lResults.some((row) => row.name === "Livingstone"));
    const kResults = await searchLocations(pool, { countryCode: "ZM", query: "k", limit: 10 });
    assert.ok(kResults.some((row) => row.name === "Kitwe"));
  });

  it("locations: new town persists once and appears in later search", async () => {
    requireDb();
    const town = "New Chisamba Township";
    const first = await persistRegistrationLocation(pool, {
      countryCode: "ZM",
      city: town,
      provinceRegion: "Central",
      registrationReference: "AC-TEST-REF",
    });
    assert.ok(first && first.id);
    const dup = await persistRegistrationLocation(pool, {
      countryCode: "ZM",
      city: "new chisamba township",
      registrationReference: "AC-TEST-REF-2",
    });
    assert.equal(dup.id, first.id);
    const found = await searchLocations(pool, { countryCode: "ZM", query: "new ch", limit: 5 });
    assert.ok(found.some((row) => normalizeLocationName(row.name) === normalizeLocationName(town)));
  });

  it("locations: invalid location id rejected at confirm", async () => {
    requireDb();
    const application = makeApp();
    const getForm = await request(application).get("/register-clinic");
    const csrf = extractCsrf(getForm, env);
    const review = await request(application)
      .post("/register-clinic")
      .set("Cookie", getForm.headers["set-cookie"])
      .type("form")
      .send({
        ...basePayload,
        contactEmail: "invalid-location@example.invalid",
        contactPhone: "+260970000124",
        [CSRF_FIELD]: csrf,
      });
    const csrf2 = extractFormCsrf(review.text);
    const bad = await request(application)
      .post("/register-clinic")
      .set("Cookie", review.headers["set-cookie"])
      .type("form")
      .send({
        ...basePayload,
        contactEmail: "invalid-location@example.invalid",
        contactPhone: "+260970000124",
        locationId: "00000000-0000-4000-8000-000000000099",
        action: "confirm",
        acceptTerms: "on",
        [CSRF_FIELD]: csrf2,
      });
    assert.equal(bad.status, 400);
    assert.match(bad.text, /valid city/i);
  });

  it("provinces: Zambia list rendered on registration", async () => {
    requireDb();
    const page = await request(makeApp()).get("/register-clinic");
    assert.match(page.text, /Select province/);
    assert.match(page.text, /North-Western/);
  });

  it("registration edit from review uses GET navigation with signed draft cookie", async () => {
    requireDb();
    const application = makeApp();
    const s1 = await request(application).get("/register-clinic");
    const csrf1 = extractFormCsrf(s1.text);
    const payload = {
      ...basePayload,
      contactEmail: "edit-flow@example.invalid",
      contactPhone: "+260970000125",
      province: "Copperbelt",
      city: "Kitwe",
    };
    const s2 = await request(application)
      .post("/register-clinic")
      .set("Cookie", s1.headers["set-cookie"])
      .type("form")
      .send({ ...payload, action: "next-clinic", [CSRF_FIELD]: csrf1 });
    const csrf2 = extractFormCsrf(s2.text);
    const review = await request(application)
      .post("/register-clinic")
      .set("Cookie", s2.headers["set-cookie"])
      .type("form")
      .send({ ...payload, action: "next-admin", [CSRF_FIELD]: csrf2 });
    assert.equal(review.status, 200);
    const editClinic = await request(application)
      .get("/register-clinic?step=clinic")
      .set("Cookie", review.headers["set-cookie"]);
    assert.equal(editClinic.status, 200);
    assert.doesNotMatch(editClinic.text, /session expired/i);
    assert.match(editClinic.text, /Kitwe/);
    const editAdmin = await request(application)
      .get("/register-clinic?step=administrator")
      .set("Cookie", review.headers["set-cookie"]);
    assert.equal(editAdmin.status, 200);
    assert.match(editAdmin.text, /edit-flow@example\.invalid/);
  });

  it("registration confirm rejects invalid CSRF while GET edit stays available", async () => {
    requireDb();
    const application = makeApp();
    const s1 = await request(application).get("/register-clinic");
    const csrf1 = extractFormCsrf(s1.text);
    const payload = {
      ...basePayload,
      contactEmail: "csrf-guard@example.invalid",
      contactPhone: "+260970000126",
    };
    const s2 = await request(application)
      .post("/register-clinic")
      .set("Cookie", s1.headers["set-cookie"])
      .type("form")
      .send({ ...payload, action: "next-clinic", [CSRF_FIELD]: csrf1 });
    const csrf2 = extractFormCsrf(s2.text);
    const review = await request(application)
      .post("/register-clinic")
      .set("Cookie", s2.headers["set-cookie"])
      .type("form")
      .send({ ...payload, action: "next-admin", [CSRF_FIELD]: csrf2 });
    const badConfirm = await request(application)
      .post("/register-clinic")
      .set("Cookie", review.headers["set-cookie"])
      .type("form")
      .send({ ...payload, action: "confirm", acceptTerms: "on", [CSRF_FIELD]: "invalid-token" });
    assert.equal(badConfirm.status, 403);
    assert.match(badConfirm.text, /session expired/i);
    const editClinic = await request(application)
      .get("/register-clinic?step=clinic")
      .set("Cookie", review.headers["set-cookie"]);
    assert.equal(editClinic.status, 200);
    assert.match(editClinic.text, /csrf-guard@example\.invalid|Lusaka|Kitwe/);
  });

  it("autocomplete API enforces country and query bounds", async () => {
    requireDb();
    const application = makeApp();
    const empty = await request(application).get("/api/locations/autocomplete?country=ZM&q=");
    assert.equal(empty.status, 200);
    assert.equal(empty.body.ok, true);
    assert.equal(empty.body.results.length, 0);
    const one = await request(application).get("/api/locations/autocomplete?country=ZM&q=L");
    assert.equal(one.status, 200);
    assert.ok(one.body.results.some((row) => row.name === "Lusaka"));
    const badCountry = await request(application).get("/api/locations/autocomplete?country=ZZZ&q=L");
    assert.equal(badCountry.status, 400);
    const parsed = parseLocationAutocompleteInput({ countryCode: "ZM", query: "x".repeat(200) });
    assert.equal(parsed.query.length, 80);
    const long = await request(application).get(
      `/api/locations/autocomplete?country=ZM&q=${encodeURIComponent("x".repeat(200))}`
    );
    assert.equal(long.status, 200);
    const special = await autocompleteLocations(pool, {
      countryCode: "ZM",
      query: "lu's%ka",
    });
    assert.ok(Array.isArray(special.results));
  });

  it("registration success shows persisted clinic URL and copy UI", async () => {
    requireDb();
    const stamp = Date.now();
    const payload = {
      ...basePayload,
      clinicName: `Sunrise Clinic ${stamp}`,
      contactEmail: `success-${stamp}@example.invalid`,
      contactPhone: `+26097${String(stamp).slice(-7)}`,
    };
    const result = await submitAndProvisionClinicRegistration(pool, {
      ...payload,
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
      dataEnvironment: "testing",
      env,
    });
    assert.equal(result.ok, true, JSON.stringify(result));
    const expectedPath = buildPublicOrganizationWebsitePath({
      product: PRODUCT_CODE.ACTIVECLINIC,
      organizationKey: result.slug,
    });
    const success = await request(makeApp()).get(
      `/register-clinic/success?ref=${encodeURIComponent(result.application.applicationNumber)}&ready=1`
    );
    assert.equal(success.status, 200);
    assert.match(success.text, new RegExp(expectedPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(success.text, /data-ac-copy-website-url="1"/);
    assert.match(success.text, /Draft — not published yet/);
    assert.match(success.text, /Build your website/);
    assert.match(success.text, /\/app\/settings\/website/);
  });

  it("self-registered clinic admin sees populated website hub with single instance", async () => {
    requireDb();
    const stamp = Date.now();
    const password = "clinic-admin-pass-12";
    const payload = {
      ...basePayload,
      clinicName: `Hub Clinic ${stamp}`,
      contactEmail: `hub-${stamp}@example.invalid`,
      contactPhone: `+26097${String(stamp).slice(-7)}`,
      password,
      passwordConfirm: password,
    };
    const application = makeApp();
    const s1 = await request(application).get("/register-clinic");
    const csrf1 = extractFormCsrf(s1.text);
    const s2 = await request(application)
      .post("/register-clinic")
      .set("Cookie", s1.headers["set-cookie"])
      .type("form")
      .send({ ...payload, action: "next-clinic", [CSRF_FIELD]: csrf1 });
    const csrf2 = extractFormCsrf(s2.text);
    const review = await request(application)
      .post("/register-clinic")
      .set("Cookie", s2.headers["set-cookie"])
      .type("form")
      .send({ ...payload, action: "next-admin", [CSRF_FIELD]: csrf2 });
    const csrf3 = extractFormCsrf(review.text);
    const confirm = await request(application)
      .post("/register-clinic")
      .set("Cookie", review.headers["set-cookie"])
      .type("form")
      .send({ ...payload, action: "confirm", acceptTerms: "on", [CSRF_FIELD]: csrf3 });
    assert.equal(confirm.status, 303, confirm.text && confirm.text.slice(0, 200));
    const loginGet = await request(application).get("/login");
    const loginCsrf = extractFormCsrf(loginGet.text);
    const loginCsrfCookie = (loginGet.headers["set-cookie"] || [])
      .find((c) => String(c).startsWith(`${CSRF_COOKIE_ACTIVECLINIC_ORG}=`));
    const loginPost = await request(application)
      .post("/login")
      .set("Cookie", loginCsrfCookie || "")
      .type("form")
      .send({
        [CSRF_FIELD]: loginCsrf,
        identifier: payload.contactEmail,
        password,
      });
    assert.equal(loginPost.status, 303);
    const sid = (loginPost.headers["set-cookie"] || [])
      .find((c) => String(c).startsWith(`${COOKIE_ACTIVECLINIC_ORG}=`));
    assert.ok(sid);
    const session = String(sid).split(";")[0];
    const hub = await request(application).get("/app/settings/website").set("Cookie", session);
    assert.equal(hub.status, 200, hub.text && hub.text.slice(0, 300));
    assert.match(hub.text, /data-ac-website-management="1"/);
    assert.match(hub.text, /data-ac-website-action="edit"/);
    assert.match(hub.text, /data-ac-website-action="preview"/);
    assert.match(hub.text, /data-ac-website-action="media"|data-ac-website-action="styles"/);
    assert.match(hub.text, /data-ac-website-action="seo"/);
    assert.match(hub.text, /data-ac-website-action="history"/);
    assert.match(hub.text, /Website not published yet|Draft/i);
    assert.doesNotMatch(hub.text, /data-ac-provisioning-incomplete/);
    const instances = await pool.query(
      `SELECT wi.id
         FROM platform.website_instances wi
         JOIN activeclinic.clinic_registration_applications a ON a.organization_id = wi.organization_id
        WHERE a.contact_email_normalized = lower($1)
          AND wi.product_code = 'activeclinic'`,
      [payload.contactEmail]
    );
    assert.equal(instances.rows.length, 1);
  });

  it("slug allocator uses shared -02/-03 collision behavior", async () => {
    requireDb();
    assert.equal(withOrganizationKeySuffix("juflona-clinic", 1), "juflona-clinic");
    assert.equal(withOrganizationKeySuffix("juflona-clinic", 2), "juflona-clinic-02");
    assert.equal(withOrganizationKeySuffix("juflona-clinic", 3), "juflona-clinic-03");
    const client = { query: pool.query.bind(pool) };
    const base = "juflona-clinic";
    await pool.query(`DELETE FROM platform.organizations WHERE organization_key LIKE $1`, [`${base}%`]);
    const first = await allocateUniqueOrganizationKey(client, { preferredKey: base, exactPreferred: true });
    await pool.query(
      `INSERT INTO platform.organizations (organization_key, display_name, status, data_environment)
       VALUES ($1, $2, 'active', 'testing')`,
      [first, "Collision Org 1"]
    );
    const second = await allocateUniqueOrganizationKey(client, { displayName: "Juflona Clinic" });
    await pool.query(
      `INSERT INTO platform.organizations (organization_key, display_name, status, data_environment)
       VALUES ($1, $2, 'active', 'testing')`,
      [second, "Collision Org 2"]
    );
    const third = await allocateUniqueOrganizationKey(client, { displayName: "Juflona Clinic" });
    assert.equal(second, "juflona-clinic-02");
    assert.equal(third, "juflona-clinic-03");
  });

  it("legal pages use centered legal container", async () => {
    requireDb();
    const application = makeApp();
    const privacy = await request(application).get("/privacy");
    const terms = await request(application).get("/terms");
    assert.equal(privacy.status, 200);
    assert.equal(terms.status, 200);
    assert.match(privacy.text, /class="ac-public-section ac-legal"/);
    assert.match(terms.text, /class="ac-public-section ac-legal"/);
  });
});
