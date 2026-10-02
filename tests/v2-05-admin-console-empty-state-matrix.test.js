"use strict";

/**
 * V2.05 / V5 — Admin Console empty/error state matrix (AC + BB).
 *
 * Ensures empty datasets render intentional UI, not errors:
 *   members/staff, branches/facilities (empty or minimal), media, reports,
 *   notifications/attention where applicable.
 *
 * Expect: 200, clear empty-state marker/message, no stack trace,
 * no internal_error, no 500/503. Reuses existing fixtures and routes.
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
  PRODUCT_CODE,
  buildPublicWebsiteMediaLibraryPath,
} = require("../src/platform/website/publicWebsiteUrl");
const {
  setClinicWebsiteAvailability,
} = require("../src/activeclinic/services/clinicWebsiteAvailabilityService");
const {
  PRODUCT,
  evaluateOrganizationOnboarding,
} = require("../src/platform/onboarding");

const IDENTITY_KEY = "blessboard-platform-v5";
const AC_PASSWORD = "EmptyState-Ac-99!";
const BB_PASSWORD = "EmptyState-Bb-99!";
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

/** Module keys reported in MODULES= FINAL line. */
const MODULES = Object.freeze([
  "ac-staff",
  "ac-facilities",
  "ac-patients",
  "ac-media",
  "ac-reports",
  "bb-members",
  "bb-branches",
  "bb-media",
  "bb-reports",
  "bb-attention",
]);

let pool;
let databaseUrl;
let skipReason = null;
let passCount = 0;
let failCount = 0;
const moduleResults = Object.create(null);

function requireDb() {
  if (skipReason) assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
}

function uniq(prefix) {
  return `${prefix}${crypto.randomBytes(3).toString("hex")}`.slice(0, 16);
}

function assertCleanEmpty(res, label, markerOrMessage) {
  assert.ok(
    ![500, 503].includes(Number(res.status)),
    `${label} must not 500/503 (got ${res.status})`
  );
  assert.equal(res.status, 200, `${label} expected 200, got ${res.status}`);
  const body = String(res.text || "");
  assert.doesNotMatch(body, /internal_error/i, `${label} must not expose internal_error`);
  assert.doesNotMatch(
    body,
    /at\s+\S+\s+\([^)]+:\d+:\d+\)|Error:\s+[A-Za-z].*stack|Node\.js v\d+/i,
    `${label} must not expose stack traces`
  );
  if (markerOrMessage instanceof RegExp) {
    assert.match(body, markerOrMessage, `${label} empty marker/message`);
  } else {
    assert.match(body, new RegExp(markerOrMessage), `${label} empty marker/message`);
  }
}

function recordModule(key, ok) {
  moduleResults[key] = ok ? "PASS" : "FAIL";
  if (ok) passCount += 1;
  else failCount += 1;
}

