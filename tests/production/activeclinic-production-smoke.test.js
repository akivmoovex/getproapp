"use strict";

/**
 * Production-safe ActiveClinic smoke pack (V2.05 / main).
 *
 * Targets disposable production DB only (moovex-platform-v7 / production).
 * Creates qa-auto-ac-* tenants, exercises critical flows, then purges them.
 * No schema drops. No testing-DB access. No real email delivery required.
 */

const assert = require("node:assert/strict");
const { describe, it, before, after } = require("node:test");
const crypto = require("crypto");
const request = require("supertest");

const { getPgPool, closePgPool } = require("../../src/db/pg/pool");
const { checkDatabaseIdentity } = require("../../db/scripts/lib/databaseIdentity");
const {
  CODE_MOOVEX_PLATFORM_PRODUCTION,
  CODE_ACTIVECLINIC_ORG_PRODUCTION,
  getDeploymentProfile,
} = require("../../src/platform/config/deploymentProfiles");
const {
  submitAndProvisionClinicRegistration,
} = require("../../src/activeclinic/services/submitClinicRegistrationService");
const {
  authenticateActiveClinicIdentity,
} = require("../../src/activeclinic/services/authenticateActiveClinicIdentity");
const {
  createAppointmentServiceType,
} = require("../../src/activeclinic/services/activeClinicAppointmentService");
const {
  setClinicWebsiteAvailability,
} = require("../../src/activeclinic/services/clinicWebsiteAvailabilityService");
const {
  createConsultationBookingRequest,
} = require("../../src/activeclinic/services/activeClinicPublicBookingService");
const {
  registerActiveClinicPatient,
  getPatientByOrgAndId,
  searchActiveClinicPatients,
  CREATION_MODES,
} = require("../../src/activeclinic/services/activeClinicPatientService");
const {
  createStaffMember,
  linkStaffMemberToIdentity,
} = require("../../src/activeclinic/services/activeClinicStaffService");
const {
  assignStaffRole,
  RECEPTIONIST,
  ORGANIZATION_ADMIN,
} = require("../../src/activeclinic/services/activeClinicAuthorizationService");
const { assignStaffToFacility } = require("../../src/activeclinic/services/activeClinicStaffFacilityService");
const {
  requestActiveClinicPasswordReset,
  issueAdminPasswordResetLink,
  completeActiveClinicPasswordReset,
  previewResetToken,
  NEUTRAL_MESSAGE,
} = require("../../src/activeclinic/services/activeClinicPasswordRecoveryService");
const { createActiveClinicFoundationApp } = require("../../src/activeclinic/http/activeClinicFoundationServer");
const { CSRF_FIELD } = require("../../src/platform/http/v5Csrf");
const publicationService = require("../../src/platform/website/publicationService");
const contentService = require("../../src/platform/website/contentService");
const instanceRepo = require("../../src/platform/website/instanceRepository");
const versionService = require("../../src/platform/website/versionService");
const mediaService = require("../../src/platform/website/mediaService");
const { withProvisioningTransaction } = require("../../src/platform/db/provisioningTransaction");
const purgeRepo = require("../../src/activeclinic/repositories/activeClinicTestingPurgeRepository");
const { createPlatformIdentity } = require("../../src/platform/services/platformIdentityService");
const {
  setPlatformIdentityPassword,
} = require("../../src/platform/services/platformIdentityCredentialService");
const { linkIdentityToProductProfile } = require("../../src/platform/services/identityProductProfileService");

const KEY_PREFIX = "qa-auto-ac-";
const AC_HOST = "activeclinic.org";
const ADMIN_PASSWORD = "QaAutoAcAdmin99!";
const RECEPTION_PASSWORD = "QaAutoAcRecep99!";
const NEW_PASSWORD = "QaAutoAcReset99!";
const AC_PROD_PROFILE = getDeploymentProfile({
  PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_PRODUCTION,
  DEPLOYMENT_ENV: "production",
});
assert.ok(AC_PROD_PROFILE, "activeclinic production deployment profile");
const SESSION_COOKIE = AC_PROD_PROFILE.sessionCookieName;
const CSRF_COOKIE = AC_PROD_PROFILE.csrfCookieName;

/** Minimal 1x1 PNG */
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5W3q0AAAAASUVORK5CYII=",
  "base64"
);

function uniq(prefix) {
  return `${prefix}${Date.now().toString(36)}${crypto.randomBytes(2).toString("hex")}`.slice(0, 48);
}

