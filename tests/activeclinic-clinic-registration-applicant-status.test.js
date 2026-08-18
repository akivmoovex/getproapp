"use strict";

/**
 * ActiveClinic public applicant status lookup (V7 Phase E).
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const fs = require("node:fs");
const path = require("node:path");

const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const { ensureDatabaseIdentity } = require("../db/scripts/lib/databaseIdentity");
const { provisionPlatformTenant } = require("../src/platform/services/provisionPlatformTenant");
const { provisionBlessBoardChurch } = require("../src/blessboard/services/provisionBlessBoardChurch");
const { createBlessBoardUser } = require("../src/blessboard/services/createBlessBoardUser");
const { assignBlessBoardRole } = require("../src/blessboard/services/assignBlessBoardRole");
const {
  createClinicRegistrationApplication,
} = require("../src/activeclinic/services/activeClinicPublicOnboardingService");
const {
  approveAndProvisionClinicRegistration,
  rejectClinicRegistration,
} = require("../src/activeclinic/services/approveClinicRegistrationService");
const {
  requestClinicRegistrationInformation,
  markClinicRegistrationInformationReturned,
  addClinicRegistrationReviewNote,
} = require("../src/activeclinic/services/clinicRegistrationReviewService");
const {
  lookupClinicRegistrationApplicantStatus,
  projectApplicantStatus,
  GENERIC_NOT_FOUND,
  GENERIC_REJECTION,
  PUBLIC_STATE,
} = require("../src/activeclinic/services/clinicRegistrationApplicantStatusService");
const {
  createMoovexPlatformRuntimeApp,
  buildDefaultProductApps,
} = require("../src/platform/http/moovexPlatformRuntimeServer");
const { CSRF_FIELD } = require("../src/platform/http/v5Csrf");
const {
  CODE_MOOVEX_PLATFORM_TESTING,
  resetDeploymentProfileWarningsForTests,
} = require("../src/platform/config/deploymentProfiles");

const IDENTITY_KEY = "moovex-platform-v7";
const ADMIN_PASSWORD = "clinic-admin-pass-12";
const PA_PASSWORD = "correct-horse-battery-staple";
const AC_HOST = "activeclinic.pronline.org";
const UNIFIED_CSRF = "moovex_platform_testing_csrf";
const INTERNAL_NOTE = "INTERNAL_NOTE_SECRET_XYZ_PHASE_E";
const INTERNAL_REJECTION = "INTERNAL_REJECTION_REASON_DO_NOT_LEAK";
const PROVISION_ERROR = "tenant_provision_failed_do_not_leak";

const UNIFIED_ENV = Object.freeze({
  NODE_ENV: "test",
  DEPLOYMENT_ENV: "testing",
  PLATFORM_DEPLOYMENT_CODE: CODE_MOOVEX_PLATFORM_TESTING,
  DATABASE_IDENTITY_EXPECTED: IDENTITY_KEY,
  DATABASE_IDENTITY_ENV: "testing",
  SESSION_SECRET: "test-session-secret-at-least-32-chars!!",
});

let pool;
let skipReason = null;
let app;
let phoneSeq = 890000000;

function nextPhone() {
  phoneSeq += 1;
  return `+2609${String(phoneSeq).slice(-8)}`;
}

function extractCookie(res, name) {
  const raw = res.headers["set-cookie"] || [];
  const list = Array.isArray(raw) ? raw : [raw];
  for (const line of list) {
    if (String(line).startsWith(`${name}=`)) {
      return String(line).split(";")[0].slice(name.length + 1);
    }
  }
  return null;
}

function cookieHeader(parts) {
  return Object.entries(parts)
    .filter(([, v]) => v != null && v !== "")
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

describe("ActiveClinic applicant status projection", () => {
  it("maps stored Phase B axes to applicant-facing states without collapsing them", () => {
    const pending = projectApplicantStatus({
      application_number: "AC-TEST-1",
      clinic_name: "Demo",
      created_at: "2026-08-17T00:00:00.000Z",
      status: "pending_review",
      follow_up_status: "none",
      provisioning_status: "not_started",
    }, null);
    assert.equal(pending.publicState, PUBLIC_STATE.UNDER_REVIEW);
    assert.equal(pending.stored.applicationStatus, "pending_review");

    const waiting = projectApplicantStatus({
      application_number: "AC-TEST-1",
      clinic_name: "Demo",
      created_at: "2026-08-17T00:00:00.000Z",
      status: "pending_review",
      follow_up_status: "awaiting_customer",
      provisioning_status: "not_started",
    }, { body: "Please send a licence copy.", createdAt: "2026-08-17T12:00:00.000Z" });
    assert.equal(waiting.publicState, PUBLIC_STATE.MORE_INFORMATION_NEEDED);
    assert.equal(waiting.informationRequest.body, "Please send a licence copy.");
    assert.equal(waiting.informationRequest.emailSent, false);

    const returned = projectApplicantStatus({
      application_number: "AC-TEST-1",
      clinic_name: "Demo",
      created_at: "2026-08-17T00:00:00.000Z",
      status: "pending_review",
      follow_up_status: "returned_for_review",
      provisioning_status: "not_started",
    }, null);
    assert.equal(returned.publicState, PUBLIC_STATE.BACK_UNDER_REVIEW);

    const preparing = projectApplicantStatus({
      application_number: "AC-TEST-1",
      clinic_name: "Demo",
      created_at: "2026-08-17T00:00:00.000Z",
      status: "approved",
      follow_up_status: "none",
      provisioning_status: "in_progress",
    }, null);
    assert.equal(preparing.publicState, PUBLIC_STATE.APPROVED_PREPARING);
    assert.equal(preparing.showLogin, false);

    const websitePending = projectApplicantStatus({
      application_number: "AC-TEST-1",
      clinic_name: "Demo",
      created_at: "2026-08-17T00:00:00.000Z",
      status: "approved",
      follow_up_status: "none",
      provisioning_status: "website_pending",
    }, null);
    assert.equal(websitePending.publicState, PUBLIC_STATE.APPROVED);
    assert.equal(websitePending.showLogin, true);
    assert.match(websitePending.explanation, /does not block/i);

    const failed = projectApplicantStatus({
      application_number: "AC-TEST-1",
      clinic_name: "Demo",
      created_at: "2026-08-17T00:00:00.000Z",
      status: "approved",
      follow_up_status: "none",
      provisioning_status: "failed",
    }, null);
    assert.equal(failed.publicState, PUBLIC_STATE.APPROVED_SETUP_ATTENTION);
    assert.doesNotMatch(failed.explanation, /tenant_provision/i);

    const provisioned = projectApplicantStatus({
      application_number: "AC-TEST-1",
      clinic_name: "Demo",
      created_at: "2026-08-17T00:00:00.000Z",
      status: "approved",
      follow_up_status: "none",
      provisioning_status: "provisioned",
    }, null);
    assert.equal(provisioned.publicState, PUBLIC_STATE.APPROVED);
    assert.equal(provisioned.showLogin, true);

    const rejected = projectApplicantStatus({
      application_number: "AC-TEST-1",
      clinic_name: "Demo",
      created_at: "2026-08-17T00:00:00.000Z",
      status: "rejected",
      follow_up_status: "none",
      provisioning_status: "not_started",
      rejection_reason: INTERNAL_REJECTION,
    }, null);
    assert.equal(rejected.publicState, PUBLIC_STATE.REJECTED);
    assert.equal(rejected.rejectionMessage, GENERIC_REJECTION);
    assert.doesNotMatch(rejected.explanation, new RegExp(INTERNAL_REJECTION));

    const withdrawn = projectApplicantStatus({
      application_number: "AC-TEST-1",
      clinic_name: "Demo",
      created_at: "2026-08-17T00:00:00.000Z",
      status: "withdrawn",
      follow_up_status: "none",
      provisioning_status: "not_started",
    }, null);
    assert.equal(withdrawn.publicState, PUBLIC_STATE.WITHDRAWN);

    const duplicate = projectApplicantStatus({
      application_number: "AC-TEST-1",
      clinic_name: "Demo",
      created_at: "2026-08-17T00:00:00.000Z",
      status: "duplicate",
      follow_up_status: "none",
      provisioning_status: "not_started",
    }, null);
    assert.equal(duplicate.publicState, PUBLIC_STATE.DUPLICATE_RECORDED);
    assert.match(duplicate.label, /Already recorded/i);
  });
});

describe("ActiveClinic applicant status lookup", () => {
  before(async () => {
    resetDeploymentProfileWarningsForTests();
    try {
      const databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });
      await ensureDatabaseIdentity(pool, {
        connectionString: databaseUrl,
        identityKey: IDENTITY_KEY,
        environmentCode: "testing",
      });
      await pool.query(
        `INSERT INTO platform.deployments (
           deployment_code, application_code, release_version, canonical_domain,
           environment_code, status, jobs_enabled, database_access_mode, session_cookie_name
         ) VALUES (
           $1, 'platform', 'v7', 'pronline.org',
           'testing', 'active', false, 'read_write', 'moovex_platform_testing_sid'
         )
         ON CONFLICT (deployment_code) DO UPDATE SET
           status = 'active',
           application_code = 'platform',
           session_cookie_name = EXCLUDED.session_cookie_name,
           updated_at = now()`,
        [CODE_MOOVEX_PLATFORM_TESTING]
      );
      await provisionPlatformTenant(pool, {
        skipDomain: true,
        dataEnvironment: "testing",
        organizationKey: "ac-status-pa",
        displayName: "Status PA Org",
        productKey: "blessboard",
        productTenantKey: "ac-status-pa",
        deploymentCode: CODE_MOOVEX_PLATFORM_TESTING,
      });
      await provisionBlessBoardChurch(pool, {
        organizationKey: "ac-status-pa",
        churchKey: "ac-status-pa",
        displayName: "Status PA Church",
        legalName: null,
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "Headquarters",
      });
      const paCreated = await createBlessBoardUser(pool, {
        email: "platform-admin@status.example",
        displayName: "Platform Administrator",
        password: PA_PASSWORD,
      });
      assert.equal(paCreated.ok, true, JSON.stringify(paCreated));
      const paRole = await assignBlessBoardRole(pool, {
        email: "platform-admin@status.example",
        organizationKey: "ac-status-pa",
        roleKey: "platform_admin",
      });
      assert.equal(paRole.ok, true, JSON.stringify(paRole));
      const productApps = buildDefaultProductApps({
        env: UNIFIED_ENV,
        getPool: () => pool,
      });
      app = createMoovexPlatformRuntimeApp({
        env: UNIFIED_ENV,
        getPool: () => pool,
        productApps,
      });
    } catch (err) {
      skipReason = err && err.message ? err.message : String(err);
    }
  });

  after(async () => {
    if (pool) await pool.end().catch(() => {});
  });

  function requireDb() {
    if (skipReason) assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
  }

  async function createPending(overrides) {
    const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const payload = {
      clinicName: `Status Clinic ${stamp}`,
      contactName: `Admin ${stamp}`,
      contactEmail: `status-${stamp}@clinic.example`,
      contactPhone: nextPhone(),
      province: "Lusaka Province",
      city: "Lusaka",
      countryCode: "ZM",
      password: ADMIN_PASSWORD,
      passwordConfirm: ADMIN_PASSWORD,
      ...overrides,
    };
    const created = await createClinicRegistrationApplication(pool, payload);
    assert.equal(created.ok, true, JSON.stringify(created));
    return { payload, created: created.application };
  }

  async function postLookup(form) {
    const page = await request(app).get("/register-clinic/status").set("Host", AC_HOST);
    assert.equal(page.status, 200);
    const csrf = extractCookie(page, UNIFIED_CSRF);
    const match = String(page.text || "").match(/name="_csrf" value="([^"]+)"/);
    return request(app)
      .post("/register-clinic/status")
      .set("Host", AC_HOST)
      .set("Cookie", cookieHeader({ [UNIFIED_CSRF]: csrf }))
      .type("form")
      .send({
        [CSRF_FIELD]: match ? match[1] : "",
        ...form,
      });
  }

  it("valid reference + matching email succeeds", async () => {
    requireDb();
    const { payload, created } = await createPending();
    const res = await postLookup({
      applicationNumber: created.applicationNumber,
      contactEmail: payload.contactEmail,
    });
    assert.equal(res.status, 200);
    assert.match(res.text, /data-ac-public-status="under_review"/);
    assert.match(res.text, new RegExp(created.applicationNumber));
    assert.match(res.text, /Status Clinic/);
    assert.doesNotMatch(res.text, /password_hash/);
    assert.doesNotMatch(res.text, /data-ac-existing-identity/);
    assert.doesNotMatch(res.text, new RegExp(created.id, "i"));
    const service = await lookupClinicRegistrationApplicantStatus(pool, {
      applicationNumber: created.applicationNumber,
      contactEmail: payload.contactEmail,
    });
    assert.equal(service.ok, true);
    assert.equal(service.projection.stored, undefined);
    assert.equal(service.projection.applicationStatus, undefined);
    assert.equal(service.projection.organizationId, undefined);
  });

  it("valid reference + normalized matching phone succeeds", async () => {
    requireDb();
    const { payload, created } = await createPending();
    const national = String(payload.contactPhone).replace(/^\+260/, "");
    const res = await postLookup({
      applicationNumber: created.applicationNumber,
      phone_country: "ZM",
      phone_national: national,
    });
    assert.equal(res.status, 200);
    assert.match(res.text, /data-ac-public-status="under_review"/);
  });

  it("reference only, wrong email, wrong phone, and unknown reference return the same generic failure", async () => {
    requireDb();
    const { payload, created } = await createPending();
    const missingContact = await postLookup({
      applicationNumber: created.applicationNumber,
    });
    assert.equal(missingContact.status, 200);
    assert.match(missingContact.text, /Enter the email or phone number used on the application/);
    assert.doesNotMatch(missingContact.text, /data-ac-status-result="1"/);

    const wrongEmail = await postLookup({
      applicationNumber: created.applicationNumber,
      contactEmail: "not-the-applicant@clinic.example",
    });
    const wrongPhone = await postLookup({
      applicationNumber: created.applicationNumber,
      contactPhone: nextPhone(),
    });
    const unknown = await postLookup({
      applicationNumber: "AC-DOESNOTEXIST-000000",
      contactEmail: payload.contactEmail,
    });
    for (const res of [wrongEmail, wrongPhone, unknown]) {
      assert.equal(res.status, 200);
      assert.match(res.text, new RegExp(GENERIC_NOT_FOUND.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      assert.doesNotMatch(res.text, /email is wrong/i);
      assert.doesNotMatch(res.text, /phone belongs/i);
      assert.doesNotMatch(res.text, /identity exists/i);
      assert.doesNotMatch(res.text, /data-ac-status-result="1"/);
    }
  });

  it("hides internal notes, identity collision details, and does not mutate state", async () => {
    requireDb();
    const { payload, created } = await createPending();
    await addClinicRegistrationReviewNote(pool, {
      applicationId: created.id,
      body: INTERNAL_NOTE,
    });
    const before = await pool.query(
      `SELECT status, follow_up_status, provisioning_status, updated_at
         FROM activeclinic.clinic_registration_applications WHERE id = $1`,
      [created.id]
    );
    const res = await postLookup({
      applicationNumber: created.applicationNumber,
      contactEmail: payload.contactEmail,
    });
    assert.equal(res.status, 200);
    assert.doesNotMatch(res.text, new RegExp(INTERNAL_NOTE));
    assert.doesNotMatch(res.text, /Existing ActiveClinic identity/);
    assert.doesNotMatch(res.text, /data-ac-existing-identity/);
    assert.doesNotMatch(res.text, /data-ac-second-clinic-ack/);
    const after = await pool.query(
      `SELECT status, follow_up_status, provisioning_status, updated_at
         FROM activeclinic.clinic_registration_applications WHERE id = $1`,
      [created.id]
    );
    assert.equal(after.rows[0].status, before.rows[0].status);
    assert.equal(after.rows[0].follow_up_status, before.rows[0].follow_up_status);
    assert.equal(after.rows[0].provisioning_status, before.rows[0].provisioning_status);
    assert.equal(String(after.rows[0].updated_at), String(before.rows[0].updated_at));
  });

  it("awaiting-customer shows information-needed state and request text; returned-for-review follows", async () => {
    requireDb();
    const { payload, created } = await createPending();
    await requestClinicRegistrationInformation(pool, {
      applicationId: created.id,
      requestText: "Please send your facility licence number.",
    });
    const waiting = await postLookup({
      applicationNumber: created.applicationNumber,
      contactEmail: payload.contactEmail,
    });
    assert.match(waiting.text, /data-ac-public-status="more_information_needed"/);
    assert.match(waiting.text, /data-ac-info-request="1"/);
    assert.match(waiting.text, /Please send your facility licence number/);
    assert.match(waiting.text, /No email or SMS was sent/);

    await markClinicRegistrationInformationReturned(pool, {
      applicationId: created.id,
    });
    const returned = await postLookup({
      applicationNumber: created.applicationNumber,
      contactEmail: payload.contactEmail,
    });
    assert.match(returned.text, /data-ac-public-status="back_under_review"/);
  });

  it("approved provisioning states stay applicant-safe and show login when ready", async () => {
    requireDb();
    const { payload, created } = await createPending();
    const approved = await approveAndProvisionClinicRegistration(pool, {
      applicationId: created.id,
      dataEnvironment: "testing",
      deploymentCode: CODE_MOOVEX_PLATFORM_TESTING,
    });
    assert.equal(approved.ok, true, JSON.stringify(approved));

    await pool.query(
      `UPDATE activeclinic.clinic_registration_applications
          SET provisioning_status = 'in_progress', last_provision_error = $2
        WHERE id = $1`,
      [created.id, PROVISION_ERROR]
    );
    const preparing = await postLookup({
      applicationNumber: created.applicationNumber,
      contactEmail: payload.contactEmail,
    });
    assert.match(preparing.text, /data-ac-public-status="approved_preparing"/);
    assert.doesNotMatch(preparing.text, new RegExp(PROVISION_ERROR));
    assert.doesNotMatch(preparing.text, /data-ac-status-login="1"/);

    await pool.query(
      `UPDATE activeclinic.clinic_registration_applications
          SET provisioning_status = 'website_pending'
        WHERE id = $1`,
      [created.id]
    );
    const website = await postLookup({
      applicationNumber: created.applicationNumber,
      contactEmail: payload.contactEmail,
    });
    assert.match(website.text, /data-ac-public-status="approved"/);
    assert.match(website.text, /does not block/i);
    assert.match(website.text, /data-ac-status-login="1"/);
    assert.match(website.text, /href="\/login"/);

    await pool.query(
      `UPDATE activeclinic.clinic_registration_applications
          SET provisioning_status = 'failed', last_provision_error = $2
        WHERE id = $1`,
      [created.id, PROVISION_ERROR]
    );
    const failed = await postLookup({
      applicationNumber: created.applicationNumber,
      contactEmail: payload.contactEmail,
    });
    assert.match(failed.text, /data-ac-public-status="approved_setup_attention"/);
    assert.doesNotMatch(failed.text, new RegExp(PROVISION_ERROR));

    await pool.query(
      `UPDATE activeclinic.clinic_registration_applications
          SET provisioning_status = 'provisioned', last_provision_error = NULL
        WHERE id = $1`,
      [created.id]
    );
    const ready = await postLookup({
      applicationNumber: created.applicationNumber,
      contactEmail: payload.contactEmail,
    });
    assert.match(ready.text, /data-ac-public-status="approved"/);
    assert.match(ready.text, /data-ac-status-login="1"/);
    assert.match(ready.text, /href="\/login"/);
    assert.doesNotMatch(ready.text, /password_hash|administrator_password/i);
    if (approved.organizationId) {
      assert.doesNotMatch(ready.text, new RegExp(String(approved.organizationId), "i"));
    }
    if (approved.identityId) {
      assert.doesNotMatch(ready.text, new RegExp(String(approved.identityId), "i"));
    }
    if (approved.staffMemberId) {
      assert.doesNotMatch(ready.text, new RegExp(String(approved.staffMemberId), "i"));
    }
    if (approved.instance && approved.instance.id) {
      assert.doesNotMatch(ready.text, new RegExp(String(approved.instance.id), "i"));
    }
  });

  it("rejected status uses a generic public message; withdrawn is distinct", async () => {
    requireDb();
    const rejectedApp = await createPending();
    const rejected = await rejectClinicRegistration(pool, {
      applicationId: rejectedApp.created.id,
      rejectionReason: INTERNAL_REJECTION,
    });
    assert.equal(rejected.ok, true, JSON.stringify(rejected));
    const rejectedLookup = await postLookup({
      applicationNumber: rejectedApp.created.applicationNumber,
      contactEmail: rejectedApp.payload.contactEmail,
    });
    assert.match(rejectedLookup.text, /data-ac-public-status="rejected"/);
    assert.match(rejectedLookup.text, new RegExp(GENERIC_REJECTION.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.doesNotMatch(rejectedLookup.text, new RegExp(INTERNAL_REJECTION));

    const withdrawnApp = await createPending();
    await pool.query(
      `UPDATE activeclinic.clinic_registration_applications SET status = 'withdrawn' WHERE id = $1`,
      [withdrawnApp.created.id]
    );
    const withdrawnLookup = await postLookup({
      applicationNumber: withdrawnApp.created.applicationNumber,
      contactEmail: withdrawnApp.payload.contactEmail,
    });
    assert.match(withdrawnLookup.text, /data-ac-public-status="withdrawn"/);

    const duplicateApp = await createPending();
    await pool.query(
      `UPDATE activeclinic.clinic_registration_applications SET status = 'duplicate' WHERE id = $1`,
      [duplicateApp.created.id]
    );
    const duplicateLookup = await postLookup({
      applicationNumber: duplicateApp.created.applicationNumber,
      contactEmail: duplicateApp.payload.contactEmail,
    });
    assert.match(duplicateLookup.text, /data-ac-public-status="duplicate_recorded"/);

    const service = await lookupClinicRegistrationApplicantStatus(pool, {
      applicationNumber: rejectedApp.created.applicationNumber,
      contactEmail: rejectedApp.payload.contactEmail,
    });
    assert.equal(service.ok, true);
    assert.equal(service.projection.rejectionMessage, GENERIC_REJECTION);
  });

  it("does not return another application that shares an email or phone", async () => {
    requireDb();
    const first = await createPending();
    const second = await createPending();
    const crossed = await postLookup({
      applicationNumber: first.created.applicationNumber,
      contactEmail: second.payload.contactEmail,
    });
    assert.match(crossed.text, new RegExp(GENERIC_NOT_FOUND.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.doesNotMatch(crossed.text, /data-ac-status-result="1"/);
    assert.doesNotMatch(crossed.text, /data-ac-status-clinic="1"/);
    assert.doesNotMatch(crossed.text, new RegExp(first.payload.clinicName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  });

  it("exposes lookup from registration and success pages", async () => {
    requireDb();
    const form = await request(app).get("/register-clinic").set("Host", AC_HOST);
    assert.match(form.text, /href="\/register-clinic\/status"/);
    const { created, payload } = await createPending();
    const success = await request(app)
      .get(`/register-clinic/success?ref=${encodeURIComponent(created.applicationNumber)}`)
      .set("Host", AC_HOST);
    assert.match(success.text, /Check application status/);
    assert.match(success.text, /\/register-clinic\/status\?ref=/);

    const prefill = await request(app)
      .get(`/register-clinic/status?ref=${encodeURIComponent(created.applicationNumber)}`)
      .set("Host", AC_HOST);
    assert.equal(prefill.status, 200);
    assert.match(prefill.text, /name="robots" content="noindex, nofollow"/);
    assert.match(prefill.text, new RegExp(created.applicationNumber));
    assert.doesNotMatch(prefill.text, /data-ac-status-result="1"/);
    assert.doesNotMatch(prefill.text, new RegExp(payload.clinicName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

    const contactOnly = await postLookup({
      contactEmail: payload.contactEmail,
    });
    assert.equal(contactOnly.status, 200);
    assert.doesNotMatch(contactOnly.text, /data-ac-status-result="1"/);
    assert.match(contactOnly.text, /Enter your application number/);

    const phoneOnly = await postLookup({
      contactPhone: payload.contactPhone,
    });
    assert.equal(phoneOnly.status, 200);
    assert.doesNotMatch(phoneOnly.text, /data-ac-status-result="1"/);
    assert.match(phoneOnly.text, /Enter your application number/);

    const csrfMissing = await request(app)
      .post("/register-clinic/status")
      .set("Host", AC_HOST)
      .type("form")
      .send({
        applicationNumber: created.applicationNumber,
        contactEmail: payload.contactEmail,
      });
    assert.equal(csrfMissing.status, 403);

    const routes = fs.readFileSync(
      path.join(__dirname, "..", "src/activeclinic/http/activeClinicPublicRoutes.js"),
      "utf8"
    );
    assert.match(routes, /statusLimiter/);
    assert.match(routes, /clinic-status\|/);
    assert.match(routes, /app\.post\("\/register-clinic\/status", statusLimiter/);
  });
});
