"use strict";

const { before, after, describe, it } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const { resetFoundationDatabase, createFoundationPool } = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const { submitAndProvisionClinicRegistration } = require("../src/activeclinic/services/submitClinicRegistrationService");
const { createActiveClinicFoundationApp } = require("../src/activeclinic/http/activeClinicFoundationServer");
const { setClinicWebsiteAvailability } = require("../src/activeclinic/services/clinicWebsiteAvailabilityService");
const { registerActiveClinicWebsiteTemplate } = require("../src/activeclinic/website/activeClinicWebsiteTemplate");
const { provisionPlatformTenant } = require("../src/platform/services/provisionPlatformTenant");
const { provisionBlessBoardChurch } = require("../src/blessboard/services/provisionBlessBoardChurch");
const { repairWebsiteFoundation } = require("../src/blessboard/services/websiteFoundationRepairService");
const { createV5FoundationApp } = require("../src/platform/http/v5FoundationServer");
const { DEFAULT_V5_COOKIE } = require("../src/platform/session/v5SessionCookie");
const { registerBlessBoardWebsiteTemplate } = require("../src/blessboard/website/blessboardChurchTemplate");
const instanceRepo = require("../src/platform/website/instanceRepository");
const contentService = require("../src/platform/website/contentService");
const publicationService = require("../src/platform/website/publicationService");
const { saveWebsiteThemeDraft, loadWebsiteThemeState } = require("../src/platform/website/websiteThemeService");
const { listSelectableThemesForProduct, getTheme } = require("../src/platform/website/themeRegistry");
const { PRODUCT_CODE } = require("../src/platform/website/publicWebsiteUrl");
const { PERMISSIONS } = require("../src/platform/website/permissions");

let pool;
let stamp = 0;
const env = {
  NODE_ENV: "test",
  PLATFORM_DEPLOYMENT_CODE: "activeclinic-org-v6",
  DATABASE_URL: "postgres://unused/local",
  SESSION_SECRET: "a".repeat(40),
};

function nextKey(prefix) {
  stamp += 1;
  return `${prefix}${stamp}`;
}

function acApp() {
  return createActiveClinicFoundationApp({ getPool: () => pool, env, log: () => {} });
}

function bbApp() {
  return createV5FoundationApp({
    getPool: () => pool,
    env: {
      NODE_ENV: "test",
      DEPLOYMENT_ENV: "testing",
      PLATFORM_DEPLOYMENT_CODE: "blessboard-org-staging",
      SESSION_SECRET: "test-session-secret-at-least-32-chars!!",
      SESSION_COOKIE_NAME: DEFAULT_V5_COOKIE,
      BLESSBOARD_TENANT_ROUTING_MODE: "authoritative",
      BLESSBOARD_AUTHORITATIVE_HOST_ALLOWLIST: "*",
    },
  });
}

