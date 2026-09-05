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
  readResendSenderConfig,
  createResendAdapter,
  sendActiveClinicEmail,
} = require("../src/activeclinic/services/activeClinicEmailDelivery");
const {
  RESEND_EMAILS_URL,
} = require("../src/activeclinic/services/activeClinicEmailResendAdapter");
const {
  buildInformationRequestedMessage,
  buildReadyToSignInMessage,
  buildStaffInvitationMessage,
} = require("../src/activeclinic/services/activeClinicEmailMessages");
const {
  CODE_MOOVEX_PLATFORM_TESTING,
  CODE_ACTIVECLINIC_ORG_V6,
  CODE_ACTIVECLINIC_ORG_PRODUCTION,
  resetDeploymentProfileWarningsForTests,
} = require("../src/platform/config/deploymentProfiles");

const IDENTITY_KEY = "moovex-platform-v7";
const ADMIN_PASSWORD = "clinic-admin-pass-12";
const TEST_ORIGIN = "https://ac.test.local";
const RESEND_TEST_KEY = "re_test_activeclinic_mock_key";
const RESEND_FROM = "noreply@activeclinic.example";

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

function productionMailEnv(overrides) {
  return {
    NODE_ENV: "production",
    DEPLOYMENT_ENV: "production",
    DATABASE_IDENTITY_ENV: "production",
    PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_PRODUCTION,
    ACTIVECLINIC_EMAIL_DELIVERY_ADAPTER: "resend",
    RESEND_API_KEY: RESEND_TEST_KEY,
    ACTIVECLINIC_EMAIL_FROM: RESEND_FROM,
    ACTIVECLINIC_EMAIL_FROM_NAME: "ActiveClinic",
    ACTIVECLINIC_EMAIL_REPLY_TO: "support@activeclinic.example",
    ...overrides,
  };
}

function jsonResponse(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() {
      return payload == null ? "" : JSON.stringify(payload);
    },
  };
}

function mockResendFetch(handler) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const headers = (init && init.headers) || {};
    let parsedBody = null;
    if (init && init.body) {
      parsedBody = JSON.parse(String(init.body));
    }
    const snapshot = {
      url,
      method: init && init.method,
      hasAuthorization: Boolean(headers.Authorization),
      authorizationIsBearer: String(headers.Authorization || "").startsWith("Bearer "),
      contentType: headers["Content-Type"] || headers["content-type"] || null,
      idempotencyKey: headers["Idempotency-Key"] || null,
      headerNames: Object.keys(headers).sort(),
      body: parsedBody,
    };
    calls.push(snapshot);
    return handler({ url, init, headers, body: parsedBody, calls: snapshot });
  };
  return { fetchImpl, calls };
}

