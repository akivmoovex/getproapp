"use strict";

/**
 * V7 BlessBoard bugs 1–4: directory demo filter, shared city autocomplete,
 * canonical branch URLs, mandatory branch name.
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
const { createV5FoundationApp } = require("../src/platform/http/v5FoundationServer");
const {
  baseV5TestEnv,
  V5_IDENTITY_KEY,
  V5_DEPLOYMENT_CODE,
} = require("./helpers/blessboardV5Fixtures");
const { provisionPlatformTenant } = require("../src/platform/services/provisionPlatformTenant");
const { provisionBlessBoardChurch } = require("../src/blessboard/services/provisionBlessBoardChurch");
const {
  ensureChurchSettingsInitialized,
  updateChurchSettings,
} = require("../src/blessboard/services/blessBoardSettingsService");
const directoryRepo = require("../src/blessboard/repositories/publicChurchDirectoryRepository");
const { CSRF_FIELD, CSRF_COOKIE } = require("../src/platform/http/v5Csrf");
const {
  publicBranchHomePath,
  publicBranchPagePath,
} = require("../src/blessboard/urls/churchUrlHelper");
const {
  buildPublicOrganizationWebsitePath,
  canonicalPublicWebsiteRedirect,
  PRODUCT_CODE,
} = require("../src/platform/website/publicWebsiteUrl");
const {
  sqlPublicDirectoryProductionDemoNameExclusion,
} = require("../src/church/orgDataEnvironment");
const {
  validatePlatformChurchRegistration,
  validateChurchRegistrationChurchStep,
} = require("../src/blessboard/services/platformChurchRegistrationValidation");

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

function extractCsrfToken(html) {
  const m = String(html || "").match(
    new RegExp(`name="${CSRF_FIELD}"[^>]*value="([^"]+)"|value="([^"]+)"[^>]*name="${CSRF_FIELD}"`)
  );
  return (m && (m[1] || m[2])) || null;
}

const APEX = "blessboard.org";

function uniq(prefix) {
  return `${prefix}-${crypto.randomBytes(3).toString("hex")}`;
}

describe("V7 BlessBoard bugs 1–4", () => {
  let pool;
  let skipSuite = false;
  let skipReason = "";
  let prevDeploymentEnv;
  /** @type {Record<string, any>} */
  const fixtures = {};

  before(async () => {
    prevDeploymentEnv = process.env.DEPLOYMENT_ENV;
    process.env.DEPLOYMENT_ENV = "testing";
    try {
      const databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });
      await ensureDatabaseIdentity(pool, {
        connectionString: databaseUrl,
        identityKey: V5_IDENTITY_KEY,
        environmentCode: "testing",
      });

      async function provisionListed({ key, displayName, dataEnvironment = "production" }) {
        const orgKey = uniq(key);
        const prov = await provisionPlatformTenant(pool, {
          organizationKey: orgKey,
          displayName,
          legalName: null,
          dataEnvironment,
          productKey: "blessboard",
          productTenantKey: orgKey,
          hostname: `${orgKey}.example.test`,
          domainType: "canonical",
          deploymentCode: V5_DEPLOYMENT_CODE,
          isPrimary: true,
        });
        assert.equal(prov.ok, true);
        const ch = await provisionBlessBoardChurch(pool, {
          organizationKey: orgKey,
          churchKey: orgKey,
          displayName,
          dataEnvironment,
          hqBranchKey: "hq",
          hqBranchDisplayName: `${displayName} HQ`,
        });
        assert.equal(ch.ok, true);
        await ensureChurchSettingsInitialized(pool, ch.records.church.id);
        await updateChurchSettings(pool, ch.records.church.id, {
          publicName: displayName,
          websiteStatus: "published",
        });
        return { orgKey, churchId: ch.records.church.id, displayName };
      }

      fixtures.demoNamed = await provisionListed({
        key: "demo-named",
        displayName: "My DEMO Church",
        dataEnvironment: "production",
      });
      fixtures.realNamed = await provisionListed({
        key: "real-named",
        displayName: "Grace Community Chapel",
        dataEnvironment: "production",
      });
      fixtures.branchUrl = await provisionListed({
        key: "branch-url",
        displayName: "Branch URL Church",
        dataEnvironment: "testing",
      });
      await pool.query(
        `INSERT INTO blessboard.branches
           (church_id, branch_key, display_name, branch_type, status, is_primary)
         SELECT c.id, 'east', 'East Campus', 'branch', 'active', false
           FROM blessboard.churches c
          INNER JOIN platform.organizations o ON o.id = c.organization_id
          WHERE o.organization_key = $1`,
        [fixtures.branchUrl.orgKey]
      );
    } catch (err) {
      skipSuite = true;
      skipReason = err && err.message ? err.message : String(err);
    }
  });

  after(async () => {
    if (prevDeploymentEnv === undefined) delete process.env.DEPLOYMENT_ENV;
    else process.env.DEPLOYMENT_ENV = prevDeploymentEnv;
    if (pool) await pool.end().catch(() => {});
  });

  function requireDb() {
    if (skipSuite) assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
  }

  function makeApp(envExtra = {}) {
    return createV5FoundationApp({
      env: baseV5TestEnv({
        BLESSBOARD_TENANT_ROUTING_MODE: "off",
        DEPLOYMENT_ENV: "testing",
        ...envExtra,
      }),
      getPool: () => pool,
    });
  }

  it("BUG 1: production directory excludes demo-named churches server-side", async () => {
    requireDb();
    process.env.DEPLOYMENT_ENV = "production";
    assert.match(sqlPublicDirectoryProductionDemoNameExclusion({ DEPLOYMENT_ENV: "production" }), /NOT \(/i);
    assert.equal(
      sqlPublicDirectoryProductionDemoNameExclusion({ DEPLOYMENT_ENV: "testing" }),
      "TRUE"
    );

    const listed = await directoryRepo.searchPublicOrganizations(pool, { env: { DEPLOYMENT_ENV: "production" } });
    const slugs = listed.items.map((i) => i.slug);
    assert.ok(!slugs.includes(fixtures.demoNamed.orgKey));
    assert.ok(slugs.includes(fixtures.realNamed.orgKey));

    const searchDemo = await directoryRepo.searchPublicOrganizations(pool, {
      env: { DEPLOYMENT_ENV: "production" },
      q: "DEMO",
    });
    assert.equal(searchDemo.total, 0);

    const app = makeApp({ DEPLOYMENT_ENV: "production" });
    const res = await request(app).get("/directory").set("Host", APEX);
    assert.equal(res.status, 200);
    assert.doesNotMatch(res.text, /My DEMO Church/);
    assert.match(res.text, /Grace Community Chapel/);
    process.env.DEPLOYMENT_ENV = "testing";
  });

  it("BUG 1: testing deployment still lists demo-named production churches", async () => {
    requireDb();
    process.env.DEPLOYMENT_ENV = "testing";
    const listed = await directoryRepo.searchPublicOrganizations(pool, {});
    const slugs = listed.items.map((i) => i.slug);
    assert.ok(slugs.includes(fixtures.demoNamed.orgKey));
  });

  it("BUG 4: branch name is mandatory in server validation", () => {
    const missing = validateChurchRegistrationChurchStep({
      church_name: "Test Church",
      country: "Zambia",
      city: "Lusaka",
      branch_name: "",
    });
    assert.equal(missing.ok, false);
    assert.equal(missing.field, "branch_name");

    const ok = validatePlatformChurchRegistration({
      church_name: "Test Church",
      country: "Zambia",
      city: "Lusaka",
      branch_name: "Main Campus",
      contact_name: "Pastor",
      role_in_church: "Pastor",
      email: "pastor@example.org",
      phone_country: "ZM",
      phone_national: "971234567",
      consent_contact: "on",
      selected_plan: "foundation",
    });
    assert.equal(ok.ok, true);
    assert.equal(ok.data.branch_name, "Main Campus");
  });

  it("BUG 3: canonical branch URLs and legacy redirects", () => {
    assert.equal(
      buildPublicOrganizationWebsitePath({
        product: PRODUCT_CODE.BLESSBOARD,
        organizationKey: "grace",
        scope: { kind: "branch", branchKey: "hq" },
      }),
      "/c/grace/hq"
    );
    assert.equal(publicBranchHomePath("grace", "hq"), "/c/grace/hq");
    assert.equal(publicBranchPagePath("grace", "east", "about"), "/c/grace/east/about");

    assert.equal(
      canonicalPublicWebsiteRedirect(
        PRODUCT_CODE.BLESSBOARD,
        "/c/demo-church/branches/hq/about?keep=1"
      ),
      "/c/demo-church/hq/about?keep=1"
    );
    assert.equal(
      canonicalPublicWebsiteRedirect(PRODUCT_CODE.BLESSBOARD, "/c/demo-church/hq"),
      null
    );
  });

  it("BUG 3: /c/:org redirects to primary branch; legacy branch path redirects", async () => {
    requireDb();
    const app = makeApp();
    const orgKey = fixtures.branchUrl.orgKey;

    const orgHome = await request(app).get(`/c/${orgKey}`).set("Host", APEX);
    assert.equal(orgHome.status, 301);
    assert.match(orgHome.headers.location, new RegExp(`/c/${orgKey}/hq`));

    const legacyBranch = await request(app)
      .get(`/c/${orgKey}/branches/east`)
      .set("Host", APEX);
    assert.equal(legacyBranch.status, 301);
    assert.equal(legacyBranch.headers.location, `/c/${orgKey}/east`);

    const east = await request(app).get(`/c/${orgKey}/east`).set("Host", APEX);
    assert.equal(east.status, 200);

    const hq = await request(app).get(`/c/${orgKey}/hq`).set("Host", APEX);
    assert.equal(hq.status, 200);
  });

  it("BUG 4: registration POST rejects missing branch name", async () => {
    requireDb();
    const app = makeApp();
    const getForm = await request(app).get("/register-church").set("Host", APEX);
    assert.equal(getForm.status, 200);
    const csrf = extractCsrfToken(getForm.text);
    const csrfCookie = extractCookie(getForm, CSRF_COOKIE);
    assert.ok(csrf);
    assert.ok(csrfCookie);

    const post = await request(app)
      .post("/register-church")
      .set("Host", APEX)
      .set("Cookie", `${CSRF_COOKIE}=${csrfCookie}`)
      .type("form")
      .send({
        [CSRF_FIELD]: csrf,
        church_name: "Missing Branch Church",
        country: "Zambia",
        city: "Lusaka",
        branch_name: "",
        contact_name: "Pastor",
        role_in_church: "Pastor",
        email: uniq("nobranch") + "@example.org",
        phone_country: "ZM",
        phone_national: "971234567",
        consent_contact: "on",
        selected_plan: "foundation",
        password: "TestPassword99!",
        password_confirm: "TestPassword99!",
      });
    assert.equal(post.status, 400);
    assert.match(post.text, /branch name/i);
  });
});
