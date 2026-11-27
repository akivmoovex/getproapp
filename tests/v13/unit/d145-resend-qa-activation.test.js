"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { createOtpService } = require("../../../src/platform/otp/otpService");
const {
  createFakeOtpProvider,
  resolveOtpProvider,
} = require("../../../src/platform/otp/otpProviders");
const { resolveOtpActivation } = require("../../../src/platform/otp/otpActivation");
const { diagnoseOtpReadiness } = require("../../../src/platform/otp/otpReadinessDiagnostics");
const {
  APPROVED_QA_DATA_DIRECTORY,
  APPROVED_QA_SOCKET_DIRECTORY,
  QA_INSTANCE_ID,
  evaluateQaLiveDelivery,
} = require("../../../src/platform/otp/otpQaLiveDelivery");
const { createMockDurableBudget } = require("../helpers/qaDeliveryFixture");
const {
  createResendOtpEmailTransport,
  diagnoseResendOtpTransport,
  assertQaRecipientAllowed,
} = require("../../../src/platform/email/resendOtpTransport");
const { resolveProductSender } = require("../../../src/platform/email/resendSenderCatalog");

const KEY = "re_test_key_not_a_secret";
const PEPPER = "unit-test-otp-pepper-32b-minimum!!";
const PASSWORD = "not-a-real-password";
const RECIPIENT = "qa.mailbox@pronline.org";
const ORG = "11111111-1111-4111-8111-111111111111";
const ACCOUNT = "22222222-2222-4222-8222-222222222222";

function databaseUrl(extra) {
  const host = extra && extra.host ? extra.host : "127.0.0.1";
  const port = extra && extra.port ? extra.port : "55432";
  const database = extra && extra.database ? extra.database : "getpro_v13_e2e_g78d2301";
  const role = extra && extra.role ? extra.role : "v13_regression_213101";
  return `postgresql://${role}:${PASSWORD}@${host}:${port}/${database}`;
}

function approvedEnv(extra) {
  return {
    NODE_ENV: "test",
    DEPLOYMENT_ENV: "testing",
    DATABASE_IDENTITY_ENV: "testing",
    DATABASE_IDENTITY_EXPECTED: "moovex-platform-v7",
    GETPRO_OTP_QA_LIVE_DELIVERY: "owner-approved",
    GETPRO_RESEND_SENDER_PROFILE: "hosted-qa",
    GETPRO_RESEND_VERIFIED_DOMAINS: "pronline.org",
    GETPRO_RESEND_QA_RECIPIENTS: RECIPIENT,
    RESEND_API_KEY: KEY,
    GETPRO_OTP_PEPPER: PEPPER,
    GETPRO_OTP_QA_PROVIDER_BUDGET: "3",
    GETPRO_V13_APPROVED_DB_TARGET: "getpro_v13_e2e_g78d2301",
    DATABASE_URL: databaseUrl(),
    GETPRO_OTP_PROVIDER: "resend",
    ...(extra || {}),
  };
}

function identity(extra) {
  return {
    ok: true,
    currentDatabase: "getpro_v13_e2e_g78d2301",
    host: "127.0.0.1",
    port: "55432",
    identityEnv: "testing",
    identityKey: "moovex-platform-v7",
    ...(extra || {}),
  };
}

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() {
      return JSON.stringify(body || {});
    },
  };
}

async function withFetchGuard(fn) {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    throw new Error("accidental_network");
  };
  try {
    return await fn(() => calls);
  } finally {
    globalThis.fetch = original;
  }
}

function assertNoSecrets(value) {
  const encoded = JSON.stringify(value);
  assert.equal(encoded.includes(KEY), false);
  assert.equal(encoded.includes(PEPPER), false);
  assert.equal(encoded.includes(PASSWORD), false);
}

