"use strict";

/**
 * Wave 4A shared section actions — EDIT-06.
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
const instanceRepo = require("../src/platform/website/instanceRepository");
const contentService = require("../src/platform/website/contentService");
const {
  setClinicWebsiteAvailability,
} = require("../src/activeclinic/services/clinicWebsiteAvailabilityService");
const { PRODUCT_CODE } = require("../src/platform/website/publicWebsiteUrl");
const publicationService = require("../src/platform/website/publicationService");
const draftRepo = require("../src/blessboard/repositories/websiteStructuredDraftRepository");
const {
  buildManifest: buildBlessBoardManifest,
  applySectionAction: applyBlessBoardSectionAction,
} = require("../src/blessboard/website/blessboardSectionActionService");
const {
  buildManifest: buildActiveClinicManifest,
} = require("../src/activeclinic/website/activeClinicSectionActionService");

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

function cookieHeader(base, res) {
  const extra = res.headers["set-cookie"];
  if (!extra) return base;
  const parts = Array.isArray(extra) ? extra : [extra];
  return [base].concat(parts.map((c) => c.split(";")[0])).join("; ");
}

describe("shared website editor wave 4a — static section shell", () => {
  it("uses shared section menu, controller, and chrome data attributes", () => {
    const chrome = read("views/platform/website-engine/editor-chrome.ejs");
    const menu = read("views/platform/website-engine/section-action-menu.ejs");
    const js = read("public/platform/website-section-actions.js");
    const css = read("public/platform/website-inline-edit.css");
    assert.match(chrome, /data-website-section-actions-url/);
    assert.match(chrome, /data-website-section-manifest/);
    assert.match(chrome, /section-action-menu/);
    assert.match(menu, /data-website-section-menu-host/);
    assert.match(menu, /data-website-section-action="edit"/);
    assert.match(menu, /data-website-section-action="reorder"/);
    assert.match(menu, /data-website-section-action="hide"/);
    assert.match(menu, /data-website-section-action="restore_default"/);
    assert.match(js, /data-website-section-trigger/);
    assert.match(js, /GpWebsiteSectionActions/);
    assert.match(css, /\.gp-website-section__trigger/);
    assert.match(css, /\.gp-website-section-menu/);
  });

  it("builds capability-driven manifests for both products", () => {
    const bb = buildBlessBoardManifest("home", [
      { sectionKey: "hero", sortOrder: 10, status: "published" },
      { sectionKey: "welcome", sortOrder: 20, status: "published" },
    ]);
    assert.equal(bb.pageKey, "home");
    assert.ok(bb.sections.find((s) => s.sectionKey === "hero"));
    assert.equal(bb.sections.find((s) => s.sectionKey === "hero").canReorder, false);
    assert.equal(bb.sections.find((s) => s.sectionKey === "welcome").canReorder, true);

    const ac = buildActiveClinicManifest("home", [
      { id: "sec_hero", page_id: "tpl_home", type: "hero", visible: true, sort_order: "0" },
      { id: "sec_services", page_id: "tpl_home", type: "services", visible: true, sort_order: "2" },
    ]);
    assert.equal(ac.selectorAttr, "data-ac-home-section");
    assert.ok(ac.sections.find((s) => s.sectionKey === "services"));
  });

  it("does not render section menu host outside edit chrome branch", () => {
    const chrome = read("views/platform/website-engine/editor-chrome.ejs");
    const previewBranch = chrome.split("shell.previewMode")[1] || "";
    assert.doesNotMatch(previewBranch.slice(0, 500), /section-action-menu/);
  });
});

describe("shared website editor wave 4a — HTTP section actions", () => {
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

  it("ActiveClinic hide section saves draft visibility without publishing", async (t) => {
    if (skipReason) t.skip(skipReason);
    const stamp = uniq("w4a-ac");
    const acResult = await submitAndProvisionClinicRegistration(pool, {
      clinicName: `Wave4A ${stamp}`,
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
      reason: "wave4a-hide",
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
    const hide = await request(app)
      .post(`/clinics/${acResult.slug}/website/section-actions`)
      .set("Cookie", cookieHeader(cookie, edit))
      .send({
        [CSRF_FIELD]: csrf,
        action: "hide",
        pageKey: "home",
        sectionKey: "services",
      });
    assert.equal(hide.status, 200);
    assert.equal(hide.body.ok, true);
    const row = await contentService.getWebsiteContentRow(
      pool,
      instance.id,
      acResult.organizationId,
      "cms.sections"
    );
    const sections = row.draftValue || [];
    const svc = sections.find((s) => s.type === "services");
    assert.equal(svc.visible, false);
    assert.notEqual(JSON.stringify(row.publishedValue), JSON.stringify(row.draftValue));
  });

  it("BlessBoard reorder section saves structured draft only", async (t) => {
    if (skipReason) t.skip(skipReason);
    const bbKey = uniq("w4a-bb");
    const row = await appRepo.createApplication(pool, {
      church_name: `Wave4A ${bbKey}`,
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
        source: "wave4a",
        dataEnvironment: "testing",
        deploymentCode: "blessboard-org-staging",
      },
    });
    const result = await applyBlessBoardSectionAction(pool, {
      organizationId: provisioned.records.organizationId,
      churchId: provisioned.records.churchId,
      branchId: null,
      editorUserId: provisioned.records.administratorUserId,
      pageKey: "home",
      sectionKey: "welcome",
      action: "move_up",
    });
    assert.equal(result.ok, true);
    const drafts = await draftRepo.listStructuredDrafts(pool, {
      churchId: provisioned.records.churchId,
      branchId: null,
      pageKey: "home",
      status: "draft",
    });
    const reorder = drafts.find((d) => d.draftKind === "page_section" && d.op === "reorder");
    assert.ok(reorder);
  });

  it("rejects cross-tenant section action via client org override", async (t) => {
    if (skipReason) t.skip(skipReason);
    const bbKey = uniq("w4a-iso");
    const row = await appRepo.createApplication(pool, {
      church_name: `Iso ${bbKey}`,
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
        source: "wave4a",
        dataEnvironment: "testing",
        deploymentCode: "blessboard-org-staging",
      },
    });
    const bbApp = createV5FoundationApp({ getPool: () => pool, env: MINIMAL_BB, log: () => {} });
    const bbSession = await createV5Session(pool, {
      deploymentCode: "blessboard-org-staging",
      userId: provisioned.records.administratorUserId,
      churchId: provisioned.records.churchId,
    });
    const host = `${provisioned.records.organizationKey}.${APEX}`;
    const edit = await request(bbApp)
      .get(`/c/${provisioned.records.organizationKey}?website_edit=1`)
      .set("Host", host)
      .set("Cookie", `${DEFAULT_V5_COOKIE}=${bbSession.rawToken}`);
    const csrf = extractCsrf(edit.text);
    const other = await request(bbApp)
      .post(`/c/${provisioned.records.organizationKey}/website/section-actions`)
      .set("Host", host)
      .set("Cookie", `${DEFAULT_V5_COOKIE}=${bbSession.rawToken}`)
      .send({
        [CSRF_FIELD]: csrf,
        action: "hide",
        pageKey: "home",
        sectionKey: "welcome",
        organizationId: "foreign",
      });
    assert.equal(other.status, 403);
  });
});
