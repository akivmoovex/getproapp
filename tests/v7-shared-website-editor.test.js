"use strict";

/**
 * Shared website editor mechanism: ActiveClinic is the canonical interaction.
 * BlessBoard uses the same shell data contract, drafts/media/publish APIs,
 * text+image JS, authorized draft preview, and publication versions.
 *
 * Old BlessBoard APIs remain until this matrix stays green:
 *   POST /hq/content/api/inline-field
 *   POST /hq/content/api/inline-field/publish
 *   POST /hq/content/api/structured-draft
 *   public/blessboard/v5/website-inline-edit.js (file kept, not loaded)
 *   HQ CMS /hq/content as a secondary surface
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
const appRepo = require("../src/blessboard/repositories/platformChurchRegistrationRepository");
const {
  provisionRegisteredBlessBoardChurch,
} = require("../src/blessboard/services/provisionRegisteredBlessBoardChurch");
const {
  acknowledgeWebsitePreview,
} = require("../src/blessboard/services/churchWebsitePublishService");
const instanceRepo = require("../src/platform/website/instanceRepository");
const contentService = require("../src/platform/website/contentService");
const versionService = require("../src/platform/website/versionService");
const publicationService = require("../src/platform/website/publicationService");

const ROOT = path.join(__dirname, "..");
const IDENTITY_KEY = "blessboard-platform-v5";
const AC_PASSWORD = "clinic-admin-pass-12";
const BB_PASSWORD = "TestPassword99!";
const APEX = "blessboard.org";

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
  BLESSBOARD_TENANT_ROUTING_MODE: "authoritative",
  BLESSBOARD_AUTHORITATIVE_HOST_ALLOWLIST: "*",
});

let pool;
let skipReason = null;

function requireDb() {
  if (skipReason) {
    // eslint-disable-next-line no-console
    console.log("skip:", skipReason);
    return false;
  }
  return true;
}

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function uniq(prefix) {
  return `${prefix}-${crypto.randomBytes(3).toString("hex")}`;
}

function extractCsrf(html) {
  const text = String(html || "");
  const meta = text.match(/name="csrf-token"\s+content="([^"]+)"/);
  if (meta) return meta[1];
  const field = text.match(new RegExp(`name="${CSRF_FIELD}"[^>]*value="([^"]+)"`));
  return field ? field[1] : "";
}

function cookieHeader(session, pageRes) {
  const parts = [session];
  const set = pageRes && pageRes.headers && pageRes.headers["set-cookie"];
  if (Array.isArray(set)) parts.push(...set);
  else if (set) parts.push(set);
  return parts.join("; ");
}

describe("v7 shared website editor — static mechanism", () => {
  it("both products load the same inline editor JS/CSS and chrome contract", () => {
    const js = read("public/platform/website-inline-edit.js");
    const acChrome = read("views/activeclinic/partials/website-editor-chrome.ejs");
    const bbChrome = read("views/platform/website-engine/editor-chrome.ejs");
    const acShell = read("views/activeclinic/layouts/public-shell.ejs");
    const bbEnd = read("views/blessboard/v5/partials/tenant-public-shell-end.ejs");
    const acImage = read("views/activeclinic/partials/website-editable-image.ejs");
    const bbImage = read("views/blessboard/v5/partials/editable-image.ejs");
    const acText = read("views/activeclinic/partials/website-editable-field.ejs");
    const bbText = read("views/blessboard/v5/partials/editable-text.ejs");
    const fieldHost = read("views/platform/website-engine/field-editor-host.ejs");
    const structured = read("views/blessboard/v5/partials/structured-editor-host.ejs");
    const collection = read("views/activeclinic/partials/website-collection-editor.ejs");

    assert.match(acShell, /\/platform\/website-inline-edit\.js/);
    assert.match(bbEnd, /\/platform\/website-inline-edit\.js/);
    assert.doesNotMatch(bbEnd, /blessboard\/v5\/website-inline-edit\.js/);
    assert.match(js, /data-website-field-editor/);
    assert.match(js, /published === true/);
    assert.match(js, /data-website-library/);
    assert.match(js, /data-website-engine-page-select/);
    assert.match(js, /data-website-viewport/);
    assert.match(js, /data-website-more-toggle/);
    assert.match(js, /function validateImageFile/);

    assert.match(acChrome, /platform\/website-engine\/editor-chrome/);
    assert.match(bbChrome, /data-website-chrome="1"/);
    assert.match(bbChrome, /data-website-save-url/);
    assert.match(bbChrome, /data-website-media-url/);
    assert.match(bbChrome, /data-website-preview="1"/);
    assert.match(bbChrome, /data-website-publish-confirm="1"/);
    assert.match(bbChrome, /data-website-engine-shell="1"/);
    assert.match(bbChrome, /Exit editing/);
    assert.match(bbChrome, /data-website-page-rail="1"/);
    assert.match(bbChrome, /data-website-more="1"/);

    for (const field of [acText, bbText]) {
      assert.match(field, /data-website-key=/);
      assert.match(field, /data-website-start="1"/);
      assert.match(field, /gp-website-editable__pencil/);
      assert.doesNotMatch(field, /data-website-editor="1"/);
    }
    assert.match(fieldHost, /data-website-save="1"/);
    assert.match(fieldHost, /data-website-cancel="1"/);
    for (const image of [acImage, bbImage]) {
      assert.match(image, /data-website-type="image"/);
      assert.match(image, /data-website-start="1"/);
      assert.doesNotMatch(image, /data-website-file="1"/);
    }
    assert.match(structured, /data-website-structured="1"/);
    assert.match(structured, /Save draft/);
    assert.match(structured, /data-website-structured-cancel="1"/);
    assert.match(collection, /data-website-collection="1"/);
    assert.match(collection, /data-website-collection-save-item="1"/);
  });

  it("legacy BlessBoard editor surfaces remain available but are not the public editor loader", () => {
    assert.equal(
      fs.existsSync(path.join(ROOT, "public/blessboard/v5/website-inline-edit.js")),
      true
    );
    const routes = read("src/blessboard/http/contentAdminRoutes.js");
    assert.match(routes, /\/api\/inline-field/);
    assert.match(routes, /\/api\/structured-draft/);
    const shared = read("src/blessboard/http/blessboardWebsiteEditorRoutes.js");
    assert.match(shared, /\/website\/drafts/);
    assert.match(shared, /\/website\/media/);
    assert.match(shared, /\/website\/publish/);
    assert.match(shared, /published:\s*false/);
  });
});

describe("v7 shared website editor — HTTP matrix", () => {
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

  it("ActiveClinic enter / text / image / save / preview / publish / version / public", async () => {
    if (!requireDb()) return;
    const stamp = uniq("ac");
    const result = await submitAndProvisionClinicRegistration(pool, {
      clinicName: `Shared Editor ${stamp}`,
      contactName: "Website Admin",
      contactEmail: `${stamp}@example.invalid`,
      contactPhone: `+2609${String(Date.now()).slice(-8)}`,
      province: "Lusaka",
      city: "Lusaka",
      address: "1 Independence Avenue",
      countryCode: "ZM",
      password: AC_PASSWORD,
      passwordConfirm: AC_PASSWORD,
      acceptTerms: "on",
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
      dataEnvironment: "testing",
      env: { NODE_ENV: "test", PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_V6 },
    });
    assert.equal(result.ok, true, JSON.stringify(result));
    const app = createActiveClinicFoundationApp({
      getPool: () => pool,
      env: MINIMAL_AC,
      log: () => {},
    });
    const session = await createPlatformIdentitySession(pool, {
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
      platformIdentityId: result.identityId,
      organizationId: result.organizationId,
    });
    const cookie = `${COOKIE_ACTIVECLINIC_ORG}=${session.rawToken}`;
    const slug = result.slug;
    const edit = await request(app)
      .get(`/clinics/${slug}?website_edit=1&website_mode=draft`)
      .set("Cookie", cookie);
    assert.equal(edit.status, 200);
    assert.match(edit.text, /data-website-chrome="1"/);
    assert.match(edit.text, /data-website-engine-shell="1"/);
    assert.match(edit.text, /data-website-key="home\.hero\.title"/);
    assert.match(edit.text, /data-website-key="home\.hero\.image"/);
    assert.match(edit.text, /data-website-field-editor="1"/);
    assert.match(edit.text, /data-website-start="1"/);
    assert.match(edit.text, /data-website-page-rail="1"/);
    assert.match(edit.text, /\/platform\/website-inline-edit\.js/);

    const csrf = extractCsrf(edit.text) || issueCsrfToken(MINIMAL_AC);
    const cookies = cookieHeader(cookie, edit);
    const draftTitle = `Shared AC ${stamp}`;
    const saved = await request(app)
      .post(`/clinics/${slug}/website/drafts`)
      .set("Cookie", cookies)
      .send({ [CSRF_FIELD]: csrf, contentKey: "home.hero.title", value: draftTitle });
    assert.equal(saved.status, 200, saved.text);
    assert.equal(saved.body.ok, true);
    assert.equal(saved.body.published, false);

    const liveBefore = await request(app).get(`/clinics/${slug}`);
    assert.doesNotMatch(liveBefore.text, new RegExp(draftTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

    const preview = await request(app)
      .get(`/clinics/${slug}?website_mode=draft`)
      .set("Cookie", cookie);
    assert.equal(preview.status, 200);
    assert.match(preview.text, new RegExp(draftTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.doesNotMatch(preview.text, /data-website-start="1"/);

    const published = await request(app)
      .post(`/clinics/${slug}/website/publish`)
      .set("Cookie", cookies)
      .set("Accept", "application/json")
      .send({ [CSRF_FIELD]: csrf, makePublic: "1" });
    assert.ok([200, 303].includes(published.status), String(published.status));

    const instance = await instanceRepo.findWebsiteInstanceByOrgProduct(pool, {
      organizationId: result.organizationId,
      productCode: "activeclinic",
    });
    const versions = await versionService.listWebsiteVersions(pool, {
      instanceId: instance.id,
      organizationId: result.organizationId,
    });
    assert.ok((versions.versions || []).length >= 1);

    const live = await request(app).get(`/clinics/${slug}`);
    assert.equal(live.status, 200);
    assert.match(live.text, new RegExp(draftTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.doesNotMatch(live.text, /data-website-chrome/);
  });

  it("BlessBoard enter / text / image / save / preview / publish / version / public", async () => {
    if (!requireDb()) return;
    const key = uniq("bbse");
    const row = await appRepo.createApplication(pool, {
      church_name: `Shared Editor ${key}`,
      country: "Zambia",
      city: "Lusaka",
      contact_name: "Site Admin",
      contact_email: `${key}@example.org`,
      contact_phone: `+26097${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`,
      selected_plan: "foundation",
      consent_terms: true,
      branch_name: "Main Campus",
    });
    const provisioned = await provisionRegisteredBlessBoardChurch(pool, {
      applicationId: row.id,
      administratorPassword: BB_PASSWORD,
      requestId: `req-${key}`,
      actorContext: {
        type: "test",
        source: "unit",
        dataEnvironment: "testing",
        deploymentCode: "blessboard-org-staging",
      },
    });
    assert.equal(provisioned.ok, true, provisioned.message || provisioned.status);
    const rec = provisioned.records;
    const session = await createV5Session(pool, {
      deploymentCode: "blessboard-org-staging",
      userId: rec.administratorUserId,
      organizationId: rec.organizationId,
    });
    assert.equal(session.ok, true, session.message || session.code);
    const cookie = `${DEFAULT_V5_COOKIE}=${session.rawToken}`;
    const app = createV5FoundationApp({
      getPool: () => pool,
      env: MINIMAL_BB,
    });

    const edit = await request(app)
      .get(`/c/${rec.organizationKey}?website_edit=1`)
      .set("Host", APEX)
      .set("Cookie", cookie);
    assert.equal(edit.status, 200, edit.text && edit.text.slice(0, 400));
    assert.match(edit.text, /data-website-engine-shell="1"/);
    assert.match(edit.text, /data-website-chrome="1"/);
    assert.match(edit.text, /data-website-key="home\.hero\.heading"/);
    assert.match(edit.text, /data-website-field-editor="1"/);
    assert.match(edit.text, /data-website-start="1"/);
    assert.match(edit.text, /data-website-page-rail="1"/);
    assert.match(edit.text, /\/platform\/website-inline-edit\.js/);
    assert.match(edit.text, /data-website-structured="1"/);
    assert.match(edit.text, /\/c\/[^"]+\/website\/drafts/);

    const csrf = extractCsrf(edit.text);
    assert.ok(csrf, "csrf");
    const cookies = cookieHeader(cookie, edit);
    const heading = `Shared BB ${key}`;
    const saved = await request(app)
      .post(`/c/${rec.organizationKey}/website/drafts`)
      .set("Host", APEX)
      .set("Cookie", cookies)
      .set("X-CSRF-Token", csrf)
      .set("Accept", "application/json")
      .send({ [CSRF_FIELD]: csrf, contentKey: "home.hero.heading", value: heading });
    assert.equal(saved.status, 200, saved.text);
    assert.equal(saved.body.ok, true);
    assert.equal(saved.body.published, false);

    const instance = await instanceRepo.findWebsiteInstanceByOrgProduct(pool, {
      organizationId: rec.organizationId,
      productCode: "blessboard",
      scopeRef: null,
    });
    const rowDraft = await contentService.getWebsiteContentRow(
      pool,
      instance.id,
      rec.organizationId,
      "home.hero.heading"
    );
    assert.equal(String(rowDraft.draftValue || ""), heading);
    assert.notEqual(String(rowDraft.publishedValue || ""), heading);

    const publicBefore = await request(app).get(`/c/${rec.organizationKey}`).set("Host", APEX);
    assert.doesNotMatch(publicBefore.text, new RegExp(heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

    const preview = await request(app)
      .get(`/c/${rec.organizationKey}?website_mode=draft`)
      .set("Host", APEX)
      .set("Cookie", cookie);
    assert.equal(preview.status, 200);
    assert.match(preview.text, new RegExp(heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.doesNotMatch(preview.text, /data-website-start="1"/);
    assert.doesNotMatch(preview.text, /data-website-engine-shell="1"/);

    await acknowledgeWebsitePreview(pool, {
      organizationId: rec.organizationId,
      actorUserId: rec.administratorUserId,
    });
    const published = await request(app)
      .post(`/c/${rec.organizationKey}/website/publish`)
      .set("Host", APEX)
      .set("Cookie", cookies)
      .set("Accept", "application/json")
      .send({
        [CSRF_FIELD]: csrf,
        confirm_publish: "1",
        makePublic: "1",
      });
    assert.ok([200, 303].includes(published.status), `${published.status} ${published.text}`);
    if (published.status === 200) {
      assert.equal(published.body.ok, true, JSON.stringify(published.body));
    }

    const versions = await versionService.listWebsiteVersions(pool, {
      instanceId: instance.id,
      organizationId: rec.organizationId,
    });
    assert.ok((versions.versions || []).length >= 1, "platform.website_versions missing");

    const live = await request(app).get(`/c/${rec.organizationKey}`).set("Host", APEX);
    assert.equal(live.status, 200);
    assert.match(live.text, new RegExp(heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.doesNotMatch(live.text, /data-website-chrome/);
    assert.equal(publicationService.RESULT.OK, "ok");
  });
});