function unexpectedNetworkFetch() {
  return async () => {
    throw new Error("unexpected_network_call");
  };
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
      RESEND_API_KEY: RESEND_TEST_KEY,
      ACTIVECLINIC_EMAIL_DELIVERY_ADAPTER: "resend",
      ACTIVECLINIC_EMAIL_FROM: RESEND_FROM,
    });
    assert.equal(local.allowed, false);
    assert.equal(local.reason, PROVIDER.NOT_PRODUCTION);

    const testEnv = liveEmailTransportDecision({
      NODE_ENV: "test",
      DEPLOYMENT_ENV: "production",
      ACTIVECLINIC_EMAIL_DELIVERY_ADAPTER: "resend",
      RESEND_API_KEY: RESEND_TEST_KEY,
      ACTIVECLINIC_EMAIL_FROM: RESEND_FROM,
    });
    assert.equal(testEnv.allowed, false);
    const testAdapter = resolveActiveClinicEmailAdapter(
      {
        NODE_ENV: "test",
        DEPLOYMENT_ENV: "production",
        ACTIVECLINIC_EMAIL_DELIVERY_ADAPTER: "resend",
        RESEND_API_KEY: RESEND_TEST_KEY,
        ACTIVECLINIC_EMAIL_FROM: RESEND_FROM,
      },
      { fetchImpl: unexpectedNetworkFetch() }
    );
    assert.equal(testAdapter.id, "activeclinic_email_unavailable");

    const productionUnknown = liveEmailTransportDecision({
      NODE_ENV: "production",
      DEPLOYMENT_ENV: "production",
      DATABASE_IDENTITY_ENV: "production",
      ACTIVECLINIC_EMAIL_DELIVERY_ADAPTER: "sendgrid",
      SENDGRID_API_KEY: "sg-test",
    });
    assert.equal(productionUnknown.allowed, false);
    assert.equal(productionUnknown.reason, PROVIDER.ADAPTER_NOT_ENABLED);

    const keysOnly = resolveOutboundEmailStatus({
      NODE_ENV: "production",
      DEPLOYMENT_ENV: "production",
      SMTP_URL: "smtp://example.invalid",
      RESEND_API_KEY: RESEND_TEST_KEY,
    });
    assert.equal(keysOnly.state, "not_configured");
    assert.match(keysOnly.label, /Email not configured/i);
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
      requestText: "Please send your <script>alert(1)</script> licence.",
      publicOrigin: TEST_ORIGIN,
    });
    const blob = `${info.subject}\n${info.text}\n${info.html}`;
    assert.match(blob, /Sunrise Clinic/);
    assert.match(blob, /AC-SAFE-1/);
    assert.match(info.ctaUrl, /\/register-clinic\/status$/);
    assert.match(info.html, /&lt;script&gt;/);
    assert.doesNotMatch(info.html, /<script>/i);
    assert.doesNotMatch(info.html, /pixel|utm_|analytics/i);
    assert.doesNotMatch(blob, /password_hash|rejection_reason|last_provision_error|organization_id/i);

    const ready = buildReadyToSignInMessage({
      clinicName: "Sunrise Clinic",
      applicationNumber: "AC-SAFE-1",
      publicOrigin: TEST_ORIGIN,
    });
    assert.match(ready.ctaUrl, /\/login$/);
    assert.match(ready.html, /href="https:\/\/ac\.test\.local\/login"/);
    assert.doesNotMatch(
      `${ready.subject}\n${ready.text}\n${ready.html}`,
      /password_hash|administrator_password|staff_id|organization_id|website_instance/i
    );

    const invite = buildStaffInvitationMessage({
      organizationName: "Sunrise Clinic",
      activationUrl: `${TEST_ORIGIN}/activate/test-token`,
      expiresAt: new Date("2026-08-18T12:00:00.000Z"),
    });
    assert.match(invite.text, /Sunrise Clinic/);
    assert.match(invite.ctaUrl, /\/activate\/test-token/);
    assert.match(invite.html, /activate\/test-token/);
    assert.doesNotMatch(invite.text, /password|roleKey|staff_member_id/i);
    assert.doesNotMatch(invite.html, /password|roleKey|staff_member_id/i);
  });
});

