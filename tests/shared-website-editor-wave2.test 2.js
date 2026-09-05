"use strict";

/**
 * Wave 2 shared field editor — Stitch EDIT-02/03/04 text/image/logo dialogs.
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
const {
  setClinicWebsiteAvailability,
} = require("../src/activeclinic/services/clinicWebsiteAvailabilityService");

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

describe("shared website editor wave 2 — static shell", () => {
  it("uses one shared field editor host in editor overlays for both products", () => {
    const overlays = read("views/platform/website-engine/editor-overlays.ejs");
    const host = read("views/platform/website-engine/field-editor-host.ejs");
    const js = read("public/platform/website-inline-edit.js");
    const css = read("public/platform/website-inline-edit.css");
    const acText = read("views/activeclinic/partials/website-editable-field.ejs");
    const bbText = read("views/blessboard/v5/partials/editable-text.ejs");
    const acImage = read("views/activeclinic/partials/website-editable-image.ejs");
    const bbImage = read("views/blessboard/v5/partials/editable-image.ejs");

    assert.match(overlays, /field-editor-host/);
    assert.match(host, /data-website-field-editor="1"/);
    assert.match(host, /Save draft/);
    assert.match(host, /data-website-save="1"/);
    assert.match(host, /data-website-cancel="1"/);
    assert.match(host, /role="dialog"/);

    assert.match(js, /data-website-field-editor/);
    assert.match(js, /openField/);
    assert.match(js, /published === true/);
    assert.match(js, /contentKey/);
    assert.match(js, /data-website-library/);
    assert.doesNotMatch(js, /function bindTextField/);

    assert.match(css, /gp-website-field-editor/);
    assert.match(css, /gp-website-editable__pencil/);

    for (const field of [acText, bbText]) {
      assert.match(field, /data-website-start="1"/);
      assert.match(field, /gp-website-editable__pencil/);
      assert.doesNotMatch(field, /data-website-editor="1"/);
      assert.doesNotMatch(field, /data-website-input="1"/);
    }
    for (const image of [acImage, bbImage]) {
      assert.match(image, /data-website-type="image"/);
      assert.match(image, /data-website-start="1"/);
      assert.doesNotMatch(image, /data-website-image-tools="1"/);
      assert.doesNotMatch(image, /data-website-file="1"/);
    }
    assert.match(acImage, /data-website-variant=/);
    assert.match(bbImage, /data-website-variant=/);
  });

  it("mobile sheet classes are defined for the field editor", () => {
    const css = read("public/platform/website-inline-edit.css");
    assert.match(css, /\.gp-website-field-editor__grab/);
    assert.match(css, /@media \(max-width: 767px\)[\s\S]*\.gp-website-field-editor__panel/);
  });
});

function cookieHeader(session, pageRes) {
  const parts = [session];
  const set = pageRes && pageRes.headers && pageRes.headers["set-cookie"];
  if (Array.isArray(set)) parts.push(...set);
  else if (set) parts.push(set);
  return parts.join("; ");
}

describe("shared website editor wave 2 — HTTP", () => {
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

  it("BlessBoard and ActiveClinic render shared field editor host on edit pages", async () => {
    if (skipReason) return;

    const acStamp = uniq("w2ac");
    const acResult = await submitAndProvisionClinicRegistration(pool, {
      clinicName: `Wave2 ${acStamp}`,
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
      reason: "wave2",
    });
    const acApp = createActiveClinicFoundationApp({ getPool: () => pool, env: MINIMAL_AC, log: () => {} });
    const acSession = await createPlatformIdentitySession(pool, {
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
      platformIdentityId: acResult.identityId,
      organizationId: acResult.organizationId,
    });
    const acEdit = await request(acApp)
      .get(`/clinics/${acResult.slug}?website_edit=1&website_mode=draft`)
      .set("Cookie", `${COOKIE_ACTIVECLINIC_ORG}=${acSession.rawToken}`);
    assert.equal(acEdit.status, 200);
    assert.match(acEdit.text, /data-website-field-editor="1"/);
    assert.match(acEdit.text, /data-website-start="1"/);
    assert.match(acEdit.text, /home\.logo/);
    assert.match(acEdit.text, /data-website-variant="logo"/);

    const bbKey = uniq("w2bb");
    const row = await appRepo.createApplication(pool, {
      church_name: `Wave2 ${bbKey}`,
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
        source: "wave2",
        dataEnvironment: "testing",
        deploymentCode: "blessboard-org-staging",
      },
    });
    const session = await createV5Session(pool, {
      deploymentCode: "blessboard-org-staging",
      userId: provisioned.records.administratorUserId,
      organizationId: provisioned.records.organizationId,
    });
    const bbApp = createV5FoundationApp({ getPool: () => pool, env: MINIMAL_BB });
    const bbEdit = await request(bbApp)
      .get(`/c/${provisioned.records.organizationKey}?website_edit=1&website_mode=draft`)
      .set("Host", APEX)
      .set("Cookie", `${DEFAULT_V5_COOKIE}=${session.rawToken}`);
    assert.equal(bbEdit.status, 200);
    assert.match(bbEdit.text, /data-website-field-editor="1"/);
    assert.match(bbEdit.text, /gp-website-editable__pencil/);
    assert.doesNotMatch(bbEdit.text, /data-bb-inline-editor="1"/);
  });

  it("draft save via shared endpoint never publishes", async () => {
    if (skipReason) return;
    const stamp = uniq("w2save");
    const result = await submitAndProvisionClinicRegistration(pool, {
      clinicName: `Wave2 save ${stamp}`,
      contactName: "Admin",
      contactEmail: `${stamp}@example.invalid`,
      contactPhone: `+2609${String(Date.now()).slice(-8)}`,
      province: "Lusaka",
      city: "Lusaka",
      address: "1 Test Road",
      countryCode: "ZM",
      password: AC_PASSWORD,
      passwordConfirm: AC_PASSWORD,
      acceptTerms: "on",
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
      dataEnvironment: "testing",
      env: { NODE_ENV: "test", PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_V6 },
    });
    const app = createActiveClinicFoundationApp({ getPool: () => pool, env: MINIMAL_AC, log: () => {} });
    const session = await createPlatformIdentitySession(pool, {
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
      platformIdentityId: result.identityId,
      organizationId: result.organizationId,
    });
    const page = await request(app)
      .get(`/clinics/${result.slug}?website_edit=1&website_mode=draft`)
      .set("Cookie", `${COOKIE_ACTIVECLINIC_ORG}=${session.rawToken}`);
    const csrf = extractCsrf(page.text);
    const save = await request(app)
      .post(`/clinics/${result.slug}/website/drafts`)
      .set("Cookie", cookieHeader(`${COOKIE_ACTIVECLINIC_ORG}=${session.rawToken}`, page))
      .set("X-CSRF-Token", csrf)
      .send({ [CSRF_FIELD]: csrf, contentKey: "home.hero.title", value: "Wave 2 draft title" });
    assert.equal(save.status, 200);
    const body = save.body;
    assert.equal(body.ok, true);
    assert.equal(body.published, false);
  });
});
