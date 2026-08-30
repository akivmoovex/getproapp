"use strict";

/**
 * Wave 3 shared lifecycle — preview, publish confirm, unsaved, discard, unpublish.
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
const { CSRF_FIELD } = require("../src/platform/http/v5Csrf");
const appRepo = require("../src/blessboard/repositories/platformChurchRegistrationRepository");
const {
  provisionRegisteredBlessBoardChurch,
} = require("../src/blessboard/services/provisionRegisteredBlessBoardChurch");
const publicationService = require("../src/platform/website/publicationService");
const instanceRepo = require("../src/platform/website/instanceRepository");
const contentService = require("../src/platform/website/contentService");
const {
  setClinicWebsiteAvailability,
} = require("../src/activeclinic/services/clinicWebsiteAvailabilityService");
const {
  buildPublicWebsitePreviewPath,
  withPreviewNavigationQuery,
} = require("../src/platform/website/publicWebsiteUrl");
const { PRODUCT_CODE } = require("../src/platform/website/publicWebsiteUrl");

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

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function uniq(prefix) {
  return `${prefix}-${crypto.randomBytes(3).toString("hex")}`;
}

function extractCsrf(html) {
  const meta = String(html).match(/name="csrf-token"\s+content="([^"]+)"/);
  return meta ? meta[1] : "";
}

describe("shared website editor wave 3 — static lifecycle shell", () => {
  it("uses shared preview banner, lifecycle host, and controller", () => {
    const chrome = read("views/platform/website-engine/editor-chrome.ejs");
    const banner = read("views/platform/website-engine/preview-banner.ejs");
    const lifecycleHost = read("views/platform/website-engine/lifecycle-dialog-host.ejs");
    const lifecycleJs = read("public/platform/website-lifecycle.js");
    const mobileJs = read("public/platform/website-editor-mobile.js");
    const inlineJs = read("public/platform/website-inline-edit.js");
    const css = read("public/platform/website-inline-edit.css");
    const acChrome = read("views/activeclinic/partials/website-editor-chrome.ejs");
    const bbChrome = read("views/blessboard/v5/partials/website-admin-chrome.ejs");

    assert.match(chrome, /preview-banner/);
    assert.match(chrome, /lifecycle-dialog-host/);
    assert.match(chrome, /data-website-publish-confirm="1"/);
    assert.match(banner, /Previewing unpublished draft/);
    assert.match(banner, /Back to editing/);
    assert.match(banner, /data-website-back-to-editing="1"/);
    assert.match(lifecycleHost, /data-website-lifecycle-panel="publish"/);
    assert.match(lifecycleHost, /data-website-lifecycle-panel="unsaved"/);
    assert.match(lifecycleHost, /Keep editing/);
    assert.match(lifecycleHost, /Discard changes/);
    assert.match(lifecycleHost, /data-website-lifecycle-panel="discard"/);
    assert.match(lifecycleHost, /data-website-lifecycle-panel="unpublish"/);
    assert.doesNotMatch(lifecycleHost, /Save draft/);

    assert.match(lifecycleJs, /GpWebsiteLifecycle/);
    assert.match(lifecycleJs, /data-website-publish-confirm/);
    assert.match(lifecycleJs, /discard_all/);
    assert.doesNotMatch(lifecycleJs, /window\.confirm\(/);

    assert.match(mobileJs, /website-lifecycle/);
    assert.doesNotMatch(mobileJs, /window\.confirm\(/);

    assert.match(inlineJs, /GpWebsiteLifecycle/);
    assert.match(inlineJs, /setLocalDirtyController/);

    assert.match(css, /\.gp-website-preview-banner/);
    assert.match(css, /\.gp-website-lifecycle/);

    assert.match(acChrome, /websitePreviewDraftMode/);
    assert.match(bbChrome, /previewDraftMode/);
  });

  it("canonical preview navigation uses website_mode=draft without website_edit", () => {
    const preview = buildPublicWebsitePreviewPath({
      product: PRODUCT_CODE.ACTIVECLINIC,
      organizationKey: "demo",
      pageKey: "home",
    });
    assert.equal(preview, "/clinics/demo?website_mode=draft");
    assert.equal(withPreviewNavigationQuery("/clinics/demo/contact"), "/clinics/demo/contact?website_mode=draft");
    assert.doesNotMatch(preview, /website_edit=1/);
  });
});

function cookieHeader(session, pageRes) {
  const parts = [session];
  const set = pageRes && pageRes.headers && pageRes.headers["set-cookie"];
  if (Array.isArray(set)) parts.push(...set);
  else if (set) parts.push(set);
  return parts.join("; ");
}

describe("shared website editor wave 3 — HTTP lifecycle", () => {
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

  it("ActiveClinic preview shows draft banner without pencils; edit restores shell", async () => {
    if (skipReason) return;

    const stamp = uniq("w3ac");
    const acResult = await submitAndProvisionClinicRegistration(pool, {
      clinicName: `Wave3 ${stamp}`,
      contactName: "Website Admin",
      contactEmail: `${stamp}@example.invalid`,
      contactPhone: `+2609${String(Date.now()).slice(-8)}`,
      province: "Lusaka Province",
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
    assert.equal(acResult.ok, true);
    await publicationService.publishWebsiteDraft(pool, {
      organizationId: acResult.organizationId,
      instanceId: (
        await instanceRepo.findWebsiteInstanceByOrgProduct(pool, {
          organizationId: acResult.organizationId,
          productCode: "activeclinic",
        })
      ).id,
      expectedProductCode: "activeclinic",
      actorIdentityId: acResult.identityId,
      allowEmpty: true,
    });
    await setClinicWebsiteAvailability(pool, {
      organizationKey: acResult.slug,
      public: true,
      overrideReadiness: true,
      reason: "wave3",
    });

    const app = createActiveClinicFoundationApp({ getPool: () => pool, env: MINIMAL_AC, log: () => {} });
    const session = await createPlatformIdentitySession(pool, {
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
      platformIdentityId: acResult.identityId,
      organizationId: acResult.organizationId,
    });
    const cookie = `${COOKIE_ACTIVECLINIC_ORG}=${session.rawToken}`;

    const edit = await request(app)
      .get(`/clinics/${acResult.slug}?website_edit=1&website_mode=draft`)
      .set("Cookie", cookie);
    assert.equal(edit.status, 200);
    const csrf = extractCsrf(edit.text);
    const cookies = cookieHeader(cookie, edit);
    const draftTitle = `Wave3 preview ${stamp}`;
    const saved = await request(app)
      .post(`/clinics/${acResult.slug}/website/drafts`)
      .set("Cookie", cookies)
      .send({ [CSRF_FIELD]: csrf, contentKey: "home.hero.title", value: draftTitle });
    assert.equal(saved.status, 200);
    assert.equal(saved.body.published, false);

    const previewRedirect = await request(app)
      .get(`/clinics/${acResult.slug}/website/preview`)
      .set("Cookie", cookie);
    assert.equal(previewRedirect.status, 303);
    assert.match(previewRedirect.headers.location, /website_mode=draft/);
    assert.doesNotMatch(previewRedirect.headers.location, /website_edit=1/);

    const preview = await request(app)
      .get(`/clinics/${acResult.slug}?website_mode=draft`)
      .set("Cookie", cookie);
    assert.equal(preview.status, 200);
    assert.match(preview.text, /Previewing unpublished draft/);
    assert.match(preview.text, /data-website-preview-banner="1"/);
    assert.match(preview.text, /website-lifecycle\.js/);
    assert.match(preview.text, new RegExp(draftTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.doesNotMatch(preview.text, /data-website-start="1"/);
    assert.doesNotMatch(preview.text, /data-website-page-rail="1"/);

    const back = await request(app)
      .get(`/clinics/${acResult.slug}?website_edit=1&website_mode=draft`)
      .set("Cookie", cookie);
    assert.equal(back.status, 200);
    assert.match(back.text, /data-website-page-rail="1"/);
    assert.match(back.text, /data-website-start="1"/);
  });

  it("ActiveClinic discard_all resets drafts and preserves published content", async () => {
    if (skipReason) return;

    const stamp = uniq("w3dcd");
    const acResult = await submitAndProvisionClinicRegistration(pool, {
      clinicName: `Wave3 discard ${stamp}`,
      contactName: "Website Admin",
      contactEmail: `${stamp}@example.invalid`,
      contactPhone: `+2609${String(Date.now()).slice(-8)}`,
      province: "Lusaka Province",
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
    assert.equal(acResult.ok, true);
    const instance = await instanceRepo.findWebsiteInstanceByOrgProduct(pool, {
      organizationId: acResult.organizationId,
      productCode: "activeclinic",
    });
    await publicationService.publishWebsiteDraft(pool, {
      organizationId: acResult.organizationId,
      instanceId: instance.id,
      expectedProductCode: "activeclinic",
      actorIdentityId: acResult.identityId,
      allowEmpty: true,
    });
    await setClinicWebsiteAvailability(pool, {
      organizationKey: acResult.slug,
      public: true,
      overrideReadiness: true,
      reason: "wave3-discard",
    });

    const app = createActiveClinicFoundationApp({ getPool: () => pool, env: MINIMAL_AC, log: () => {} });
    const session = await createPlatformIdentitySession(pool, {
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
      platformIdentityId: acResult.identityId,
      organizationId: acResult.organizationId,
    });
    const cookie = `${COOKIE_ACTIVECLINIC_ORG}=${session.rawToken}`;
    const edit = await request(app)
      .get(`/clinics/${acResult.slug}?website_edit=1&website_mode=draft`)
      .set("Cookie", cookie);
    const csrf = extractCsrf(edit.text);
    const cookies = cookieHeader(cookie, edit);
    const draftTitle = `Discard me ${stamp}`;
    await request(app)
      .post(`/clinics/${acResult.slug}/website/drafts`)
      .set("Cookie", cookies)
      .send({ [CSRF_FIELD]: csrf, contentKey: "home.hero.title", value: draftTitle });

    const discarded = await request(app)
      .post(`/clinics/${acResult.slug}/website/drafts/discard`)
      .set("Cookie", cookies)
      .set("Accept", "application/json")
      .send({ [CSRF_FIELD]: csrf, confirm_discard: "1", discard_all: "1" });
    assert.equal(discarded.status, 200);
    assert.equal(discarded.body.ok, true);

    const live = await request(app).get(`/clinics/${acResult.slug}`);
    assert.equal(live.status, 200);
    assert.doesNotMatch(live.text, new RegExp(draftTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

    const row = await pool.query(
      `SELECT draft_value, published_value FROM platform.website_content
       WHERE instance_id = $1 AND content_key = 'home.hero.title' LIMIT 1`,
      [instance.id]
    );
    if (row.rows[0]) {
      assert.equal(JSON.stringify(row.rows[0].draft_value), JSON.stringify(row.rows[0].published_value));
    }
  });

  it("BlessBoard preview mode uses shared banner without edit pencils", async () => {
    if (skipReason) return;

    const bbKey = uniq("w3bb");
    const row = await appRepo.createApplication(pool, {
      church_name: `Wave3 ${bbKey}`,
      country: "Zambia",
      city: "Lusaka",
      contact_name: "Site Admin",
      contact_email: `${bbKey}@example.org`,
      contact_phone: `+26097${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`,
      selected_plan: "foundation",
      consent_terms: true,
      branch_name: "Main Campus",
    });
    const provisioned = await provisionRegisteredBlessBoardChurch(pool, {
      applicationId: row.id,
      administratorPassword: BB_PASSWORD,
      requestId: `req-${bbKey}`,
      actorContext: {
        type: "test",
        source: "wave3",
        dataEnvironment: "testing",
        deploymentCode: "blessboard-org-staging",
      },
    });
    const bbSession = await createV5Session(pool, {
      deploymentCode: "blessboard-org-staging",
      userId: provisioned.records.administratorUserId,
      organizationId: provisioned.records.organizationId,
    });
    const bbApp = createV5FoundationApp({ getPool: () => pool, env: MINIMAL_BB });
    const cookie = `${DEFAULT_V5_COOKIE}=${bbSession.rawToken}`;

    const preview = await request(bbApp)
      .get(`/c/${provisioned.records.organizationKey}?website_mode=draft`)
      .set("Host", APEX)
      .set("Cookie", cookie);
    assert.equal(preview.status, 200);
    assert.match(preview.text, /Previewing unpublished draft/);
    assert.match(preview.text, /website-lifecycle\.js/);
    assert.doesNotMatch(preview.text, /data-website-start="1"/);
  });
});
