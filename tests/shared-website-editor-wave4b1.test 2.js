"use strict";

/**
 * Wave 4B-1 — shared version history, restore-as-draft, media library.
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
const versionService = require("../src/platform/website/versionService");
const {
  setClinicWebsiteAvailability,
} = require("../src/activeclinic/services/clinicWebsiteAvailabilityService");
const {
  PRODUCT_CODE,
  buildPublicWebsiteHistoryPath,
  buildPublicWebsiteMediaLibraryPath,
  buildPublicWebsiteEditPath,
} = require("../src/platform/website/publicWebsiteUrl");
const publicationService = require("../src/platform/website/publicationService");
const { buildHistoryView } = require("../src/platform/website/historyModel");
const { renderWebsiteHistory } = require("../src/platform/website/renderWebsiteHistory");

const ROOT = path.join(__dirname, "..");
const IDENTITY_KEY = "blessboard-platform-v5";
const AC_PASSWORD = "clinic-admin-pass-12";
const BB_PASSWORD = "TestPassword99!";

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

const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

let pool;
let skipReason = null;

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function uniq(prefix) {
  return `${prefix}-${crypto.randomBytes(3).toString("hex")}`;
}

function extractCsrf(html) {
  const hidden = String(html).match(/name="_csrf"\s+value="([^"]+)"/);
  if (hidden) return hidden[1];
  const meta = String(html).match(/name="csrf-token"\s+content="([^"]+)"/);
  return meta ? meta[1] : "";
}

function cookieHeader(base, res) {
  const extra = res.headers["set-cookie"];
  if (!extra) return base;
  const parts = Array.isArray(extra) ? extra : [extra];
  return [base].concat(parts.map((c) => c.split(";")[0])).join("; ");
}

async function publishTwice(orgId, instanceId, productCode, actorId) {
  await contentService.saveWebsiteDraft(pool, {
    organizationId: orgId,
    instanceId,
    expectedProductCode: productCode,
    contentKey: productCode === "activeclinic" ? "home.hero.heading" : "home.hero.heading",
    value: `Heading ${uniq("h")}`,
    actorIdentityId: actorId,
    grantedPermissions: ["website.edit", "website.publish"],
  });
  const first = await publicationService.publishWebsiteDraft(pool, {
    organizationId: orgId,
    instanceId,
    expectedProductCode: productCode,
    actorIdentityId: actorId,
    allowEmpty: true,
  });
  assert.equal(first.ok, true);
  await contentService.saveWebsiteDraft(pool, {
    organizationId: orgId,
    instanceId,
    expectedProductCode: productCode,
    contentKey: productCode === "activeclinic" ? "home.hero.heading" : "home.hero.heading",
    value: `Heading ${uniq("h2")}`,
    actorIdentityId: actorId,
    grantedPermissions: ["website.edit", "website.publish"],
  });
  const second = await publicationService.publishWebsiteDraft(pool, {
    organizationId: orgId,
    instanceId,
    expectedProductCode: productCode,
    actorIdentityId: actorId,
    allowEmpty: true,
  });
  assert.equal(second.ok, true);
  return versionService.listWebsiteVersions(pool, {
    organizationId: orgId,
    instanceId,
  });
}

describe("shared website editor wave 4b1 — static surfaces", () => {
  it("BlessBoard and ActiveClinic use shared history surface", () => {
    const history = read("views/platform/website/history.ejs");
    const ac = read("views/activeclinic/tenant/website-history.ejs");
    const js = read("public/platform/website-history.js");
    assert.match(history, /data-gp-website-history/);
    assert.match(history, /Current live version/);
    assert.match(history, /data-gp-history-restore-open/);
    assert.match(ac, /historyHtml/);
    assert.doesNotMatch(js, /window\.confirm/);
  });

  it("shared history model distinguishes live, historical, and draft rows", () => {
    const view = buildHistoryView({
      siteLabel: "Demo Clinic",
      versions: [
        { id: "v2", versionNumber: 2, status: "published", publishedAt: "2026-01-02T10:00:00Z" },
        { id: "v1", versionNumber: 1, status: "superseded", publishedAt: "2026-01-01T10:00:00Z" },
      ],
      unpublishedCount: 3,
      canRestore: true,
      previewHrefFor: (id) => `/preview/${id}`,
      restoreHrefFor: (id) => `/restore/${id}`,
    });
    assert.ok(view.draftRow);
    assert.equal(view.versions[0].isLive, true);
    assert.equal(view.versions[1].status, "historical");
    const html = renderWebsiteHistory(view);
    assert.match(html, /Current live version/);
    assert.match(html, /Working draft/);
  });

  it("BlessBoard and ActiveClinic use shared media library building blocks", () => {
    const mediaPage = read("views/platform/website/media-page.ejs");
    const acCms = read("views/activeclinic/app/website-cms-media.ejs");
    assert.match(mediaPage, /data-gp-website-media-page/);
    assert.match(mediaPage, /libraryHtml/);
    assert.match(acCms, /libraryModel/);
    assert.match(read("src/platform/website/mediaPageModel.js"), /buildLibraryView/);
  });

  it("image field dialog still exposes choose-existing media hook", () => {
    const js = read("public/platform/website-inline-edit.js");
    assert.match(js, /data-website-media-url/);
    assert.match(js, /choose existing/i);
  });

  it("delete is not exposed in shared library cards by default", () => {
    const library = read("views/platform/website/library.ejs");
    assert.doesNotMatch(library, /Delete media/);
    assert.doesNotMatch(library, /data-gp-library-delete/);
  });

  it("BlessBoard chrome wires tenant history and assets destinations", () => {
    const chrome = read("src/blessboard/http/attachWebsiteAdminChrome.js");
    assert.match(chrome, /buildPublicWebsiteHistoryPath/);
    assert.match(chrome, /buildPublicWebsiteMediaLibraryPath/);
    assert.match(chrome, /id: "assets"/);
  });

  it("editor mobile history is enabled when historyHref is present", () => {
    const shell = read("src/platform/website-engine/editorShell.js");
    assert.match(shell, /id: "history"/);
    assert.match(shell, /available: Boolean\(historyHref\)/);
  });

  it("history surfaces preserve back-to-editor links", () => {
    const view = buildHistoryView({
      backHref: "/clinics/demo?website_edit=1&website_mode=draft",
      versions: [],
    });
    const html = renderWebsiteHistory(view);
    assert.match(html, /Back to editor/);
    assert.match(html, /website_edit=1/);
  });
});

describe("shared website editor wave 4b1 — HTTP history and media", () => {
  let acSlug;
  let acOrgId;
  let acIdentityId;
  let acInstanceId;
  let bbSlug;
  let bbOrgId;
  let bbUserId;
  let bbInstanceId;
  let acCookie;
  let bbCookie;

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

      const stamp = uniq("w4b1");
      const acResult = await submitAndProvisionClinicRegistration(pool, {
        clinicName: `Wave4B1 ${stamp}`,
        contactName: "Website Admin",
        contactEmail: `${stamp}-ac@example.invalid`,
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
        env: MINIMAL_AC,
      });
      assert.equal(acResult.ok, true);
      acSlug = acResult.slug;
      acOrgId = acResult.organizationId;
      acIdentityId = acResult.identityId;
      const acInstance = await instanceRepo.findWebsiteInstanceByOrgProduct(pool, {
        organizationId: acOrgId,
        productCode: "activeclinic",
      });
      acInstanceId = acInstance.id;
      await publishTwice(acOrgId, acInstanceId, "activeclinic", acIdentityId);
      await setClinicWebsiteAvailability(pool, {
        organizationKey: acSlug,
        public: true,
        overrideReadiness: true,
        reason: "wave4b1",
      });
      const acSession = await createPlatformIdentitySession(pool, {
        deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
        platformIdentityId: acIdentityId,
        organizationId: acOrgId,
      });
      acCookie = `${COOKIE_ACTIVECLINIC_ORG}=${acSession.rawToken}`;

      const bbKey = uniq("w4b1-bb");
      const row = await appRepo.createApplication(pool, {
        church_name: `Wave4B1 ${bbKey}`,
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
          source: "wave4b1",
          dataEnvironment: "testing",
          deploymentCode: "blessboard-org-staging",
        },
      });
      bbSlug = provisioned.records.organizationKey;
      bbOrgId = provisioned.records.organizationId;
      bbUserId = provisioned.records.administratorUserId;
      const bbInstance = await instanceRepo.findWebsiteInstanceByOrgProduct(pool, {
        organizationId: bbOrgId,
        productCode: "blessboard",
      });
      bbInstanceId = bbInstance.id;
      await publishTwice(bbOrgId, bbInstanceId, "blessboard", bbUserId);
      const bbSession = await createV5Session(pool, {
        userId: bbUserId,
        deploymentCode: "blessboard-org-staging",
      });
      bbCookie = `${DEFAULT_V5_COOKIE}=${bbSession.rawToken}`;
    } catch (err) {
      skipReason = err && err.message ? String(err.message).slice(0, 240) : "no foundation db";
    }
  });

  after(async () => {
    if (pool) await pool.end().catch(() => {});
  });

  it("ActiveClinic history route renders shared surface with current version", async (t) => {
    if (skipReason) t.skip(skipReason);
    const app = createActiveClinicFoundationApp({ getPool: () => pool, env: MINIMAL_AC, log: () => {} });
    const res = await request(app)
      .get(buildPublicWebsiteHistoryPath({ product: PRODUCT_CODE.ACTIVECLINIC, organizationKey: acSlug }))
      .set("Cookie", acCookie);
    assert.equal(res.status, 200);
    assert.match(res.text, /data-gp-website-history/);
    assert.match(res.text, /Current live version/);
    assert.match(res.text, /data-gp-history-restore-open/);
    const editPath = buildPublicWebsiteEditPath({
      product: PRODUCT_CODE.ACTIVECLINIC,
      organizationKey: acSlug,
    });
    assert.ok(res.text.includes(editPath) || res.text.includes(editPath.replace(/&/g, "&amp;")));
  });

  it("BlessBoard history route renders shared surface with current version", async (t) => {
    if (skipReason) t.skip(skipReason);
    const app = createV5FoundationApp({ getPool: () => pool, env: MINIMAL_BB, log: () => {} });
    const res = await request(app)
      .get(buildPublicWebsiteHistoryPath({ product: PRODUCT_CODE.BLESSBOARD, organizationKey: bbSlug }))
      .set("Host", "blessboard.org")
      .set("Cookie", bbCookie);
    assert.equal(res.status, 200);
    assert.match(res.text, /data-gp-website-history/);
    assert.match(res.text, /Current live version/);
  });

  it("restore creates draft only and leaves live version unchanged", async (t) => {
    if (skipReason) t.skip(skipReason);
    const app = createActiveClinicFoundationApp({ getPool: () => pool, env: MINIMAL_AC, log: () => {} });
    const before = await versionService.listWebsiteVersions(pool, {
      organizationId: acOrgId,
      instanceId: acInstanceId,
    });
    const live = before.versions.find((v) => v.status === "published");
    const older = before.versions.find((v) => v.status === "superseded");
    assert.ok(live);
    assert.ok(older);
    const historyPage = await request(app)
      .get(buildPublicWebsiteHistoryPath({ product: PRODUCT_CODE.ACTIVECLINIC, organizationKey: acSlug }))
      .set("Cookie", acCookie);
    const csrf = extractCsrf(historyPage.text);
    const restore = await request(app)
      .post(`/clinics/${acSlug}/website/versions/${older.id}/restore`)
      .set("Cookie", cookieHeader(acCookie, historyPage))
      .send({ [CSRF_FIELD]: csrf });
    assert.equal(restore.status, 303);
    assert.match(String(restore.headers.location || ""), /website_edit=1/);
    const after = await versionService.listWebsiteVersions(pool, {
      organizationId: acOrgId,
      instanceId: acInstanceId,
    });
    const liveAfter = after.versions.find((v) => v.id === live.id);
    assert.equal(liveAfter.status, "published");
    assert.equal(after.versions.length, before.versions.length);
    const audit = await pool.query(
      `SELECT 1
         FROM platform.website_audit_events
        WHERE instance_id = $1
          AND action_key = 'website.rollback'
        ORDER BY created_at DESC
        LIMIT 1`,
      [acInstanceId]
    );
    assert.ok(audit.rows.length > 0);
  });

  it("unauthorized restore is denied", async (t) => {
    if (skipReason) t.skip(skipReason);
    const app = createActiveClinicFoundationApp({ getPool: () => pool, env: MINIMAL_AC, log: () => {} });
    const listed = await versionService.listWebsiteVersions(pool, {
      organizationId: acOrgId,
      instanceId: acInstanceId,
    });
    const older = listed.versions.find((v) => v.status === "superseded");
    const denied = await request(app)
      .post(`/clinics/${acSlug}/website/versions/${older.id}/restore`)
      .send({ [CSRF_FIELD]: "invalid" });
    assert.ok(denied.status === 403 || denied.status === 401);
  });

  it("cross-tenant version restore is rejected", async (t) => {
    if (skipReason) t.skip(skipReason);
    const stamp = uniq("w4b1-iso");
    const other = await submitAndProvisionClinicRegistration(pool, {
      clinicName: `Other ${stamp}`,
      contactName: "Other Admin",
      contactEmail: `${stamp}@example.invalid`,
      contactPhone: `+2609${String(Date.now()).slice(-8)}`,
      province: "Lusaka",
      city: "Lusaka",
      address: "2 Independence Avenue",
      countryCode: "ZM",
      password: AC_PASSWORD,
      passwordConfirm: AC_PASSWORD,
      acceptTerms: "on",
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
      dataEnvironment: "testing",
      env: MINIMAL_AC,
    });
    const otherInstance = await instanceRepo.findWebsiteInstanceByOrgProduct(pool, {
      organizationId: other.organizationId,
      productCode: "activeclinic",
    });
    await publicationService.publishWebsiteDraft(pool, {
      organizationId: other.organizationId,
      instanceId: otherInstance.id,
      expectedProductCode: "activeclinic",
      actorIdentityId: other.identityId,
      allowEmpty: true,
    });
    const otherVersions = await versionService.listWebsiteVersions(pool, {
      organizationId: other.organizationId,
      instanceId: otherInstance.id,
    });
    const app = createActiveClinicFoundationApp({ getPool: () => pool, env: MINIMAL_AC, log: () => {} });
    const historyPage = await request(app)
      .get(buildPublicWebsiteHistoryPath({ product: PRODUCT_CODE.ACTIVECLINIC, organizationKey: acSlug }))
      .set("Cookie", acCookie);
    const csrf = extractCsrf(historyPage.text);
    const cross = await request(app)
      .post(`/clinics/${acSlug}/website/versions/${otherVersions.versions[0].id}/restore`)
      .set("Cookie", cookieHeader(acCookie, historyPage))
      .send({ [CSRF_FIELD]: csrf });
    assert.equal(cross.status, 303);
    assert.match(String(cross.headers.location || ""), /error=/);
  });

  it("BlessBoard media library page uses shared library grid", async (t) => {
    if (skipReason) t.skip(skipReason);
    const app = createV5FoundationApp({ getPool: () => pool, env: MINIMAL_BB, log: () => {} });
    const res = await request(app)
      .get(buildPublicWebsiteMediaLibraryPath({ product: PRODUCT_CODE.BLESSBOARD, organizationKey: bbSlug }))
      .set("Host", "blessboard.org")
      .set("Cookie", bbCookie);
    assert.equal(res.status, 200);
    assert.match(res.text, /data-gp-website-media-page/);
    assert.match(res.text, /data-gp-library/);
  });

  it("media upload returns preview/public URL and appears in library list", async (t) => {
    if (skipReason) t.skip(skipReason);
    const app = createV5FoundationApp({ getPool: () => pool, env: MINIMAL_BB, log: () => {} });
    const edit = await request(app)
      .get(`/c/${bbSlug}?website_edit=1&website_mode=draft`)
      .set("Host", "blessboard.org")
      .set("Cookie", bbCookie);
    const csrf = extractCsrf(edit.text);
    const upload = await request(app)
      .post(`/c/${bbSlug}/website/media`)
      .set("Host", "blessboard.org")
      .set("Cookie", cookieHeader(bbCookie, edit))
      .field(CSRF_FIELD, csrf)
      .attach("file", TINY_PNG, { filename: "wave4b1.png", contentType: "image/png" });
    assert.equal(upload.status, 200);
    assert.equal(upload.body.ok, true);
    assert.ok(upload.body.media && upload.body.media.publicSrc);
    assert.ok(upload.body.media.previewUrl || upload.body.media.publicSrc);
    const list = await request(app)
      .get(`/c/${bbSlug}/website/media`)
      .set("Host", "blessboard.org")
      .set("Cookie", bbCookie)
      .set("Accept", "application/json");
    assert.equal(list.status, 200);
    assert.ok((list.body.media || []).some((item) => item.id === upload.body.media.id));
  });

  it("cross-tenant media fetch is rejected for BlessBoard", async (t) => {
    if (skipReason) t.skip(skipReason);
    const stamp = uniq("w4b1-media");
    const row = await appRepo.createApplication(pool, {
      church_name: `Media ${stamp}`,
      country: "Zambia",
      city: "Lusaka",
      contact_name: "Site Admin",
      contact_email: `${stamp}@example.org`,
      contact_phone: `+26097${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`,
      selected_plan: "foundation",
      consent_terms: true,
      branch_name: "Main Campus",
    });
    const other = await provisionRegisteredBlessBoardChurch(pool, {
      applicationId: row.id,
      administratorPassword: BB_PASSWORD,
      requestId: `req-${stamp}`,
      actorContext: {
        type: "test",
        source: "wave4b1",
        dataEnvironment: "testing",
        deploymentCode: "blessboard-org-staging",
      },
    });
    const otherSession = await createV5Session(pool, {
      userId: other.records.administratorUserId,
      deploymentCode: "blessboard-org-staging",
    });
    const otherCookie = `${DEFAULT_V5_COOKIE}=${otherSession.rawToken}`;
    const app = createV5FoundationApp({ getPool: () => pool, env: MINIMAL_BB, log: () => {} });
    const otherEdit = await request(app)
      .get(`/c/${other.records.organizationKey}?website_edit=1`)
      .set("Host", "blessboard.org")
      .set("Cookie", otherCookie);
    const otherCsrf = extractCsrf(otherEdit.text);
    const otherUpload = await request(app)
      .post(`/c/${other.records.organizationKey}/website/media`)
      .set("Host", "blessboard.org")
      .set("Cookie", cookieHeader(otherCookie, otherEdit))
      .field(CSRF_FIELD, otherCsrf)
      .attach("file", TINY_PNG, { filename: "other.png", contentType: "image/png" });
    assert.equal(otherUpload.status, 200);
    const denied = await request(app)
      .get(`/c/${bbSlug}/website/media/${otherUpload.body.media.id}`)
      .set("Host", "blessboard.org")
      .set("Cookie", bbCookie);
    assert.equal(denied.status, 404);
  });
});