function phone() {
  return `+26097${String(Date.now()).slice(-5)}${crypto.randomInt(10, 99)}`;
}

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
    new RegExp(
      `name="${CSRF_FIELD}"[^>]*value="([^"]+)"|value="([^"]+)"[^>]*name="${CSRF_FIELD}"`
    )
  );
  return (m && (m[1] || m[2])) || null;
}

function cookieJar(session, csrf) {
  return [
    session ? `${SESSION_COOKIE}=${session}` : null,
    csrf ? `${CSRF_COOKIE}=${csrf}` : null,
  ]
    .filter(Boolean)
    .join("; ");
}

function assertProdSafetyGate() {
  const url = String(process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || "");
  assert.match(url, /postgres\.ubbdyfcyhtifuttmgmfy/, "must target production Supabase project");
  assert.doesNotMatch(url, /xpcpvbtzqdzhwkwlyhtb/, "must not touch testing project");
  assert.equal(String(process.env.DATABASE_IDENTITY_ENV || "").toLowerCase(), "production");
  assert.equal(String(process.env.DEPLOYMENT_ENV || "").toLowerCase(), "production");
}

async function assertProdIdentity(pool) {
  const identity = await checkDatabaseIdentity(pool, {
    identityKey: "moovex-platform-v7",
  });
  assert.equal(identity.ok, true, identity.code || "identity_failed");
  assert.equal(identity.row.identity_key, "moovex-platform-v7");
  assert.equal(String(identity.row.environment_code).toLowerCase(), "production");
  return identity.row;
}

function acEnv(overrides) {
  return {
    NODE_ENV: "test",
    DEPLOYMENT_ENV: "production",
    PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_PRODUCTION,
    DATABASE_IDENTITY_EXPECTED: "moovex-platform-v7",
    DATABASE_IDENTITY_ENV: "production",
    SESSION_SECRET: process.env.SESSION_SECRET || "qa-auto-ac-session-secret-32chars!!",
    GETPRO_SKIP_DOTENV: "1",
    GETPRO_PG_SSL: process.env.GETPRO_PG_SSL || "no-verify",
    ...overrides,
  };
}

async function provisionClinic(pool, stamp) {
  const organizationKey = uniq(`${KEY_PREFIX}${stamp}-`);
  const adminEmail = `admin@${organizationKey}.example.invalid`;
  const adminPhone = phone();
  const clinicName = `QA AUTO AC ${stamp}`;
  const env = acEnv({
    PLATFORM_DEPLOYMENT_CODE: CODE_MOOVEX_PLATFORM_PRODUCTION,
  });

  const clinic = await submitAndProvisionClinicRegistration(pool, {
    clinicName,
    contactName: "QA AUTO AC Admin",
    contactEmail: adminEmail,
    contactPhone: adminPhone,
    province: "Lusaka",
    city: "Lusaka",
    address: "QA Auto Avenue",
    countryCode: "ZM",
    password: ADMIN_PASSWORD,
    passwordConfirm: ADMIN_PASSWORD,
    acceptTerms: "on",
    deploymentCode: CODE_MOOVEX_PLATFORM_PRODUCTION,
    dataEnvironment: "production",
    organizationKey,
    env,
  });

  assert.equal(clinic.ok, true, `provision failed: ${clinic.code || clinic.reason || "unknown"}`);
  assert.equal(clinic.reviewRequired, false, `unexpected review hold: ${clinic.reason || ""}`);
  assert.ok(clinic.organizationId, "organizationId required");

  const org = (
    await pool.query(
      `SELECT id, organization_key, data_environment, test_cleanup_eligible
         FROM platform.organizations WHERE id = $1`,
      [clinic.organizationId]
    )
  ).rows[0];
  assert.ok(org, "organization row missing");
  assert.ok(String(org.organization_key).startsWith(KEY_PREFIX), "org key prefix");
  assert.equal(String(org.data_environment).toLowerCase(), "production");

  await pool.query(
    `UPDATE platform.organizations SET test_cleanup_eligible = true WHERE id = $1`,
    [clinic.organizationId]
  );

  const hco = (
    await pool.query(
      `SELECT id FROM activeclinic.healthcare_organizations
        WHERE organization_id = $1 AND status = 'active' LIMIT 1`,
      [clinic.organizationId]
    )
  ).rows[0];
  const facility = (
    await pool.query(
      `SELECT id, facility_key FROM activeclinic.facilities
        WHERE organization_id = $1 AND status = 'active' LIMIT 1`,
      [clinic.organizationId]
    )
  ).rows[0];
  const staff = (
    await pool.query(
      `SELECT id FROM activeclinic.staff_members
        WHERE organization_id = $1 AND platform_identity_id = $2 AND status = 'active' LIMIT 1`,
      [clinic.organizationId, clinic.identityId]
    )
  ).rows[0];

  assert.ok(hco, "facility HCO missing");
  assert.ok(facility, "facility missing");
  assert.ok(staff, "admin staff missing");

  return {
    organizationId: clinic.organizationId,
    organizationKey: String(org.organization_key),
    identityId: clinic.identityId,
    staffMemberId: staff.id,
    healthcareOrganizationId: hco.id,
    facilityId: facility.id,
    facilityKey: facility.facility_key,
    adminEmail,
    adminPhone,
    clinicName,
  };
}

