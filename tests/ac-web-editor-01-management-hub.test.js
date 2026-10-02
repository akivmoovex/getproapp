"use strict";

/**
 * AC-WEB-EDITOR-01 — Website Management Hub UX (management-only; no fake editor canvas).
 * Canonical visual editor remains /clinics/:clinicKey?website_edit=1&website_mode=draft.
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
  COOKIE_ACTIVECLINIC_ORG,
  resetDeploymentProfileWarningsForTests,
} = require("../src/platform/config/deploymentProfiles");
const {
  submitAndProvisionClinicRegistration,
} = require("../src/activeclinic/services/submitClinicRegistrationService");
const {
  createPlatformIdentitySession,
} = require("../src/platform/session/createDeploymentSession");
const {
  buildPublicWebsiteEditPath,
  buildPublicWebsitePreviewPath,
  PRODUCT_CODE,
} = require("../src/platform/website/publicWebsiteUrl");
const {
  presentWebsiteSettingsUx,
} = require("../src/platform/website/websiteManagementPresentation");
const { CSRF_FIELD } = require("../src/platform/http/v5Csrf");

const MINIMAL_AC = Object.freeze({
  NODE_ENV: "test",
  PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_V6,
  DATABASE_URL: "postgres://unused/local",
  SESSION_SECRET: "a".repeat(40),
});

let pool;
let skipReason = null;
let app;
let phoneSeq = 773300000;

function requireDb() {
  if (skipReason) assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
}

function nextPhone() {
  phoneSeq += 1;
  return `+2609${String(phoneSeq).slice(-8)}`;
}

function extractHref(html, action) {
  const re = new RegExp(
    `href="([^"]+)"[^>]*data-ac-website-action="${action}"|data-ac-website-action="${action}"[^>]*href="([^"]+)"`
  );
  const m = String(html || "").match(re);
  if (!m) return null;
  return String(m[1] || m[2] || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"');
}

function extractFormCsrf(html) {
  const m = String(html || "").match(
    new RegExp(
      `name="${CSRF_FIELD}"[^>]*value="([^"]+)"|value="([^"]+)"[^>]*name="${CSRF_FIELD}"`
    )
  );
  return (m && (m[1] || m[2])) || "";
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

function joinCookies(...responses) {
  const parts = [];
  for (const res of responses) {
    if (typeof res === "string") {
      parts.push(res);
      continue;
    }
    const raw = res && res.headers && res.headers["set-cookie"];
    const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
    for (const line of list) parts.push(String(line).split(";")[0]);
  }
  return parts.join("; ");
}

async function provisionClinic(label) {
  const stamp = `${Date.now().toString(36)}_${label}`;
  const password = "AcHub-Mgmt-Edit-12!";
  const payload = {
    clinicName: `Hub ${label} ${stamp}`,
    clinicType: "clinic",
    countryCode: "ZM",
    city: "Lusaka",
    address: "1 Independence Ave",
    contactName: `${label} Admin`,
    contactEmail: `hub-${stamp}@example.invalid`,
    contactPhone: nextPhone(),
    password,
    passwordConfirm: password,
    acceptTerms: "on",
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    dataEnvironment: "testing",
    env: MINIMAL_AC,
  };
  const result = await submitAndProvisionClinicRegistration(pool, payload);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.ok(result.slug, "clinicKey required");
  return { result, payload, clinicKey: result.slug };
}

async function sessionCookie(result) {
  const session = await createPlatformIdentitySession(pool, {
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    platformIdentityId: result.identityId,
    organizationId: result.organizationId,
  });
  assert.equal(session.ok, true, JSON.stringify(session));
  return `${COOKIE_ACTIVECLINIC_ORG}=${session.rawToken}`;
}

describe("AC-WEB-EDITOR-01 Website Management Hub UX", () => {
  before(async () => {
    resetDeploymentProfileWarningsForTests();
    try {
      const databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });
      app = createActiveClinicFoundationApp({
        getPool: () => pool,
        env: MINIMAL_AC,
        log: () => {},
      });
    } catch (err) {
      skipReason = err && err.message ? String(err.message) : String(err);
    }
  });

  after(async () => {
    if (pool) await pool.end().catch(() => {});
  });

  it("A: hub renders without fake/blank editor canvas", async () => {
    requireDb();
    const { result } = await provisionClinic("a");
    const cookie = await sessionCookie(result);
    const hub = await request(app).get("/app/settings/website").set("Cookie", cookie);
    assert.equal(hub.status, 200, hub.text.slice(0, 300));
    assert.match(hub.text, /data-ac-website-hub-role="management"/);
    assert.match(hub.text, /data-ac-website-management="1"/);
    assert.match(hub.text, /Website Management Hub/);
    assert.match(hub.text, /data-ac-website-hub-identity="1"/);
    assert.doesNotMatch(hub.text, /data-ac-mw-editor="1"/);
    assert.doesNotMatch(hub.text, /data-ac-website-cms-nav="1"/);
    assert.doesNotMatch(hub.text, /ac-app-body--mw/);
    assert.doesNotMatch(hub.text, /data-gp-website-editor/);
    assert.doesNotMatch(hub.text, /class="[^"]*ac-mw-editor__top/);
    assert.doesNotMatch(hub.text, /class="[^"]*ac-mw-editor__rail/);
    assert.match(hub.text, /this page is not the editor canvas/i);
  });

  it("B+C: Edit Website opens canonical editor with correct clinicKey", async () => {
    requireDb();
    const { result, clinicKey } = await provisionClinic("bc");
    const expected = buildPublicWebsiteEditPath({
      product: PRODUCT_CODE.ACTIVECLINIC,
      organizationKey: clinicKey,
    });
    assert.equal(expected, `/clinics/${clinicKey}?website_edit=1&website_mode=draft`);

    const cookie = await sessionCookie(result);
    const hub = await request(app).get("/app/settings/website").set("Cookie", cookie);
    assert.equal(hub.status, 200);
    assert.match(hub.text, new RegExp(`data-ac-website-clinic-key="${clinicKey}"`));
    const editHref = extractHref(hub.text, "edit");
    assert.equal(editHref, expected);
    assert.match(editHref, /website_edit=1/);
    assert.match(editHref, /website_mode=draft/);
    assert.doesNotMatch(editHref, /\/app\/settings\/website$/);

    const editor = await request(app).get(editHref).set("Cookie", cookie);
    assert.equal(editor.status, 200);
    assert.match(editor.text, /data-website-chrome|data-gp-website-editor|data-website-start/);
  });

  it("D: Preview uses canonical preview behavior", async () => {
    requireDb();
    const { result, clinicKey } = await provisionClinic("d");
    const expectedPreview = buildPublicWebsitePreviewPath({
      product: PRODUCT_CODE.ACTIVECLINIC,
      organizationKey: clinicKey,
    });
    const cookie = await sessionCookie(result);
    const hub = await request(app).get("/app/settings/website").set("Cookie", cookie);
    assert.equal(hub.status, 200);
    const previewHref = extractHref(hub.text, "preview");
    assert.ok(previewHref, "preview href present");
    assert.equal(previewHref, expectedPreview);
    assert.match(previewHref, /website_mode=draft/);
    assert.doesNotMatch(previewHref, /website_edit=1/);

    const preview = await request(app).get(previewHref).set("Cookie", cookie);
    assert.equal(preview.status, 200);
    assert.doesNotMatch(preview.text, /data-ac-mw-editor="1"/);
  });

  it("E: unpublished changes count visible on hub", async () => {
    requireDb();
    const { result } = await provisionClinic("e");
    const cookie = await sessionCookie(result);
    const hub = await request(app).get("/app/settings/website").set("Cookie", cookie);
    assert.equal(hub.status, 200);
    assert.match(hub.text, /data-ac-website-unpublished=/);
    assert.match(hub.text, /Unpublished changes/i);
    assert.match(hub.text, /data-ac-website-draft-chip="1"/);
  });

  it("F: publish action respects authorization", async () => {
    requireDb();
    const { result, clinicKey } = await provisionClinic("f");
    const cookie = await sessionCookie(result);
    const hub = await request(app).get("/app/settings/website").set("Cookie", cookie);
    assert.equal(hub.status, 200);
    assert.match(hub.text, /data-ac-website-action="publish"/);

    const deniedUx = presentWebsiteSettingsUx({
      exists: true,
      unpublishedChanges: true,
      publishedVersionNumber: 0,
      availabilityPublished: false,
      canView: true,
      canEdit: true,
      canPublish: false,
      publishPath: `/clinics/${clinicKey}/website/publish`,
      editPath: `/clinics/${clinicKey}?website_edit=1&website_mode=draft`,
      previewPath: `/clinics/${clinicKey}?website_mode=draft`,
    });
    assert.equal(deniedUx.canPublish, false);
    assert.equal(deniedUx.actions.publishPath, null);

    const other = await provisionClinic("foth");
    const otherCookie = await sessionCookie(other.result);
    const csrfPage = await request(app)
      .get(`/clinics/${clinicKey}?website_mode=draft`)
      .set("Cookie", otherCookie);
    const csrf = extractFormCsrf(csrfPage.text) || "invalid";
    const csrfCookie = extractCookie(csrfPage, "gp_csrf") || extractCookie(csrfPage, "_csrf");
    const publish = await request(app)
      .post(`/clinics/${clinicKey}/website/publish`)
      .set("Cookie", joinCookies(otherCookie, csrfPage))
      .type("form")
      .send({ [CSRF_FIELD]: csrf, makePublic: "1" });
    assert.ok(
      [403, 404].includes(publish.status),
      `cross-tenant publish expected 403/404, got ${publish.status}`
    );
    void csrfCookie;
  });

  it("G: Sections link works", async () => {
    requireDb();
    const { result } = await provisionClinic("g");
    const cookie = await sessionCookie(result);
    const hub = await request(app).get("/app/settings/website").set("Cookie", cookie);
    assert.match(hub.text, /href="\/app\/settings\/website\/sections"/);
    assert.match(hub.text, /data-ac-website-action="sections"/);
    const sections = await request(app)
      .get("/app/settings/website/sections")
      .set("Cookie", cookie);
    assert.equal(sections.status, 200);
    assert.match(sections.text, /Sections|Homepage sections|data-ac-mw-nav="sections"/i);
  });

  it("H: Media link works", async () => {
    requireDb();
    const { result } = await provisionClinic("h");
    const cookie = await sessionCookie(result);
    const hub = await request(app).get("/app/settings/website").set("Cookie", cookie);
    assert.match(hub.text, /href="\/app\/settings\/website\/media"/);
    assert.match(hub.text, /data-ac-website-action="media"/);
    const media = await request(app).get("/app/settings/website/media").set("Cookie", cookie);
    assert.equal(media.status, 200);
    assert.match(media.text, /Media|Assets|data-ac-mw-nav="media"/i);
  });

  it("I: History link works", async () => {
    requireDb();
    const { result, clinicKey } = await provisionClinic("i");
    const cookie = await sessionCookie(result);
    const hub = await request(app).get("/app/settings/website").set("Cookie", cookie);
    assert.equal(hub.status, 200);
    const historyHref = extractHref(hub.text, "history") || extractHref(hub.text, "history-nav");
    assert.ok(historyHref, "history href present");
    assert.match(historyHref, new RegExp(`/clinics/${clinicKey}`));
    assert.match(historyHref, /history|website_history|versions/i);
    const history = await request(app).get(historyHref).set("Cookie", cookie);
    assert.ok([200, 302, 303].includes(history.status), `history status ${history.status}`);
    if (history.status === 200) {
      assert.match(history.text, /history|version|restore/i);
    }
  });

  it("J: cross-tenant access denied", async () => {
    requireDb();
    const owner = await provisionClinic("jown");
    const other = await provisionClinic("joth");
    const ownerEdit = buildPublicWebsiteEditPath({
      product: PRODUCT_CODE.ACTIVECLINIC,
      organizationKey: owner.clinicKey,
    });
    const otherCookie = await sessionCookie(other.result);
    const denied = await request(app).get(ownerEdit).set("Cookie", otherCookie);
    assert.ok([403, 404].includes(denied.status), `got ${denied.status}`);
    assert.doesNotMatch(
      denied.text,
      new RegExp(owner.payload.clinicName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    );

    const ownerSections = await request(app)
      .get("/app/settings/website/sections")
      .set("Cookie", otherCookie);
    assert.equal(ownerSections.status, 200);
    assert.doesNotMatch(
      ownerSections.text,
      new RegExp(owner.payload.clinicName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    );
  });
});
