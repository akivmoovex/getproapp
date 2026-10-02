"use strict";

/**
 * V2.05 / V5 — Admin Console product isolation gate (AC ↔ BB UI/route leakage).
 *
 * Renders representative Admin Console pages for each product and asserts:
 *   - AC HTML has no /hq routes, BlessBoard/church-only labels, or BB shell markers
 *   - BB HTML has no /app/staff (or other AC-only admin routes), ActiveClinic/
 *     clinic-only labels, or AC shell markers
 *   - Shared platform Admin Console shell markers remain present
 *
 * Allowlist is tiny and explicit for legitimate shared wording only.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
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
const {
  createPlatformIdentitySession,
} = require("../src/platform/session/createDeploymentSession");
const {
  CODE_ACTIVECLINIC_ORG_V6,
  COOKIE_ACTIVECLINIC_ORG,
} = require("../src/platform/config/deploymentProfiles");
const { createV5FoundationApp } = require("../src/platform/http/v5FoundationServer");
const { DEFAULT_V5_COOKIE } = require("../src/platform/session/v5SessionCookie");
const { createV5Session } = require("../src/platform/session/createV5Session");
const { ENV_KEY } = require("../src/blessboard/config/instantFreeProvisioningEnabled");
const { provisionPlatformTenant } = require("../src/platform/services/provisionPlatformTenant");
const {
  provisionBlessBoardChurch,
} = require("../src/blessboard/services/provisionBlessBoardChurch");
const {
  createBlessBoardUser,
} = require("../src/blessboard/services/createBlessBoardUser");
const {
  assignBlessBoardRole,
} = require("../src/blessboard/services/assignBlessBoardRole");
const {
  ensureChurchSettingsInitialized,
} = require("../src/blessboard/services/blessBoardSettingsService");
const {
  assignOrganizationPlan,
} = require("../src/platform/services/entitlementService");
const {
  PRODUCT,
  evaluateOrganizationOnboarding,
} = require("../src/platform/onboarding");
const {
  PRODUCT_CODE,
  buildPublicWebsiteMediaLibraryPath,
} = require("../src/platform/website/publicWebsiteUrl");

const IDENTITY_KEY = "blessboard-platform-v5";
const AC_PASSWORD = "IsoGate-Ac-99!";
const BB_PASSWORD = "IsoGate-Bb-99!";
const AC_HOST = "activeclinic.org";

const MINIMAL_AC = Object.freeze({
  NODE_ENV: "test",
  PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_V6,
  SESSION_SECRET: "a".repeat(48),
});

const MINIMAL_BB = Object.freeze({
  NODE_ENV: "test",
  DEPLOYMENT_ENV: "testing",
  PLATFORM_DEPLOYMENT_CODE: "blessboard-org-staging",
  SESSION_SECRET: "test-session-secret-at-least-32-chars!!",
  SESSION_COOKIE_NAME: DEFAULT_V5_COOKIE,
  BLESSBOARD_TENANT_ROUTING_MODE: "authoritative",
  BLESSBOARD_AUTHORITATIVE_HOST_ALLOWLIST: "*",
  [ENV_KEY]: "1",
});

/** Representative Admin Console surfaces to render per product. */
const AC_PAGES = Object.freeze([
  "/app",
  "/app/staff",
  "/app/facilities",
  "/app/settings",
  "/app/performance",
  "/app/settings/website/media",
]);

const BB_PAGES = Object.freeze([
  "/hq",
  "/hq/members",
  "/hq/branches",
  "/hq/settings",
  "/hq/reports",
  // filled after provision with org-scoped media library path
]);

/**
 * Tiny explicit allowlist: shared platform wording that may appear in both shells.
 * Product brand names and foreign admin routes are NEVER allowlisted.
 */
const SHARED_WORDING_ALLOWLIST = Object.freeze([
  "Admin Console",
  "Settings",
  "Media",
  "Website",
  "Organization",
  "Dashboard",
  "Reports",
  "Staff", // label appears in both AC Staff and BB staff-access surfaces
]);