async function provisionAc() {
  const stamp = uniq("ace");
  const provisioned = await submitAndProvisionClinicRegistration(pool, {
    clinicName: `Empty Clinic ${stamp}`,
    contactName: "Empty Admin",
    contactEmail: `${stamp}@acempty.smoke`,
    contactPhone: `+2609${String(Date.now()).slice(-8)}`,
    province: "Lusaka",
    city: "Lusaka",
    address: "1 Empty Avenue",
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
  await setClinicWebsiteAvailability(pool, {
    organizationKey: provisioned.slug,
    public: true,
    overrideReadiness: true,
    reason: "v205_empty_state_matrix",
  }).catch(() => {});
  const session = await createPlatformIdentitySession(pool, {
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    platformIdentityId: provisioned.identityId,
    organizationId: provisioned.organizationId,
    contextJson: facilityId ? { selectedFacilityId: facilityId } : {},
  });
  assert.equal(session.ok, true, JSON.stringify(session));
  return {
    cookie: `${COOKIE_ACTIVECLINIC_ORG}=${session.rawToken}`,
    stamp,
    facilityId,
  };
}

async function provisionBb() {
  const stamp = uniq("bbe");
  const orgKey = `bbemp${String(stamp).replace(/[^a-z0-9]/gi, "")}`.slice(0, 24);
  const host = `${orgKey}.blessboard.org`;
  const displayName = `Empty Church ${stamp}`;
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
  // Satisfy required onboarding contact so /hq renders the dashboard (attention empty).
  await pool.query(
    `INSERT INTO blessboard.church_settings (church_id, public_name, primary_email)
     VALUES ($1, $2, $3)
     ON CONFLICT (church_id) DO UPDATE
       SET primary_email = EXCLUDED.primary_email,
           public_name = COALESCE(blessboard.church_settings.public_name, EXCLUDED.public_name)`,
    [church.records.church.id, displayName, `contact-${stamp}@bbempty.smoke`]
  );
  const organizationId = (
    await pool.query(`SELECT id FROM platform.organizations WHERE organization_key=$1`, [
      orgKey,
    ])
  ).rows[0].id;
  const email = `hq-${stamp}@bbempty.smoke`;
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
  assert.equal(onboard.ok, true, JSON.stringify(onboard));
  assert.equal(
    onboard.onboardingRequired,
    false,
    `onboarding still required: ${onboard.status} ${onboard.currentStepKey}`
  );
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
    stamp,
    mediaPath: buildPublicWebsiteMediaLibraryPath({
      product: PRODUCT_CODE.BLESSBOARD,
      organizationKey: orgKey,
    }),
  };
}

describe("V2.05 Admin Console empty/error state matrix", () => {
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

  it("AC empty states: staff, facilities, patients, media, reports", async () => {
    requireDb();
    const ac = await provisionAc();
    const app = createActiveClinicFoundationApp({
      getPool: () => pool,
      env: { ...MINIMAL_AC, DATABASE_URL: databaseUrl },
      log: () => {},
    });
    const agent = (path) =>
      request(app).get(path).set("Host", AC_HOST).set("Cookie", ac.cookie);

    // staff — filtered empty (catalog always has at least the admin)
    try {
      const res = await agent("/app/staff?q=zzz-no-match-empty-matrix");
      assertCleanEmpty(
        res,
        "AC staff filtered empty",
        /data-ac-empty="staff-filtered"|No staff match these filters/
      );
      recordModule("ac-staff", true);
    } catch (err) {
      recordModule("ac-staff", false);
      throw err;
    }

    // facilities — filtered empty (minimal tenant always has primary facility)
    try {
      const res = await agent("/app/facilities?q=zzz-no-match-empty-matrix");
      assertCleanEmpty(
        res,
        "AC facilities filtered empty",
        /data-ac-empty="facilities-filtered"|No facilities match these filters/
      );
      recordModule("ac-facilities", true);
    } catch (err) {
      recordModule("ac-facilities", false);
      throw err;
    }

    // patients — true empty catalog
    try {
      const res = await agent("/app/patients");
      assertCleanEmpty(
        res,
        "AC patients empty",
        /data-ac-empty="patients-none"|No patients registered yet/
      );
      recordModule("ac-patients", true);
    } catch (err) {
      recordModule("ac-patients", false);
      throw err;
    }

    // media — empty library
    try {
      const res = await agent("/app/settings/website/media");
      assertCleanEmpty(
        res,
        "AC media empty",
        /data-gp-library-empty="1"|No files yet/
      );
      recordModule("ac-media", true);
    } catch (err) {
      recordModule("ac-media", false);
      throw err;
    }

    // reports / performance — zero KPIs + popular empty
    try {
      const res = await agent("/app/performance");
      assertCleanEmpty(
        res,
        "AC reports empty",
        /No bookings in this range|data-ac-page-section="performance-dashboard"/
      );
      assert.match(
        res.text,
        /ac-kpi__label">Appointments<\/p>\s*<p class="ac-kpi__value">0<\/p>/
      );
      recordModule("ac-reports", true);
    } catch (err) {
      recordModule("ac-reports", false);
      throw err;
    }
  });

  it("BB empty states: members, branches, media, reports, attention", async () => {
    requireDb();
    const bb = await provisionBb();
    const app = createV5FoundationApp({
      getPool: () => pool,
      env: { ...MINIMAL_BB, DATABASE_URL: databaseUrl },
      log: () => {},
    });
    const agent = (path) =>
      request(app).get(path).set("Host", bb.host).set("Cookie", bb.cookie);

    // members — empty directory
    try {
      const res = await agent("/hq/members");
      assertCleanEmpty(
        res,
        "BB members empty",
        /data-bb-member-empty="catalog"|No members yet/
      );
      recordModule("bb-members", true);
    } catch (err) {
      recordModule("bb-members", false);
      throw err;
    }

    // branches — minimal list OK; filtered empty must be intentional
    try {
      const minimal = await agent("/hq/branches");
      assertCleanEmpty(
        minimal,
        "BB branches minimal",
        /data-bb-branch-key="hq"|Branches|HQ/
      );
      const filtered = await agent("/hq/branches?q=zzz-no-match-empty-matrix");
      assertCleanEmpty(
        filtered,
        "BB branches filtered empty",
        /data-bb-empty="branch-no-results"|No branches match this search/
      );
      recordModule("bb-branches", true);
    } catch (err) {
      recordModule("bb-branches", false);
      throw err;
    }

    // media — empty library
    try {
      const res = await request(app)
        .get(bb.mediaPath)
        .set("Host", "blessboard.org")
        .set("Cookie", bb.cookie);
      assertCleanEmpty(
        res,
        "BB media empty",
        /data-gp-library-empty="1"|No files yet/
      );
      recordModule("bb-media", true);
    } catch (err) {
      recordModule("bb-media", false);
      throw err;
    }

    // reports — empty markers
    try {
      const res = await agent("/hq/reports");
      assertCleanEmpty(
        res,
        "BB reports empty",
        /data-bb-hq-reports="1"/
      );
      assert.match(
        res.text,
        /data-bb-report="giving-empty"|data-bb-report="attendance-empty"|data-bb-report-empty="registrations"|No pending registrations/
      );
      recordModule("bb-reports", true);
    } catch (err) {
      recordModule("bb-reports", false);
      throw err;
    }

    // notifications/attention — HQ dashboard attention empty panel
    try {
      const res = await agent("/hq").redirects(2);
      assertCleanEmpty(
        res,
        "BB attention empty",
        /data-bb-dash-empty="attention"|Branches needing attention/
      );
      recordModule("bb-attention", true);
    } catch (err) {
      recordModule("bb-attention", false);
      throw err;
    }
  });

  it("reports MODULES/PASS/FAIL for FINALs", () => {
    if (skipReason) return;
    for (const key of MODULES) {
      assert.equal(moduleResults[key], "PASS", `module ${key}=${moduleResults[key]}`);
    }
    assert.equal(passCount, MODULES.length, `PASS=${passCount}`);
    assert.equal(failCount, 0, `FAIL=${failCount}`);
    // eslint-disable-next-line no-console
    console.log(
      `ADMIN_CONSOLE_EMPTY_STATE MODULES=${MODULES.join(",")} PASS=${passCount} FAIL=${failCount}`
    );
  });
});
