"use strict";

/**
 * Clinic website autonomy acceptance: HTTP registration through publish,
 * draft/preview isolation, restore, RBAC, and tenant isolation.
 * Clinic-admin publish only — no Platform Admin availability override.
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
  createActiveClinicFoundationApp,
} = require("../src/activeclinic/http/activeClinicFoundationServer");
const {
  CODE_ACTIVECLINIC_ORG_V6,
  COOKIE_ACTIVECLINIC_ORG,
  CSRF_COOKIE_ACTIVECLINIC_ORG,
} = require("../src/platform/config/deploymentProfiles");
const { CSRF_FIELD } = require("../src/platform/http/v5Csrf");
const {
  createPlatformIdentitySession,
} = require("../src/platform/session/createDeploymentSession");
const { createPlatformIdentity } = require("../src/platform/services/platformIdentityService");
const {
  setPlatformIdentityPassword,
} = require("../src/platform/services/platformIdentityCredentialService");
const {
  createStaffMember,
} = require("../src/activeclinic/services/activeClinicStaffService");
const {
  assignStaffToFacility,
} = require("../src/activeclinic/services/activeClinicStaffFacilityService");
const {
  assignStaffRole,
  WEBSITE_EDITOR,
  RECEPTIONIST,
} = require("../src/activeclinic/services/activeClinicAuthorizationService");

const IDENTITY_KEY = "blessboard-platform-v5";
const PASSWORD = "clinic-admin-pass-12";
const AC_HOST = "activeclinic.org";
const MINIMAL_AC = Object.freeze({
  NODE_ENV: "test",
  PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_V6,
  DATABASE_URL: "postgres://unused/local",
  SESSION_SECRET: "a".repeat(40),
});
const PNG_1X1 = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082",
  "hex"
);

let pool;
let skipReason = null;
let phoneSeq = 870000000;

function requireDb() {
  if (skipReason) {
    assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
  }
}

function nextPhone() {
  phoneSeq += 1;
  return `+2609${String(phoneSeq).slice(-8)}`;
}

function uniq(prefix) {
  return `${prefix}-${crypto.randomBytes(3).toString("hex")}`;
}

function re(value) {
  return new RegExp(String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
}

function extractCookie(res, name) {
  const raw = res.headers["set-cookie"];
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  for (const line of list) {
    if (String(line).startsWith(`${name}=`)) {
      return String(line).split(";")[0].slice(name.length + 1);
    }
  }
  return null;
}

function extractCsrf(htmlOrRes) {
  const text = typeof htmlOrRes === "string" ? htmlOrRes : String(htmlOrRes && htmlOrRes.text || "");
  const meta = text.match(/name="csrf-token"\s+content="([^"]+)"/);
  if (meta) return meta[1];
  const field = text.match(
    new RegExp(`name="${CSRF_FIELD}"[^>]*value="([^"]+)"|value="([^"]+)"[^>]*name="${CSRF_FIELD}"`)
  );
  return (field && (field[1] || field[2])) || null;
}

function addCookiePair(map, raw) {
  const first = String(raw || "").split(";")[0];
  const eq = first.indexOf("=");
  if (eq <= 0) return;
  map[first.slice(0, eq)] = first.slice(eq + 1);
}

function mergeCookies(sessionCookie, pageRes, extra) {
  const map = Object.create(null);
  if (sessionCookie) {
    for (const part of String(sessionCookie).split(";")) addCookiePair(map, part.trim());
  }
  const set = pageRes && pageRes.headers && pageRes.headers["set-cookie"];
  const list = Array.isArray(set) ? set : set ? [set] : [];
  for (const line of list) addCookiePair(map, line);
  if (extra) addCookiePair(map, extra);
  return Object.entries(map)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

function makeApp() {
  return createActiveClinicFoundationApp({
    getPool: () => pool,
    env: MINIMAL_AC,
    log: () => {},
  });
}

async function registerClinic(app, payload) {
  const getForm = await request(app).get("/register-clinic").set("Host", AC_HOST);
  assert.equal(getForm.status, 200, getForm.text && getForm.text.slice(0, 300));
  const csrfCookie = extractCookie(getForm, CSRF_COOKIE_ACTIVECLINIC_ORG);
  const csrf = extractCsrf(getForm.text);
  const confirm = await request(app)
    .post("/register-clinic")
    .set("Host", AC_HOST)
    .set("Cookie", csrfCookie ? `${CSRF_COOKIE_ACTIVECLINIC_ORG}=${csrfCookie}` : "")
    .redirects(0)
    .type("form")
    .send({ [CSRF_FIELD]: csrf || "", action: "confirm", ...payload });
  assert.equal(confirm.status, 303, confirm.text && confirm.text.slice(0, 400));
  assert.match(String(confirm.headers.location || ""), /\/register-clinic\/success\?ref=AC-/);
  const appRow = await pool.query(
    `SELECT status, provisioning_status, organization_id
       FROM activeclinic.clinic_registration_applications
      WHERE contact_email_normalized = $1`,
    [payload.contactEmail.toLowerCase()]
  );
  assert.equal(appRow.rows.length, 1);
  assert.equal(appRow.rows[0].status, "active");
  assert.ok(appRow.rows[0].organization_id);
  const organizationId = appRow.rows[0].organization_id;
  const slugRow = await pool.query(
    `SELECT organization_key FROM platform.organizations WHERE id = $1`,
    [organizationId]
  );
  const identity = await pool.query(
    `SELECT id FROM platform.identities WHERE email_normalized = $1 LIMIT 1`,
    [payload.contactEmail.toLowerCase()]
  );
  return {
    organizationId,
    slug: slugRow.rows[0].organization_key,
    identityId: identity.rows[0].id,
    provisioningStatus: appRow.rows[0].provisioning_status,
  };
}

async function loginClinicAdmin(app, email, password) {
  const getLogin = await request(app).get("/login").set("Host", AC_HOST);
  const loginCsrfCookie = extractCookie(getLogin, CSRF_COOKIE_ACTIVECLINIC_ORG);
  const loginCsrf = extractCsrf(getLogin.text);
  const loginPost = await request(app)
    .post("/login")
    .set("Host", AC_HOST)
    .set("Cookie", loginCsrfCookie ? `${CSRF_COOKIE_ACTIVECLINIC_ORG}=${loginCsrfCookie}` : "")
    .set("Accept", "text/html")
    .type("form")
    .send({ [CSRF_FIELD]: loginCsrf || "", identifier: email, password });
  assert.equal(loginPost.status, 303, loginPost.text && loginPost.text.slice(0, 400));
  const sid = extractCookie(loginPost, COOKIE_ACTIVECLINIC_ORG);
  assert.ok(sid, "clinic admin session cookie");
  return `${COOKIE_ACTIVECLINIC_ORG}=${sid}`;
}

async function sessionCookie(identityId, organizationId, facilityId) {
  const session = await createPlatformIdentitySession(pool, {
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    platformIdentityId: identityId,
    organizationId,
    contextJson: facilityId ? { selectedFacilityId: facilityId } : {},
  });
  assert.equal(session.ok, true, JSON.stringify(session));
  return `${COOKIE_ACTIVECLINIC_ORG}=${session.rawToken}`;
}

async function seedStaff(orgId, hcoId, facilityId, roleKey, email) {
  const phone = nextPhone();
  const identity = await createPlatformIdentity(pool, {
    primaryEmail: email,
    primaryPhone: phone,
    phoneNormalized: phone,
    phoneVerifiedAt: new Date().toISOString(),
  });
  assert.equal(identity.ok, true, JSON.stringify(identity));
  await setPlatformIdentityPassword(pool, {
    identityId: identity.identity.id,
    password: PASSWORD,
  });
  const staff = await createStaffMember(pool, {
    organizationId: orgId,
    healthcareOrganizationId: hcoId,
    firstName: "Autonomy",
    lastName: roleKey.slice(-8),
    employmentType: "permanent",
    status: "active",
    phone,
    platformIdentityId: identity.identity.id,
  });
  assert.equal(staff.ok, true, JSON.stringify(staff));
  await assignStaffToFacility(pool, {
    organizationId: orgId,
    staffMemberId: staff.staffMember.id,
    facilityId,
    isPrimary: true,
  });
  const role = await assignStaffRole(pool, {
    organizationId: orgId,
    staffMemberId: staff.staffMember.id,
    roleKey,
    scopeType: "facility",
    facilityId,
    assignmentOrigin: "system",
  });
  assert.equal(role.ok, true, JSON.stringify(role));
  return { identityId: identity.identity.id };
}

describe("v7 clinic website autonomy acceptance", { timeout: 180000 }, () => {
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

  it("walks a new clinic from registration through restore without Platform Admin", async () => {
    requireDb();
    const app = makeApp();
    const stamp = uniq("auto");
    const payload = {
      clinicName: `Autonomy Clinic ${stamp}`,
      contactName: "Clinic Admin",
      contactEmail: `${stamp}@clinic.example`,
      contactPhone: nextPhone(),
      province: "Lusaka Province",
      city: "Lusaka",
      address: "1 Independence Avenue",
      countryCode: "ZM",
      notes: "website autonomy",
      password: PASSWORD,
      passwordConfirm: PASSWORD,
      acceptTerms: "on",
    };

    const clinic = await registerClinic(app, payload);
    assert.equal(clinic.provisioningStatus, "provisioned");
    const otherPayload = {
      ...payload,
      clinicName: `Other Clinic ${stamp}`,
      contactEmail: `other-${stamp}@clinic.example`,
      contactPhone: nextPhone(),
    };
    const other = await registerClinic(app, otherPayload);

    const session = await loginClinicAdmin(app, payload.contactEmail, PASSWORD);
    const dashboard = await request(app).get("/app").set("Host", AC_HOST).set("Cookie", session);
    assert.equal(dashboard.status, 200);
    assert.match(dashboard.text, /data-ac-shell="staff-app"/);
    assert.doesNotMatch(dashboard.text, /data-ac-provisioning-incomplete/);

    const hub = await request(app)
      .get("/app/settings/website")
      .set("Host", AC_HOST)
      .set("Cookie", session);
    assert.equal(hub.status, 200, hub.text);
    assert.match(hub.text, /Website Management Hub/);
    assert.match(hub.text, /data-ac-website-status-label/);
    assert.match(hub.text, /data-ac-website-public-url/);
    assert.match(hub.text, /Not published/);
    assert.match(hub.text, /Not published yet|Not published/);
    assert.match(hub.text, /data-ac-website-next-action="publish"/);
    assert.match(hub.text, re(`/clinics/${clinic.slug}`));
    assert.doesNotMatch(hub.text, /data-ac-provisioning-incomplete/);
    assert.doesNotMatch(hub.text, /until Platform Admin finishes provisioning/);

    const anonHub = await request(app).get("/app/settings/website").set("Host", AC_HOST);
    assert.ok([302, 303, 401].includes(anonHub.status), `anon hub ${anonHub.status}`);

    const publicBefore = await request(app).get(`/clinics/${clinic.slug}`).set("Host", AC_HOST);
    assert.ok([200, 403].includes(publicBefore.status), `public ${publicBefore.status}`);
    if (publicBefore.status === 200) {
      assert.doesNotMatch(publicBefore.text, /Autonomy hours/);
    }

    const settingsGet = await request(app)
      .get("/app/settings/website/settings")
      .set("Host", AC_HOST)
      .set("Cookie", session);
    assert.equal(settingsGet.status, 200);
    const settingsSave = await request(app)
      .post("/app/settings/website/settings")
      .set("Host", AC_HOST)
      .set("Cookie", mergeCookies(session, settingsGet))
      .type("form")
      .send({
        [CSRF_FIELD]: extractCsrf(settingsGet),
        siteName: payload.clinicName,
        phone: "+260 211 000 111",
        email: `hello-${stamp}@clinic.example`,
        hours: "Mon–Fri 08:00–17:00 Autonomy hours",
      });
    assert.equal(settingsSave.status, 303, settingsSave.text);

    const brandingGet = await request(app)
      .get("/app/settings/website/branding")
      .set("Host", AC_HOST)
      .set("Cookie", session);
    assert.equal(brandingGet.status, 200);
    const brandingCookies = mergeCookies(session, brandingGet);
    const brandingCsrf = extractCsrf(brandingGet);
    const uploaded = await request(app)
      .post(`/clinics/${clinic.slug}/website/media`)
      .set("Host", AC_HOST)
      .set("Cookie", brandingCookies)
      .field(CSRF_FIELD, brandingCsrf)
      .field("altText", "Clinic logo")
      .attach("file", PNG_1X1, { filename: "logo.png", contentType: "image/png" });
    assert.equal(uploaded.status, 200, uploaded.text);
    const media = JSON.parse(uploaded.text);
    assert.equal(media.ok, true);
    assert.equal(media.published, false);
    const mediaId = media.media.id;
    const logoSrc = `/clinics/${clinic.slug}/website/media/${mediaId}`;
    const brandingSave = await request(app)
      .post("/app/settings/website/branding")
      .set("Host", AC_HOST)
      .set("Cookie", brandingCookies)
      .type("form")
      .send({
        [CSRF_FIELD]: brandingCsrf,
        primaryColor: "#0d9488",
        accentColor: "#0f766e",
        logoSrc,
        logoAlt: "Clinic logo",
        logoMediaId: mediaId,
      });
    assert.equal(brandingSave.status, 303, brandingSave.text);

    const chromeGet = await request(app)
      .get("/app/settings/website/chrome")
      .set("Host", AC_HOST)
      .set("Cookie", session);
    const chromeSave = await request(app)
      .post("/app/settings/website/chrome")
      .set("Host", AC_HOST)
      .set("Cookie", mergeCookies(session, chromeGet))
      .type("form")
      .send({
        [CSRF_FIELD]: extractCsrf(chromeGet),
        showLogo: "1",
        showNav: "1",
        showPhone: "1",
        showContact: "1",
        tagline: "Care close to home",
        legal: "Autonomy legal line",
        facebookUrl: "https://facebook.com/autonomy-clinic",
      });
    assert.equal(chromeSave.status, 303, chromeSave.text);

    const seoGet = await request(app)
      .get("/app/settings/website/seo")
      .set("Host", AC_HOST)
      .set("Cookie", session);
    const seoSave = await request(app)
      .post("/app/settings/website/seo")
      .set("Host", AC_HOST)
      .set("Cookie", mergeCookies(session, seoGet))
      .type("form")
      .send({
        [CSRF_FIELD]: extractCsrf(seoGet),
        seoTitle: `${payload.clinicName} | Care`,
        seoDescription: "First-time clinic website for autonomy acceptance.",
      });
    assert.equal(seoSave.status, 303, seoSave.text);

    const sections = await request(app)
      .get("/app/settings/website/sections")
      .set("Host", AC_HOST)
      .set("Cookie", session);
    assert.equal(sections.status, 200);
    assert.match(sections.text, /data-ac-section-id=/);

    const createPage = await request(app)
      .get("/app/settings/website/pages/new")
      .set("Host", AC_HOST)
      .set("Cookie", session);
    const createdPage = await request(app)
      .post("/app/settings/website/pages")
      .set("Host", AC_HOST)
      .set("Cookie", mergeCookies(session, createPage))
      .type("form")
      .send({
        [CSRF_FIELD]: extractCsrf(createPage),
        title: "Patient stories",
        slug: "patient-stories",
        templateKey: "blank",
        inNav: "1",
      });
    assert.equal(createdPage.status, 303, createdPage.text);
    const pageIdMatch = String(createdPage.headers.location || "").match(/pages\/([^/]+)\/builder/);
    assert.ok(pageIdMatch, createdPage.headers.location);
    const pageId = pageIdMatch[1];
    const builder = await request(app)
      .get(`/app/settings/website/pages/${pageId}/builder`)
      .set("Host", AC_HOST)
      .set("Cookie", session);
    const addBlock = await request(app)
      .post(`/app/settings/website/pages/${pageId}/blocks`)
      .set("Host", AC_HOST)
      .set("Cookie", mergeCookies(session, builder))
      .type("form")
      .send({ [CSRF_FIELD]: extractCsrf(builder), type: "heading" });
    assert.equal(addBlock.status, 303, addBlock.text);

    const nav = await request(app)
      .get("/app/settings/website/navigation")
      .set("Host", AC_HOST)
      .set("Cookie", session);
    assert.equal(nav.status, 200);
    assert.match(nav.text, /Patient stories/);

    const addLibrary = await request(app)
      .get("/app/settings/website/library/new")
      .set("Host", AC_HOST)
      .set("Cookie", session);
    const faqCreated = await request(app)
      .post("/app/settings/website/library")
      .set("Host", AC_HOST)
      .set("Cookie", mergeCookies(session, addLibrary))
      .type("form")
      .send({
        [CSRF_FIELD]: extractCsrf(addLibrary),
        type: "faq",
        question: `Parking for ${stamp}`,
        answer: "Use the side lot.",
        visible: "1",
      });
    assert.equal(faqCreated.status, 303, faqCreated.text);
    const faqId = String(faqCreated.headers.location || "").split("/").pop().split("?")[0];
    const testimonial = await request(app)
      .post("/app/settings/website/library")
      .set("Host", AC_HOST)
      .set("Cookie", mergeCookies(session, addLibrary))
      .type("form")
      .send({
        [CSRF_FIELD]: extractCsrf(addLibrary),
        type: "testimonial",
        quote: `Kind care at ${stamp}`,
        attribution: "A patient",
        visible: "1",
      });
    assert.equal(testimonial.status, 303, testimonial.text);
    const usePage = await request(app)
      .get(`/app/settings/website/library/${faqId}/use`)
      .set("Host", AC_HOST)
      .set("Cookie", session);
    const placed = await request(app)
      .post(`/app/settings/website/library/${faqId}/use`)
      .set("Host", AC_HOST)
      .set("Cookie", mergeCookies(session, usePage))
      .type("form")
      .send({ [CSRF_FIELD]: extractCsrf(usePage), pageId });
    assert.equal(placed.status, 303, placed.text);

    const anonCustom = await request(app)
      .get(`/clinics/${clinic.slug}/p/patient-stories`)
      .set("Host", AC_HOST);
    assert.ok([403, 404].includes(anonCustom.status), `unpublished custom ${anonCustom.status}`);
    const anonMedia = await request(app)
      .get(`/clinics/${clinic.slug}/website/media/${mediaId}`)
      .set("Host", AC_HOST);
    assert.ok([403, 404].includes(anonMedia.status), `unpublished media ${anonMedia.status}`);
    const draftPreview = await request(app)
      .get(`/clinics/${clinic.slug}/website/preview`)
      .set("Host", AC_HOST)
      .set("Cookie", session)
      .redirects(0);
    assert.ok([200, 303].includes(draftPreview.status), `preview ${draftPreview.status}`);
    const previewPage =
      draftPreview.status === 303
        ? await request(app)
            .get(draftPreview.headers.location)
            .set("Host", AC_HOST)
            .set("Cookie", session)
        : draftPreview;
    assert.equal(previewPage.status, 200);
    assert.match(previewPage.text, /Autonomy hours|Patient stories|Care close to home/);
    const mobilePreview = await request(app)
      .get(`/clinics/${clinic.slug}?website_mode=draft`)
      .set("Host", AC_HOST)
      .set("Cookie", session)
      .set("User-Agent", "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)");
    assert.equal(mobilePreview.status, 200);

    const publishPage = await request(app)
      .get("/app/settings/website/publish")
      .set("Host", AC_HOST)
      .set("Cookie", session);
    assert.equal(publishPage.status, 200);
    const publish = await request(app)
      .post(`/clinics/${clinic.slug}/website/publish`)
      .set("Host", AC_HOST)
      .set("Cookie", mergeCookies(session, publishPage))
      .type("form")
      .send({
        [CSRF_FIELD]: extractCsrf(publishPage),
        makePublic: "1",
        returnTo: "/app/settings/website",
      });
    assert.ok([200, 303].includes(publish.status), `publish ${publish.status} ${publish.text}`);

    const liveHome = await request(app).get(`/clinics/${clinic.slug}`).set("Host", AC_HOST);
    assert.equal(liveHome.status, 200, liveHome.text && liveHome.text.slice(0, 400));
    assert.match(liveHome.text, re(payload.clinicName));
    assert.match(liveHome.text, /Autonomy hours/);
    assert.match(liveHome.text, /Patient stories/);
    const liveCustom = await request(app)
      .get(`/clinics/${clinic.slug}/p/patient-stories`)
      .set("Host", AC_HOST);
    assert.equal(liveCustom.status, 200, liveCustom.text && liveCustom.text.slice(0, 300));
    assert.match(liveCustom.text, /Parking for/);
    const live404 = await request(app)
      .get(`/clinics/${clinic.slug}/p/does-not-exist`)
      .set("Host", AC_HOST);
    assert.ok([404, 403].includes(live404.status), `404 ${live404.status}`);

    const draftHours = `Sat 09:00–12:00 draft hours ${stamp}`;
    const settingsAfter = await request(app)
      .get("/app/settings/website/settings")
      .set("Host", AC_HOST)
      .set("Cookie", session);
    const saveHours = await request(app)
      .post("/app/settings/website/settings")
      .set("Host", AC_HOST)
      .set("Cookie", mergeCookies(session, settingsAfter))
      .type("form")
      .send({
        [CSRF_FIELD]: extractCsrf(settingsAfter),
        siteName: payload.clinicName,
        phone: "+260 211 000 111",
        email: `hello-${stamp}@clinic.example`,
        hours: draftHours,
      });
    assert.equal(saveHours.status, 303, saveHours.text);
    const brandingAfter = await request(app)
      .get("/app/settings/website/branding")
      .set("Host", AC_HOST)
      .set("Cookie", session);
    const brandingDraft = await request(app)
      .post("/app/settings/website/branding")
      .set("Host", AC_HOST)
      .set("Cookie", mergeCookies(session, brandingAfter))
      .type("form")
      .send({
        [CSRF_FIELD]: extractCsrf(brandingAfter),
        primaryColor: "#115e59",
        accentColor: "#134e4a",
        logoSrc,
        logoAlt: "Clinic logo",
        logoMediaId: mediaId,
      });
    assert.equal(brandingDraft.status, 303, brandingDraft.text);
    const sectionsAfter = await request(app)
      .get("/app/settings/website/sections")
      .set("Host", AC_HOST)
      .set("Cookie", session);
    const hideId = (
      sectionsAfter.text.match(/data-ac-section-id="([^"]+)" data-ac-section-type="(?!hero)[^"]+"/) || []
    )[1];
    assert.ok(hideId, "non-hero section exists to hide after publish");
    const hideSection = await request(app)
      .post(`/app/settings/website/sections/${hideId}/visibility`)
      .set("Host", AC_HOST)
      .set("Cookie", mergeCookies(session, sectionsAfter))
      .type("form")
      .send({ [CSRF_FIELD]: extractCsrf(sectionsAfter), visible: "0" });
    assert.equal(hideSection.status, 303);
    const extraPage = await request(app)
      .post("/app/settings/website/pages")
      .set("Host", AC_HOST)
      .set("Cookie", mergeCookies(session, createPage))
      .type("form")
      .send({
        [CSRF_FIELD]: extractCsrf(createPage),
        title: "Visit notes",
        slug: "visit-notes",
        templateKey: "blank",
        inNav: "1",
      });
    assert.equal(extraPage.status, 303, extraPage.text);
    const liveUnchanged = await request(app).get(`/clinics/${clinic.slug}`).set("Host", AC_HOST);
    assert.match(liveUnchanged.text, /Autonomy hours/);
    assert.doesNotMatch(liveUnchanged.text, re(draftHours));
    assert.doesNotMatch(liveUnchanged.text, /Visit notes/);
    const republish = await request(app)
      .post(`/clinics/${clinic.slug}/website/publish`)
      .set("Host", AC_HOST)
      .set("Cookie", mergeCookies(session, settingsAfter))
      .type("form")
      .send({ [CSRF_FIELD]: extractCsrf(settingsAfter), makePublic: "1" });
    assert.ok([200, 303].includes(republish.status), String(republish.status));
    const liveUpdated = await request(app).get(`/clinics/${clinic.slug}`).set("Host", AC_HOST);
    assert.match(liveUpdated.text, re(draftHours));
    assert.match(liveUpdated.text, /Visit notes/);

    const history = await request(app)
      .get(`/clinics/${clinic.slug}/website/history`)
      .set("Host", AC_HOST)
      .set("Cookie", session);
    assert.equal(history.status, 200);
    assert.match(history.text, /Restore as new draft/);
    const versions = await request(app)
      .get(`/clinics/${clinic.slug}/website/versions`)
      .set("Host", AC_HOST)
      .set("Cookie", session)
      .set("Accept", "application/json");
    const listed = JSON.parse(versions.text);
    const firstPublished = (listed.versions || [])
      .slice()
      .sort((a, b) => Number(a.versionNumber) - Number(b.versionNumber))[0];
    assert.ok(firstPublished && firstPublished.id, JSON.stringify(listed));
    const restore = await request(app)
      .post(`/clinics/${clinic.slug}/website/versions/${firstPublished.id}/restore`)
      .set("Host", AC_HOST)
      .set("Cookie", mergeCookies(session, history))
      .type("form")
      .send({ [CSRF_FIELD]: extractCsrf(history) });
    assert.ok([200, 303].includes(restore.status), `restore ${restore.status} ${restore.text}`);
    const liveAfterRestore = await request(app).get(`/clinics/${clinic.slug}`).set("Host", AC_HOST);
    assert.match(liveAfterRestore.text, re(draftHours));
    const publishRestored = await request(app)
      .post(`/clinics/${clinic.slug}/website/publish`)
      .set("Host", AC_HOST)
      .set("Cookie", mergeCookies(session, history))
      .type("form")
      .send({ [CSRF_FIELD]: extractCsrf(history), makePublic: "1" });
    assert.ok(
      [200, 303].includes(publishRestored.status),
      `restore publish ${publishRestored.status}`
    );
    const liveRestored = await request(app).get(`/clinics/${clinic.slug}`).set("Host", AC_HOST);
    assert.doesNotMatch(liveRestored.text, re(draftHours));
    assert.match(liveRestored.text, /Autonomy hours/);

    const hco = await pool.query(
      `SELECT id FROM activeclinic.healthcare_organizations WHERE organization_id = $1 LIMIT 1`,
      [clinic.organizationId]
    );
    const facility = await pool.query(
      `SELECT id FROM activeclinic.facilities WHERE organization_id = $1 AND facility_key = 'hq' LIMIT 1`,
      [clinic.organizationId]
    );
    const editor = await seedStaff(
      clinic.organizationId,
      hco.rows[0].id,
      facility.rows[0].id,
      WEBSITE_EDITOR,
      `editor-${stamp}@clinic.example`
    );
    const receptionist = await seedStaff(
      clinic.organizationId,
      hco.rows[0].id,
      facility.rows[0].id,
      RECEPTIONIST,
      `desk-${stamp}@clinic.example`
    );
    const editorCookie = await sessionCookie(
      editor.identityId,
      clinic.organizationId,
      facility.rows[0].id
    );
    const recCookie = await sessionCookie(
      receptionist.identityId,
      clinic.organizationId,
      facility.rows[0].id
    );
    const otherCookie = await loginClinicAdmin(app, otherPayload.contactEmail, PASSWORD);

    const editorHub = await request(app)
      .get("/app/settings/website")
      .set("Host", AC_HOST)
      .set("Cookie", editorCookie);
    assert.equal(editorHub.status, 200);
    assert.match(editorHub.text, /data-ac-website-action="edit"/);
    assert.doesNotMatch(editorHub.text, /data-ac-website-action="publish"/);
    const recHub = await request(app)
      .get("/app/settings/website")
      .set("Host", AC_HOST)
      .set("Cookie", recCookie);
    assert.equal(recHub.status, 403);
    const otherLibrary = await request(app)
      .get("/app/settings/website/library")
      .set("Host", AC_HOST)
      .set("Cookie", otherCookie);
    assert.equal(otherLibrary.status, 200);
    assert.doesNotMatch(otherLibrary.text, re(`Parking for ${stamp}`));
    const otherMediaLib = await request(app)
      .get("/app/settings/website/media")
      .set("Host", AC_HOST)
      .set("Cookie", otherCookie);
    assert.equal(otherMediaLib.status, 200);
    assert.doesNotMatch(otherMediaLib.text, re(mediaId));
    const stealMedia = await request(app)
      .post(`/clinics/${clinic.slug}/website/media`)
      .set("Host", AC_HOST)
      .set("Cookie", otherCookie)
      .field(CSRF_FIELD, extractCsrf(otherMediaLib) || "x")
      .attach("file", PNG_1X1, { filename: "steal.png", contentType: "image/png" });
    assert.ok([403, 404].includes(stealMedia.status), `cross-tenant media upload ${stealMedia.status}`);
    const otherHistory = await request(app)
      .get(`/clinics/${clinic.slug}/website/history`)
      .set("Host", AC_HOST)
      .set("Cookie", otherCookie);
    assert.ok([403, 404].includes(otherHistory.status), `cross-tenant history ${otherHistory.status}`);

    const mobileHub = await request(app)
      .get("/app/settings/website")
      .set("Host", AC_HOST)
      .set("Cookie", session)
      .set("User-Agent", "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)");
    assert.equal(mobileHub.status, 200);
    assert.match(mobileHub.text, /data-ac-mw-screen-mobile="MW10-02"/);
    for (const path of [
      "/app/settings/website/pages",
      "/app/settings/website/sections",
      "/app/settings/website/media",
      "/app/settings/website/branding",
      "/app/settings/website/settings",
      "/app/settings/website/seo",
      "/app/settings/website/library",
    ]) {
      const page = await request(app).get(path).set("Host", AC_HOST).set("Cookie", session);
      assert.equal(page.status, 200, path);
      assert.match(page.text, /ac-mw-nav/, path);
    }
  });
});
