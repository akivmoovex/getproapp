"use strict";

/**
 * V2.05 / V5 — Admin Console mutation security matrix (CSRF + session expiry).
 *
 * One representative POST per Admin Console area:
 *   People/Staff, Access, Settings, Media, Location/Branch
 *
 * For each: valid CSRF succeeds; missing/invalid CSRF denied; expired session
 * denied/login redirect; failed requests must not change DB.
 * Reuses tests/helpers/adminConsoleMutationSecurity.js + existing fixtures.
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
  CSRF_FIELD,
  assertNoServerError,
  expectCsrfDenied,
  expectSessionDenied,
  expireDeploymentSession,
  issueAcCsrfPair,
  issueBbCsrfPair,
  issueMismatchedCsrfPair,
} = require("./helpers/adminConsoleMutationSecurity");
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
const {
  createStaffMember,
} = require("../src/activeclinic/services/activeClinicStaffService");
const {
  assignStaffToFacility,
} = require("../src/activeclinic/services/activeClinicStaffFacilityService");
const {
  STAFF_ROLE,
  FACILITY_ADMIN,
} = require("../src/activeclinic/services/activeClinicAuthorizationService");
const {
  setClinicWebsiteAvailability,
} = require("../src/activeclinic/services/clinicWebsiteAvailabilityService");
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

const IDENTITY_KEY = "blessboard-platform-v5";
const AC_PASSWORD = "MutSec-Ac-99!";
const BB_PASSWORD = "MutSec-Bb-99!";
const AC_HOST = "activeclinic.org";

const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

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

const MUTATIONS = Object.freeze([
  "people-staff",
  "access",
  "settings",
  "media",
  "location-branch",
]);

let pool;
let databaseUrl;
let skipReason = null;
let passCount = 0;
let failCount = 0;
const mutationResults = Object.create(null);

function requireDb() {
  if (skipReason) assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
}

function uniq(prefix) {
  return `${prefix}${crypto.randomBytes(3).toString("hex")}`.slice(0, 16);
}

function nextPhone() {
  return `+26097${String(Date.now()).slice(-7)}${crypto.randomBytes(1).readUInt8(0) % 10}`;
}

function recordMutation(key, ok) {
  mutationResults[key] = ok ? "PASS" : "FAIL";
  if (ok) passCount += 1;
  else failCount += 1;
}

function bumpCase() {
  passCount += 1;
}

/**
 * Run missing / invalid CSRF + expired session negatives, assert probe unchanged,
 * then valid success. Counts 4 case bumps per mutation (3 negatives + 1 success).
 */
async function runSecurityCases({
  mutationKey,
  probe,
  sendMissingCsrf,
  sendInvalidCsrf,
  sendExpiredSession,
  sendValid,
  assertSuccess,
}) {
  try {
    const before = await probe();

    const missing = await sendMissingCsrf();
    expectCsrfDenied(missing, `${mutationKey} missing CSRF`);
    assert.deepEqual(await probe(), before, `${mutationKey} missing CSRF must not change DB`);
    bumpCase();

    const invalid = await sendInvalidCsrf();
    expectCsrfDenied(invalid, `${mutationKey} invalid CSRF`);
    assert.deepEqual(await probe(), before, `${mutationKey} invalid CSRF must not change DB`);
    bumpCase();

    const expired = await sendExpiredSession();
    expectSessionDenied(expired, `${mutationKey} expired session`);
    assert.deepEqual(await probe(), before, `${mutationKey} expired session must not change DB`);
    bumpCase();

    const okRes = await sendValid();
    assertNoServerError(okRes, `${mutationKey} valid`);
    await assertSuccess(okRes, before);
    bumpCase();

    recordMutation(mutationKey, true);
  } catch (err) {
    recordMutation(mutationKey, false);
    throw err;
  }
}