describe("ActiveClinic Resend production transport", () => {
  it("never constructs the live adapter outside hosted production", () => {
    const fullResend = {
      ACTIVECLINIC_EMAIL_DELIVERY_ADAPTER: "resend",
      RESEND_API_KEY: RESEND_TEST_KEY,
      ACTIVECLINIC_EMAIL_FROM: RESEND_FROM,
      ACTIVECLINIC_EMAIL_FROM_NAME: "ActiveClinic",
    };
    const cases = [
      { NODE_ENV: "test", DEPLOYMENT_ENV: "production", ...fullResend },
      { NODE_ENV: "development", DEPLOYMENT_ENV: "production", ...fullResend },
      {
        NODE_ENV: "production",
        DEPLOYMENT_ENV: "testing",
        PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_V6,
        ...fullResend,
      },
      {
        NODE_ENV: "testing",
        DEPLOYMENT_ENV: "testing",
        PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_V6,
        ...fullResend,
      },
      {
        ...productionMailEnv({
          DATABASE_URL: "postgresql://user:secret@127.0.0.1:5432/getpro_v7_prod_rehearsal",
        }),
      },
    ];
    for (const env of cases) {
      const decision = liveEmailTransportDecision(env);
      assert.equal(decision.allowed, false, JSON.stringify({ envKeys: Object.keys(env), decision }));
      const adapter = resolveActiveClinicEmailAdapter(env, {
        fetchImpl: unexpectedNetworkFetch(),
      });
      assert.equal(adapter.id, "activeclinic_email_unavailable");
      assert.equal(resolveOutboundEmailStatus(env).state, "disabled");
    }
  });

  it("fails closed on incomplete production Resend config", () => {
    const missingAdapter = liveEmailTransportDecision(
      productionMailEnv({ ACTIVECLINIC_EMAIL_DELIVERY_ADAPTER: "" })
    );
    assert.equal(missingAdapter.allowed, false);
    assert.equal(missingAdapter.reason, PROVIDER.ADAPTER_NOT_SELECTED);
    assert.equal(
      resolveOutboundEmailStatus(productionMailEnv({ ACTIVECLINIC_EMAIL_DELIVERY_ADAPTER: "" })).label,
      "Email not configured"
    );

    const missingKey = liveEmailTransportDecision(productionMailEnv({ RESEND_API_KEY: "" }));
    assert.equal(missingKey.allowed, false);
    assert.equal(missingKey.reason, PROVIDER.CONFIGURATION_ERROR);
    assert.equal(
      resolveOutboundEmailStatus(productionMailEnv({ RESEND_API_KEY: "" })).label,
      "Resend selected but incomplete"
    );

    const missingFrom = liveEmailTransportDecision(productionMailEnv({ ACTIVECLINIC_EMAIL_FROM: "" }));
    assert.equal(missingFrom.allowed, false);
    assert.equal(missingFrom.reason, PROVIDER.CONFIGURATION_ERROR);

    const badFrom = liveEmailTransportDecision(
      productionMailEnv({ ACTIVECLINIC_EMAIL_FROM: "not-an-email" })
    );
    assert.equal(badFrom.allowed, false);
    assert.equal(readResendSenderConfig(productionMailEnv({ ACTIVECLINIC_EMAIL_FROM: "not-an-email" })).ok, false);

    const badReply = liveEmailTransportDecision(
      productionMailEnv({ ACTIVECLINIC_EMAIL_REPLY_TO: "not-an-email" })
    );
    assert.equal(badReply.allowed, false);

    assert.equal(
      resolveActiveClinicEmailAdapter(productionMailEnv({ RESEND_API_KEY: "" }), {
        fetchImpl: unexpectedNetworkFetch(),
      }).id,
      "activeclinic_email_unavailable"
    );
  });

  it("constructs Resend only when production config is complete", () => {
    const env = productionMailEnv();
    const decision = liveEmailTransportDecision(env);
    assert.equal(decision.allowed, true);
    assert.equal(decision.adapterName, "resend");
    const adapter = resolveActiveClinicEmailAdapter(env, {
      fetchImpl: unexpectedNetworkFetch(),
    });
    assert.equal(adapter.id, "activeclinic_email_resend");
    assert.equal(adapter.sendingAvailable, true);
    assert.equal(resolveOutboundEmailStatus(env).label, "Resend available for production");
    const cfg = readResendSenderConfig(env);
    assert.equal(cfg.fromHeader, "ActiveClinic <noreply@activeclinic.example>");
    assert.equal(cfg.replyTo, "support@activeclinic.example");
  });

  it("maps mocked Resend outcomes to honest Phase G statuses", async () => {
    const scenarios = [
      {
        name: "accepted",
        handler: async () => jsonResponse(200, { id: "email_accepted_1" }),
        status: "queued",
        providerCode: PROVIDER.RESEND,
        accepted: true,
      },
      {
        name: "invalid request",
        handler: async () => jsonResponse(422, { name: "validation_error", message: "raw provider body" }),
        status: "failed",
        providerCode: PROVIDER.REQUEST_REJECTED,
        accepted: false,
      },
      {
        name: "unauthorized",
        handler: async () => jsonResponse(401, { name: "invalid_api_key", message: "secret leak" }),
        status: "failed",
        providerCode: PROVIDER.AUTHENTICATION_FAILED,
        accepted: false,
      },
      {
        name: "rate limited",
        handler: async () => jsonResponse(429, { name: "rate_limit_exceeded", message: "slow down raw" }),
        status: "failed",
        providerCode: PROVIDER.RATE_LIMITED,
        accepted: false,
      },
      {
        name: "provider 5xx",
        handler: async () => jsonResponse(503, { name: "application_error", message: "upstream raw" }),
        status: "failed",
        providerCode: PROVIDER.PROVIDER_UNAVAILABLE,
        accepted: false,
      },
      {
        name: "malformed",
        handler: async () => jsonResponse(200, { not: "an-id" }),
        status: "failed",
        providerCode: PROVIDER.UNKNOWN,
        accepted: false,
      },
      {
        name: "network",
        handler: async () => {
          throw new Error("ECONNRESET");
        },
        status: "failed",
        providerCode: PROVIDER.PROVIDER_UNAVAILABLE,
        accepted: false,
      },
    ];

    for (const scenario of scenarios) {
      const { fetchImpl, calls } = mockResendFetch(scenario.handler);
      const logs = [];
      const result = await sendActiveClinicEmail({
        env: productionMailEnv(),
        fetchImpl,
        log: (entry) => logs.push(entry),
        templateKey: TEMPLATE.INFORMATION_REQUESTED,
        recipient: "applicant@clinic.example",
        publicOrigin: TEST_ORIGIN,
        idempotencyKey: "information_requested:evt-resend-1",
        fields: {
          clinicName: "Demo",
          applicationNumber: "AC-1",
          requestText: "Licence please",
        },
      });
      assert.equal(result.reviewDeliveryStatus, scenario.status, scenario.name);
      assert.equal(result.accepted, scenario.accepted, scenario.name);
      assert.equal(result.delivered, false, scenario.name);
      assert.notEqual(result.reviewDeliveryStatus, "sent", scenario.name);
      assert.equal(result.providerCode, scenario.providerCode, scenario.name);
      const dumped = JSON.stringify({ result, logs, calls });
      assert.doesNotMatch(dumped, /raw provider body|secret leak|slow down raw|upstream raw/i);
      if (scenario.name !== "network") {
        assert.equal(calls[0].url, RESEND_EMAILS_URL);
        assert.equal(calls[0].authorizationIsBearer, true);
        assert.equal(calls[0].idempotencyKey, "information_requested:evt-resend-1");
        assert.equal(calls[0].body.from, "ActiveClinic <noreply@activeclinic.example>");
        assert.deepEqual(calls[0].body.to, ["applicant@clinic.example"]);
        assert.equal(calls[0].body.reply_to, "support@activeclinic.example");
        assert.ok(calls[0].body.html);
        assert.ok(calls[0].body.text);
        assert.doesNotMatch(JSON.stringify(calls[0].body), /password_hash|RESEND_API_KEY/i);
      }
    }
  });

  it("does not expose provider bodies or activation tokens in logs", async () => {
    const { fetchImpl } = mockResendFetch(async () =>
      jsonResponse(401, { name: "invalid_api_key", message: "credential dump" })
    );
    const logs = [];
    const result = await sendActiveClinicEmail({
      env: productionMailEnv(),
      fetchImpl,
      log: (entry) => logs.push(entry),
      templateKey: TEMPLATE.STAFF_INVITATION,
      recipient: "nurse@clinic.example",
      publicOrigin: TEST_ORIGIN,
      idempotencyKey: "staff.invitation:token-1",
      fields: {
        organizationName: "Sunrise Clinic",
        activationUrl: `${TEST_ORIGIN}/activate/super-secret-token`,
      },
    });
    assert.equal(result.providerCode, PROVIDER.AUTHENTICATION_FAILED);
    const dumped = JSON.stringify({ result, logs });
    assert.doesNotMatch(dumped, /credential dump|super-secret-token|Bearer re_/i);
    assert.equal(logs[0].recipientMasked, "n***@clinic.example");
    assert.equal(logs[0].idempotencyKey, "staff.invitation:token-1");
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
      province: "Lusaka",
      city: "Lusaka",
      countryCode: "ZM",
      password: ADMIN_PASSWORD,
      passwordConfirm: ADMIN_PASSWORD,
      acceptTerms: "on",
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

  it("sends ready-to-sign-in for provisioned clinics only, not website_pending, and not twice", async () => {
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
      0
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

  it("records mocked Resend acceptance as queued for the three Phase G messages", async () => {
    requireDb();
    const { payload, created } = await createPending();
    const { fetchImpl, calls } = mockResendFetch(async () => jsonResponse(200, { id: "email_info_1" }));
    const adapter = createResendAdapter({
      apiKey: RESEND_TEST_KEY,
      from: "ActiveClinic <noreply@activeclinic.example>",
      fetchImpl,
    });
    const requested = await requestClinicRegistrationInformation(pool, {
      applicationId: created.id,
      requestText: "Please send your facility licence number.",
      publicOrigin: TEST_ORIGIN,
      emailAdapter: adapter,
    });
    assert.equal(requested.ok, true, JSON.stringify(requested));
    assert.equal(requested.deliveryStatus, "queued");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].idempotencyKey, `information_requested:${requested.event.id}`);

    const failedFetch = mockResendFetch(async () =>
      jsonResponse(422, { name: "validation_error", message: "provider dump" })
    );
    const failed = await requestClinicRegistrationInformation(pool, {
      applicationId: created.id,
      requestText: "Second request after mock rejection.",
      publicOrigin: TEST_ORIGIN,
      emailAdapter: createResendAdapter({
        apiKey: RESEND_TEST_KEY,
        from: RESEND_FROM,
        fetchImpl: failedFetch.fetchImpl,
      }),
    });
    assert.equal(failed.ok, true);
    assert.equal(failed.deliveryStatus, "failed");
    assert.doesNotMatch(JSON.stringify(failed), /provider dump/i);

    const readyFetch = mockResendFetch(async () => jsonResponse(200, { id: "email_ready_1" }));
    const pending = await createPending();
    const approved = await approveAndProvisionClinicRegistration(pool, {
      applicationId: pending.created.id,
      dataEnvironment: "testing",
      deploymentCode: CODE_MOOVEX_PLATFORM_TESTING,
      publicOrigin: TEST_ORIGIN,
      emailAdapter: createResendAdapter({
        apiKey: RESEND_TEST_KEY,
        from: RESEND_FROM,
        fetchImpl: readyFetch.fetchImpl,
      }),
    });
    assert.equal(approved.ok, true, JSON.stringify(approved));
    assert.equal(readyFetch.calls.length, 1);
    assert.match(readyFetch.calls[0].idempotencyKey, /^ready_to_sign_in:/);
    const retryReady = await approveAndProvisionClinicRegistration(pool, {
      applicationId: pending.created.id,
      dataEnvironment: "testing",
      deploymentCode: CODE_MOOVEX_PLATFORM_TESTING,
      publicOrigin: TEST_ORIGIN,
      emailAdapter: createResendAdapter({
        apiKey: RESEND_TEST_KEY,
        from: RESEND_FROM,
        fetchImpl: readyFetch.fetchImpl,
      }),
    });
    assert.equal(retryReady.ok, true);
    assert.equal(readyFetch.calls.length, 1);

    const inviteFetch = mockResendFetch(async () => jsonResponse(200, { id: "email_invite_1" }));
    const invited = await inviteActiveClinicStaff(pool, {
      organizationId: approved.organizationId,
      healthcareOrganizationId: approved.healthcareOrganization.id,
      facilityIds: approved.facility ? [approved.facility.id] : [],
      firstName: "Resend",
      lastName: "Invite",
      phone: nextPhone(),
      email: `resend-${Date.now()}@clinic.example`,
      employmentType: "permanent",
      roleAssignments: [],
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
      publicOrigin: TEST_ORIGIN,
      emailAdapter: createResendAdapter({
        apiKey: RESEND_TEST_KEY,
        from: RESEND_FROM,
        fetchImpl: inviteFetch.fetchImpl,
      }),
    });
    assert.equal(invited.ok, true, JSON.stringify({ code: invited.code }));
    assert.equal(invited.deliveryStatus, "queued");
    assert.equal(inviteFetch.calls.length, 1);
    assert.equal(inviteFetch.calls[0].idempotencyKey, `staff.invitation:${invited.tokenId}`);
  });

  it("does not claim a live provider from env-key presence in source", () => {
    const settings = fs.readFileSync(
      path.join(__dirname, "..", "src/platform/services/getPlatformAdminSettingsView.js"),
      "utf8"
    );
    const delivery = fs.readFileSync(
      path.join(__dirname, "..", "src/activeclinic/services/activeClinicEmailDelivery.js"),
      "utf8"
    );
    assert.match(delivery, /adapter_not_enabled/);
    assert.match(delivery, /Resend available for production/);
    assert.match(settings, /resolveOutboundEmailStatus/);
    assert.doesNotMatch(
      settings,
      /if \(e\.SMTP_URL \|\| e\.SENDGRID_API_KEY \|\| e\.POSTMARK_SERVER_TOKEN/
    );
    assert.doesNotMatch(settings, /RESEND_API_KEY[\s\S]{0,80}configured/);
    assert.doesNotMatch(settings, /Send test email/i);
  });
});
