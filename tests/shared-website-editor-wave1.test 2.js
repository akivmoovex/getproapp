"use strict";

/**
 * Wave 1 shared BlessBoard + ActiveClinic website editor shell (Stitch WE01).
 * Shared chrome / page rail / More menu / mobile editor nav. Product config only.
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
const appRepo = require("../src/blessboard/repositories/platformChurchRegistrationRepository");
const {
  provisionRegisteredBlessBoardChurch,
} = require("../src/blessboard/services/provisionRegisteredBlessBoardChurch");
const {
  presentEditorShell,
  buildEditorPages,
  LABELS,
} = require("../src/platform/website-engine/editorShell");
const {
  PRODUCT_CODE,
  withEditorNavigationQuery,
  withoutEditorNavigationQuery,
  buildPublicWebsiteEditPath,
  EDITOR_NAV_QUERY,
} = require("../src/platform/website/publicWebsiteUrl");
const { listProductPageTypes } = require("../src/platform/website-engine/productSchemaRegistry");

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

describe("shared website editor wave 1 — static shell", () => {
  it("uses one shared EJS chrome with Stitch labels, page rail, More, and mobile nav", () => {
    const chrome = read("views/platform/website-engine/editor-chrome.ejs");
    const acChrome = read("views/activeclinic/partials/website-editor-chrome.ejs");
    const bbChrome = read("views/blessboard/v5/partials/website-admin-chrome.ejs");
    assert.match(chrome, /data-gp-website-editor="1"/);
    assert.match(chrome, /data-website-engine-shell="1"/);
    assert.match(chrome, /data-website-chrome="1"/);
    assert.match(chrome, /Editing website/);
    assert.match(chrome, /draftLabel/);
    assert.match(chrome, /labels\.preview \|\| 'Preview'/);
    assert.match(chrome, /labels\.publish \|\| 'Publish'/);
    assert.match(chrome, /more_horiz/);
    assert.match(chrome, /Exit editing/);
    assert.match(chrome, /data-website-page-rail="1"/);
    assert.match(chrome, /data-website-more="1"/);
    assert.match(chrome, /data-website-mobile-nav="1"/);
    assert.match(chrome, /data-website-mobile-nav-id/);
    assert.match(chrome, /item\.label/);
    assert.doesNotMatch(chrome, /data-website-engine-page-select/);
    assert.doesNotMatch(chrome, />Website features</);
    assert.doesNotMatch(chrome, />SEO</);
    assert.doesNotMatch(chrome, />Assets</);
    assert.match(bbChrome, /platform\/website-engine\/editor-chrome/);
    assert.match(acChrome, /platform\/website-engine\/editor-chrome/);
    assert.doesNotMatch(bbChrome, /bb-tp-edit-toolbar__product/);
    assert.doesNotMatch(acChrome, /href="\/app\/settings\/website\/pages">Pages</);
  });

  it("canonical editor navigation preserves website_edit and website_mode=draft", () => {
    assert.deepEqual(EDITOR_NAV_QUERY, { website_edit: "1", website_mode: "draft" });
    assert.equal(
      withEditorNavigationQuery("/c/demo/about"),
      "/c/demo/about?website_edit=1&website_mode=draft"
    );
    assert.equal(
      withEditorNavigationQuery("/c/demo/about?website_edit=1"),
      "/c/demo/about?website_edit=1&website_mode=draft"
    );
    assert.equal(
      withoutEditorNavigationQuery("/c/demo/about?website_edit=1&website_mode=draft&keep=1"),
      "/c/demo/about?keep=1"
    );
    assert.equal(
      buildPublicWebsiteEditPath({
        product: PRODUCT_CODE.BLESSBOARD,
        organizationKey: "demo",
        pageKey: "about",
      }),
      "/c/demo/about?website_edit=1&website_mode=draft"
    );
    assert.equal(
      buildPublicWebsiteEditPath({
        product: PRODUCT_CODE.ACTIVECLINIC,
        organizationKey: "demo",
        pageKey: "doctors",
      }),
      "/clinics/demo/doctors?website_edit=1&website_mode=draft"
    );
  });

  it("presenter supplies product page lists and More destinations through configuration", () => {
    const bbPages = buildEditorPages({
      productCode: PRODUCT_CODE.BLESSBOARD,
      organizationKey: "grace",
      pageKey: "about",
    });
    const acPages = buildEditorPages({
      productCode: PRODUCT_CODE.ACTIVECLINIC,
      organizationKey: "sunrise",
      pageKey: "doctors",
    });
    assert.deepEqual(
      bbPages.map((p) => p.key),
      listProductPageTypes(PRODUCT_CODE.BLESSBOARD).map((p) => p.key)
    );
    assert.deepEqual(
      acPages.map((p) => p.key),
      listProductPageTypes(PRODUCT_CODE.ACTIVECLINIC).map((p) => p.key)
    );
    assert.equal(bbPages.find((p) => p.key === "about").current, true);
    assert.equal(acPages.find((p) => p.key === "doctors").current, true);
    assert.match(bbPages[0].editHref, /website_edit=1/);
    assert.match(bbPages[0].editHref, /website_mode=draft/);

    const bb = presentEditorShell({
      productCode: PRODUCT_CODE.BLESSBOARD,
      pageKey: "home",
      pages: bbPages,
      moreItems: [
        { id: "features", label: "Website features", icon: "widgets", action: "features", group: "product" },
        { id: "seo", label: "SEO", icon: "search", href: "/hq/website/advanced", group: "product" },
      ],
      unpublishedCount: 3,
      canPublish: true,
      editing: true,
    });
    const ac = presentEditorShell({
      productCode: PRODUCT_CODE.ACTIVECLINIC,
      pageKey: "home",
      pages: acPages,
      moreItems: [
        { id: "pages", label: "Pages", icon: "layers", href: "/app/settings/website/pages", group: "product" },
        { id: "assets", label: "Assets", icon: "folder", href: "/app/settings/website/media", group: "product" },
      ],
      unpublishedCount: 3,
      canPublish: false,
      editing: true,
    });
    assert.equal(bb.labels.editingWebsite, LABELS.editingWebsite);
    assert.equal(bb.labels.exitEditing, "Exit editing");
    assert.equal(ac.labels.exitEditing, "Exit editing");
    assert.equal(bb.draftLabel, "Draft • 3 unpublished changes");
    assert.equal(bb.canPublish, true);
    assert.equal(ac.canPublish, false);
    assert.ok(bb.moreItems.some((item) => item.id === "features"));
    assert.ok(bb.moreItems.some((item) => item.id === "seo"));
    assert.ok(!bb.moreItems.some((item) => item.id === "pages"));
    assert.ok(ac.moreItems.some((item) => item.id === "pages"));
    assert.ok(ac.moreItems.some((item) => item.id === "assets"));
    assert.ok(!ac.moreItems.some((item) => item.id === "seo"));
    assert.equal(bb.mobileNav.length, 4);
    assert.deepEqual(bb.mobileNav.map((item) => item.label), ["Pages", "Styles", "History", "Settings"]);
  });

  it("hides Publish when the actor cannot publish", () => {
    const shell = presentEditorShell({
      productCode: PRODUCT_CODE.BLESSBOARD,
      canPublish: false,
      publishPath: "/c/demo/website/publish",
      editing: true,
    });
    assert.equal(shell.canPublish, false);
    const chrome = read("views/platform/website-engine/editor-chrome.ejs");
    assert.match(chrome, /shell\.canPublish && \(shell\.publishHref \|\| shell\.publishPath\)/);
  });
});

describe("shared website editor wave 1 — HTTP", () => {
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

  it("BlessBoard and ActiveClinic render the shared Stitch editor chrome", async () => {
    if (!requireDb()) return;

    const acStamp = uniq("acw1");
    const acResult = await submitAndProvisionClinicRegistration(pool, {
      clinicName: `Wave1 ${acStamp}`,
      contactName: "Website Admin",
      contactEmail: `${acStamp}@example.invalid`,
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
    assert.equal(acResult.ok, true, JSON.stringify(acResult));
    const acApp = createActiveClinicFoundationApp({
      getPool: () => pool,
      env: MINIMAL_AC,
      log: () => {},
    });
    const acSession = await createPlatformIdentitySession(pool, {
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
      platformIdentityId: acResult.identityId,
      organizationId: acResult.organizationId,
    });
    const acCookie = `${COOKIE_ACTIVECLINIC_ORG}=${acSession.rawToken}`;
    const acEdit = await request(acApp)
      .get(`/clinics/${acResult.slug}?website_edit=1&website_mode=draft`)
      .set("Cookie", acCookie);
    assert.equal(acEdit.status, 200);
    assert.match(acEdit.text, /data-gp-website-editor="1"/);
    assert.match(acEdit.text, /Editing website/);
    assert.match(acEdit.text, /Draft • \d+ unpublished changes/);
    assert.match(acEdit.text, />Preview</);
    assert.match(acEdit.text, />Publish</);
    assert.match(acEdit.text, /Exit editing/);
    assert.match(acEdit.text, /data-website-page-rail="1"/);
    assert.match(acEdit.text, /data-website-more="1"/);
    assert.match(acEdit.text, /data-website-mobile-nav="1"/);
    assert.match(acEdit.text, /data-website-more-id="pages"/);
    assert.match(acEdit.text, /data-website-more-id="assets"/);
    assert.match(acEdit.text, /data-website-more-id="seo"/);
    assert.match(acEdit.text, /data-website-page-key="home"[^>]*aria-current="page"|aria-current="page"[^>]*data-website-page-key="home"/);
    assert.match(acEdit.text, /\/clinics\/[^"]+\/doctors\?website_edit=1&amp;website_mode=draft/);
    assert.doesNotMatch(acEdit.text, /Exit edit mode/);

    const bbKey = uniq("bbw1");
    const row = await appRepo.createApplication(pool, {
      church_name: `Wave1 ${bbKey}`,
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
    const bbCookie = `${DEFAULT_V5_COOKIE}=${session.rawToken}`;
    const bbApp = createV5FoundationApp({
      getPool: () => pool,
      env: MINIMAL_BB,
    });
    const bbEdit = await request(bbApp)
      .get(`/c/${rec.organizationKey}?website_edit=1`)
      .set("Host", APEX)
      .set("Cookie", bbCookie);
    assert.equal(bbEdit.status, 200, bbEdit.text && bbEdit.text.slice(0, 400));
    assert.match(bbEdit.text, /data-gp-website-editor="1"/);
    assert.match(bbEdit.text, /data-bb-edit-toolbar="1"/);
    assert.match(bbEdit.text, /Editing website/);
    assert.match(bbEdit.text, /Draft • \d+ unpublished changes/);
    assert.match(bbEdit.text, />Preview</);
    assert.match(bbEdit.text, />Publish</);
    assert.match(bbEdit.text, /Exit editing/);
    assert.match(bbEdit.text, /data-website-page-rail="1"/);
    assert.match(bbEdit.text, /data-website-more="1"/);
    assert.match(bbEdit.text, /data-website-mobile-nav="1"/);
    assert.match(bbEdit.text, /data-website-more-id="features"/);
    assert.match(bbEdit.text, /data-website-more-action="features"/);
    assert.doesNotMatch(bbEdit.text, /data-website-more-id="pages"/);
    assert.doesNotMatch(bbEdit.text, /bb-tp-edit-toolbar__product/);
    assert.match(bbEdit.text, /\/c\/[^"]+\/about\?website_edit=1&amp;website_mode=draft/);
    assert.match(bbEdit.text, /gp-website-editor-open/);
    assert.doesNotMatch(bbEdit.text, /Exit Editing/);
  });
});
