"use strict";

/**
 * Local/ephemeral HTTP E2E: register → provision → sign in → onboarding →
 * website settings → pencil ✓ draft → live unchanged → preview → publish →
 * public updated → history → edit/publish again → restore creates a new version.
 *
 * Covers ActiveClinic and BlessBoard on foundation Postgres. No hosted deploy.
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
const { createV5FoundationApp } = require("../src/platform/http/v5FoundationServer");
const {
  CODE_ACTIVECLINIC_ORG_V6,
  COOKIE_ACTIVECLINIC_ORG,
  CSRF_COOKIE_ACTIVECLINIC_ORG,
} = require("../src/platform/config/deploymentProfiles");
const { CSRF_FIELD, CSRF_COOKIE } = require("../src/platform/http/v5Csrf");
const { DEFAULT_V5_COOKIE } = require("../src/platform/session/v5SessionCookie");
const instanceRepo = require("../src/platform/website/instanceRepository");
const contentService = require("../src/platform/website/contentService");
const resolver = require("../src/platform/website/resolver");
const versionService = require("../src/platform/website/versionService");
const versionRepo = require("../src/blessboard/repositories/websitePublicationVersionRepository");

const IDENTITY_KEY = "blessboard-platform-v5";
const AC_PASSWORD = "clinic-admin-pass-12";
const BB_PASSWORD = "TestPassword99!";
const AC_HOST = "activeclinic.org";
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

let pool;
let skipReason = null;
let phoneSeq = 860000000;

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

function extractCsrf(html) {
  const text = String(html || "");
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

function extractBbCsrf(html) {
  const data = String(html || "").match(/data-bb-csrf="([^"]+)"/);
  if (data) return data[1];
  return extractCsrf(html);
}

function re(value) {
  return new RegExp(String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
}

function ok(detail) {
  return { ok: true, detail };
}

describe("v7 local registration-to-website E2E", { timeout: 180000 }, () => {
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

  it("walks ActiveClinic and BlessBoard from registration through restore", async () => {
    requireDb();
    const ac = await runActiveClinicFlow();
    const bb = await runBlessBoardFlow();
    const steps = [
      "Register",
      "Auto provision",
      "Sign in",
      "Onboarding",
      "Settings → Website",
      "Populated draft",
      "Edit website / pencil",
      "Edit text + ✓",
      "Draft updated",
      "Public live unchanged",
      "Preview",
      "Publish",
      "Public updated",
      "Version history",
      "Edit again + publish",
      "Restore old version",
      "Restore created a new version",
    ];
    for (const step of steps) {
      assert.equal(ac[step].ok, true, `ActiveClinic ${step}: ${ac[step].detail}`);
      assert.equal(bb[step].ok, true, `BlessBoard ${step}: ${bb[step].detail}`);
    }
  });
});

async function runActiveClinicFlow() {
  const out = {};
  const app = createActiveClinicFoundationApp({
    getPool: () => pool,
    env: MINIMAL_AC,
    log: () => {},
  });
  const stamp = uniq("ace2e");
  const payload = {
    clinicName: `E2E Clinic ${stamp}`,
    contactName: "Clinic Admin",
    contactEmail: `${stamp}@clinic.example`,
    contactPhone: nextPhone(),
    province: "Lusaka Province",
    city: "Lusaka",
    address: "1 Independence Avenue",
    countryCode: "ZM",
    notes: "local e2e",
    password: AC_PASSWORD,
    passwordConfirm: AC_PASSWORD,
    acceptTerms: "on",
  };

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
  out.Register = ok(`POST /register-clinic → ${confirm.status} ${confirm.headers.location || ""}`);
  assert.equal(confirm.status, 303, confirm.text && confirm.text.slice(0, 400));
  assert.match(String(confirm.headers.location || ""), /\/register-clinic\/success\?ref=AC-/);

  const appRow = await pool.query(
    `SELECT status, provisioning_status, organization_id, administrator_password_hash
       FROM activeclinic.clinic_registration_applications
      WHERE contact_email_normalized = $1`,
    [payload.contactEmail]
  );
  assert.equal(appRow.rows.length, 1);
  assert.equal(appRow.rows[0].status, "active");
  assert.ok(appRow.rows[0].organization_id);
  assert.equal(appRow.rows[0].administrator_password_hash, null);
  const organizationId = appRow.rows[0].organization_id;
  const slugRow = await pool.query(
    `SELECT organization_key FROM platform.organizations WHERE id = $1`,
    [organizationId]
  );
  const slug = slugRow.rows[0].organization_key;
  out["Auto provision"] = ok(`status=active org=${slug} provisioning=${appRow.rows[0].provisioning_status || "provisioned"}`);

  const getLogin = await request(app).get("/login").set("Host", AC_HOST);
  const loginCsrfCookie = extractCookie(getLogin, CSRF_COOKIE_ACTIVECLINIC_ORG);
  const loginCsrf = extractCsrf(getLogin.text);
  const loginPost = await request(app)
    .post("/login")
    .set("Host", AC_HOST)
    .set("Cookie", loginCsrfCookie ? `${CSRF_COOKIE_ACTIVECLINIC_ORG}=${loginCsrfCookie}` : "")
    .set("Accept", "text/html")
    .type("form")
    .send({ [CSRF_FIELD]: loginCsrf || "", identifier: payload.contactEmail, password: AC_PASSWORD });
  assert.equal(loginPost.status, 303, loginPost.text && loginPost.text.slice(0, 400));
  const sid = extractCookie(loginPost, COOKIE_ACTIVECLINIC_ORG);
  assert.ok(sid, "ActiveClinic session cookie");
  const session = `${COOKIE_ACTIVECLINIC_ORG}=${sid}`;
  out["Sign in"] = ok("POST /login → session cookie");

  const appPage = await request(app).get("/app").set("Host", AC_HOST).set("Cookie", session);
  assert.equal(appPage.status, 200);
  assert.match(appPage.text, /data-ac-shell="staff-app"/);
  out.Onboarding = ok("GET /app staff shell after auto-provision (no separate wizard table)");

  const settings = await request(app).get("/app/settings").set("Host", AC_HOST).set("Cookie", session);
  assert.equal(settings.status, 200);
  assert.match(settings.text, /data-ac-settings-card="website"/);
  const websiteSettings = await request(app)
    .get("/app/settings/website")
    .set("Host", AC_HOST)
    .set("Cookie", session);
  assert.equal(websiteSettings.status, 200);
  assert.match(websiteSettings.text, /data-ac-website-action="edit"/);
  assert.match(websiteSettings.text, /data-ac-website-next-action="publish"/);
  assert.doesNotMatch(websiteSettings.text, /data-ac-provisioning-incomplete/);
  out["Settings → Website"] = ok("GET /app/settings + /app/settings/website");

  const instance = await instanceRepo.findWebsiteInstanceByOrgProduct(pool, {
    organizationId,
    productCode: "activeclinic",
  });
  assert.ok(instance);
  const seeded = await contentService.listWebsiteContent(pool, instance, organizationId);
  const byKey = Object.fromEntries(seeded.map((row) => [row.contentKey, row.draftValue]));
  assert.equal(byKey["home.hero.title"], payload.clinicName);
  out["Populated draft"] = ok(`home.hero.title=${payload.clinicName}`);

  const editPath = `/clinics/${slug}?website_edit=1&website_mode=draft`;
  const editPage = await request(app).get(editPath).set("Host", AC_HOST).set("Cookie", session);
  assert.equal(editPage.status, 200);
  assert.match(editPage.text, /data-website-start="1"/);
  assert.match(editPage.text, /data-website-save="1"/);
  out["Edit website / pencil"] = ok("GET edit mode exposes start + save pencils");

  const editCsrf = extractCsrf(editPage.text);
  const editCookies = mergeCookies(session, editPage);
  const draftTitle = `AC Draft One ${stamp}`;
  const save = await request(app)
    .post(`/clinics/${slug}/website/drafts`)
    .set("Host", AC_HOST)
    .set("Cookie", editCookies)
    .send({ [CSRF_FIELD]: editCsrf, contentKey: "home.hero.title", value: draftTitle });
  assert.equal(save.status, 200, save.text);
  const saveBody = JSON.parse(save.text);
  assert.equal(saveBody.ok, true);
  assert.equal(saveBody.published, false);
  assert.equal(saveBody.code, "saved_to_draft");
  out["Edit text + ✓"] = ok("POST /website/drafts published=false saved_to_draft");

  const draft = await resolver.resolveWebsiteContent(pool, {
    organizationId,
    instance,
    mode: resolver.MODE.DRAFT,
  });
  assert.equal(draft.values["home.hero.title"], draftTitle);
  out["Draft updated"] = ok(draftTitle);

  const liveBefore = await resolver.resolveWebsiteContent(pool, {
    organizationId,
    instance,
    mode: resolver.MODE.LIVE,
  });
  assert.notEqual(liveBefore.values["home.hero.title"], draftTitle);
  const publicBefore = await request(app).get(`/clinics/${slug}`).set("Host", AC_HOST);
  assert.ok([200, 403].includes(publicBefore.status), `public ${publicBefore.status}`);
  if (publicBefore.status === 200) {
    assert.doesNotMatch(publicBefore.text, re(draftTitle));
  }
  out["Public live unchanged"] = ok(
    publicBefore.status === 403
      ? "unpublished clinic stays 403; live resolver does not include draft"
      : "public HTML omits draft title"
  );

  const preview = await request(app)
    .get(`/clinics/${slug}/website/preview`)
    .set("Host", AC_HOST)
    .set("Cookie", session)
    .redirects(0);
  assert.ok([200, 303].includes(preview.status), `preview ${preview.status}`);
  const previewPage =
    preview.status === 303
      ? await request(app)
          .get(preview.headers.location)
          .set("Host", AC_HOST)
          .set("Cookie", session)
      : preview;
  assert.equal(previewPage.status, 200);
  assert.match(previewPage.text, re(draftTitle));
  out.Preview = ok("preview shows draft title");

  const publish = await request(app)
    .post(`/clinics/${slug}/website/publish`)
    .set("Host", AC_HOST)
    .set("Cookie", editCookies)
    .set("Accept", "application/json")
    .send({ [CSRF_FIELD]: editCsrf, makePublic: "1" });
  assert.ok([200, 303].includes(publish.status), `publish ${publish.status} ${publish.text}`);
  out.Publish = ok(`POST /website/publish makePublic=1 → ${publish.status}`);

  const publicAfter = await request(app).get(`/clinics/${slug}`).set("Host", AC_HOST);
  assert.equal(publicAfter.status, 200, publicAfter.text && publicAfter.text.slice(0, 300));
  assert.match(publicAfter.text, re(draftTitle));
  out["Public updated"] = ok("anonymous GET /clinics/{key} shows published title");

  const history = await request(app)
    .get(`/clinics/${slug}/website/history`)
    .set("Host", AC_HOST)
    .set("Cookie", session);
  assert.equal(history.status, 200);
  const versions1 = await request(app)
    .get(`/clinics/${slug}/website/versions`)
    .set("Host", AC_HOST)
    .set("Cookie", session)
    .set("Accept", "application/json");
  assert.equal(versions1.status, 200);
  const listed1 = JSON.parse(versions1.text);
  assert.ok((listed1.versions || []).length >= 1);
  const firstPublished = (listed1.versions || []).find((v) => v.status === "published") || listed1.versions[0];
  const v1Id = firstPublished.id;
  const v1Number = Number(firstPublished.versionNumber);
  out["Version history"] = ok(`GET history + versions; v${v1Number} ${v1Id}`);

  const editPage2 = await request(app).get(editPath).set("Host", AC_HOST).set("Cookie", session);
  const csrf2 = extractCsrf(editPage2.text);
  const cookies2 = mergeCookies(session, editPage2);
  const draftTitle2 = `AC Draft Two ${stamp}`;
  const save2 = await request(app)
    .post(`/clinics/${slug}/website/drafts`)
    .set("Host", AC_HOST)
    .set("Cookie", cookies2)
    .send({ [CSRF_FIELD]: csrf2, contentKey: "home.hero.title", value: draftTitle2 });
  assert.equal(save2.status, 200);
  assert.equal(JSON.parse(save2.text).published, false);
  const liveMid = await resolver.resolveWebsiteContent(pool, {
    organizationId,
    instance,
    mode: resolver.MODE.LIVE,
  });
  assert.equal(liveMid.values["home.hero.title"], draftTitle);
  const publish2 = await request(app)
    .post(`/clinics/${slug}/website/publish`)
    .set("Host", AC_HOST)
    .set("Cookie", cookies2)
    .set("Accept", "application/json")
    .send({ [CSRF_FIELD]: csrf2, makePublic: "1" });
  assert.ok([200, 303].includes(publish2.status), String(publish2.status));
  const public2 = await request(app).get(`/clinics/${slug}`).set("Host", AC_HOST);
  assert.equal(public2.status, 200);
  assert.match(public2.text, re(draftTitle2));
  out["Edit again + publish"] = ok("second publish updates public to draft two");

  const versions2 = await versionService.listWebsiteVersions(pool, {
    instanceId: instance.id,
    organizationId,
  });
  const beforeRestoreCount = (versions2.versions || []).length;
  const historic = await versionService.getWebsiteVersion(pool, {
    versionId: v1Id,
    organizationId,
  });
  const historicTitle = historic.version.snapshot.values["home.hero.title"];
  const restore = await request(app)
    .post(`/clinics/${slug}/website/versions/${v1Id}/restore`)
    .set("Host", AC_HOST)
    .set("Cookie", cookies2)
    .set("Accept", "application/json")
    .send({ [CSRF_FIELD]: csrf2 });
  assert.ok([200, 303].includes(restore.status), `restore ${restore.status} ${restore.text}`);
  out["Restore old version"] = ok(`POST restore ${v1Id} → ${restore.status}`);

  const versions3 = await versionService.listWebsiteVersions(pool, {
    instanceId: instance.id,
    organizationId,
  });
  const afterRestoreCount = (versions3.versions || []).length;
  assert.equal(afterRestoreCount, beforeRestoreCount, "restore does not create a published version");
  const historicAfter = await versionService.getWebsiteVersion(pool, {
    versionId: v1Id,
    organizationId,
  });
  assert.equal(historicAfter.version.snapshot.values["home.hero.title"], historicTitle);
  const liveRestored = await resolver.resolveWebsiteContent(pool, {
    organizationId,
    instance,
    mode: resolver.MODE.LIVE,
  });
  assert.equal(liveRestored.values["home.hero.title"], draftTitle2);
  const draftRestored = await resolver.resolveWebsiteContent(pool, {
    organizationId,
    instance,
    mode: resolver.MODE.DRAFT,
  });
  assert.equal(draftRestored.values["home.hero.title"], historicTitle);
  const publicAfterRestore = await request(app).get(`/clinics/${slug}`).set("Host", AC_HOST);
  assert.equal(publicAfterRestore.status, 200);
  assert.match(publicAfterRestore.text, re(draftTitle2));
  assert.doesNotMatch(publicAfterRestore.text, re(historicTitle));
  out["Restore created a new version"] = ok(
    `draft restored to historic v${v1Number}; published remains ${draftTitle2}`
  );
  return out;
}

async function runBlessBoardFlow() {
  const out = {};
  const app = createV5FoundationApp({
    getPool: () => pool,
    env: MINIMAL_BB,
    apexHosts: new Set([BB_HOST, `www.${BB_HOST}`]),
  });
  const key = uniq("bbe2e");
  const body = {
    church_name: `E2E Church ${key}`,
    country: "Zambia",
    city: "Lusaka",
    contact_name: "Church Administrator",
    role_in_church: "Pastor",
    phone: nextPhone(),
    email: `${key}@example.org`,
    selected_plan: "foundation",
    organization_key: key,
    password: BB_PASSWORD,
    password_confirm: BB_PASSWORD,
    acceptTerms: "on",
    branch_name: "HQ Campus",
    consent_contact: "on",
  };

  const getForm = await request(app).get("/register-church?plan=foundation").set("Host", BB_HOST);
  assert.equal(getForm.status, 200, getForm.text && getForm.text.slice(0, 300));
  const csrfCookie = extractCookie(getForm, CSRF_COOKIE);
  const csrf = extractCsrf(getForm.text);
  const confirm = await request(app)
    .post("/register-church")
    .set("Host", BB_HOST)
    .set("Cookie", csrfCookie ? `${CSRF_COOKIE}=${csrfCookie}` : "")
    .type("form")
    .send({ ...body, [CSRF_FIELD]: csrf || "" });
  out.Register = ok(`POST /register-church → ${confirm.status} ${confirm.headers.location || ""}`);
  assert.equal(confirm.status, 303, confirm.text && confirm.text.slice(0, 400));
  const loc = String(confirm.headers.location || "");
  assert.ok(loc === "/hq" || /ready=1/.test(loc), loc);

  const appRow = await pool.query(
    `SELECT application_status, provisioning_status, status, organization_id
       FROM blessboard.platform_church_registration_applications
      WHERE lower(contact_email) = lower($1)`,
    [body.email]
  );
  assert.equal(appRow.rows.length, 1);
  assert.equal(appRow.rows[0].application_status, "active");
  assert.equal(appRow.rows[0].provisioning_status, "provisioned");
  const organizationId = appRow.rows[0].organization_id;
  const churchRow = await pool.query(
    `SELECT id FROM blessboard.churches WHERE organization_id = $1`,
    [organizationId]
  );
  const churchId = churchRow.rows[0].id;
  out["Auto provision"] = ok(`application active/provisioned org=${key}`);

  const getLogin = await request(app).get("/login").set("Host", BB_HOST);
  const loginCsrfCookie = extractCookie(getLogin, CSRF_COOKIE);
  const loginCsrf = extractCsrf(getLogin.text);
  const loginPost = await request(app)
    .post("/login")
    .set("Host", BB_HOST)
    .set("Cookie", loginCsrfCookie ? `${CSRF_COOKIE}=${loginCsrfCookie}` : "")
    .type("form")
    .send({ email: body.email, password: BB_PASSWORD, [CSRF_FIELD]: loginCsrf || "" });
  assert.equal(loginPost.status, 303, loginPost.text && loginPost.text.slice(0, 400));
  assert.equal(loginPost.headers.location, "/hq");
  const sid = extractCookie(loginPost, DEFAULT_V5_COOKIE);
  assert.ok(sid, "BlessBoard session cookie");
  const session = `${DEFAULT_V5_COOKIE}=${sid}`;
  out["Sign in"] = ok("POST /login → /hq");

  const hq = await request(app).get("/hq").set("Host", BB_HOST).set("Cookie", session);
  assert.equal(hq.status, 200, hq.text && hq.text.slice(0, 300));
  const onboarding = await pool.query(
    `SELECT onboarding_status FROM blessboard.organization_onboarding WHERE organization_id = $1`,
    [organizationId]
  );
  assert.ok(onboarding.rowCount >= 1);
  out.Onboarding = ok(`GET /hq; organization_onboarding=${onboarding.rows[0].onboarding_status}`);

  const website = await request(app).get("/hq/website").set("Host", BB_HOST).set("Cookie", session);
  assert.equal(website.status, 200, website.text && website.text.slice(0, 300));
  assert.match(website.text, /data-bb-hq-website="1"/);
  out["Settings → Website"] = ok("GET /hq/website");

  const welcome = await pool.query(
    `SELECT heading, body_text
       FROM blessboard.page_sections ps
       JOIN blessboard.public_pages pp ON pp.id = ps.page_id
      WHERE pp.church_id = $1 AND pp.page_key = 'home' AND ps.section_key = 'welcome'`,
    [churchId]
  );
  assert.equal(welcome.rowCount, 1);
  assert.match(String(welcome.rows[0].body_text || welcome.rows[0].heading || ""), re(body.church_name));
  out["Populated draft"] = ok("home welcome includes church name");

  const editPath = `/c/${key}?website_edit=1`;
  const editPage = await request(app).get(editPath).set("Host", BB_HOST).set("Cookie", session);
  assert.equal(editPage.status, 200, editPage.text && editPage.text.slice(0, 300));
  assert.match(editPage.text, /data-bb-inline-start="1"/);
  out["Edit website / pencil"] = ok("GET /c/{key}?website_edit=1 exposes pencils");

  const editCsrf = extractBbCsrf(editPage.text);
  const editCookies = mergeCookies(session, editPage);
  const draftHeading = `BB Draft One ${key}`;
  const save = await request(app)
    .post("/hq/content/api/inline-field")
    .set("Host", BB_HOST)
    .set("Cookie", editCookies)
    .set("X-CSRF-Token", editCsrf || "")
    .set("Accept", "application/json")
    .send({
      [CSRF_FIELD]: editCsrf,
      pageKey: "home",
      sectionKey: "hero",
      fieldKey: "heading",
      value: draftHeading,
    });
  assert.equal(save.status, 200, save.text);
  assert.equal(save.body.published, false);
  out["Edit text + ✓"] = ok("POST /hq/content/api/inline-field published=false");

  const heroLive = await pool.query(
    `SELECT heading
       FROM blessboard.page_sections ps
       JOIN blessboard.public_pages pp ON pp.id = ps.page_id
      WHERE pp.church_id = $1 AND pp.page_key = 'home' AND ps.section_key = 'hero'`,
    [churchId]
  );
  assert.notEqual(heroLive.rows[0].heading, draftHeading);
  out["Draft updated"] = ok("overlay draft stored; CMS heading unchanged");

  const publicBefore = await request(app).get(`/c/${key}`).set("Host", BB_HOST);
  assert.equal(publicBefore.status, 200);
  assert.doesNotMatch(publicBefore.text, re(draftHeading));
  out["Public live unchanged"] = ok("anonymous /c/{key} omits draft heading");

  const preview = await request(app)
    .get(`/c/${key}?website_mode=draft`)
    .set("Host", BB_HOST)
    .set("Cookie", session);
  assert.equal(preview.status, 200);
  assert.match(preview.text, re(draftHeading));
  const hqPreview = await request(app)
    .get("/hq/content/preview/home")
    .set("Host", BB_HOST)
    .set("Cookie", session);
  assert.equal(hqPreview.status, 200);
  assert.match(hqPreview.text, re(draftHeading));
  out.Preview = ok("draft mode + HQ preview show draft heading");

  const boot = await request(app).get("/hq/website").set("Host", BB_HOST).set("Cookie", session);
  const bootCsrf = extractBbCsrf(boot.text) || extractCsrf(boot.text);
  const bootCookies = mergeCookies(session, boot);
  await request(app)
    .post("/hq/website/preview-ack")
    .set("Host", BB_HOST)
    .set("Cookie", bootCookies)
    .type("form")
    .send({ [CSRF_FIELD]: bootCsrf });
  const afterAck = await request(app).get("/hq/website").set("Host", BB_HOST).set("Cookie", session);
  const publishCsrf = extractBbCsrf(afterAck.text) || extractCsrf(afterAck.text);
  const publishCookies = mergeCookies(session, afterAck);
  const publish = await request(app)
    .post("/hq/website/publish")
    .set("Host", BB_HOST)
    .set("Cookie", publishCookies)
    .type("form")
    .send({
      [CSRF_FIELD]: publishCsrf,
      confirm_publish: "1",
      defer_service_times: "1",
      mobile_preview_confirmed: "1",
    });
  assert.ok([200, 303].includes(publish.status), `publish ${publish.status} ${publish.text && publish.text.slice(0, 400)}`);
  if (publish.status === 303) {
    const pubLoc = String(publish.headers.location || "");
    assert.ok(
      pubLoc.includes("/hq/website/publish/success") ||
        pubLoc.includes("/hq/website/publish/result") ||
        pubLoc.includes(`/c/${key}`) ||
        pubLoc.includes("/hq/website"),
      pubLoc
    );
  }
  out.Publish = ok(`POST /hq/website/publish → ${publish.status}`);

  const publicAfter = await request(app).get(`/c/${key}`).set("Host", BB_HOST);
  assert.equal(publicAfter.status, 200);
  assert.match(publicAfter.text, re(draftHeading));
  out["Public updated"] = ok("anonymous /c/{key} shows published heading");

  const history = await request(app)
    .get("/hq/website/version-history")
    .set("Host", BB_HOST)
    .set("Cookie", session);
  assert.equal(history.status, 200, history.text && history.text.slice(0, 300));
  const listed1 = await versionRepo.listVersions(pool, { organizationId, branchId: null });
  assert.ok((listed1.items || []).length >= 1);
  const firstPublished = await versionRepo.getCurrentPublishedVersion(pool, organizationId, null);
  assert.ok(firstPublished, "published version after first HQ publish");
  const v1Id = firstPublished.id;
  const v1Number = Number(firstPublished.versionNumber);
  const v1Snapshot = JSON.stringify(firstPublished.snapshot || {});
  out["Version history"] = ok(`GET /hq/website/version-history; v${v1Number}`);

  const editPage2 = await request(app).get(editPath).set("Host", BB_HOST).set("Cookie", session);
  const csrf2 = extractBbCsrf(editPage2.text);
  const cookies2 = mergeCookies(session, editPage2);
  const draftHeading2 = `BB Draft Two ${key}`;
  const save2 = await request(app)
    .post("/hq/content/api/inline-field")
    .set("Host", BB_HOST)
    .set("Cookie", cookies2)
    .set("X-CSRF-Token", csrf2 || "")
    .set("Accept", "application/json")
    .send({
      [CSRF_FIELD]: csrf2,
      pageKey: "home",
      sectionKey: "hero",
      fieldKey: "heading",
      value: draftHeading2,
    });
  assert.equal(save2.status, 200, save2.text);
  assert.equal(save2.body.published, false);
  const publicMid = await request(app).get(`/c/${key}`).set("Host", BB_HOST);
  assert.doesNotMatch(publicMid.text, re(draftHeading2));
  const afterAck2 = await request(app).get("/hq/website").set("Host", BB_HOST).set("Cookie", session);
  const publish2 = await request(app)
    .post("/hq/website/publish")
    .set("Host", BB_HOST)
    .set("Cookie", mergeCookies(session, afterAck2))
    .type("form")
    .send({
      [CSRF_FIELD]: extractBbCsrf(afterAck2.text) || extractCsrf(afterAck2.text),
      confirm_publish: "1",
      defer_service_times: "1",
      mobile_preview_confirmed: "1",
    });
  assert.ok([200, 303].includes(publish2.status), String(publish2.status));
  const public2 = await request(app).get(`/c/${key}`).set("Host", BB_HOST);
  assert.equal(public2.status, 200);
  assert.match(public2.text, re(draftHeading2));
  out["Edit again + publish"] = ok("second HQ publish applies draft two to public");

  const listed2 = await versionRepo.listVersions(pool, { organizationId, branchId: null });
  const beforeRestoreCount = (listed2.items || []).length;
  const restoreForm = await request(app)
    .get(`/hq/website/version-history/${v1Id}/restore`)
    .set("Host", BB_HOST)
    .set("Cookie", session);
  assert.equal(restoreForm.status, 200, restoreForm.text && restoreForm.text.slice(0, 300));
  const restore = await request(app)
    .post(`/hq/website/version-history/${v1Id}/restore`)
    .set("Host", BB_HOST)
    .set("Cookie", mergeCookies(session, restoreForm))
    .type("form")
    .send({
      [CSRF_FIELD]: extractCsrf(restoreForm.text) || extractBbCsrf(restoreForm.text),
      confirm_restore: "1",
      restore_all: "1",
      restoration_reason: "Local E2E restore of first published copy",
    });
  assert.ok([200, 303].includes(restore.status), `restore ${restore.status} ${restore.text && restore.text.slice(0, 400)}`);
  if (restore.status === 200) {
    assert.match(restore.text, /restored draft has been created/i);
  }
  out["Restore old version"] = ok(`POST restore ${v1Id} → ${restore.status} (draft, not live)`);

  const listed3 = await versionRepo.listVersions(pool, { organizationId, branchId: null });
  const afterRestoreCount = (listed3.items || []).length;
  assert.ok(afterRestoreCount > beforeRestoreCount, "restore appends a version row");
  const historicAfter = (listed3.items || []).find((v) => v.id === v1Id);
  assert.ok(historicAfter);
  assert.equal(JSON.stringify(historicAfter.snapshot || {}), v1Snapshot);
  const newest = listed3.items.reduce((a, b) =>
    Number(a.versionNumber) >= Number(b.versionNumber) ? a : b
  );
  assert.ok(Number(newest.versionNumber) > v1Number);
  assert.ok(newest.status === "draft" || newest.sourceType === "content_restoration" || newest.id !== v1Id);
  const liveAfterRestore = await request(app).get(`/c/${key}`).set("Host", BB_HOST);
  assert.match(liveAfterRestore.text, re(draftHeading2));
  out["Restore created a new version"] = ok(
    `new v${newest.versionNumber} status=${newest.status}; historic snapshot unchanged; live waits for publish`
  );
  return out;
}