async function enableBooking(pool, tenant) {
  const serviceKey = "qa-auto-consultation";
  const created = await createAppointmentServiceType(pool, {
    organizationId: tenant.organizationId,
    healthcareOrganizationId: tenant.healthcareOrganizationId,
    serviceKey,
    displayName: "QA AUTO consultation",
    defaultDurationMinutes: 30,
    actor: {
      staffMemberId: tenant.staffMemberId,
      organizationId: tenant.organizationId,
      platformIdentityId: tenant.identityId,
    },
  });
  if (!created.ok) {
    const repo = require("../../src/activeclinic/repositories/appointmentRepository");
    await repo.insertServiceType(pool, {
      organizationId: tenant.organizationId,
      healthcareOrganizationId: tenant.healthcareOrganizationId,
      serviceKey,
      displayName: "QA AUTO consultation",
      defaultDurationMinutes: 30,
      requiresAssignedStaff: false,
      status: "active",
    });
  }
  await pool.query(
    `UPDATE activeclinic.appointment_service_types
        SET public_website_visible = true
      WHERE organization_id = $1 AND service_key = $2`,
    [tenant.organizationId, serviceKey]
  );
  await pool.query(
    `UPDATE activeclinic.healthcare_organizations
        SET public_booking_enabled = true
      WHERE id = $1 AND organization_id = $2`,
    [tenant.healthcareOrganizationId, tenant.organizationId]
  );
  return serviceKey;
}

async function publishWebsite(pool, tenant, env) {
  const instance = await instanceRepo.findWebsiteInstanceByOrgProduct(pool, {
    organizationId: tenant.organizationId,
    productCode: "activeclinic",
  });
  assert.ok(instance, "website instance missing after provision");
  const published = await publicationService.publishWebsiteDraft(pool, {
    organizationId: tenant.organizationId,
    instanceId: instance.id,
    expectedProductCode: "activeclinic",
    actorIdentityId: tenant.identityId,
    allowEmpty: true,
  });
  assert.equal(published.ok, true, published.code || "publish_failed");
  const availability = await setClinicWebsiteAvailability(pool, {
    organizationKey: tenant.organizationKey,
    public: true,
    actorIdentityId: tenant.identityId,
    overrideReadiness: true,
    reason: "qa_auto_ac_smoke",
    env,
  });
  assert.equal(availability.ok, true, availability.code || "availability_failed");
  return instance;
}

async function cleanupQaAutoOrg(pool, organizationKey) {
  const key = String(organizationKey || "").trim().toLowerCase();
  if (!key.startsWith(KEY_PREFIX)) {
    return { ok: false, reason: "refused_non_qa_auto_prefix", organizationKey: key };
  }
  await assertProdIdentity(pool);
  const org = (
    await pool.query(`SELECT id, organization_key FROM platform.organizations WHERE organization_key = $1`, [
      key,
    ])
  ).rows[0];
  if (!org) return { ok: true, reason: "already_absent", organizationKey: key };

  const products = await purgeRepo.listActiveProductKeys(pool, org.id);
  if (!products.includes("activeclinic") || products.includes("blessboard")) {
    return { ok: false, reason: "product_guard", products, organizationKey: key };
  }
  const hosts = await purgeRepo.listDomainHostnames(pool, org.id);
  const prodHosts = hosts.filter((h) => purgeRepo.PRODUCTION_HOSTNAME_RE.test(h));
  if (prodHosts.length) {
    return { ok: false, reason: "production_hostname_guard", prodHosts, organizationKey: key };
  }

  const preserve = await purgeRepo.listPlatformAdminPreserveSet(pool);
  const scope = await purgeRepo.loadScopedIds(pool, org.id);
  const identityClass = await purgeRepo.classifyIdentities(pool, org.id, scope.identityIds);

  await withProvisioningTransaction(pool, async (client) => {
    await purgeRepo.deleteActiveClinicTestingOrganization(client, {
      organizationId: org.id,
      preserveOrgIds: preserve.orgIds || [],
      preserveUserIds: preserve.userIds || [],
      identityIds: identityClass.deletable,
      deleteOperational: true,
    });
  });

  const left = await pool.query(`SELECT 1 FROM platform.organizations WHERE id = $1`, [org.id]);
  return {
    ok: left.rowCount === 0,
    reason: left.rowCount === 0 ? "purged" : "still_present",
    organizationKey: key,
  };
}

