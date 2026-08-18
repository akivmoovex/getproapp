"use strict";

/**
 * ActiveClinic clinic-registration review lifecycle (V7 Phase B).
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

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
  createPlatformIdentity,
} = require("../src/platform/services/platformIdentityService");
const {
  setPlatformIdentityPassword,
  verifyPlatformIdentityPassword,
} = require("../src/platform/services/platformIdentityCredentialService");
const {
  createHealthcareOrganization,
} = require("../src/activeclinic/services/healthcareOrganizationService");
const { createFacility } = require("../src/activeclinic/services/facilityService");
const { createStaffMember } = require("../src/activeclinic/services/activeClinicStaffService");
const {
  assignStaffRole,
  ORGANIZATION_ADMIN,
} = require("../src/activeclinic/services/activeClinicAuthorizationService");
const {
  listEligibleActiveClinicOrganizations,
} = require("../src/activeclinic/services/activeClinicLoginEligibility");
const {
  requestClinicRegistrationInformation,
  markClinicRegistrationInformationReturned,
  addClinicRegistrationReviewNote,
  listClinicRegistrationApplications,
  getClinicRegistrationDetail,
} = require("../src/activeclinic/services/clinicRegistrationReviewService");
const {
  createMoovexPlatformRuntimeApp,
  buildDefaultProductApps,
} = require("../src/platform/http/moovexPlatformRuntimeServer");
const {
  CSRF_FIELD,
} = require("../src/platform/http/v5Csrf");
const {
  CODE_MOOVEX_PLATFORM_TESTING,
  resetDeploymentProfileWarningsForTests,
} = require("../src/platform/config/deploymentProfiles");

const IDENTITY_KEY = "moovex-platform-v7";
const ADMIN_PASSWORD = "clinic-admin-pass-12";
const PA_PASSWORD = "correct-horse-battery-staple";
const AC_HOST = "activeclinic.pronline.org";
const BB_HOST = "blessboard.pronline.org";
const UNIFIED_SID = "moovex_platform_testing_sid";
const UNIFIED_CSRF = "moovex_platform_testing_csrf";
const INTERNAL_NOTE = "INTERNAL_NOTE_SECRET_XYZ_PHASE_B";

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
let phoneSeq = 880000000;

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

describe("ActiveClinic clinic registration review lifecycle", () => {
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
        organizationKey: "ac-review-pa",
        displayName: "Review PA Org",
        productKey: "blessboard",
        productTenantKey: "ac-review-pa",
        deploymentCode: CODE_MOOVEX_PLATFORM_TESTING,
      });
      await provisionBlessBoardChurch(pool, {
        organizationKey: "ac-review-pa",
        churchKey: "ac-review-pa",
        displayName: "Review PA Church",
        legalName: null,
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "Headquarters",
      });
      const paCreated = await createBlessBoardUser(pool, {
        email: "platform-admin@review.example",
        displayName: "Platform Administrator",
        password: PA_PASSWORD,
      });
      assert.equal(paCreated.ok, true, JSON.stringify(paCreated));
      const paRole = await assignBlessBoardRole(pool, {
        email: "platform-admin@review.example",
        organizationKey: "ac-review-pa",
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
      clinicName: `Review Clinic ${stamp}`,
      contactName: `Admin ${stamp}`,
      contactEmail: `admin-${stamp}@clinic.example`,
      contactPhone: nextPhone(),
      province: "Lusaka Province",
      city: "Lusaka",
      address: "10 Cairo Road",
      countryCode: "ZM",
      notes: "Applicant submitted note",
      password: ADMIN_PASSWORD,
      passwordConfirm: ADMIN_PASSWORD,
      ...overrides,
    };
    const created = await createClinicRegistrationApplication(pool, payload);
    assert.equal(created.ok, true, JSON.stringify(created));
    return { payload, created: created.application };
  }

  async function loginPa() {
    const getLogin = await request(app).get("/login").set("Host", BB_HOST);
    const csrf = extractCookie(getLogin, UNIFIED_CSRF);
    const match = String(getLogin.text || "").match(/name="_csrf" value="([^"]+)"/);
    const post = await request(app)
      .post("/login")
      .set("Host", BB_HOST)
      .set("Cookie", csrf ? `${UNIFIED_CSRF}=${csrf}` : "")
      .type("form")
      .send({
        [CSRF_FIELD]: match ? match[1] : "",
        email: "platform-admin@review.example",
        password: PA_PASSWORD,
      });
    return { post, sid: extractCookie(post, UNIFIED_SID) };
  }

  function csrfFrom(html) {
    const match = String(html || "").match(/name="_csrf" value="([^"]+)"/);
    return match ? match[1] : "";
  }

  it("1-5 request information, return, and approve without changing main status until approval", async () => {
    requireDb();
    const { created } = await createPending();
    const requested = await requestClinicRegistrationInformation(pool, {
      applicationId: created.id,
      actorId: null,
      requestText: "Please send a copy of the clinic licence.",
    });
    assert.equal(requested.ok, true, JSON.stringify(requested));
    assert.equal(requested.applicationStatus, "pending_review");
    assert.equal(requested.followUpStatus, "awaiting_customer");
    assert.equal(requested.emailSent, false);
    assert.equal(requested.deliveryStatus, "sending_unavailable");

    const afterRequest = await pool.query(
      `SELECT status, follow_up_status FROM activeclinic.clinic_registration_applications WHERE id = $1`,
      [created.id]
    );
    assert.equal(afterRequest.rows[0].status, "pending_review");
    assert.equal(afterRequest.rows[0].follow_up_status, "awaiting_customer");
    assert.notEqual(afterRequest.rows[0].status, "information_requested");

    const returned = await markClinicRegistrationInformationReturned(pool, {
      applicationId: created.id,
    });
    assert.equal(returned.ok, true, JSON.stringify(returned));
    assert.equal(returned.applicationStatus, "pending_review");
    assert.equal(returned.followUpStatus, "returned_for_review");

    const approved = await approveAndProvisionClinicRegistration(pool, {
      applicationId: created.id,
      dataEnvironment: "testing",
      deploymentCode: CODE_MOOVEX_PLATFORM_TESTING,
    });
    assert.equal(approved.ok, true, JSON.stringify(approved));
    const afterApprove = await pool.query(
      `SELECT status, provisioning_status FROM activeclinic.clinic_registration_applications WHERE id = $1`,
      [created.id]
    );
    assert.equal(afterApprove.rows[0].status, "approved");

    const detail = await getClinicRegistrationDetail(pool, created.id);
    const types = detail.history.map((e) => e.eventType);
    assert.ok(types.includes("submitted"));
    assert.ok(types.includes("information_requested"));
    assert.ok(types.includes("information_returned"));
    assert.ok(types.includes("approval"));
    assert.ok(types.includes("provisioning_started"));
    assert.ok(types.includes("provisioning_succeeded") || types.includes("provisioning_failed"));
    const info = detail.history.find((e) => e.eventType === "information_requested");
    assert.equal(info.deliveryClaimedSent, false);
    assert.match(info.body, /clinic licence/);
  });

  it("6 reject with reason persists in history and stays visible", async () => {
    requireDb();
    const { created } = await createPending();
    const missing = await rejectClinicRegistration(pool, { applicationId: created.id });
    assert.equal(missing.ok, false);
    assert.equal(missing.code, "rejection_reason_required");

    const rejected = await rejectClinicRegistration(pool, {
      applicationId: created.id,
      rejectionReason: "Clinic could not be verified from the supplied details",
    });
    assert.equal(rejected.ok, true, JSON.stringify(rejected));
    assert.equal(rejected.emailSent, false);

    const row = await pool.query(
      `SELECT status, rejection_reason FROM activeclinic.clinic_registration_applications WHERE id = $1`,
      [created.id]
    );
    assert.equal(row.rows[0].status, "rejected");
    assert.match(row.rows[0].rejection_reason, /could not be verified/);

    const listed = await listClinicRegistrationApplications(pool, { status: "rejected" });
    assert.ok(listed.applications.some((a) => a.id === created.id));

    const detail = await getClinicRegistrationDetail(pool, created.id);
    const rejection = detail.history.find((e) => e.eventType === "rejection");
    assert.ok(rejection);
    assert.match(rejection.body, /could not be verified/);
    assert.equal(rejection.deliveryClaimedSent, false);
  });

  it("7-8 internal notes persist and do not leak publicly", async () => {
    requireDb();
    const { created, payload } = await createPending();
    const first = await addClinicRegistrationReviewNote(pool, {
      applicationId: created.id,
      body: INTERNAL_NOTE,
    });
    assert.equal(first.ok, true, JSON.stringify(first));
    const second = await addClinicRegistrationReviewNote(pool, {
      applicationId: created.id,
      body: "Second internal observation",
    });
    assert.equal(second.ok, true);

    const detail = await getClinicRegistrationDetail(pool, created.id);
    assert.equal(detail.notes.length, 2);
    assert.equal(detail.notes[0].body, INTERNAL_NOTE);
    assert.equal(detail.notes[1].body, "Second internal observation");
    assert.equal(detail.notes[0].visibility, "internal");

    const publicPage = await request(app).get("/register-clinic").set("Host", AC_HOST);
    assert.equal(publicPage.status, 200);
    assert.doesNotMatch(publicPage.text, new RegExp(INTERNAL_NOTE));

    const success = await request(app)
      .get(`/register-clinic/success?ref=${encodeURIComponent(created.applicationNumber)}`)
      .set("Host", AC_HOST);
    assert.equal(success.status, 200);
    assert.doesNotMatch(success.text, new RegExp(INTERNAL_NOTE));
    assert.match(success.text, /pending review/i);

    const queue = await listClinicRegistrationApplications(pool, {
      status: "pending_review",
      q: payload.contactEmail,
    });
    const listed = queue.applications.find((a) => a.id === created.id);
    assert.ok(listed);
    assert.equal(listed.notes, "Applicant submitted note");
    assert.ok(!JSON.stringify(listed).includes(INTERNAL_NOTE));
  });

  it("9-10 search by application number, clinic, admin, email, and phone", async () => {
    requireDb();
    const { created, payload } = await createPending({
      clinicName: "Searchable Sunrise Clinic",
      contactName: "Mwansa Chanda",
    });
    const byNumber = await listClinicRegistrationApplications(pool, {
      status: "all",
      q: created.applicationNumber,
    });
    assert.ok(byNumber.applications.some((a) => a.id === created.id));

    const byClinic = await listClinicRegistrationApplications(pool, {
      status: "all",
      q: "Searchable Sunrise",
    });
    assert.ok(byClinic.applications.some((a) => a.id === created.id));

    const byAdmin = await listClinicRegistrationApplications(pool, {
      status: "all",
      q: "Mwansa Chanda",
    });
    assert.ok(byAdmin.applications.some((a) => a.id === created.id));

    const byEmail = await listClinicRegistrationApplications(pool, {
      status: "all",
      q: payload.contactEmail,
    });
    assert.ok(byEmail.applications.some((a) => a.id === created.id));

    const byPhone = await listClinicRegistrationApplications(pool, {
      status: "all",
      q: payload.contactPhone,
    });
    assert.ok(byPhone.applications.some((a) => a.id === created.id));

    const pa = await loginPa();
    assert.equal(pa.post.status, 303);
    const cookie = cookieHeader({ [UNIFIED_SID]: pa.sid });
    const html = await request(app)
      .get(`/admin/clinic-registrations?status=all&q=${encodeURIComponent(created.applicationNumber)}`)
      .set("Host", BB_HOST)
      .set("Cookie", cookie);
    assert.equal(html.status, 200);
    assert.match(html.text, /Searchable Sunrise Clinic/);
    assert.match(html.text, /data-ac-clinic-reg-search="1"/);
  });

  it("11 identity collision protection remains intact", async () => {
    requireDb();
    const stamp = Date.now().toString(36);
    const email = `collide-${stamp}@clinic.example`;
    const phone = nextPhone();
    const existing = await createPlatformIdentity(pool, {
      status: "active",
      primaryEmail: email,
      emailNormalized: email,
      emailVerifiedAt: new Date().toISOString(),
      primaryPhone: phone,
      phoneNormalized: phone,
      phoneVerifiedAt: new Date().toISOString(),
    });
    assert.equal(existing.ok, true, JSON.stringify(existing));

    const dupIdentity = await createPlatformIdentity(pool, {
      status: "active",
      primaryEmail: email,
      emailNormalized: email,
      emailVerifiedAt: new Date().toISOString(),
    });
    assert.equal(dupIdentity.ok, false);
    assert.equal(dupIdentity.code, "duplicate_verified_email");

    const { created } = await createPending({
      contactEmail: email,
      contactPhone: nextPhone(),
    });
    const approved = await approveAndProvisionClinicRegistration(pool, {
      applicationId: created.id,
      dataEnvironment: "testing",
      deploymentCode: CODE_MOOVEX_PLATFORM_TESTING,
    });
    assert.equal(approved.ok, true, JSON.stringify(approved));
    const identities = await pool.query(
      `SELECT count(*)::int AS n FROM platform.identities WHERE email_normalized = $1`,
      [email]
    );
    assert.equal(identities.rows[0].n, 1);
  });

  it("12 duplicate and reapplication rules remain intact", async () => {
    requireDb();
    const stamp = Date.now().toString(36);
    const email = `reapply-${stamp}@clinic.example`;
    const phone = nextPhone();
    const first = await createPending({ contactEmail: email, contactPhone: phone });
    const dup = await createClinicRegistrationApplication(pool, {
      clinicName: `Other Clinic ${stamp}`,
      contactName: "Other Admin",
      contactEmail: email,
      contactPhone: nextPhone(),
      password: ADMIN_PASSWORD,
      passwordConfirm: ADMIN_PASSWORD,
    });
    assert.equal(dup.ok, false);
    assert.equal(dup.code, "duplicate_application");

    const rejected = await rejectClinicRegistration(pool, {
      applicationId: first.created.id,
      rejectionReason: "Rejected so the applicant may reapply",
    });
    assert.equal(rejected.ok, true);

    const reapply = await createClinicRegistrationApplication(pool, {
      clinicName: `Reapply Clinic ${stamp}`,
      contactName: "Reapply Admin",
      contactEmail: email,
      contactPhone: phone,
      password: ADMIN_PASSWORD,
      passwordConfirm: ADMIN_PASSWORD,
    });
    assert.equal(reapply.ok, true, JSON.stringify(reapply));
    assert.equal(reapply.application.status, "pending_review");
    assert.notEqual(reapply.application.id, first.created.id);
  });

  it("13 provisioning idempotency remains intact", async () => {
    requireDb();
    const { created } = await createPending();
    const first = await approveAndProvisionClinicRegistration(pool, {
      applicationId: created.id,
      dataEnvironment: "testing",
      deploymentCode: CODE_MOOVEX_PLATFORM_TESTING,
    });
    assert.equal(first.ok, true, JSON.stringify(first));
    const orgId = first.organizationId;
    const again = await approveAndProvisionClinicRegistration(pool, {
      applicationId: created.id,
      dataEnvironment: "testing",
      deploymentCode: CODE_MOOVEX_PLATFORM_TESTING,
    });
    assert.equal(again.ok, true, JSON.stringify(again));
    assert.equal(again.alreadyProvisioned || again.code === "already_provisioned", true);
    assert.equal(again.organizationId, orgId);
    const orgs = await pool.query(
      `SELECT count(*)::int AS n FROM platform.organizations WHERE id = $1`,
      [orgId]
    );
    assert.equal(orgs.rows[0].n, 1);
  });

  it("Platform Admin can request information and mark returned over HTTP", async () => {
    requireDb();
    const { created } = await createPending();
    const pa = await loginPa();
    const cookie = cookieHeader({ [UNIFIED_SID]: pa.sid });
    const detail = await request(app)
      .get(`/admin/clinic-registrations/${created.id}`)
      .set("Host", BB_HOST)
      .set("Cookie", cookie);
    assert.equal(detail.status, 200);
    assert.match(detail.text, /data-ac-clinic-reg-request-info="1"/);
    assert.match(detail.text, /data-ac-clinic-reg-history="1"/);

    const csrf = csrfFrom(detail.text);
    const csrfCookie = extractCookie(detail, UNIFIED_CSRF);
    const authed = cookieHeader({ [UNIFIED_SID]: pa.sid, [UNIFIED_CSRF]: csrfCookie || csrf });
    const requested = await request(app)
      .post(`/admin/clinic-registrations/${created.id}/request-information`)
      .set("Host", BB_HOST)
      .set("Cookie", authed)
      .redirects(0)
      .type("form")
      .send({
        [CSRF_FIELD]: csrf,
        request_text: "Please confirm the physical address.",
      });
    assert.equal(requested.status, 303);
    assert.match(requested.headers.location, /notice=information_requested/);

    const after = await request(app)
      .get(`/admin/clinic-registrations/${created.id}`)
      .set("Host", BB_HOST)
      .set("Cookie", authed);
    assert.equal(after.status, 200);
    assert.match(after.text, /data-ac-application-status="pending_review"/);
    assert.match(after.text, /data-ac-follow-up-status="awaiting_customer"/);
    assert.match(after.text, /Please confirm the physical address/);
    assert.match(after.text, /Email was not sent/);
    assert.doesNotMatch(after.text, /Outbound message sent/);

    const csrf2 = csrfFrom(after.text);
    const csrfCookie2 = extractCookie(after, UNIFIED_CSRF) || csrfCookie;
    const returned = await request(app)
      .post(`/admin/clinic-registrations/${created.id}/information-returned`)
      .set("Host", BB_HOST)
      .set("Cookie", cookieHeader({ [UNIFIED_SID]: pa.sid, [UNIFIED_CSRF]: csrfCookie2 || csrf2 }))
      .redirects(0)
      .type("form")
      .send({ [CSRF_FIELD]: csrf2 });
    assert.equal(returned.status, 303);

    const restored = await request(app)
      .get(`/admin/clinic-registrations/${created.id}`)
      .set("Host", BB_HOST)
      .set("Cookie", authed);
    assert.match(restored.text, /data-ac-follow-up-status="returned_for_review"/);
    assert.match(restored.text, /data-ac-history-event="information_returned"/);
  });

  it("Platform Admin queue and detail keep the three status axes distinct", async () => {
    requireDb();
    const { created } = await createPending();
    await requestClinicRegistrationInformation(pool, {
      applicationId: created.id,
      requestText: "Need the trading licence number.",
    });
    const pa = await loginPa();
    const cookie = cookieHeader({ [UNIFIED_SID]: pa.sid });
    const queue = await request(app)
      .get(`/admin/clinic-registrations?status=pending_review&follow_up_status=awaiting_customer`)
      .set("Host", BB_HOST)
      .set("Cookie", cookie);
    assert.equal(queue.status, 200);
    assert.match(queue.text, /data-ac-clinic-reg-queue="1"/);
    assert.match(queue.text, /data-ac-application-status="pending_review"/);
    assert.match(queue.text, /data-ac-follow-up-status="awaiting_customer"/);
    assert.match(queue.text, /data-ac-provisioning-status="not_started"/);

    const detail = await request(app)
      .get(`/admin/clinic-registrations/${created.id}`)
      .set("Host", BB_HOST)
      .set("Cookie", cookie);
    assert.equal(detail.status, 200);
    assert.match(detail.text, /data-ac-clinic-reg-axes="1"/);
    assert.match(detail.text, /Application status/);
    assert.match(detail.text, /Follow-up status/);
    assert.match(detail.text, /Provisioning status/);
    assert.doesNotMatch(detail.text, /Network validation/);
    assert.doesNotMatch(detail.text, /duplicate score/i);
    assert.doesNotMatch(detail.text, /Foundation plan/);
    assert.doesNotMatch(detail.text, /church verification/i);
  });

  it("Platform Admin notes, reject, and approve keep honest delivery and PA-only notes", async () => {
    requireDb();
    const { created } = await createPending();
    const pa = await loginPa();
    const cookie = cookieHeader({ [UNIFIED_SID]: pa.sid });
    const detail = await request(app)
      .get(`/admin/clinic-registrations/${created.id}`)
      .set("Host", BB_HOST)
      .set("Cookie", cookie);
    const csrf = csrfFrom(detail.text);
    const csrfCookie = extractCookie(detail, UNIFIED_CSRF);
    const authed = cookieHeader({ [UNIFIED_SID]: pa.sid, [UNIFIED_CSRF]: csrfCookie || csrf });

    const noted = await request(app)
      .post(`/admin/clinic-registrations/${created.id}/notes`)
      .set("Host", BB_HOST)
      .set("Cookie", authed)
      .redirects(0)
      .type("form")
      .send({ [CSRF_FIELD]: csrf, note_body: INTERNAL_NOTE });
    assert.equal(noted.status, 303);

    const afterNote = await request(app)
      .get(`/admin/clinic-registrations/${created.id}`)
      .set("Host", BB_HOST)
      .set("Cookie", authed);
    assert.match(afterNote.text, new RegExp(INTERNAL_NOTE));
    assert.match(afterNote.text, /data-ac-review-note="1"/);
    assert.match(afterNote.text, /bb-pa-clinic-history__item--note/);

    const publicPage = await request(app)
      .get("/register-clinic")
      .set("Host", AC_HOST);
    assert.doesNotMatch(publicPage.text, new RegExp(INTERNAL_NOTE));

    const { created: rejectApp } = await createPending();
    const rejectDetail = await request(app)
      .get(`/admin/clinic-registrations/${rejectApp.id}`)
      .set("Host", BB_HOST)
      .set("Cookie", authed);
    const rejectCsrf = csrfFrom(rejectDetail.text);
    const rejectCsrfCookie = extractCookie(rejectDetail, UNIFIED_CSRF) || csrfCookie;
    const rejectAuthed = cookieHeader({
      [UNIFIED_SID]: pa.sid,
      [UNIFIED_CSRF]: rejectCsrfCookie || rejectCsrf,
    });
    const rejected = await request(app)
      .post(`/admin/clinic-registrations/${rejectApp.id}/reject`)
      .set("Host", BB_HOST)
      .set("Cookie", rejectAuthed)
      .redirects(0)
      .type("form")
      .send({
        [CSRF_FIELD]: rejectCsrf,
        rejection_reason: "Clinic documentation was incomplete.",
      });
    assert.equal(rejected.status, 303);
    assert.match(rejected.headers.location, /notice=rejected/);
    const rejectedHtml = await request(app)
      .get(`/admin/clinic-registrations/${rejectApp.id}`)
      .set("Host", BB_HOST)
      .set("Cookie", rejectAuthed);
    assert.match(rejectedHtml.text, /data-ac-rejection-reason="1"/);
    assert.match(rejectedHtml.text, /Clinic documentation was incomplete/);
    assert.match(rejectedHtml.text, /Email was not sent/);
  });

  it("website Platform Admin routes still resolve after clinic PA relocation", async () => {
    requireDb();
    const pa = await loginPa();
    const cookie = cookieHeader({ [UNIFIED_SID]: pa.sid });
    const html = await request(app)
      .get("/admin/website-changes")
      .set("Host", BB_HOST)
      .set("Cookie", cookie);
    assert.equal(html.status, 200);
  });

  it("POLICY A: existing ActiveClinic identity cannot be attached to a second clinic without acknowledgement", async () => {
    requireDb();
    const stamp = Date.now().toString(36);
    const email = `second-clinic-${stamp}@clinic.example`;
    const phone = nextPhone();
    const originalPassword = "original-identity-pass-12";
    const identity = await createPlatformIdentity(pool, {
      status: "active",
      primaryEmail: email,
      emailNormalized: email,
      emailVerifiedAt: new Date().toISOString(),
      primaryPhone: phone,
      phoneNormalized: phone,
      phoneVerifiedAt: new Date().toISOString(),
    });
    assert.equal(identity.ok, true, JSON.stringify(identity));
    const setPass = await setPlatformIdentityPassword(pool, {
      identityId: identity.identity.id,
      password: originalPassword,
    });
    assert.equal(setPass.ok, true, JSON.stringify(setPass));

    const tenant = await provisionPlatformTenant(pool, {
      skipDomain: true,
      dataEnvironment: "testing",
      organizationKey: `ac-first-${stamp}`,
      displayName: `First Clinic ${stamp}`,
      productKey: "activeclinic",
      productTenantKey: `ac-first-${stamp}`,
      deploymentCode: CODE_MOOVEX_PLATFORM_TESTING,
    });
    assert.equal(tenant.ok, true, JSON.stringify(tenant));
    const orgId = tenant.records.organization.id;
    const hco = await createHealthcareOrganization(pool, {
      organizationId: orgId,
      legalName: `First Legal ${stamp}`,
      publicName: `First Clinic ${stamp}`,
      organizationType: "private_healthcare",
      countryCode: "ZM",
      timezone: "Africa/Lusaka",
    });
    assert.equal(hco.ok, true, JSON.stringify(hco));
    const facility = await createFacility(pool, {
      organizationId: orgId,
      healthcareOrganizationId: hco.healthcareOrganization.id,
      facilityKey: "hq",
      displayName: "HQ",
      facilityType: "clinic",
      status: "active",
      isPrimary: true,
      countryCode: "ZM",
      timezone: "Africa/Lusaka",
      phone,
    });
    assert.equal(facility.ok, true, JSON.stringify(facility));
    const staff = await createStaffMember(pool, {
      organizationId: orgId,
      healthcareOrganizationId: hco.healthcareOrganization.id,
      firstName: "Existing",
      lastName: "Admin",
      employmentType: "permanent",
      status: "active",
      phone,
      platformIdentityId: identity.identity.id,
    });
    assert.equal(staff.ok, true, JSON.stringify(staff));
    const role = await assignStaffRole(pool, {
      organizationId: orgId,
      staffMemberId: staff.staffMember.id,
      roleKey: ORGANIZATION_ADMIN,
      scopeType: "organisation",
      assignmentOrigin: "system",
    });
    assert.equal(role.ok, true, JSON.stringify(role));

    const staffBefore = await pool.query(
      `SELECT count(*)::int AS n FROM activeclinic.staff_members WHERE organization_id = $1`,
      [orgId]
    );

    const { created } = await createPending({
      contactEmail: email,
      contactPhone: nextPhone(),
      password: "replacement-password-99",
      passwordConfirm: "replacement-password-99",
    });
    const memberships = await pool.query(
      `SELECT count(*)::int AS n FROM activeclinic.staff_members WHERE platform_identity_id = $1`,
      [identity.identity.id]
    );
    assert.equal(memberships.rows[0].n, 1);

    const publicForm = await request(app).get("/register-clinic").set("Host", AC_HOST);
    assert.equal(publicForm.status, 200);
    assert.doesNotMatch(publicForm.text, /data-ac-existing-identity=/);
    assert.doesNotMatch(publicForm.text, /data-ac-second-clinic-ack=/);
    const publicSuccess = await request(app)
      .get(`/register-clinic/success?ref=${encodeURIComponent(created.applicationNumber)}`)
      .set("Host", AC_HOST);
    assert.equal(publicSuccess.status, 200);
    assert.doesNotMatch(publicSuccess.text, /data-ac-existing-identity=/);
    assert.doesNotMatch(publicSuccess.text, /data-ac-existing-ac-identity=/);

    const pa = await loginPa();
    const cookie = cookieHeader({ [UNIFIED_SID]: pa.sid });
    const detail = await request(app)
      .get(`/admin/clinic-registrations/${created.id}`)
      .set("Host", BB_HOST)
      .set("Cookie", cookie);
    assert.equal(detail.status, 200);
    assert.match(detail.text, /data-ac-existing-identity="1"/);
    assert.match(detail.text, /data-ac-existing-ac-identity="1"/);
    assert.match(detail.text, /data-ac-second-clinic-ack="1"/);
    assert.match(detail.text, /First Clinic/);
    assert.doesNotMatch(detail.text, new RegExp(identity.identity.id, "i"));
    assert.doesNotMatch(detail.text, /password_hash/i);

    const csrf = csrfFrom(detail.text);
    const csrfCookie = extractCookie(detail, UNIFIED_CSRF);
    const authed = cookieHeader({ [UNIFIED_SID]: pa.sid, [UNIFIED_CSRF]: csrfCookie || csrf });
    const silent = await request(app)
      .post(`/admin/clinic-registrations/${created.id}/approve`)
      .set("Host", BB_HOST)
      .set("Cookie", authed)
      .redirects(0)
      .type("form")
      .send({ [CSRF_FIELD]: csrf });
    assert.equal(silent.status, 303);
    assert.match(silent.headers.location, /existing_identity_acknowledgement_required/);

    const blocked = await approveAndProvisionClinicRegistration(pool, {
      applicationId: created.id,
      dataEnvironment: "testing",
      deploymentCode: CODE_MOOVEX_PLATFORM_TESTING,
    });
    assert.equal(blocked.ok, false);
    assert.equal(blocked.code, "existing_identity_acknowledgement_required");

    const staffAfterBlock = await pool.query(
      `SELECT count(*)::int AS n FROM activeclinic.staff_members WHERE organization_id = $1`,
      [orgId]
    );
    assert.equal(staffAfterBlock.rows[0].n, staffBefore.rows[0].n);
    const stillPending = await pool.query(
      `SELECT status FROM activeclinic.clinic_registration_applications WHERE id = $1`,
      [created.id]
    );
    assert.equal(stillPending.rows[0].status, "pending_review");

    const attached = await approveAndProvisionClinicRegistration(pool, {
      applicationId: created.id,
      dataEnvironment: "testing",
      deploymentCode: CODE_MOOVEX_PLATFORM_TESTING,
      acknowledgeExistingIdentity: true,
    });
    assert.equal(attached.ok, true, JSON.stringify(attached));
    assert.equal(attached.reusedIdentity, true);
    assert.notEqual(attached.organizationId, orgId);

    const originalStillWorks = await verifyPlatformIdentityPassword(pool, {
      identityId: identity.identity.id,
      password: originalPassword,
      recordFailure: false,
    });
    assert.equal(originalStillWorks.ok, true);
    const replacementRejected = await verifyPlatformIdentityPassword(pool, {
      identityId: identity.identity.id,
      password: "replacement-password-99",
      recordFailure: false,
    });
    assert.equal(replacementRejected.ok, false);

    const firstOrgStaff = await pool.query(
      `SELECT count(*)::int AS n FROM activeclinic.staff_members
        WHERE organization_id = $1 AND platform_identity_id = $2 AND status <> 'archived'`,
      [orgId, identity.identity.id]
    );
    assert.equal(firstOrgStaff.rows[0].n, 1);

    const newOrgStaff = await pool.query(
      `SELECT count(*)::int AS n FROM activeclinic.staff_members
        WHERE organization_id = $1 AND platform_identity_id = $2 AND status <> 'archived'`,
      [attached.organizationId, identity.identity.id]
    );
    assert.equal(newOrgStaff.rows[0].n, 1);

    const retry = await approveAndProvisionClinicRegistration(pool, {
      applicationId: created.id,
      dataEnvironment: "testing",
      deploymentCode: CODE_MOOVEX_PLATFORM_TESTING,
      acknowledgeExistingIdentity: true,
    });
    assert.equal(retry.ok, true, JSON.stringify(retry));
    assert.equal(retry.alreadyProvisioned || retry.code === "already_provisioned", true);

    const newOrgStaffAfterRetry = await pool.query(
      `SELECT count(*)::int AS n FROM activeclinic.staff_members
        WHERE organization_id = $1 AND platform_identity_id = $2 AND status <> 'archived'`,
      [attached.organizationId, identity.identity.id]
    );
    assert.equal(newOrgStaffAfterRetry.rows[0].n, 1);
    const firstOrgStaffAfterRetry = await pool.query(
      `SELECT count(*)::int AS n FROM activeclinic.staff_members
        WHERE organization_id = $1 AND platform_identity_id = $2 AND status <> 'archived'`,
      [orgId, identity.identity.id]
    );
    assert.equal(firstOrgStaffAfterRetry.rows[0].n, 1);

    const eligible = await listEligibleActiveClinicOrganizations(pool, {
      platformIdentityId: identity.identity.id,
    });
    assert.equal(eligible.ok, true);
    assert.equal(eligible.organizations.length, 2);

    const history = await getClinicRegistrationDetail(pool, created.id);
    const approval = history.history.find((e) => e.eventType === "approval");
    assert.ok(approval && /Existing ActiveClinic identity linked/i.test(String(approval.body || "")));
  });

  it("HTTP approve unwraps deployment code and provisions the clinic", async () => {
    requireDb();
    const { created } = await createPending();
    const pa = await loginPa();
    const detail = await request(app)
      .get(`/admin/clinic-registrations/${created.id}`)
      .set("Host", BB_HOST)
      .set("Cookie", cookieHeader({ [UNIFIED_SID]: pa.sid }));
    assert.equal(detail.status, 200);
    const csrf = csrfFrom(detail.text);
    const csrfCookie = extractCookie(detail, UNIFIED_CSRF);
    const approved = await request(app)
      .post(`/admin/clinic-registrations/${created.id}/approve`)
      .set("Host", BB_HOST)
      .set("Cookie", cookieHeader({ [UNIFIED_SID]: pa.sid, [UNIFIED_CSRF]: csrfCookie || csrf }))
      .redirects(0)
      .type("form")
      .send({ [CSRF_FIELD]: csrf });
    assert.equal(approved.status, 303);
    assert.match(String(approved.headers.location || ""), /notice=approved/);
    assert.doesNotMatch(String(approved.headers.location || ""), /tenant_provision_failed|deployment_unavailable/);

    const row = await pool.query(
      `SELECT a.status, a.provisioning_status, a.organization_id, a.last_provision_error,
              o.organization_key, wi.publish_policy, wi.lifecycle_status
         FROM activeclinic.clinic_registration_applications a
         JOIN platform.organizations o ON o.id = a.organization_id
         LEFT JOIN platform.website_instances wi ON wi.organization_id = o.id
        WHERE a.id = $1`,
      [created.id]
    );
    assert.equal(row.rows[0].status, "approved");
    assert.equal(row.rows[0].provisioning_status, "provisioned");
    assert.ok(row.rows[0].organization_id);
    assert.equal(row.rows[0].last_provision_error, null);
    assert.equal(row.rows[0].publish_policy, "AUTO_PUBLISH_WITH_MODERATION");
    assert.equal(row.rows[0].lifecycle_status, "provisional");

    const assignedBy = await pool.query(
      `SELECT sra.assigned_by_platform_identity_id
         FROM activeclinic.staff_role_assignments sra
         JOIN activeclinic.staff_members sm ON sm.id = sra.staff_member_id
        WHERE sm.organization_id = $1`,
      [row.rows[0].organization_id]
    );
    assert.ok(assignedBy.rows.length >= 1);
    for (const assignment of assignedBy.rows) {
      if (assignment.assigned_by_platform_identity_id) {
        const identity = await pool.query(
          `SELECT 1 FROM platform.identities WHERE id = $1`,
          [assignment.assigned_by_platform_identity_id]
        );
        assert.equal(identity.rowCount, 1);
      }
    }
  });
});