/** Patterns forbidden on AC Admin Console HTML. */
const AC_FORBIDDEN = Object.freeze([
  { id: "hq-route", re: /href=["']\/hq(?:\/|["'?#])/i },
  { id: "bb-shell", re: /data-bb-shell=/i },
  { id: "bb-product", re: /data-bb-product=/i },
  { id: "bb-nav-key", re: /data-bb-nav-key=/i },
  { id: "bb-stitch-shell", re: /data-bb-stitch-shell=/i },
  { id: "bb-adm-stitch", re: /data-gp-admin-console-stitch=["']BB-ADM-01["']|data-bb-stitch-screen=["']BB-ADM-01["']/i },
  { id: "bb-console-product", re: /data-gp-admin-console-product=["']blessboard["']/i },
  { id: "blessboard-label", re: /\bBlessBoard\b/i },
  { id: "church-hq-label", re: /\bChurch HQ\b|\bHQ admin\b|\bbranch admin\b/i },
  { id: "bb-css", re: /href=["']\/blessboard\//i },
]);

/** Patterns forbidden on BB Admin Console HTML. */
const BB_FORBIDDEN = Object.freeze([
  { id: "ac-staff-route", re: /href=["']\/app\/staff(?:\/|["'?#])/i },
  { id: "ac-app-admin-route", re: /href=["']\/app\/(?:facilities|patients|performance|access)(?:\/|["'?#])/i },
  { id: "ac-shell", re: /data-ac-shell=/i },
  { id: "ac-product", re: /data-ac-product=/i },
  { id: "ac-nav-key", re: /data-ac-nav-key=/i },
  { id: "ac-nav-registry", re: /data-ac-nav-source=["']registry["']/i },
  { id: "ac-adm-stitch", re: /data-gp-admin-console-stitch=["']AC-ADM-01["']|data-ac-stitch-screen=["']AC-ADM-01["']/i },
  { id: "ac-console-product", re: /data-gp-admin-console-product=["']activeclinic["']/i },
  { id: "activeclinic-label", re: /\bActiveClinic\b/i },
  { id: "clinic-only-label", re: /\bclinic manager\b|\bhealthcare organization\b|\bselect facility\b/i },
  { id: "ac-css", re: /href=["']\/activeclinic\//i },
]);

/** Shared platform shell markers that must remain on both products. */
const SHARED_REQUIRED = Object.freeze([
  { id: "gp-admin-console", re: /data-gp-admin-console=["']AdminConsoleShell["']/ },
  { id: "gp-admin-console-app", re: /data-gp-admin-console-app=/ },
  { id: "gp-admin-console-sidebar", re: /data-gp-admin-console-sidebar=/ },
  { id: "admin-console-css", re: /admin-console-shell\.css/ },
  { id: "gp-desktop", re: /data-gp-admin-console-desktop=["']1440["']/ },
  { id: "gp-mobile", re: /data-gp-admin-console-mobile=["']390["']/ },
]);

let pool;
let databaseUrl;
let skipReason = null;
let passCount = 0;
let failCount = 0;
const acLeaks = [];
const bbLeaks = [];

function requireDb() {
  if (skipReason) assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
}

function uniq(prefix) {
  return `${prefix}${crypto.randomBytes(3).toString("hex")}`.slice(0, 16);
}

function scanForbidden(html, rules, page, bucket) {
  const text = String(html || "");
  for (const rule of rules) {
    if (rule.re.test(text)) {
      bucket.push(`${page}:${rule.id}`);
    }
  }
}

function assertSharedShell(html, page) {
  const text = String(html || "");
  for (const req of SHARED_REQUIRED) {
    assert.match(text, req.re, `${page} missing shared marker ${req.id}`);
  }
  // Product-specific console product attribute must be set (not missing).
  assert.match(
    text,
    /data-gp-admin-console-product=["'](activeclinic|blessboard)["']/,
    `${page} missing data-gp-admin-console-product`
  );
}

function assertAllowlistDocumented() {
  // Guardrail: allowlist stays tiny and does not include foreign brands/routes.
  assert.ok(SHARED_WORDING_ALLOWLIST.length <= 12, "allowlist grew unexpectedly");
  for (const word of SHARED_WORDING_ALLOWLIST) {
    assert.doesNotMatch(word, /BlessBoard|ActiveClinic|\/hq|\/app\/staff/i);
  }
}

async function provisionAc() {
  const stamp = uniq("isoa");
  const provisioned = await submitAndProvisionClinicRegistration(pool, {
    clinicName: `Iso AC ${stamp}`,
    contactName: "Iso Admin",
    contactEmail: `${stamp}@aciso.smoke`,
    contactPhone: `+2609${String(Date.now()).slice(-8)}`,
    province: "Lusaka",
    city: "Lusaka",
    address: "1 Iso Avenue",
    countryCode: "ZM",
    password: AC_PASSWORD,
    passwordConfirm: AC_PASSWORD,
    acceptTerms: "on",
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    dataEnvironment: "testing",
    env: MINIMAL_AC,
  });
  assert.equal(provisioned.ok, true, JSON.stringify(provisioned));
  const facilityId =
    (provisioned.facility && (provisioned.facility.id || provisioned.facility.facilityId)) ||
    null;
  const session = await createPlatformIdentitySession(pool, {
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    platformIdentityId: provisioned.identityId,
    organizationId: provisioned.organizationId,
    contextJson: facilityId ? { selectedFacilityId: facilityId } : {},
  });
  assert.equal(session.ok, true, JSON.stringify(session));
  return {
    cookie: `${COOKIE_ACTIVECLINIC_ORG}=${session.rawToken}`,
    clinicName: `Iso AC ${stamp}`,
  };
}

async function provisionBb() {
  const stamp = uniq("isob");
  const orgKey = `bbiso${String(stamp).replace(/[^a-z0-9]/gi, "")}`.slice(0, 24);
  const host = `${orgKey}.blessboard.org`;
  const displayName = `Iso Church ${stamp}`;
  const tenant = await provisionPlatformTenant(pool, {
    organizationKey: orgKey,
    displayName,
    legalName: null,
    dataEnvironment: "testing",
    productKey: "blessboard",
    productTenantKey: orgKey,
    hostname: host,
    domainType: "canonical",
    deploymentCode: "blessboard-org-staging",
    isPrimary: true,
  });
  assert.equal(tenant.ok, true, JSON.stringify(tenant));
  const church = await provisionBlessBoardChurch(pool, {
    organizationKey: orgKey,
    churchKey: orgKey,
    displayName,
    dataEnvironment: "testing",
    hqBranchKey: "hq",
    hqBranchDisplayName: "HQ",
  });
  assert.equal(church.ok, true, JSON.stringify(church));
  await ensureChurchSettingsInitialized(pool, church.records.church.id);
  await pool.query(
    `INSERT INTO blessboard.church_settings (church_id, public_name, primary_email)
     VALUES ($1, $2, $3)
     ON CONFLICT (church_id) DO UPDATE
       SET primary_email = EXCLUDED.primary_email,
           public_name = COALESCE(blessboard.church_settings.public_name, EXCLUDED.public_name)`,
    [church.records.church.id, displayName, `contact-${stamp}@bbiso.smoke`]
  );
  const organizationId = (
    await pool.query(`SELECT id FROM platform.organizations WHERE organization_key=$1`, [
      orgKey,
    ])
  ).rows[0].id;
  const plan = await assignOrganizationPlan(pool, {
    organizationId,
    planKey: "growth",
  });
  assert.equal(plan.ok, true, JSON.stringify(plan));
  const email = `hq-${stamp}@bbiso.smoke`;
  const created = await createBlessBoardUser(pool, {
    email,
    password: BB_PASSWORD,
    displayName: "HQ Admin",
  });
  assert.equal(created.ok, true, created.message || JSON.stringify(created));
  const assigned = await assignBlessBoardRole(pool, {
    email,
    organizationKey: orgKey,
    roleKey: "church_hq_admin",
    churchKey: orgKey,
  });
  assert.equal(assigned.ok, true, JSON.stringify(assigned));
  const onboard = await evaluateOrganizationOnboarding(pool, {
    productCode: PRODUCT.BLESSBOARD,
    organizationId,
    actor: { roles: ["church_hq_admin"], userId: created.user.id },
    persist: true,
    deploymentCode: "blessboard-org-staging",
  });
  assert.equal(onboard.ok, true);
  assert.equal(onboard.onboardingRequired, false, JSON.stringify(onboard));
  const session = await createV5Session(pool, {
    deploymentCode: "blessboard-org-staging",
    userId: created.user.id,
    organizationId,
    churchId: church.records.church.id,
    branchId: church.records.hqBranch.id,
  });
  assert.equal(session.ok, true, session.code || JSON.stringify(session));
  return {
    cookie: `${DEFAULT_V5_COOKIE}=${session.rawToken}`,
    host,
    orgKey,
    displayName,
    mediaPath: buildPublicWebsiteMediaLibraryPath({
      product: PRODUCT_CODE.BLESSBOARD,
      organizationKey: orgKey,
    }),
  };
}

describe("V2.05 Admin Console product isolation gate", () => {
  before(async () => {
    try {
      databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });
      await ensureDatabaseIdentity(pool, {
        connectionString: databaseUrl,
        identityKey: IDENTITY_KEY,
        environmentCode: "testing",
      });
    } catch (err) {
      skipReason = err && err.message ? String(err.message) : String(err);
    }
  });

  after(async () => {
    if (pool) await pool.end().catch(() => {});
  });

  it("allowlist stays tiny and excludes foreign brands/routes", () => {
    assertAllowlistDocumented();
    passCount += 1;
  });

  it("AC Admin Console pages: no BB route/label/shell leakage + shared markers", async () => {
    requireDb();
    const ac = await provisionAc();
    const app = createActiveClinicFoundationApp({
      getPool: () => pool,
      env: { ...MINIMAL_AC, DATABASE_URL: databaseUrl },
      log: () => {},
    });

    for (const page of AC_PAGES) {
      const res = await request(app)
        .get(page)
        .set("Host", AC_HOST)
        .set("Cookie", ac.cookie)
        .redirects(2);
      assert.ok(![404, 500, 503].includes(res.status), `${page} status ${res.status}`);
      assert.equal(res.status, 200, `${page} expected 200 got ${res.status}`);
      assertSharedShell(res.text, `AC ${page}`);
      assert.match(
        res.text,
        /data-gp-admin-console-product=["']activeclinic["']|data-ac-product=["']activeclinic["']/,
        `${page} AC product marker`
      );
      assert.match(res.text, /data-ac-shell=/);
      assert.doesNotMatch(res.text, /data-gp-admin-console-product=["']blessboard["']/);
      const before = acLeaks.length;
      scanForbidden(res.text, AC_FORBIDDEN, page, acLeaks);
      if (acLeaks.length === before) passCount += 1;
      else failCount += 1;
    }

    assert.equal(
      acLeaks.length,
      0,
      `AC_LEAKS=${acLeaks.join("|") || "none"}`
    );
  });

  it("BB Admin Console pages: no AC route/label/shell leakage + shared markers", async () => {
    requireDb();
    const bb = await provisionBb();
    const app = createV5FoundationApp({
      getPool: () => pool,
      env: { ...MINIMAL_BB, DATABASE_URL: databaseUrl },
      log: () => {},
    });
    const pages = [...BB_PAGES, bb.mediaPath].filter(Boolean);

    for (const page of pages) {
      const host = page.startsWith("/c/") ? "blessboard.org" : bb.host;
      const res = await request(app)
        .get(page)
        .set("Host", host)
        .set("Cookie", bb.cookie)
        .redirects(2);
      assert.ok(![404, 500, 503].includes(res.status), `${page} status ${res.status}`);
      assert.equal(res.status, 200, `${page} expected 200 got ${res.status}`);

      // Media library is shared platform chrome; still must not leak AC admin shell.
      if (page.startsWith("/hq")) {
        assertSharedShell(res.text, `BB ${page}`);
        assert.match(
          res.text,
          /data-gp-admin-console-product=["']blessboard["']|data-bb-product=/,
          `${page} BB product marker`
        );
        assert.match(res.text, /data-bb-shell=/);
      } else {
        // Public website media library: require no AC admin shell markers.
        assert.doesNotMatch(res.text, /data-ac-shell=/);
        assert.doesNotMatch(res.text, /data-gp-admin-console-product=["']activeclinic["']/);
      }

      const before = bbLeaks.length;
      scanForbidden(res.text, BB_FORBIDDEN, page, bbLeaks);
      if (bbLeaks.length === before) passCount += 1;
      else failCount += 1;
    }

    assert.equal(
      bbLeaks.length,
      0,
      `BB_LEAKS=${bbLeaks.join("|") || "none"}`
    );
  });

  it("reports AC_LEAKS/BB_LEAKS/PASS/FAIL for FINALs", () => {
    if (skipReason) return;
    assert.equal(acLeaks.length, 0, `AC_LEAKS=${acLeaks.join("|")}`);
    assert.equal(bbLeaks.length, 0, `BB_LEAKS=${bbLeaks.join("|")}`);
    assert.ok(passCount >= AC_PAGES.length + BB_PAGES.length, `PASS=${passCount}`);
    assert.equal(failCount, 0, `FAIL=${failCount}`);
    // eslint-disable-next-line no-console
    console.log(
      `ADMIN_CONSOLE_PRODUCT_ISOLATION AC_LEAKS=${acLeaks.join("|") || "none"} BB_LEAKS=${bbLeaks.join("|") || "none"} PASS=${passCount} FAIL=${failCount} ALLOWLIST=${SHARED_WORDING_ALLOWLIST.join(",")}`
    );
  });
});