async function provisionAc() {
  const stamp = uniq("msa");
  const provisioned = await submitAndProvisionClinicRegistration(pool, {
    clinicName: `MutSec Clinic ${stamp}`,
    contactName: "MutSec Admin",
    contactEmail: `${stamp}@acmutsec.smoke`,
    contactPhone: `+2609${String(Date.now()).slice(-8)}`,
    province: "Lusaka",
    city: "Lusaka",
    address: "1 Security Ave",
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
  const hcoId =
    (provisioned.healthcareOrganization &&
      (provisioned.healthcareOrganization.id ||
        provisioned.healthcareOrganization.healthcareOrganizationId)) ||
    null;
  await setClinicWebsiteAvailability(pool, {
    organizationKey: provisioned.slug,
    public: true,
    overrideReadiness: true,
    reason: "v205_mutation_security_matrix",
  }).catch(() => {});

  async function mintSession() {
    const session = await createPlatformIdentitySession(pool, {
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
      platformIdentityId: provisioned.identityId,
      organizationId: provisioned.organizationId,
      contextJson: facilityId ? { selectedFacilityId: facilityId } : {},
    });
    assert.equal(session.ok, true, JSON.stringify(session));
    return {
      rawToken: session.rawToken,
      cookie: `${COOKIE_ACTIVECLINIC_ORG}=${session.rawToken}`,
    };
  }

  const live = await mintSession();
  return {
    stamp,
    slug: provisioned.slug,
    organizationId: provisioned.organizationId,
    facilityId,
    hcoId,
    cookie: live.cookie,
    rawToken: live.rawToken,
    mintSession,
  };
}

async function provisionBb() {
  const stamp = uniq("msb");
  const orgKey = `bbms${String(stamp).replace(/[^a-z0-9]/gi, "")}`.slice(0, 24);
  const host = `${orgKey}.blessboard.org`;
  const displayName = `MutSec Church ${stamp}`;
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
  const email = `hq-${stamp}@bbmutsec.smoke`;
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

  async function mintSession() {
    const session = await createV5Session(pool, {
      deploymentCode: "blessboard-org-staging",
      userId: created.user.id,
      organizationId,
      churchId: church.records.church.id,
      branchId: church.records.hqBranch.id,
    });
    assert.equal(session.ok, true, session.code || JSON.stringify(session));
    return {
      rawToken: session.rawToken,
      cookie: `${DEFAULT_V5_COOKIE}=${session.rawToken}`,
    };
  }

  const live = await mintSession();
  return {
    stamp,
    orgKey,
    host,
    churchId: church.records.church.id,
    displayName,
    cookie: live.cookie,
    rawToken: live.rawToken,
    mintSession,
  };
}

describe("V2.05 Admin Console mutation security matrix", () => {
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

  it("AC mutations: people-staff, access, settings, media", async () => {
    requireDb();
    const ac = await provisionAc();
    const app = createActiveClinicFoundationApp({
      getPool: () => pool,
      env: { ...MINIMAL_AC, DATABASE_URL: databaseUrl },
      log: () => {},
    });

    // --- people-staff: POST /app/staff ---
    {
      const phone = nextPhone();
      const firstName = `SecStaff${ac.stamp}`;
      const bodyBase = {
        first_name: firstName,
        last_name: "Nurse",
        phone,
        employment_type: "permanent",
        job_title: "Nurse",
        facility_ids: [ac.facilityId],
        primary_facility_id: ac.facilityId,
        role_keys: [STAFF_ROLE],
        role_scope: "facility",
        role_facility_id: ac.facilityId,
        issue_invitation: "1",
      };
      const probe = async () => {
        const r = await pool.query(
          `SELECT COUNT(*)::int AS n FROM activeclinic.staff_members
            WHERE organization_id = $1 AND phone_normalized = $2`,
          [ac.organizationId, phone]
        );
        return r.rows[0].n;
      };
      await runSecurityCases({
        mutationKey: "people-staff",
        probe,
        sendMissingCsrf: () =>
          request(app)
            .post("/app/staff")
            .set("Host", AC_HOST)
            .set("Cookie", ac.cookie)
            .type("form")
            .send(bodyBase),
        sendInvalidCsrf: () => {
          const bad = issueMismatchedCsrfPair(MINIMAL_AC, ac.cookie, "ac");
          return request(app)
            .post("/app/staff")
            .set("Host", AC_HOST)
            .set("Cookie", bad.cookie)
            .type("form")
            .send({ ...bodyBase, [CSRF_FIELD]: bad.token });
        },
        sendExpiredSession: async () => {
          const expired = await ac.mintSession();
          await expireDeploymentSession(pool, expired.rawToken);
          const pair = issueAcCsrfPair(MINIMAL_AC, expired.cookie);
          return request(app)
            .post("/app/staff")
            .set("Host", AC_HOST)
            .set("Cookie", pair.cookie)
            .type("form")
            .send({ ...bodyBase, [CSRF_FIELD]: pair.token });
        },
        sendValid: () => {
          const pair = issueAcCsrfPair(MINIMAL_AC, ac.cookie);
          return request(app)
            .post("/app/staff")
            .set("Host", AC_HOST)
            .set("Cookie", pair.cookie)
            .type("form")
            .send({ ...bodyBase, [CSRF_FIELD]: pair.token });
        },
        assertSuccess: async (res, before) => {
          assert.ok([200, 303].includes(res.status), `staff invite ${res.status}`);
          assert.ok((await probe()) > before, "staff row created");
        },
      });
    }

    // --- access: POST /app/access/staff/:id/roles ---
    {
      const targetPhone = nextPhone();
      const staff = await createStaffMember(pool, {
        organizationId: ac.organizationId,
        healthcareOrganizationId: ac.hcoId,
        firstName: "Access",
        lastName: ac.stamp,
        employmentType: "permanent",
        status: "active",
        phone: targetPhone,
        jobTitle: "Access Target",
      });
      assert.equal(staff.ok, true, JSON.stringify(staff));
      await assignStaffToFacility(pool, {
        organizationId: ac.organizationId,
        staffMemberId: staff.staffMember.id,
        facilityId: ac.facilityId,
        isPrimary: true,
      });
      const staffId = staff.staffMember.id;
      const bodyBase = {
        role_key: FACILITY_ADMIN,
        scope_type: "facility",
        facility_id: ac.facilityId,
      };
      const probe = async () => {
        const r = await pool.query(
          `SELECT COUNT(*)::int AS n
             FROM activeclinic.staff_role_assignments sra
             JOIN blessboard.roles r ON r.id = sra.role_id
            WHERE sra.organization_id = $1
              AND sra.staff_member_id = $2
              AND r.role_key = $3
              AND sra.status = 'active'
              AND sra.revoked_at IS NULL`,
          [ac.organizationId, staffId, FACILITY_ADMIN]
        );
        return r.rows[0].n;
      };
      await runSecurityCases({
        mutationKey: "access",
        probe,
        sendMissingCsrf: () =>
          request(app)
            .post(`/app/access/staff/${staffId}/roles`)
            .set("Host", AC_HOST)
            .set("Cookie", ac.cookie)
            .type("form")
            .send(bodyBase),
        sendInvalidCsrf: () => {
          const bad = issueMismatchedCsrfPair(MINIMAL_AC, ac.cookie, "ac");
          return request(app)
            .post(`/app/access/staff/${staffId}/roles`)
            .set("Host", AC_HOST)
            .set("Cookie", bad.cookie)
            .type("form")
            .send({ ...bodyBase, [CSRF_FIELD]: bad.token });
        },
        sendExpiredSession: async () => {
          const expired = await ac.mintSession();
          await expireDeploymentSession(pool, expired.rawToken);
          const pair = issueAcCsrfPair(MINIMAL_AC, expired.cookie);
          return request(app)
            .post(`/app/access/staff/${staffId}/roles`)
            .set("Host", AC_HOST)
            .set("Cookie", pair.cookie)
            .type("form")
            .send({ ...bodyBase, [CSRF_FIELD]: pair.token });
        },
        sendValid: () => {
          const pair = issueAcCsrfPair(MINIMAL_AC, ac.cookie);
          return request(app)
            .post(`/app/access/staff/${staffId}/roles`)
            .set("Host", AC_HOST)
            .set("Cookie", pair.cookie)
            .type("form")
            .send({ ...bodyBase, [CSRF_FIELD]: pair.token });
        },
        assertSuccess: async (res, before) => {
          assert.ok(
            [200, 303].includes(res.status) || String(res.headers.location || "").includes("ok=1"),
            `access assign ${res.status}`
          );
          assert.ok((await probe()) > before, "role assignment created");
        },
      });
    }

    // --- settings: POST /app/settings/organization ---
    {
      const newName = `MutSec Persisted ${ac.stamp}`;
      const bodyBase = {
        public_name: newName,
        legal_name: `${ac.stamp} Legal`,
        organization_type: "private_healthcare",
        country_code: "ZM",
        timezone: "Africa/Lusaka",
      };
      const probe = async () => {
        const r = await pool.query(
          `SELECT public_name FROM activeclinic.healthcare_organizations WHERE id = $1`,
          [ac.hcoId]
        );
        return r.rows[0] && r.rows[0].public_name;
      };
      await runSecurityCases({
        mutationKey: "settings",
        probe,
        sendMissingCsrf: () =>
          request(app)
            .post("/app/settings/organization")
            .set("Host", AC_HOST)
            .set("Cookie", ac.cookie)
            .type("form")
            .send(bodyBase),
        sendInvalidCsrf: () => {
          const bad = issueMismatchedCsrfPair(MINIMAL_AC, ac.cookie, "ac");
          return request(app)
            .post("/app/settings/organization")
            .set("Host", AC_HOST)
            .set("Cookie", bad.cookie)
            .type("form")
            .send({ ...bodyBase, [CSRF_FIELD]: bad.token });
        },
        sendExpiredSession: async () => {
          const expired = await ac.mintSession();
          await expireDeploymentSession(pool, expired.rawToken);
          const pair = issueAcCsrfPair(MINIMAL_AC, expired.cookie);
          return request(app)
            .post("/app/settings/organization")
            .set("Host", AC_HOST)
            .set("Cookie", pair.cookie)
            .type("form")
            .send({ ...bodyBase, [CSRF_FIELD]: pair.token });
        },
        sendValid: () => {
          const pair = issueAcCsrfPair(MINIMAL_AC, ac.cookie);
          return request(app)
            .post("/app/settings/organization")
            .set("Host", AC_HOST)
            .set("Cookie", pair.cookie)
            .type("form")
            .send({ ...bodyBase, [CSRF_FIELD]: pair.token });
        },
        assertSuccess: async (res, before) => {
          assert.equal(res.status, 303);
          assert.notEqual(await probe(), before);
          assert.equal(await probe(), newName);
        },
      });
    }

    // --- media: POST /clinics/:slug/website/media ---
    {
      const probe = async () => {
        const r = await pool.query(
          `SELECT COUNT(*)::int AS n FROM platform.website_media
            WHERE organization_id = $1 AND status = 'active'`,
          [ac.organizationId]
        );
        return r.rows[0].n;
      };
      await runSecurityCases({
        mutationKey: "media",
        probe,
        sendMissingCsrf: () =>
          request(app)
            .post(`/clinics/${ac.slug}/website/media`)
            .set("Host", AC_HOST)
            .set("Cookie", ac.cookie)
            .field("altText", `missing-${ac.stamp}`)
            .attach("file", TINY_PNG, {
              filename: `miss-${ac.stamp}.png`,
              contentType: "image/png",
            }),
        sendInvalidCsrf: () => {
          const bad = issueMismatchedCsrfPair(MINIMAL_AC, ac.cookie, "ac");
          return request(app)
            .post(`/clinics/${ac.slug}/website/media`)
            .set("Host", AC_HOST)
            .set("Cookie", bad.cookie)
            .field(CSRF_FIELD, bad.token)
            .field("altText", `invalid-${ac.stamp}`)
            .attach("file", TINY_PNG, {
              filename: `bad-${ac.stamp}.png`,
              contentType: "image/png",
            });
        },
        sendExpiredSession: async () => {
          const expired = await ac.mintSession();
          await expireDeploymentSession(pool, expired.rawToken);
          const pair = issueAcCsrfPair(MINIMAL_AC, expired.cookie);
          return request(app)
            .post(`/clinics/${ac.slug}/website/media`)
            .set("Host", AC_HOST)
            .set("Cookie", pair.cookie)
            .field(CSRF_FIELD, pair.token)
            .field("altText", `expired-${ac.stamp}`)
            .attach("file", TINY_PNG, {
              filename: `exp-${ac.stamp}.png`,
              contentType: "image/png",
            });
        },
        sendValid: () => {
          const pair = issueAcCsrfPair(MINIMAL_AC, ac.cookie);
          return request(app)
            .post(`/clinics/${ac.slug}/website/media`)
            .set("Host", AC_HOST)
            .set("Cookie", pair.cookie)
            .field(CSRF_FIELD, pair.token)
            .field("altText", `ok-${ac.stamp}`)
            .attach("file", TINY_PNG, {
              filename: `ok-${ac.stamp}.png`,
              contentType: "image/png",
            });
        },
        assertSuccess: async (res, before) => {
          assert.equal(res.status, 200, res.text && res.text.slice(0, 200));
          const body = typeof res.body === "object" && res.body ? res.body : JSON.parse(res.text);
          assert.equal(body.ok, true, res.text);
          assert.ok((await probe()) > before, "media row created");
        },
      });
    }
  });

  it("BB mutation: location-branch POST /hq/branches", async () => {
    requireDb();
    const bb = await provisionBb();
    const app = createV5FoundationApp({
      getPool: () => pool,
      env: { ...MINIMAL_BB, DATABASE_URL: databaseUrl },
      log: () => {},
    });
    const branchKey = `sec-${bb.stamp}`.slice(0, 32);
    const bodyBase = {
      displayName: `Security Branch ${bb.stamp}`,
      branchKey,
      email: `branch-${bb.stamp}@example.org`,
      timezone: "Africa/Lusaka",
      countryCode: "ZM",
      addressLine1: "1 Independence Ave",
      city: "Lusaka",
    };
    const probe = async () => {
      const r = await pool.query(
        `SELECT COUNT(*)::int AS n FROM blessboard.branches
          WHERE church_id = $1 AND branch_key = $2`,
        [bb.churchId, branchKey]
      );
      return r.rows[0].n;
    };
    const formGet = await request(app)
      .get("/hq/branches/new")
      .set("Host", bb.host)
      .set("Cookie", bb.cookie);
    assertNoServerError(formGet, "BB GET branches/new");
    assert.equal(formGet.status, 200);

    await runSecurityCases({
      mutationKey: "location-branch",
      probe,
      sendMissingCsrf: () =>
        request(app)
          .post("/hq/branches")
          .set("Host", bb.host)
          .set("Cookie", bb.cookie)
          .type("form")
          .send(bodyBase),
      sendInvalidCsrf: () => {
        const bad = issueMismatchedCsrfPair(MINIMAL_BB, bb.cookie, "bb");
        return request(app)
          .post("/hq/branches")
          .set("Host", bb.host)
          .set("Cookie", bad.cookie)
          .type("form")
          .send({ ...bodyBase, [CSRF_FIELD]: bad.token });
      },
      sendExpiredSession: async () => {
        const expired = await bb.mintSession();
        await expireDeploymentSession(pool, expired.rawToken);
        const pair = issueBbCsrfPair(MINIMAL_BB, expired.cookie, formGet);
        return request(app)
          .post("/hq/branches")
          .set("Host", bb.host)
          .set("Cookie", pair.cookie)
          .type("form")
          .send({ ...bodyBase, [CSRF_FIELD]: pair.token });
      },
      sendValid: () => {
        const pair = issueBbCsrfPair(MINIMAL_BB, bb.cookie, formGet);
        return request(app)
          .post("/hq/branches")
          .set("Host", bb.host)
          .set("Cookie", pair.cookie)
          .type("form")
          .send({ ...bodyBase, [CSRF_FIELD]: pair.token });
      },
      assertSuccess: async (res, before) => {
        assert.equal(res.status, 303, res.text && String(res.text).slice(0, 200));
        assert.match(String(res.headers.location || ""), new RegExp(branchKey));
        assert.ok((await probe()) > before, "branch row created");
      },
    });
  });

  it("reports MUTATIONS/PASS/FAIL for FINALs", () => {
    if (skipReason) return;
    for (const key of MUTATIONS) {
      assert.equal(
        mutationResults[key],
        "PASS",
        `mutation ${key}=${mutationResults[key]}`
      );
    }
    assert.ok(passCount >= MUTATIONS.length * 4, `PASS=${passCount}`);
    assert.equal(failCount, 0, `FAIL=${failCount}`);
    // eslint-disable-next-line no-console
    console.log(
      `ADMIN_CONSOLE_SECURITY_MATRIX MUTATIONS=${MUTATIONS.join(",")} PASS=${passCount} FAIL=${failCount}`
    );
  });
});