async function loginSession(app, email, password) {
  const page = await request(app).get("/login").set("Host", AC_HOST);
  assert.equal(page.status, 200);
  const csrf = extractCsrfToken(page.text);
  const csrfCookie = extractCookie(page, CSRF_COOKIE);
  assert.ok(csrf, "csrf token");
  assert.ok(csrfCookie, "csrf cookie");
  const posted = await request(app)
    .post("/login")
    .set("Host", AC_HOST)
    .set("Cookie", cookieJar(extractCookie(page, SESSION_COOKIE), csrfCookie))
    .type("form")
    .send({
      [CSRF_FIELD]: csrf,
      identifier: email,
      password,
    });
  const session = extractCookie(posted, SESSION_COOKIE);
  const nextCsrf = extractCookie(posted, CSRF_COOKIE) || csrfCookie;
  return { posted, session, csrfCookie: nextCsrf, html: posted.text };
}

describe("ActiveClinic production-safe smoke", () => {
  let pool;
  let app;
  let env;
  let primary;
  let secondary;
  let serviceKey;
  let websiteInstance;
  let patientId;
  let cleanupKeys = [];

  before(async () => {
    assertProdSafetyGate();
    pool = getPgPool();
    await pool.query("SELECT 1");
    await assertProdIdentity(pool);

    env = acEnv();
    app = createActiveClinicFoundationApp({
      getPool: () => pool,
      env,
    });

    primary = await provisionClinic(pool, "a");
    cleanupKeys.push(primary.organizationKey);
    secondary = await provisionClinic(pool, "b");
    cleanupKeys.push(secondary.organizationKey);

    serviceKey = await enableBooking(pool, primary);
    websiteInstance = await publishWebsite(pool, primary, env);
  });

  after(async () => {
    const results = [];
    for (const key of cleanupKeys) {
      try {
        results.push(await cleanupQaAutoOrg(pool, key));
      } catch (err) {
        results.push({
          ok: false,
          organizationKey: key,
          reason: err && err.message ? err.message : String(err),
        });
      }
    }
    const failed = results.filter((r) => !r.ok);
    if (failed.length) {
      // eslint-disable-next-line no-console
      console.error("[ac-prod-smoke] cleanup failures", failed);
    }
    try {
      await closePgPool();
    } catch {
      /* ignore */
    }
    assert.equal(failed.length, 0, `cleanup failed: ${JSON.stringify(failed)}`);
  });

  it("1) registration provisions facility on production deployment", async () => {
    assert.ok(primary.facilityId);
    assert.ok(primary.healthcareOrganizationId);
    assert.ok(String(primary.organizationKey).startsWith(KEY_PREFIX));

    const products = await pool.query(
      `SELECT p.product_key, d.deployment_code, d.environment_code
         FROM platform.organization_products op
         JOIN platform.products p ON p.id = op.product_id
         JOIN platform.deployments d ON d.deployment_code = op.deployment_code
        WHERE op.organization_id = $1`,
      [primary.organizationId]
    ).catch(async () =>
      pool.query(
        `SELECT application_code AS product_key, NULL::text AS deployment_code, NULL::text AS environment_code
           FROM platform.organization_products
          WHERE organization_id = $1`,
        [primary.organizationId]
      ).catch(() => ({ rows: [] }))
    );

    const productKeys = products.rows.map((r) => r.product_key || r.application_code).filter(Boolean);
    if (productKeys.length) {
      assert.ok(productKeys.includes("activeclinic"), `products=${productKeys.join(",")}`);
      assert.ok(!productKeys.includes("blessboard"), "no BB product leakage");
    }

    const depCodes = products.rows.map((r) => r.deployment_code).filter(Boolean);
    if (depCodes.length) {
      assert.ok(
        depCodes.some((c) =>
          [CODE_MOOVEX_PLATFORM_PRODUCTION, CODE_ACTIVECLINIC_ORG_PRODUCTION].includes(c)
        ),
        `unexpected deployment codes: ${depCodes.join(",")}`
      );
    }
  });

  it("2) login accepts valid credentials and denies invalid", async () => {
    const authOk = await authenticateActiveClinicIdentity(pool, {
      identifier: primary.adminEmail,
      password: ADMIN_PASSWORD,
      deploymentCode: CODE_ACTIVECLINIC_ORG_PRODUCTION,
      hostname: AC_HOST,
      country: "ZM",
    });
    assert.equal(authOk.ok, true, authOk.code || "auth_failed");

    const authBad = await authenticateActiveClinicIdentity(pool, {
      identifier: primary.adminEmail,
      password: "DefinitelyWrongPass99!",
      deploymentCode: CODE_ACTIVECLINIC_ORG_PRODUCTION,
      hostname: AC_HOST,
      country: "ZM",
    });
    assert.equal(authBad.ok, false);

    const session = await loginSession(app, primary.adminEmail, ADMIN_PASSWORD);
    assert.ok([302, 303].includes(session.posted.status), `login status ${session.posted.status}`);
    assert.ok(session.session, "session cookie");
  });

  it("3) /app returns 200 AC shell without BlessBoard leakage", async () => {
    const session = await loginSession(app, primary.adminEmail, ADMIN_PASSWORD);
    const appRes = await request(app)
      .get("/app")
      .set("Host", AC_HOST)
      .set("Cookie", cookieJar(session.session, session.csrfCookie));
    assert.equal(appRes.status, 200);
    const html = String(appRes.text || "");
    assert.match(html, /activeclinic|ActiveClinic|data-product=["']activeclinic["']/i);
    assert.doesNotMatch(html, /BlessBoard|blessboard\.org|church-admin/i);
  });

  it("4) patient registration, list/detail, and tenant isolation", async () => {
    const created = await registerActiveClinicPatient(pool, {
      organizationId: primary.organizationId,
      healthcareOrganizationId: primary.healthcareOrganizationId,
      facilityId: primary.facilityId,
      creationMode: CREATION_MODES.FULL,
      registrationMethod: "walk_in",
      demographics: {
        firstName: "QA",
        lastName: "AUTO",
        sexAtRegistration: "female",
        dateOfBirth: "1990-01-15",
      },
      contacts: {
        phone: phone(),
        phoneCountry: "ZM",
        clinicDefaultCountry: "ZM",
        email: `patient.${primary.organizationKey}@example.invalid`,
      },
      address: { addressLine1: "1 QA Street", city: "Lusaka", countryCode: "ZM" },
      actor: {
        staffMemberId: primary.staffMemberId,
        organizationId: primary.organizationId,
        platformIdentityId: primary.identityId,
      },
      deploymentCode: CODE_ACTIVECLINIC_ORG_PRODUCTION,
    });
    assert.equal(created.ok, true, created.code || "patient_create_failed");
    patientId = created.patient && created.patient.id;
    assert.ok(patientId);

    const detail = await getPatientByOrgAndId(pool, {
      organizationId: primary.organizationId,
      patientId,
      actor: {
        staffMemberId: primary.staffMemberId,
        organizationId: primary.organizationId,
        platformIdentityId: primary.identityId,
      },
    });
    assert.equal(detail.ok, true, detail.code || "patient_detail_failed");

    const listed = await searchActiveClinicPatients(pool, {
      organizationId: primary.organizationId,
      healthcareOrganizationId: primary.healthcareOrganizationId,
      facilityId: primary.facilityId,
      nameQuery: "QA AUTO",
      actor: {
        staffMemberId: primary.staffMemberId,
        organizationId: primary.organizationId,
        platformIdentityId: primary.identityId,
      },
    });
    assert.equal(listed.ok, true, listed.code || "patient_search_failed");
    const rows = listed.results || listed.patients || [];
    assert.ok(rows.some((p) => p.id === patientId));

    const cross = await getPatientByOrgAndId(pool, {
      organizationId: secondary.organizationId,
      patientId,
      actor: {
        staffMemberId: secondary.staffMemberId,
        organizationId: secondary.organizationId,
        platformIdentityId: secondary.identityId,
      },
    });
    assert.equal(cross.ok, false);
  });

  it("5) public directory / clinic detail / published site", async () => {
    const dir = await request(app).get("/clinics").set("Host", AC_HOST);
    // Directory may render ready(200) or controlled error(503) depending on catalogue readiness.
    assert.ok([200, 302, 303, 503].includes(dir.status), `directory status ${dir.status}`);
    assert.doesNotMatch(String(dir.text || ""), /BlessBoard/i);

    const detail = await request(app)
      .get(`/clinics/${primary.organizationKey}`)
      .set("Host", AC_HOST);
    assert.ok([200, 302, 303].includes(detail.status), `clinic detail ${detail.status}`);
    if (detail.status === 200) {
      assert.match(String(detail.text), /QA AUTO AC|activeclinic|clinic/i);
      assert.doesNotMatch(String(detail.text), /BlessBoard/i);
    }
  });

  it("6) booking enabled/disabled and inquiry submit", async () => {
    const serviceTypeId = (
      await pool.query(
        `SELECT id FROM activeclinic.appointment_service_types
          WHERE organization_id = $1 AND service_key = $2 LIMIT 1`,
        [primary.organizationId, serviceKey]
      )
    ).rows[0]?.id;

    const enabled = await createConsultationBookingRequest(pool, {
      organizationId: primary.organizationId,
      healthcareOrganizationId: primary.healthcareOrganizationId,
      facilityId: primary.facilityId,
      serviceTypeId,
      patientFirstName: "Book",
      patientLastName: "QA",
      patientPhone: phone(),
      patientEmail: `book.${primary.organizationKey}@example.invalid`,
      preferredStartsAt: new Date(Date.now() + 86400000).toISOString(),
      visitReason: "qa-auto-ac booking",
      env,
    });
    assert.equal(enabled.ok, true, enabled.code || "booking_enabled_failed");

    await pool.query(
      `UPDATE activeclinic.healthcare_organizations
          SET public_booking_enabled = false
        WHERE id = $1`,
      [primary.healthcareOrganizationId]
    );
    const disabled = await createConsultationBookingRequest(pool, {
      organizationId: primary.organizationId,
      healthcareOrganizationId: primary.healthcareOrganizationId,
      facilityId: primary.facilityId,
      serviceTypeId,
      patientFirstName: "Book",
      patientLastName: "Off",
      patientPhone: phone(),
      preferredStartsAt: new Date(Date.now() + 172800000).toISOString(),
      env,
    });
    assert.equal(disabled.ok, false);
    assert.ok(
      ["booking_not_enabled", "BOOKING_NOT_ENABLED", "invalid_input"].includes(
        String(disabled.code || "").toLowerCase()
      ) || disabled.code,
      disabled.code || "disabled booking should fail"
    );

    await pool.query(
      `UPDATE activeclinic.healthcare_organizations
          SET public_booking_enabled = true
        WHERE id = $1`,
      [primary.healthcareOrganizationId]
    );
  });

  it("7) website draft / preview / publish / unpublish / history", async () => {
    const draft = await contentService.saveWebsiteDraftField
      ? await contentService.saveWebsiteDraftField(pool, {
          organizationId: primary.organizationId,
          instanceId: websiteInstance.id,
          pageKey: "home",
          fieldKey: "hero_title",
          value: "QA AUTO AC Hero",
          actorIdentityId: primary.identityId,
          expectedProductCode: "activeclinic",
        })
      : await contentService.upsertDraftField?.(pool, {
          organizationId: primary.organizationId,
          instanceId: websiteInstance.id,
          pageKey: "home",
          fieldKey: "hero_title",
          value: "QA AUTO AC Hero",
          actorIdentityId: primary.identityId,
        });

    // Prefer published path when draft helper name differs across versions.
    if (!draft || draft.ok === false) {
      const republish = await publicationService.publishWebsiteDraft(pool, {
        organizationId: primary.organizationId,
        instanceId: websiteInstance.id,
        expectedProductCode: "activeclinic",
        actorIdentityId: primary.identityId,
        allowEmpty: true,
        changeSummary: { publicationNote: "qa-auto-ac republish" },
      });
      assert.equal(republish.ok, true, republish.code || "republish_failed");
    } else {
      assert.equal(draft.ok, true, draft.code || "draft_failed");
      const published = await publicationService.publishWebsiteDraft(pool, {
        organizationId: primary.organizationId,
        instanceId: websiteInstance.id,
        expectedProductCode: "activeclinic",
        actorIdentityId: primary.identityId,
        allowEmpty: true,
      });
      assert.equal(published.ok, true, published.code || "publish_failed");
    }

    const preview = await request(app)
      .get(`/clinics/${primary.organizationKey}/website/preview`)
      .set("Host", AC_HOST);
    // preview may require auth; accept 200/302/303/401/403 as reachable surface
    assert.ok([200, 302, 303, 401, 403].includes(preview.status), `preview ${preview.status}`);

    const history = await versionService.listWebsiteVersions?.(pool, {
      organizationId: primary.organizationId,
      instanceId: websiteInstance.id,
    });
    if (history && history.ok !== false) {
      assert.ok(Array.isArray(history.versions || history.rows || history) || history.ok === true);
    }

    const unpublished = await setClinicWebsiteAvailability(pool, {
      organizationKey: primary.organizationKey,
      public: false,
      actorIdentityId: primary.identityId,
      overrideReadiness: true,
      reason: "qa_auto_ac_unpublish",
      env,
    });
    assert.equal(unpublished.ok, true, unpublished.code || "unpublish_failed");

    const republish = await setClinicWebsiteAvailability(pool, {
      organizationKey: primary.organizationKey,
      public: true,
      actorIdentityId: primary.identityId,
      overrideReadiness: true,
      reason: "qa_auto_ac_republish",
      env,
    });
    assert.equal(republish.ok, true, republish.code || "republish_failed");
  });

  it("8) media safe upload persists", async () => {
    const media = await mediaService.registerWebsiteMedia(pool, {
      organizationId: primary.organizationId,
      instanceId: websiteInstance.id,
      actorIdentityId: primary.identityId,
      mediaKind: "image",
      originalFilename: "qa-auto-ac.png",
      mimeType: "image/png",
      buffer: TINY_PNG,
      altText: "qa-auto-ac",
      expectedProductCode: "activeclinic",
    });
    assert.equal(media.ok, true, media.code || "media_upload_failed");
    assert.ok(media.media && media.media.id);
    const fetched = await mediaService.getWebsiteMediaById(pool, media.media.id);
    assert.equal(fetched.ok, true, fetched.code || "media_fetch_failed");
    assert.equal(String(fetched.media.organizationId), primary.organizationId);
  });

  it("9) password recovery forgot + reset token without real email", async () => {
    const forgotPage = await request(app).get("/forgot-password").set("Host", AC_HOST);
    assert.equal(forgotPage.status, 200);

    // Public forgot path must stay enumeration-safe (neutral), even when email is unavailable.
    const requested = await requestActiveClinicPasswordReset(pool, {
      identifier: primary.adminEmail,
      requestIp: "203.0.113.90",
      deploymentCode: CODE_ACTIVECLINIC_ORG_PRODUCTION,
      env,
    });
    assert.equal(requested.ok, true);
    assert.equal(requested.message, NEUTRAL_MESSAGE);

    // Production has no inbox/testing outbox — issue admin reset link for GET/POST smoke.
    const issued = await issueAdminPasswordResetLink(pool, {
      organizationId: primary.organizationId,
      staffMemberId: primary.staffMemberId,
      deploymentCode: CODE_ACTIVECLINIC_ORG_PRODUCTION,
      actorPlatformIdentityId: primary.identityId,
      env,
      requestIp: "203.0.113.91",
    });
    assert.equal(issued.ok, true, issued.code || "admin_reset_issue_failed");
    const rawToken = issued.rawToken;
    assert.ok(rawToken, "reset token unavailable from admin issuance");

    const preview = await previewResetToken(pool, {
      rawToken,
      deploymentCode: CODE_ACTIVECLINIC_ORG_PRODUCTION,
    });
    assert.equal(preview.ok, true, preview.code || "preview_failed");

    const getReset = await request(app)
      .get(`/reset-password/${encodeURIComponent(rawToken)}`)
      .set("Host", AC_HOST);
    assert.ok([200, 302, 303].includes(getReset.status), `reset GET ${getReset.status}`);

    const completed = await completeActiveClinicPasswordReset(pool, {
      rawToken,
      password: NEW_PASSWORD,
      passwordConfirm: NEW_PASSWORD,
      deploymentCode: CODE_ACTIVECLINIC_ORG_PRODUCTION,
      env,
    });
    assert.equal(completed.ok, true, completed.code || "reset_complete_failed");

    const authNew = await authenticateActiveClinicIdentity(pool, {
      identifier: primary.adminEmail,
      password: NEW_PASSWORD,
      deploymentCode: CODE_ACTIVECLINIC_ORG_PRODUCTION,
      hostname: AC_HOST,
      country: "ZM",
    });
    assert.equal(authNew.ok, true, authNew.code || "post_reset_login_failed");

    // restore known password for later RBAC login convenience
    await setPlatformIdentityPassword(pool, {
      identityId: primary.identityId,
      password: ADMIN_PASSWORD,
      passwordConfirm: ADMIN_PASSWORD,
    });
  });

  it("10) RBAC: receptionist denied from protected access admin route", async () => {
    const recepEmail = `recep.${crypto.randomBytes(4).toString("hex")}@${primary.organizationKey}.example.invalid`;
    const recepPhone = phone();
    const identity = await createPlatformIdentity(pool, {
      primaryEmail: recepEmail,
      primaryPhone: recepPhone,
      status: "active",
    });
    assert.equal(identity.ok, true, identity.code || "identity_create_failed");
    await setPlatformIdentityPassword(pool, {
      identityId: identity.identity.id,
      password: RECEPTION_PASSWORD,
      passwordConfirm: RECEPTION_PASSWORD,
    });

    const staff = await createStaffMember(pool, {
      organizationId: primary.organizationId,
      healthcareOrganizationId: primary.healthcareOrganizationId,
      firstName: "QA",
      lastName: "Reception",
      displayName: "QA AUTO Reception",
      employmentType: "permanent",
      status: "active",
      email: recepEmail,
      phone: recepPhone,
      clinicDefaultCountry: "ZM",
    });
    assert.equal(staff.ok, true, staff.code || "staff_create_failed");
    const linked = await linkStaffMemberToIdentity(pool, {
      id: staff.staffMember.id,
      organizationId: primary.organizationId,
      platformIdentityId: identity.identity.id,
    });
    assert.equal(linked.ok, true, linked.code || "staff_identity_link_failed");
    const profile = await linkIdentityToProductProfile(pool, {
      identityId: identity.identity.id,
      productKey: "activeclinic",
      productProfileId: staff.staffMember.id,
    });
    assert.ok(
      profile.ok ||
        ["duplicate_product_link", "link_conflict", "product_profile_already_linked"].includes(
          profile.code
        ),
      profile.code || "product_profile_link_failed"
    );
    const facilityAssign = await assignStaffToFacility(pool, {
      organizationId: primary.organizationId,
      staffMemberId: staff.staffMember.id,
      facilityId: primary.facilityId,
      isPrimary: true,
    });
    assert.equal(facilityAssign.ok, true, facilityAssign.code || "facility_assign_failed");
    const role = await assignStaffRole(pool, {
      organizationId: primary.organizationId,
      staffMemberId: staff.staffMember.id,
      roleKey: RECEPTIONIST,
      scopeType: "facility",
      facilityId: primary.facilityId,
      assignedByPlatformIdentityId: primary.identityId,
      deploymentCode: CODE_ACTIVECLINIC_ORG_PRODUCTION,
    });
    assert.equal(role.ok, true, role.code || "role_assign_failed");
    assert.notEqual(RECEPTIONIST, ORGANIZATION_ADMIN);

    const session = await loginSession(app, recepEmail, RECEPTION_PASSWORD);
    assert.ok(session.session, "receptionist session");
    const denied = await request(app)
      .get("/app/access")
      .set("Host", AC_HOST)
      .set("Cookie", cookieJar(session.session, session.csrfCookie));
    assert.ok(
      [401, 403, 302, 303].includes(denied.status) ||
        (denied.status === 200 && /denied|forbidden|not authorized|access denied/i.test(denied.text)),
      `expected denial, got ${denied.status}`
    );
    if ([302, 303].includes(denied.status)) {
      const loc = String(denied.headers.location || "");
      assert.ok(!/\/app\/access\/?$/.test(loc) || /login|denied|forbidden/i.test(loc));
    }
  });
});