describe("D145 Resend QA live-delivery gate", () => {
  it("keeps delivery disabled and live send unauthorized by default", async () => {
    const decision = await evaluateQaLiveDelivery({});
    assert.equal(decision.authorized, false);
    assert.equal(decision.liveSendAuthorized, false);
    assert.equal(resolveOtpProvider({}).deliveryActivated, false);
    assert.equal(resolveOtpProvider({}).contactsNetwork, false);
    assert.equal(diagnoseResendOtpTransport({}, "blessboard").liveSendAuthorized, false);
    const readiness = diagnoseOtpReadiness({});
    assert.equal(readiness.deliveryActivated, false);
    assert.equal(readiness.qaLiveDeliveryAuthorized, false);
    assert.equal(readiness.liveMailboxAuthorized, false);
    assert.equal(readiness.emailOtpQaGoNoGo, "NO-GO");
    await withFetchGuard(async (calls) => {
      const transport = createResendOtpEmailTransport({
        RESEND_API_KEY: KEY,
        GETPRO_RESEND_VERIFIED_DOMAINS: "notify.activeclinic.org",
      });
      const blocked = await transport({
        productCode: "activeclinic",
        destination: "patient@example.com",
        text: "Your verification code is 135790. It expires in 5 minutes.",
        idempotencyKey: "default-blocked",
      });
      assert.equal(blocked.ok, false);
      assert.equal(calls(), 0);
    });
  });

  it("rejects a single activation flag and a missing owner approval", async () => {
    const onlyFlag = await evaluateQaLiveDelivery({
      GETPRO_OTP_QA_LIVE_DELIVERY: "owner-approved",
    });
    assert.equal(onlyFlag.authorized, false);
    assert.ok(onlyFlag.reasons.includes("qa_live_delivery_not_approved") === false);
    assert.ok(onlyFlag.reasons.length > 1);

    const missing = await evaluateQaLiveDelivery(
      approvedEnv({ GETPRO_OTP_QA_LIVE_DELIVERY: "" }),
      { databaseIdentity: identity() }
    );
    assert.equal(missing.authorized, false);
    assert.ok(missing.reasons.includes("qa_live_delivery_not_approved"));
    assertNoSecrets(missing);
  });

  it("blocks production signals even when every QA flag is present", async () => {
    let probes = 0;
    const probe = async () => {
      probes += 1;
      return identity();
    };
    const cases = [
      approvedEnv({ NODE_ENV: "production" }),
      approvedEnv({ NODE_ENV: "test", DEPLOYMENT_ENV: "production" }),
      approvedEnv({ DATABASE_IDENTITY_ENV: "production" }),
      approvedEnv({ PLATFORM_DEPLOYMENT_CODE: "moovex-platform-production" }),
    ];
    for (const env of cases) {
      const decision = await evaluateQaLiveDelivery(env, { databaseIdentityProbe: probe });
      assert.equal(decision.authorized, false);
      assert.ok(decision.reasons.includes("production_environment"));
      assert.equal(
        resolveOtpActivation({ ...env, GETPRO_OTP_ACTIVATION: "ACTIVE" }).status,
        "BLOCKED"
      );
    }
    assert.equal(probes, 0);
    assert.equal(
      resolveOtpProvider(approvedEnv({ NODE_ENV: "production" })).deliveryActivated,
      false
    );
  });

  it("rejects the wrong database, shared port, and a non-loopback host without probing", async () => {
    let probes = 0;
    const probe = async () => {
      probes += 1;
      return identity();
    };
    const wrongName = await evaluateQaLiveDelivery(
      approvedEnv({ DATABASE_URL: databaseUrl({ database: "getpro_v13_e2e_regression213101" }) }),
      { databaseIdentityProbe: probe }
    );
    assert.ok(wrongName.reasons.includes("database_identity_mismatch"));
    const sharedPort = await evaluateQaLiveDelivery(
      approvedEnv({ DATABASE_URL: databaseUrl({ port: "5432" }) }),
      { databaseIdentityProbe: probe }
    );
    assert.ok(sharedPort.reasons.includes("database_port_shared"));
    const remote = await evaluateQaLiveDelivery(
      approvedEnv({ DATABASE_URL: databaseUrl({ host: "db.example.com" }) }),
      { databaseIdentityProbe: probe }
    );
    assert.ok(remote.reasons.includes("database_host_not_loopback"));
    const mismatch = await evaluateQaLiveDelivery(approvedEnv(), {
      productCode: "blessboard",
      purpose: "login",
      destination: RECIPIENT,
      attemptBudgetStore: createMockDurableBudget(),
      databaseIdentityProbe: async (request) => {
        probes += 1;
        assert.equal(request.password, undefined);
        assert.equal(request.connect.password, undefined);
        assert.equal(JSON.stringify(request).includes(PASSWORD), false);
        assert.equal(request.identityKey, undefined);
        assert.equal(request.dataDirectory, undefined);
        return {
          ok: true,
          evidence: "postgresql_observation",
          nonce: request.nonce,
          currentDatabase: "getpro_v13_e2e_otpqa135",
          inetServerPort: "55432",
          host: "127.0.0.1",
          currentUser: "v13_regression_213101",
          identityKey: "moovex-platform-v7",
          identityEnv: "testing",
          instanceId: QA_INSTANCE_ID,
          dataDirectory: APPROVED_QA_DATA_DIRECTORY,
          socketDirectory: APPROVED_QA_SOCKET_DIRECTORY,
          pathEvidence: "listener_postmaster_pid",
        };
      },
    });
    assert.ok(mismatch.reasons.includes("database_identity_mismatch"));
    const unverified = await evaluateQaLiveDelivery(approvedEnv(), {});
    assert.ok(unverified.reasons.includes("database_identity_unverified"));
    assert.equal(probes, 1);
    assertNoSecrets(wrongName);
  });

  it("rejects sender, domain, recipient, product, key, pepper, and budget defects", async () => {
    const attested = { databaseIdentity: identity() };
    const missingProfile = await evaluateQaLiveDelivery(
      approvedEnv({ GETPRO_RESEND_SENDER_PROFILE: "" }),
      attested
    );
    assert.ok(missingProfile.reasons.includes("sender_profile_not_approved"));
    const productionProfile = await evaluateQaLiveDelivery(
      approvedEnv({ GETPRO_RESEND_SENDER_PROFILE: "production" }),
      attested
    );
    assert.equal(productionProfile.authorized, false);
    assert.ok(productionProfile.reasons.includes("sender_profile_not_approved"));

    const missingDomain = await evaluateQaLiveDelivery(
      approvedEnv({ GETPRO_RESEND_VERIFIED_DOMAINS: "" }),
      attested
    );
    assert.ok(missingDomain.reasons.includes("verified_domain_missing"));
    const extraDomain = await evaluateQaLiveDelivery(
      approvedEnv({ GETPRO_RESEND_VERIFIED_DOMAINS: "pronline.org,notify.blessboard.com" }),
      attested
    );
    assert.ok(extraDomain.reasons.includes("verified_domain_not_exact"));

    const missingRecipients = await evaluateQaLiveDelivery(
      approvedEnv({ GETPRO_RESEND_QA_RECIPIENTS: "" }),
      attested
    );
    assert.ok(missingRecipients.reasons.includes("qa_recipient_allowlist_missing"));
    const wildcard = await evaluateQaLiveDelivery(
      approvedEnv({ GETPRO_RESEND_QA_RECIPIENTS: "*" }),
      { ...attested, destination: RECIPIENT }
    );
    assert.ok(wildcard.reasons.includes("qa_recipient_allowlist_rejected"));
    const malformed = await evaluateQaLiveDelivery(
      approvedEnv({ GETPRO_RESEND_QA_RECIPIENTS: "not-an-email" }),
      attested
    );
    assert.ok(malformed.reasons.includes("qa_recipient_allowlist_rejected"));
    const unapproved = await evaluateQaLiveDelivery(approvedEnv(), {
      ...attested,
      destination: "other@pronline.org",
    });
    assert.ok(unapproved.reasons.includes("qa_recipient_not_allowlisted"));
    assert.equal(
      assertQaRecipientAllowed(
        approvedEnv({ GETPRO_RESEND_QA_RECIPIENTS: "qa.mailbox@pronline.org,*" }),
        RECIPIENT
      ).reason,
      "qa_recipient_allowlist_rejected"
    );

    const missingKey = await evaluateQaLiveDelivery(approvedEnv({ RESEND_API_KEY: "" }), attested);
    assert.ok(missingKey.reasons.includes("missing_api_key"));
    const missingPepper = await evaluateQaLiveDelivery(
      approvedEnv({ GETPRO_OTP_PEPPER: "" }),
      attested
    );
    assert.ok(missingPepper.reasons.includes("otp_pepper_missing"));
    const publishedPepper = await evaluateQaLiveDelivery(
      approvedEnv({ GETPRO_OTP_PEPPER: "g187-published-test-pepper-not-secret" }),
      attested
    );
    assert.ok(publishedPepper.reasons.includes("otp_pepper_rejected"));

    for (const productCode of ["pronline", "neuniversity", ""]) {
      const decision = await evaluateQaLiveDelivery(approvedEnv(), { ...attested, productCode });
      assert.ok(decision.reasons.includes("unauthorized_product"));
    }
    assert.equal(
      resolveProductSender("pronline", {
        GETPRO_RESEND_SENDER_PROFILE: "hosted-qa",
        GETPRO_RESEND_VERIFIED_DOMAINS: "pronline.org",
      }).reason,
      "not_configured"
    );

    const missingBudget = await evaluateQaLiveDelivery(
      approvedEnv({ GETPRO_OTP_QA_PROVIDER_BUDGET: "" }),
      attested
    );
    assert.ok(missingBudget.reasons.includes("provider_budget_missing"));
    const exhausted = await evaluateQaLiveDelivery(approvedEnv({ GETPRO_OTP_QA_PROVIDER_BUDGET: "1" }), {
      ...attested,
      providerRequestsUsed: 1,
      productCode: "activeclinic",
      destination: RECIPIENT,
    });
    assert.ok(exhausted.reasons.includes("provider_budget_rejected"));
    assert.equal(exhausted.authorized, false);
    assertNoSecrets(missingKey);
  });

  it("allows a mocked provider request only when every gate passes", async () => {
    const seen = [];
    const store = createMockDurableBudget();
    const decision = await evaluateQaLiveDelivery(approvedEnv(), {
      productCode: "blessboard",
      purpose: "login",
      destination: RECIPIENT,
      attemptBudgetStore: store,
      databaseIdentity: identity(),
      databaseIdentityProbe: async (request) => {
        seen.push(request);
        return {
          ok: true,
          evidence: "postgresql_observation",
          nonce: request.nonce,
          currentDatabase: "getpro_v13_e2e_g78d2301",
          inetServerPort: "55432",
          host: "127.0.0.1",
          currentUser: "v13_regression_213101",
          identityKey: "moovex-platform-v7",
          identityEnv: "testing",
          instanceId: QA_INSTANCE_ID,
          dataDirectory: APPROVED_QA_DATA_DIRECTORY,
          socketDirectory: APPROVED_QA_SOCKET_DIRECTORY,
          pathEvidence: "listener_postmaster_pid",
        };
      },
    });
    assert.equal(decision.authorized, true);
    assert.equal(decision.liveSendAuthorized, true);
    assert.equal(seen.length, 1);
    assert.deepEqual(seen[0].connect, {
      host: "127.0.0.1",
      port: "55432",
      database: "getpro_v13_e2e_g78d2301",
      username: "v13_regression_213101",
    });
    assert.equal(seen[0].identityKey, undefined);
    assert.equal(typeof seen[0].nonce, "string");
    assertNoSecrets(decision);
    assert.equal(
      diagnoseResendOtpTransport(approvedEnv(), "activeclinic").liveSendAuthorized,
      false
    );
    assert.equal(
      diagnoseOtpReadiness(approvedEnv(), { databaseIdentity: identity() }).qaLiveDeliveryAuthorized,
      false
    );
    assert.equal(
      diagnoseOtpReadiness(approvedEnv(), { databaseIdentity: identity() }).deliveryActivated,
      false
    );
    assert.equal(
      diagnoseOtpReadiness(approvedEnv(), { databaseIdentity: identity() }).emailOtpQaGoNoGo,
      "NO-GO"
    );

    await withFetchGuard(async (calls) => {
      let mocked = 0;
      const provider = resolveOtpProvider(approvedEnv(), {
        fetchImpl: async () => {
          mocked += 1;
          return jsonResponse(200, { id: "email_qa_mock" });
        },
        attemptBudgetStore: store,
        databaseIdentityProbe: async (request) => ({
          ok: true,
          evidence: "postgresql_observation",
          nonce: request.nonce,
          currentDatabase: "getpro_v13_e2e_g78d2301",
          inetServerPort: "55432",
          host: "127.0.0.1",
          currentUser: "v13_regression_213101",
          identityKey: "moovex-platform-v7",
          identityEnv: "testing",
          instanceId: QA_INSTANCE_ID,
          dataDirectory: APPROVED_QA_DATA_DIRECTORY,
          socketDirectory: APPROVED_QA_SOCKET_DIRECTORY,
          pathEvidence: "listener_postmaster_pid",
        }),
      });
      assert.equal(provider.deliveryActivated, false);
      assert.equal(provider.contactsNetwork, false);
      const sent = await provider.dispatch({
        channel: "email",
        destination: RECIPIENT,
        code: "135790",
        productCode: "blessboard",
        purpose: "login",
        idempotencyKey: "qa-mock-1",
      });
      assert.equal(sent.ok, true);
      assert.equal(sent.publicStatus, "accepted");
      assert.equal(mocked, 1);
      assert.equal(calls(), 0);
    });
  });

  it("stops an exhausted budget and a provider failure without a real network call", async () => {
    await withFetchGuard(async (calls) => {
      const observation = (request) => ({
        ok: true,
        evidence: "postgresql_observation",
        nonce: request.nonce,
        currentDatabase: "getpro_v13_e2e_g78d2301",
        inetServerPort: "55432",
        host: "127.0.0.1",
        currentUser: "v13_regression_213101",
        identityKey: "moovex-platform-v7",
        identityEnv: "testing",
        instanceId: QA_INSTANCE_ID,
        dataDirectory: APPROVED_QA_DATA_DIRECTORY,
        socketDirectory: APPROVED_QA_SOCKET_DIRECTORY,
          pathEvidence: "listener_postmaster_pid",
      });
      const exhaustedStore = createMockDurableBudget({ used: 3 });
      const transport = createResendOtpEmailTransport(approvedEnv(), {
        databaseIdentityProbe: async (request) => observation(request),
        attemptBudgetStore: exhaustedStore,
      });
      const exhausted = await transport({
        productCode: "blessboard",
        purpose: "login",
        destination: RECIPIENT,
        text: "Your verification code is 135790. It expires in 5 minutes.",
        idempotencyKey: "budget-exhausted",
      });
      assert.equal(exhausted.ok, false);
      assert.equal(exhausted.reason, "provider_budget_exhausted");
      assert.equal(calls(), 0);

      let failures = 0;
      const failing = createResendOtpEmailTransport(approvedEnv(), {
        databaseIdentityProbe: async (request) => observation(request),
        attemptBudgetStore: createMockDurableBudget(),
        fetchImpl: async () => {
          failures += 1;
          return jsonResponse(500, { name: "provider_unavailable" });
        },
      });
      const failed = await failing({
        productCode: "blessboard",
        purpose: "login",
        destination: RECIPIENT,
        text: "Your verification code is 135790. It expires in 5 minutes.",
        idempotencyKey: "provider-failed",
      });
      assert.equal(failed.ok, false);
      assert.equal(failed.reason, "retry_exhausted");
      assert.equal(failures, 3);
      assert.equal(calls(), 0);
      assertNoSecrets(failed);
    });
  });

  it("withholds the session until the protected action and rejects fake production OTP", async () => {
    const env = {
      NODE_ENV: "test",
      DEPLOYMENT_ENV: "testing",
      DATABASE_IDENTITY_ENV: "testing",
      DATABASE_IDENTITY_EXPECTED: "moovex-platform-v7",
      PLATFORM_DEPLOYMENT_CODE: "moovex-platform-testing",
      GETPRO_OTP_ALLOW_FIXED_CODE: "1",
      GETPRO_OTP_PEPPER: PEPPER,
      GETPRO_OTP_PROVIDER: "fake",
    };
    const service = createOtpService({ provider: createFakeOtpProvider() });
    const started = await service.beginChallenge(
      {
        action: "auth.login",
        productCode: "blessboard",
        channel: "email",
        organizationId: ORG,
        accountId: ACCOUNT,
        identifier: RECIPIENT,
        accountResolved: true,
      },
      env
    );
    assert.equal(started.server.sessionComplete, false);
    const verified = await service.verifyChallenge(
      {
        action: "auth.login",
        productCode: "blessboard",
        channel: "email",
        organizationId: ORG,
        accountId: ACCOUNT,
        attemptId: started.server.attemptId,
        code: "1234",
      },
      env
    );
    assert.equal(verified.server.reason, "verified");
    assert.equal(verified.server.sessionComplete, false);
    const completed = await service.completeProtectedAction(
      { ...verified, channel: "email" },
      "auth.login"
    );
    assert.equal(completed.sessionComplete, true);

    const production = {
      NODE_ENV: "production",
      DEPLOYMENT_ENV: "production",
      DATABASE_IDENTITY_ENV: "production",
      GETPRO_OTP_PROVIDER: "fake",
      GETPRO_OTP_QA_LIVE_DELIVERY: "owner-approved",
    };
    assert.equal(resolveOtpProvider(production).name, "inactive");
    const forbidden = await createFakeOtpProvider().dispatch({ code: "1234", env: production });
    assert.equal(forbidden.reason, "fake_forbidden");
  });

  it("blocks an injected fetch unless a fresh QA decision authorizes it", async () => {
    let calls = 0;
    const fetchImpl = async () => {
      calls += 1;
      return jsonResponse(200, { id: "email_existing" });
    };
    const blocked = createResendOtpEmailTransport(
      { RESEND_API_KEY: KEY, GETPRO_RESEND_VERIFIED_DOMAINS: "notify.activeclinic.org" },
      { fetchImpl }
    );
    const denied = await blocked({
      productCode: "activeclinic",
      destination: "patient@example.com",
      text: "Your verification code is 135790. It expires in 5 minutes.",
      idempotencyKey: "existing-1",
      fetchImpl,
    });
    assert.equal(denied.ok, false);
    assert.equal(calls, 0);
    const readiness = diagnoseResendOtpTransport(
      { RESEND_API_KEY: KEY, GETPRO_RESEND_VERIFIED_DOMAINS: "notify.activeclinic.org" },
      "activeclinic"
    );
    assert.equal(readiness.ok, true);
    assert.equal(readiness.liveSendAuthorized, false);

    const observation = (request) => ({
      ok: true,
      evidence: "postgresql_observation",
      nonce: request.nonce,
      currentDatabase: "getpro_v13_e2e_g78d2301",
      inetServerPort: "55432",
      host: "127.0.0.1",
      currentUser: "v13_regression_213101",
      identityKey: "moovex-platform-v7",
      identityEnv: "testing",
      instanceId: QA_INSTANCE_ID,
      dataDirectory: APPROVED_QA_DATA_DIRECTORY,
      socketDirectory: APPROVED_QA_SOCKET_DIRECTORY,
          pathEvidence: "listener_postmaster_pid",
    });
    const transport = createResendOtpEmailTransport(approvedEnv(), {
      fetchImpl,
      databaseIdentityProbe: async (request) => observation(request),
      attemptBudgetStore: createMockDurableBudget(),
    });
    const payload = {
      productCode: "blessboard",
      purpose: "login",
      destination: RECIPIENT,
      text: "Your verification code is 135790. It expires in 5 minutes.",
      idempotencyKey: "authorized-1",
    };
    const first = await transport(payload);
    const second = await transport(payload);
    assert.equal(first.ok, true);
    assert.equal(second.reason, "duplicate_suppressed");
    assert.equal(calls, 1);
  });
});
