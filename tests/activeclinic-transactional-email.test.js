"use strict";

/**
 * ActiveClinic transactional email (V7 Phase G).
 * Capture transport only. No network. No live provider.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const { ensureDatabaseIdentity } = require("../db/scripts/lib/databaseIdentity");
const {
  createClinicRegistrationApplication,
} = require("../src/activeclinic/services/activeClinicPublicOnboardingService");
const {
  approveAndProvisionClinicRegistration,
} = require("../src/activeclinic/services/approveClinicRegistrationService");
const {
  requestClinicRegistrationInformation,
  deliverInformationRequestedEmail,
  getClinicRegistrationDetail,
} = require("../src/activeclinic/services/clinicRegistrationReviewService");
const {
  inviteActiveClinicStaff,
  reissueStaffInvitation,
} = require("../src/activeclinic/services/activeClinicStaffInvitationService");
const {
  TEMPLATE,
  PROVIDER,
  liveEmailTransportDecision,
  resolveOutboundEmailStatus,
  createUnavailableAdapter,
  createCaptureAdapter,
  createRejectingAdapter,
  createThrowingAdapter,
  resolveActiveClinicEmailAdapter,
  sendActiveClinicEmail,
} = require("../src/activeclinic/services/activeClinicEmailDelivery");
const {
  buildInformationRequestedMessage,
  buildReadyToSignInMessage,
  buildStaffInvitationMessage,
} = require("../src/activeclinic/services/activeClinicEmailMessages");
const {
  CODE_MOOVEX_PLATFORM_TESTING,
  CODE_ACTIVECLINIC_ORG_V6,
  resetDeploymentProfileWarningsForTests,
} = require("../src/platform/config/deploymentProfiles");

const IDENTITY_KEY = "moovex-platform-v7";
const ADMIN_PASSWORD = "clinic-admin-pass-12";
const TEST_ORIGIN = "https://ac.test.local";

let pool;
let skipReason = null;
let phoneSeq = 870000000;

function nextPhone() {
  phoneSeq += 1;
  return `+2609${String(phoneSeq).slice(-8)}`;
}

function requireDb() {
  if (skipReason) assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
}

describe("ActiveClinic email adapter guards", () => {
  it("defaults to unavailable and never selects live transport in test/local", () => {
    const adapter = resolveActiveClinicEmailAdapter({ NODE_ENV: "test" });
    assert.equal(adapter.sendingAvailable, false);
    assert.equal(adapter.id, "activeclinic_email_unavailable");

    const local = liveEmailTransportDecision({
      NODE_ENV: "development",
      DEPLOYMENT_ENV: "development",
      SMTP_URL: "smtp://example.invalid",
      SENDGRID_API_KEY: "sg-test",
      POSTMARK_SERVER_TOKEN: "pm-test",
      EMAIL_DELIVERY_ADAPTER: "sendgrid",
    });
    assert.equal(local.allowed, false);
    assert.equal(local.reason, PROVIDER.NOT_PRODUCTION);

    const testEnv = liveEmailTransportDecision({
      NODE_ENV: "test",
      DEPLOYMENT_ENV: "production",
      ACTIVECLINIC_EMAIL_DELIVERY_ADAPTER: "sendgrid",
      SENDGRID_API_KEY: "sg-test",
    });
    assert.equal(testEnv.allowed, false);

    const productionUnimplemented = liveEmailTransportDecision({
      NODE_ENV: "production",
      DEPLOYMENT_ENV: "production",
      DATABASE_IDENTITY_ENV: "production",
      ACTIVECLINIC_EMAIL_DELIVERY_ADAPTER: "sendgrid",
      SENDGRID_API_KEY: "sg-test",
    });
    assert.equal(productionUnimplemented.allowed, false);
    assert.equal(productionUnimplemented.reason, PROVIDER.ADAPTER_NOT_ENABLED);

    const keysOnly = resolveOutboundEmailStatus({
      NODE_ENV: "production",
      DEPLOYMENT_ENV: "production",
      SMTP_URL: "smtp://example.invalid",
    });
    assert.equal(keysOnly.state, "unavailable");
    assert.match(keysOnly.label, /adapter_not_selected|email_sending_unavailable/);
  });

  it("unavailable adapter does not accept mail", async () => {
    const result = await sendActiveClinicEmail({
      adapter: createUnavailableAdapter(),
      templateKey: TEMPLATE.INFORMATION_REQUESTED,
      recipient: "applicant@clinic.example",
      publicOrigin: TEST_ORIGIN,
      fields: { clinicName: "Demo", applicationNumber: "AC-1", requestText: "Licence please" },
    });
    assert.equal(result.accepted, false);
    assert.equal(result.reviewDeliveryStatus, "sending_unavailable");
  });

  it("keeps applicant and invitation templates free of secrets", () => {
    const info = buildInformationRequestedMessage({
      clinicName: "Sunrise Clinic",
      applicationNumber: "AC-SAFE-1",
      requestText: "Please send your facility licence.",
      publicOrigin: TEST_ORIGIN,
    });
    const blob = `${info.subject}\n${info.text}`;
    assert.match(blob, /Sunrise Clinic/);
    assert.match(blob, /AC-SAFE-1/);
    assert.match(info.ctaUrl, /\/register-clinic\/status$/);
    assert.doesNotMatch(blob, /password_hash|rejection_reason|last_provision_error|organization_id/i);

    const ready = buildReadyToSignInMessage({
      clinicName: "Sunrise Clinic",
      applicationNumber: "AC-SAFE-1",
      publicOrigin: TEST_ORIGIN,
    });
    assert.match(ready.ctaUrl, /\/login$/);
    assert.doesNotMatch(
      `${ready.subject}\n${ready.text}`,
      /password_hash|administrator_password|staff_id|organization_id|website_instance/i
    );

    const invite = buildStaffInvitationMessage({
      organizationName: "Sunrise Clinic",
      activationUrl: `${TEST_ORIGIN}/activate/test-token`,
      expiresAt: new Date("2026-08-18T12:00:00.000Z"),
    });
    assert.match(invite.text, /Sunrise Clinic/);
    assert.match(invite.ctaUrl, /\/activate\/test-token/);
    assert.doesNotMatch(invite.text, /password|roleKey|staff_member_id/i);
  });
});

describe("ActiveClinic transactional email workflows", () => {
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
    } catch (err) {
      skipReason = err && err.message ? err.message : String(err);
    }
  });

  after(async () => {
    if (pool) await pool.end().catch(() => {});
  });

  async function createPending(overrides) {
    const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const payload = {
      clinicName: `Mail Clinic ${stamp}`,
      contactName: `Admin ${stamp}`,
      contactEmail: `mail-${stamp}@clinic.example`,
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

  it("captures information-request email once and keeps the business action on failure", async () => {
    requireDb();
    const { payload, created } = await createPending();
    const captured = [];
    const requested = await requestClinicRegistrationInformation(pool, {
      applicationId: created.id,
      requestText: "Please send your facility licence number.",
      publicOrigin: TEST_ORIGIN,
      emailAdapter: createCaptureAdapter(captured),
    });
    assert.equal(requested.ok, true, JSON.stringify(requested));
    assert.equal(requested.followUpStatus, "awaiting_customer");
    assert.equal(requested.deliveryStatus, "queued");
    assert.equal(requested.emailSent, false);
    assert.equal(captured.length, 1);
    assert.equal(captured[0].templateKey, TEMPLATE.INFORMATION_REQUESTED);
    assert.equal(captured[0].recipient, payload.contactEmail);
    assert.equal(captured[0].ctaPath, "/register-clinic/status");
    assert.equal(captured[0].idempotencyKey, `information_requested:${requested.event.id}`);
    const blob = JSON.stringify(captured[0]);
    assert.doesNotMatch(blob, /password_hash|INTERNAL_NOTE|last_provision_error/i);

    await deliverInformationRequestedEmail(pool, {
      eventId: requested.event.id,
      emailAdapter: createCaptureAdapter(captured),
      publicOrigin: TEST_ORIGIN,
      recipient: payload.contactEmail,
      clinicName: created.clinicName || payload.clinicName,
      applicationNumber: created.applicationNumber,
      requestText: "Please send your facility licence number.",
    });
    assert.equal(captured.length, 1);

    const unavailable = await requestClinicRegistrationInformation(pool, {
      applicationId: created.id,
      requestText: "Second request still records without mail.",
    });
    assert.equal(unavailable.ok, true);
    assert.equal(unavailable.deliveryStatus, "sending_unavailable");

    const failedApp = await createPending();
    const failed = await requestClinicRegistrationInformation(pool, {
      applicationId: failedApp.created.id,
      requestText: "This mail will fail.",
      emailAdapter: createRejectingAdapter(),
      publicOrigin: TEST_ORIGIN,
    });
    assert.equal(failed.ok, true);
    assert.equal(failed.followUpStatus, "awaiting_customer");
    assert.equal(failed.deliveryStatus, "failed");

    const thrownApp = await createPending();
    const thrown = await requestClinicRegistrationInformation(pool, {
      applicationId: thrownApp.created.id,
      requestText: "This mail will throw.",
      emailAdapter: createThrowingAdapter(),
      publicOrigin: TEST_ORIGIN,
    });
    assert.equal(thrown.ok, true);
    assert.equal(thrown.deliveryStatus, "failed");

    const detail = await getClinicRegistrationDetail(pool, created.id);
    const infoEvent = detail.history.find((e) => e.eventType === "information_requested");
    assert.equal(infoEvent.deliveryStatus, "queued");
    assert.match(infoEvent.deliveryHint, /accepted for processing/i);
    assert.equal(infoEvent.deliveryClaimedSent, false);
  });

  it("sends ready-to-sign-in for provisioned and website_pending, not before eligibility, and not twice", async () => {
    requireDb();
    const pending = await createPending();
    const captured = [];
    const adapter = createCaptureAdapter(captured);

    const tooEarly = captured.filter((m) => m.templateKey === TEMPLATE.READY_TO_SIGN_IN);
    assert.equal(tooEarly.length, 0);

    const approved = await approveAndProvisionClinicRegistration(pool, {
      applicationId: pending.created.id,
      dataEnvironment: "testing",
      deploymentCode: CODE_MOOVEX_PLATFORM_TESTING,
      publicOrigin: TEST_ORIGIN,
      emailAdapter: adapter,
    });
    assert.equal(approved.ok, true, JSON.stringify(approved));
    const ready = captured.filter((m) => m.templateKey === TEMPLATE.READY_TO_SIGN_IN);
    assert.equal(ready.length, 1);
    assert.equal(ready[0].recipient, pending.payload.contactEmail);
    assert.equal(ready[0].ctaPath, "/login");
    const readyBlob = JSON.stringify(ready[0]);
    assert.doesNotMatch(readyBlob, /password|last_provision_error|tenant_failed/i);

    const retry = await approveAndProvisionClinicRegistration(pool, {
      applicationId: pending.created.id,
      dataEnvironment: "testing",
      deploymentCode: CODE_MOOVEX_PLATFORM_TESTING,
      publicOrigin: TEST_ORIGIN,
      emailAdapter: adapter,
    });
    assert.equal(retry.ok, true, JSON.stringify(retry));
    assert.equal(
      captured.filter((m) => m.templateKey === TEMPLATE.READY_TO_SIGN_IN).length,
      1
    );

    const websiteApp = await createPending();
    const websiteCapture = [];
    const websitePending = await approveAndProvisionClinicRegistration(pool, {
      applicationId: websiteApp.created.id,
      dataEnvironment: "testing",
      deploymentCode: CODE_MOOVEX_PLATFORM_TESTING,
      websiteTemplateVersion: 999,
      publicOrigin: TEST_ORIGIN,
      emailAdapter: createCaptureAdapter(websiteCapture),
    });
    assert.equal(websitePending.ok, true, JSON.stringify(websitePending));
    assert.equal(websitePending.code, "website_pending");
    assert.equal(
      websiteCapture.filter((m) => m.templateKey === TEMPLATE.READY_TO_SIGN_IN).length,
      1
    );

    const detail = await getClinicRegistrationDetail(pool, pending.created.id);
    const approval = [...detail.history].reverse().find((e) => e.eventType === "approval");
    assert.ok(approval);
    assert.equal(approval.deliveryStatus, "queued");
  });

  it("sends staff invitation email when present, skips without email, keeps copy/WhatsApp, and reissue can send again", async () => {
    requireDb();
    const { created } = await createPending();
    const approved = await approveAndProvisionClinicRegistration(pool, {
      applicationId: created.id,
      dataEnvironment: "testing",
      deploymentCode: CODE_MOOVEX_PLATFORM_TESTING,
    });
    assert.equal(approved.ok, true, JSON.stringify(approved));

    const captured = [];
    const logs = [];
    const originalLog = console.log;
    const originalError = console.error;
    console.log = (...args) => {
      logs.push(args.map(String).join(" "));
    };
    console.error = (...args) => {
      logs.push(args.map(String).join(" "));
    };
    let invited;
    try {
      invited = await inviteActiveClinicStaff(pool, {
        organizationId: approved.organizationId,
        healthcareOrganizationId: approved.healthcareOrganization.id,
        facilityIds: approved.facility ? [approved.facility.id] : [],
        firstName: "Invited",
        lastName: "Nurse",
        phone: nextPhone(),
        email: `invite-${Date.now()}@clinic.example`,
        employmentType: "permanent",
        roleAssignments: [],
        deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
        publicOrigin: TEST_ORIGIN,
        emailAdapter: createCaptureAdapter(captured),
      });
    } finally {
      console.log = originalLog;
      console.error = originalError;
    }
    assert.equal(invited.ok, true, JSON.stringify({ code: invited.code }));
    assert.ok(invited.activationUrl);
    assert.ok(invited.share && invited.share.copyText);
    assert.ok(invited.share.whatsappUrl);
    assert.equal(invited.deliveryStatus, "queued");
    assert.equal(captured.length, 1);
    assert.equal(captured[0].templateKey, TEMPLATE.STAFF_INVITATION);
    assert.match(captured[0].activationUrl, /\/activate\//);
    assert.doesNotMatch(logs.join("\n"), new RegExp(invited.rawToken));

    const noMailCapture = [];
    const phoneOnly = await inviteActiveClinicStaff(pool, {
      organizationId: approved.organizationId,
      healthcareOrganizationId: approved.healthcareOrganization.id,
      facilityIds: approved.facility ? [approved.facility.id] : [],
      firstName: "Phone",
      lastName: "Only",
      phone: nextPhone(),
      employmentType: "permanent",
      roleAssignments: [],
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
      publicOrigin: TEST_ORIGIN,
      emailAdapter: createCaptureAdapter(noMailCapture),
    });
    assert.equal(phoneOnly.ok, true, JSON.stringify({ code: phoneOnly.code }));
    assert.equal(phoneOnly.deliveryStatus, "link_generated");
    assert.equal(noMailCapture.length, 0);
    assert.ok(phoneOnly.activationUrl);
    assert.ok(phoneOnly.share.whatsappUrl);

    const reissued = await reissueStaffInvitation(pool, {
      organizationId: approved.organizationId,
      staffMemberId: invited.staffMember.id,
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
      publicOrigin: TEST_ORIGIN,
      emailAdapter: createCaptureAdapter(captured),
    });
    assert.equal(reissued.ok, true, JSON.stringify({ code: reissued.code }));
    assert.equal(reissued.deliveryStatus, "queued");
    assert.equal(captured.filter((m) => m.templateKey === TEMPLATE.STAFF_INVITATION).length, 2);
    assert.notEqual(reissued.tokenId, invited.tokenId);

    const failedInvite = await inviteActiveClinicStaff(pool, {
      organizationId: approved.organizationId,
      healthcareOrganizationId: approved.healthcareOrganization.id,
      firstName: "Fail",
      lastName: "Mail",
      phone: nextPhone(),
      email: `fail-${Date.now()}@clinic.example`,
      employmentType: "permanent",
      roleAssignments: [],
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
      publicOrigin: TEST_ORIGIN,
      emailAdapter: createThrowingAdapter(),
    });
    assert.equal(failedInvite.ok, true, JSON.stringify({ code: failedInvite.code }));
    assert.equal(failedInvite.deliveryStatus, "failed");
    assert.ok(failedInvite.activationUrl);
  });

  it("does not claim a live provider from env-key presence in source", () => {
    const settings = fs.readFileSync(
      path.join(__dirname, "..", "src/platform/services/getPlatformAdminSettingsView.js"),
      "utf8"
    );
    assert.match(settings, /adapter_not_enabled/);
    assert.doesNotMatch(
      settings,
      /if \(e\.SMTP_URL \|\| e\.SENDGRID_API_KEY \|\| e\.POSTMARK_SERVER_TOKEN/
    );
  });
});