async function clinic() {
  const key = nextKey("theme-clinic-");
  const result = await submitAndProvisionClinicRegistration(pool, {
    clinicName: `Theme ${key}`,
    contactName: "Theme Admin",
    contactEmail: `${key}@example.invalid`,
    contactPhone: `+260971${String(100000 + stamp).slice(-6)}`,
    province: "Lusaka",
    city: "Lusaka",
    address: "1 Theme Street",
    countryCode: "ZM",
    password: "Theme-lifecycle-12",
    passwordConfirm: "Theme-lifecycle-12",
    acceptTerms: "on",
    deploymentCode: "activeclinic-org-v6",
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  return result;
}

async function church() {
  const key = nextKey("theme-church-");
  const host = `${key}.blessboard.org`;
  const org = await provisionPlatformTenant(pool, {
    organizationKey: key, displayName: key, productKey: "blessboard", productTenantKey: key,
    hostname: host, domainType: "canonical", deploymentCode: "blessboard-org-staging",
    dataEnvironment: "testing", isPrimary: true,
  });
  assert.equal(org.ok, true, org.message);
  const created = await provisionBlessBoardChurch(pool, {
    organizationKey: key, churchKey: key, displayName: key, dataEnvironment: "testing",
    hqBranchKey: "hq", hqBranchDisplayName: "HQ", timezone: "Africa/Lusaka", countryCode: "ZM",
  });
  assert.equal(created.ok, true, created.message);
  const churchId = created.records.church.id;
  await pool.query(
    `INSERT INTO blessboard.church_settings (church_id, public_name, primary_email, website_status)
     VALUES ($1, $2, $3, 'draft') ON CONFLICT (church_id) DO UPDATE SET website_status = 'draft'`,
    [churchId, key, `${key}@example.invalid`]
  );
  assert.equal((await repairWebsiteFoundation(pool, { churchId, publicName: key })).ok, true);
  return { key, host, organizationId: org.records.organization.id, churchId };
}

async function exerciseLifecycle({ productCode, organizationId, key, host, publish, render }) {
  const themes = listSelectableThemesForProduct(productCode);
  assert.ok(themes.length > 0);
  const sequence = [...themes, themes[0]];
  const instance = await instanceRepo.findWebsiteInstanceByOrgProduct(pool, { organizationId, productCode });
  assert.ok(instance);
  const contentKey = productCode === PRODUCT_CODE.BLESSBOARD ? "brand.primary_color" : "home.hero.title";
  const contentValue = productCode === PRODUCT_CODE.BLESSBOARD ? "#123456" : `${productCode} retained content`;
  const savedContent = await contentService.saveWebsiteDraft(pool, {
    organizationId, instanceId: instance.id, contentKey,
    value: contentValue, grantedPermissions: [PERMISSIONS.EDIT],
  });
  assert.equal(savedContent.ok, true, JSON.stringify(savedContent));
  let previousPublishedThemeId = themes[0].id;
  for (const theme of sequence) {
    const saved = await saveWebsiteThemeDraft(pool, {
      organizationId, productCode, instance, themeId: theme.id, grantedPermissions: [PERMISSIONS.EDIT],
    });
    assert.equal(saved.ok, true, JSON.stringify(saved));
    assert.equal(saved.published, false);
    const draft = await loadWebsiteThemeState(pool, { organizationId, productCode, preferDraft: true });
    assert.equal(draft.draftThemeId, theme.id);
    assert.equal(draft.publishedThemeId, previousPublishedThemeId);
    const definition = getTheme(theme.id, productCode);
    assert.equal(draft.presentation.cssClass, definition.cssClass);
    assert.equal((await contentService.getWebsiteContentRow(pool, instance.id, organizationId, contentKey)).draftValue, contentValue);
    await publish(instance);
    const live = await loadWebsiteThemeState(pool, { organizationId, productCode });
    assert.equal(live.publishedThemeId, theme.id);
    previousPublishedThemeId = theme.id;
    const page = await render();
    assert.equal(page.status, 200, page.text);
    assert.match(page.text, new RegExp(definition.cssClass));
  }
  return { themes, sequence };
}

describe("V2.09 exhaustive website theme lifecycle", () => {
  before(async () => {
    const databaseUrl = await resetFoundationDatabase();
    pool = createFoundationPool(databaseUrl);
    await migrate({ connectionString: databaseUrl });
    registerActiveClinicWebsiteTemplate();
    registerBlessBoardWebsiteTemplate();
  });
  after(async () => { if (pool) await pool.end(); });

  it("publishes every BlessBoard theme sequentially without content loss", async () => {
    const tenant = await church();
    const result = await exerciseLifecycle({
      productCode: PRODUCT_CODE.BLESSBOARD, organizationId: tenant.organizationId, key: tenant.key, host: tenant.host,
      publish: async (instance) => {
        assert.equal((await publicationService.publishWebsiteDraft(pool, {
          organizationId: tenant.organizationId, instanceId: instance.id, expectedProductCode: PRODUCT_CODE.BLESSBOARD, allowEmpty: true,
        })).ok, true);
        await pool.query(`UPDATE blessboard.church_settings SET website_status = 'published' WHERE church_id = $1`, [tenant.churchId]);
      },
      render: () => request(bbApp()).get(`/c/${tenant.key}/hq`).set("Host", tenant.host),
    });
    assert.deepEqual(result.sequence.map((theme) => theme.id), [...result.themes.map((theme) => theme.id), result.themes[0].id]);
  });

  it("publishes every ActiveClinic theme sequentially without content loss", async () => {
    const tenant = await clinic();
    const result = await exerciseLifecycle({
      productCode: PRODUCT_CODE.ACTIVECLINIC, organizationId: tenant.organizationId, key: tenant.slug,
      publish: async (instance) => {
        assert.equal((await publicationService.publishWebsiteDraft(pool, {
          organizationId: tenant.organizationId, instanceId: instance.id, expectedProductCode: PRODUCT_CODE.ACTIVECLINIC, allowEmpty: true,
        })).ok, true);
        assert.equal((await setClinicWebsiteAvailability(pool, { organizationKey: tenant.slug, public: true, overrideReadiness: true })).ok, true);
      },
      render: () => request(acApp()).get(`/clinics/${tenant.slug}`),
    });
    assert.deepEqual(result.sequence.map((theme) => theme.id), [...result.themes.map((theme) => theme.id), result.themes[0].id]);
  });
});
