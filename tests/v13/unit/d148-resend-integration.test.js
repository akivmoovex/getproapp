"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { createOtpService } = require("../../../src/platform/otp/otpService");
const { resolveOtpProvider, createFakeOtpProvider } = require("../../../src/platform/otp/otpProviders");
const { resolveOtpActivation } = require("../../../src/platform/otp/otpActivation");
const {
  evaluateQaLiveDelivery,
  createInProcessAttemptBudget,
  QA_HTTP_ATTEMPT_LIMIT,
  QA_SENDER_EMAIL,
} = require("../../../src/platform/otp/otpQaLiveDelivery");
const { createResendOtpEmailTransport } = require("../../../src/platform/email/resendOtpTransport");
const { resolveProductSender } = require("../../../src/platform/email/resendSenderCatalog");
const {
  attachOtpQaDeliveryDependencies,
  resetOtpDatabaseAttachment,
  evaluateOtpSessionGate,
} = require("../../../src/platform/otp/otpSessionGate");
const { issueAuthenticatedSessionCookie } = require("../../../src/platform/session/sharedSessionSecurity");
const { beginEligibleRecoveryOtp } = require("../../../src/platform/otp/otpPasswordRecoveryBridge");
const {
  KEY,
  PEPPER,
  PASSWORD,
  RECIPIENT,
  MESSAGE,
  approvedQaEnv,
  postgresqlObservation,
  createMockDurableBudget,
  jsonResponse,
  authorizedProbe,
} = require("../helpers/qaDeliveryFixture");

const ORG = "11111111-1111-4111-8111-111111111111";
const ACCOUNT = "22222222-2222-4222-8222-222222222222";

function assertNoSecrets(value) {
  const encoded = JSON.stringify(value);
  assert.equal(encoded.includes(KEY), false);
  assert.equal(encoded.includes(PEPPER), false);
  assert.equal(encoded.includes(PASSWORD), false);
  assert.equal(encoded.includes("1234"), false);
  assert.equal(encoded.includes("135790"), false);
}

function responseDouble() {
  const cookies = [];
  return {
    cookies,
    setHeader() {},
    getHeader() {
      return "";
    },
    cookie(name, value) {
      cookies.push({ name, value });
    },
  };
}

function requestDouble() {
  return { headers: {}, get() { return ""; } };
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

function readyDeps(extra) {
  return {
    productCode: "blessboard",
    purpose: "login",
    destination: RECIPIENT,
    attemptBudgetStore: createMockDurableBudget(),
    databaseIdentityProbe: authorizedProbe(),
    ...(extra || {}),
  };
}

describe("D148 Resend QA integration hardening", () => {
  it("keeps delivery disabled and blocks production, bad environments, and caller attestation", async () => {
    await withFetchGuard(async (calls) => {
      const defaults = await evaluateQaLiveDelivery({});
      assert.equal(defaults.authorized, false);
      assert.equal(defaults.liveSendAuthorized, false);
      assert.equal(resolveOtpProvider({}).deliveryActivated, false);
      assert.equal(resolveOtpActivation({ NODE_ENV: "production", GETPRO_OTP_ACTIVATION: "ACTIVE" }).status, "BLOCKED");

      let probes = 0;
      const probe = async () => {
        probes += 1;
        return { ok: true };
      };
      const production = await evaluateQaLiveDelivery(
        approvedQaEnv({ NODE_ENV: "production", GETPRO_OTP_ACTIVATION: "ACTIVE" }),
        readyDeps({ databaseIdentityProbe: probe, databaseIdentity: postgresqlObservation({ nonce: "forged" }) })
      );
      assert.equal(production.authorized, false);
      assert.ok(production.reasons.includes("production_environment"));
      assert.equal(probes, 0);

      const wrongEnv = await evaluateQaLiveDelivery(approvedQaEnv({ NODE_ENV: "staging" }), readyDeps({ databaseIdentityProbe: probe }));
      assert.ok(wrongEnv.reasons.includes("testing_environment_required"));
      assert.equal(wrongEnv.authorized, false);

      const attested = await evaluateQaLiveDelivery(approvedQaEnv(), {
        ...readyDeps({ databaseIdentityProbe: null }),
        databaseIdentity: postgresqlObservation({ nonce: "caller-supplied" }),
      });
      assert.equal(attested.authorized, false);
      assert.ok(attested.reasons.includes("database_identity_unverified"));
      assert.equal(probes, 0);
      assert.equal(calls(), 0);
      assertNoSecrets(attested);
    });
  });

  it("fail-closes a missing, stale, thrown, malformed, echoed, or inconsistent probe", async () => {
    const env = approvedQaEnv({ DATABASE_IDENTITY_EXPECTED: "echo-from-env" });
    const missing = await evaluateQaLiveDelivery(env, readyDeps({ databaseIdentityProbe: null }));
    assert.ok(missing.reasons.includes("database_identity_unverified"));

    const stale = await evaluateQaLiveDelivery(env, readyDeps({
      databaseIdentityProbe: async () => postgresqlObservation({ nonce: "stale-nonce" }),
    }));
    assert.ok(stale.reasons.includes("database_identity_stale"));

    const thrown = await evaluateQaLiveDelivery(env, readyDeps({
      databaseIdentityProbe: async () => {
        throw new Error("probe_failed");
      },
    }));
    assert.ok(thrown.reasons.includes("database_identity_unverified"));

    const malformed = await evaluateQaLiveDelivery(env, readyDeps({
      databaseIdentityProbe: async () => null,
    }));
    assert.ok(malformed.reasons.includes("database_identity_malformed"));

    const echoed = await evaluateQaLiveDelivery(env, readyDeps({
      databaseIdentityProbe: async (request) => ({
        ok: true,
        nonce: request.nonce,
        evidence: "request_echo",
        currentDatabase: request.connect.database,
        inetServerPort: request.connect.port,
        host: request.connect.host,
        currentUser: request.connect.username,
        identityKey: env.DATABASE_IDENTITY_EXPECTED,
        identityEnv: "testing",
        instanceId: "v13-regression-213101",
        dataDirectory: request.dataDirectory,
      }),
    }));
    assert.equal(echoed.authorized, false);
    assert.ok(echoed.reasons.includes("database_identity_unverified"));

    const cases = [
      { currentDatabase: "getpro_v13_e2e_regression213101" },
      { currentUser: "postgres" },
      { inetServerPort: "5432" },
      { host: "10.0.0.8" },
      { instanceId: "shared-cluster" },
      { dataDirectory: "/tmp/not-the-approved-cluster" },
      { identityKey: "echo-from-env" },
      { identityEnv: "production" },
    ];
    for (const override of cases) {
      const decision = await evaluateQaLiveDelivery(env, readyDeps({
        databaseIdentityProbe: async (request) => postgresqlObservation(request, override),
      }));
      assert.equal(decision.authorized, false, JSON.stringify(override));
      assert.ok(decision.reasons.includes("database_identity_mismatch"), JSON.stringify(override));
    }

    let seen = 0;
    const independent = await evaluateQaLiveDelivery(env, readyDeps({
      databaseIdentityProbe: async (request) => {
        seen += 1;
        assert.equal(request.identityKey, undefined);
        assert.equal(request.dataDirectory, undefined);
        return postgresqlObservation(request);
      },
    }));
    assert.equal(independent.authorized, true);
    assert.equal(seen, 1);
    assert.equal(env.DATABASE_IDENTITY_EXPECTED, "echo-from-env");
  });

  it("rejects domain, sender, product, recipient, key, and pepper defects before any fetch", async () => {
    await withFetchGuard(async (calls) => {
      const domain = await evaluateQaLiveDelivery(
        approvedQaEnv({ GETPRO_RESEND_VERIFIED_DOMAINS: "notify.blessboard.com" }),
        readyDeps()
      );
      assert.ok(domain.reasons.includes("verified_domain_not_exact"));
      const recipients = await evaluateQaLiveDelivery(
        approvedQaEnv({ GETPRO_RESEND_QA_RECIPIENTS: "" }),
        readyDeps()
      );
      assert.ok(recipients.reasons.includes("qa_recipient_allowlist_missing"));
      const many = await evaluateQaLiveDelivery(
        approvedQaEnv({ GETPRO_RESEND_QA_RECIPIENTS: "one@pronline.org,two@pronline.org" }),
        readyDeps()
      );
      assert.ok(many.reasons.includes("qa_recipient_allowlist_rejected"));
      const stranger = await evaluateQaLiveDelivery(approvedQaEnv(), readyDeps({ destination: "other@pronline.org" }));
      assert.ok(stranger.reasons.includes("qa_recipient_not_allowlisted"));
      const missingKey = await evaluateQaLiveDelivery(approvedQaEnv({ RESEND_API_KEY: "" }), readyDeps());
      assert.ok(missingKey.reasons.includes("missing_api_key"));
      const missingPepper = await evaluateQaLiveDelivery(approvedQaEnv({ GETPRO_OTP_PEPPER: "" }), readyDeps());
      assert.ok(missingPepper.reasons.includes("otp_pepper_missing"));
      for (const productCode of ["activeclinic", "pronline", "neuniversity"]) {
        const decision = await evaluateQaLiveDelivery(approvedQaEnv(), readyDeps({ productCode }));
        assert.ok(decision.reasons.includes("unauthorized_product"));
        assert.equal(decision.authorized, false);
      }
      assert.equal(
        resolveProductSender("pronline", approvedQaEnv()).reason,
        "not_configured"
      );
      assert.notEqual(
        resolveProductSender("activeclinic", approvedQaEnv()).sender.email,
        QA_SENDER_EMAIL
      );
      const transport = createResendOtpEmailTransport(approvedQaEnv(), {
        fetchImpl: async () => {
          throw new Error("fetch_must_not_run");
        },
        databaseIdentityProbe: authorizedProbe(),
        attemptBudgetStore: createMockDurableBudget(),
      });
      const blocked = await transport({
        productCode: "pronline",
        purpose: "login",
        destination: RECIPIENT,
        text: MESSAGE,
        idempotencyKey: "pronline-blocked",
      });
      assert.equal(blocked.ok, false);
      assert.equal(calls(), 0);
      assertNoSecrets(missingKey);
    });
  });

  it("blocks an injected fetch unless the service-boundary decision is authorized", async () => {
    await withFetchGuard(async (calls) => {
      let injected = 0;
      const fetchImpl = async () => {
        injected += 1;
        return jsonResponse(200, { id: "injected" });
      };
      const blocked = createResendOtpEmailTransport(approvedQaEnv(), { fetchImpl });
      const denied = await blocked({
        productCode: "blessboard",
        purpose: "login",
        destination: RECIPIENT,
        text: MESSAGE,
        idempotencyKey: "inject-1",
        fetchImpl: async () => {
          injected += 10;
          return jsonResponse(200, { id: "payload" });
        },
      });
      assert.equal(denied.ok, false);
      assert.equal(injected, 0);
      assert.equal(calls(), 0);

      let payloadFetches = 0;
      const allowed = createResendOtpEmailTransport(approvedQaEnv(), {
        fetchImpl,
        databaseIdentityProbe: authorizedProbe(),
        attemptBudgetStore: createMockDurableBudget(),
      });
      const sent = await allowed({
        productCode: "blessboard",
        purpose: "login",
        destination: RECIPIENT,
        text: MESSAGE,
        idempotencyKey: "inject-2",
        fetchImpl: async () => {
          payloadFetches += 1;
          return jsonResponse(200, { id: "payload" });
        },
      });
      assert.equal(sent.ok, true);
      assert.equal(injected, 1);
      assert.equal(payloadFetches, 0);
      assert.equal(calls(), 0);
    });
  });

  it("counts every retry and stops concurrent sends at the in-process cap", async () => {
    await withFetchGuard(async (calls) => {
      async function failTimes(impl) {
        let attempts = 0;
        const transport = createResendOtpEmailTransport(approvedQaEnv(), {
          databaseIdentityProbe: authorizedProbe(),
          attemptBudgetStore: createMockDurableBudget(),
          fetchImpl: async () => {
            attempts += 1;
            return impl();
          },
        });
        const result = await transport({
          productCode: "blessboard",
          purpose: "login",
          destination: RECIPIENT,
          text: MESSAGE,
          idempotencyKey: `retry-${attempts}-${Math.random()}`,
        });
        assert.equal(result.ok, false);
        assert.equal(result.reason, "retry_exhausted");
        assert.equal(attempts, QA_HTTP_ATTEMPT_LIMIT);
      }
      await failTimes(() => jsonResponse(429, { name: "rate_limit_exceeded" }));
      await failTimes(() => jsonResponse(500, { name: "internal_error" }));
      await failTimes(() => {
        const error = new Error("timed out");
        error.name = "TimeoutError";
        throw error;
      });
      await failTimes(() => {
        const error = new Error("connect ECONNREFUSED 127.0.0.1");
        error.code = "ECONNREFUSED";
        throw error;
      });
      assert.equal(calls(), 0);

      let release;
      const hold = new Promise((resolve) => {
        release = resolve;
      });
      const concurrent = [];
      const store = createMockDurableBudget();
      const transport = createResendOtpEmailTransport(approvedQaEnv(), {
        databaseIdentityProbe: authorizedProbe(),
        attemptBudgetStore: store,
        fetchImpl: async () => {
          concurrent.push(1);
          await hold;
          return jsonResponse(200, { id: "held" });
        },
      });
      const pending = Promise.all(
        [1, 2, 3, 4].map((n) =>
          transport({
            productCode: "blessboard",
            purpose: "login",
            destination: RECIPIENT,
            text: MESSAGE,
            idempotencyKey: `concurrent-${n}`,
          })
        )
      );
      const started = Date.now();
      while (concurrent.length < QA_HTTP_ATTEMPT_LIMIT) {
        if (Date.now() - started > 1000) break;
        await new Promise((resolve) => setImmediate(resolve));
      }
      assert.equal(concurrent.length, QA_HTTP_ATTEMPT_LIMIT);
      assert.equal(store.snapshot().used, QA_HTTP_ATTEMPT_LIMIT);
      release();
      await pending;
      assert.equal(concurrent.length, QA_HTTP_ATTEMPT_LIMIT);
      assert.equal(calls(), 0);
    });
  });

  it("treats a new in-process budget as a restart and does not install a durable cap", async () => {
    const first = createInProcessAttemptBudget();
    assert.equal(first.tryReserve().ok, true);
    assert.equal(first.tryReserve().ok, true);
    assert.equal(first.tryReserve().ok, true);
    assert.equal(first.tryReserve().ok, false);
    assert.equal(first.durable, false);
    assert.equal(first.restartSafe, false);
    const restarted = createInProcessAttemptBudget();
    assert.equal(restarted.snapshot().used, 0);
    assert.equal(restarted.restartSafe, false);
    const denied = await evaluateQaLiveDelivery(approvedQaEnv(), readyDeps({
      attemptBudgetStore: restarted,
    }));
    assert.equal(denied.authorized, false);
    assert.ok(denied.reasons.includes("provider_budget_not_durable"));

    await withFetchGuard(async (calls) => {
      const shared = createMockDurableBudget();
      const deps = {
        databaseIdentityProbe: authorizedProbe(),
        attemptBudgetStore: shared,
        fetchImpl: async () => jsonResponse(200, { id: "rebuilt" }),
      };
      const built = createResendOtpEmailTransport(approvedQaEnv(), deps);
      const firstSend = await built({
        productCode: "blessboard",
        purpose: "login",
        destination: RECIPIENT,
        text: MESSAGE,
        idempotencyKey: "rebuild-1",
      });
      assert.equal(firstSend.ok, true);
      const rebuilt = createResendOtpEmailTransport(approvedQaEnv(), deps);
      const secondSend = await rebuilt({
        productCode: "blessboard",
        purpose: "login",
        destination: RECIPIENT,
        text: MESSAGE,
        idempotencyKey: "rebuild-2",
      });
      assert.equal(secondSend.ok, true);
      assert.equal(shared.snapshot().used, 2);
      assert.equal(shared.snapshot().restartSafe, true);
      assert.equal(calls(), 0);
    });
  });

  it("reaches login and recovery through the process OTP service without creating a session early", async () => {
    resetOtpDatabaseAttachment();
    try {
      await withFetchGuard(async (calls) => {
        const env = approvedQaEnv();
        let fetches = 0;
        const missing = await issueAuthenticatedSessionCookie(requestDouble(), responseDouble(), {
          rawToken: "login-token",
          env,
          otpWorkflow: "blessboard.member_login",
          organizationId: ORG,
          accountId: ACCOUNT,
          otpIdentifier: RECIPIENT,
          accountResolved: true,
        });
        assert.equal(missing.ok, false);
        assert.equal(missing.code, "otp_required");
        assert.equal(missing.gate.sessionComplete, false);
        assert.equal(missing.gate.sessionAllowed, false);
        assert.equal(calls(), 0);

        resetOtpDatabaseAttachment();
        attachOtpQaDeliveryDependencies({
          databaseIdentityProbe: authorizedProbe(),
          attemptBudgetStore: createMockDurableBudget(),
          fetchImpl: async () => {
            fetches += 1;
            return jsonResponse(200, { id: "login-mock" });
          },
          env,
        });
        const blockedRes = responseDouble();
        const started = await issueAuthenticatedSessionCookie(requestDouble(), blockedRes, {
          rawToken: "login-token",
          env,
          otpWorkflow: "blessboard.member_login",
          organizationId: ORG,
          accountId: ACCOUNT,
          otpIdentifier: RECIPIENT,
          accountResolved: true,
        });
        assert.equal(started.ok, false);
        assert.equal(started.code, "otp_required");
        assert.equal(started.gate.sessionComplete, false);
        assert.equal(blockedRes.cookies.length, 0);
        assert.equal(fetches, 1);
        assert.equal(calls(), 0);
        assertNoSecrets(started);

        const allowedRes = responseDouble();
        const issued = await issueAuthenticatedSessionCookie(requestDouble(), allowedRes, {
          rawToken: "login-token",
          env,
          otpWorkflow: "blessboard.member_login",
          organizationId: ORG,
          accountId: ACCOUNT,
          otpIdentifier: RECIPIENT,
          accountResolved: true,
          otpVerification: { attemptId: started.gate.attemptId, code: "1234" },
        });
        assert.equal(issued.ok, true);
        assert.equal(issued.code, "issued");
        assert.equal(allowedRes.cookies.length, 1);
        assert.equal(fetches, 1);

        resetOtpDatabaseAttachment();
        let recoveryFetches = 0;
        attachOtpQaDeliveryDependencies({
          databaseIdentityProbe: authorizedProbe(),
          attemptBudgetStore: createMockDurableBudget(),
          fetchImpl: async () => {
            recoveryFetches += 1;
            return jsonResponse(200, { id: "recovery-mock" });
          },
          env,
        });
        const recovery = await beginEligibleRecoveryOtp(
          {
            workflow: "blessboard.forgot_password",
            found: true,
            organizationId: ORG,
            accountId: ACCOUNT,
            identifier: RECIPIENT,
            channel: "email",
          },
          env
        );
        assert.equal(recovery.requireCode, true);
        assert.equal(recovery.gate.sessionComplete, false);
        assert.equal(recovery.gate.sessionAllowed, false);
        assert.equal(recovery.reason, "unauthorized_purpose");
        assert.ok(recovery.attemptId);
        assert.equal(recoveryFetches, 0);

        resetOtpDatabaseAttachment();
        let clinicFetches = 0;
        attachOtpQaDeliveryDependencies({
          databaseIdentityProbe: authorizedProbe(),
          attemptBudgetStore: createMockDurableBudget(),
          fetchImpl: async () => {
            clinicFetches += 1;
            return jsonResponse(200, { id: "clinic-mock" });
          },
          env,
        });
        const clinic = await evaluateOtpSessionGate(
          {
            workflow: "activeclinic.staff_login",
            organizationId: ORG,
            accountId: ACCOUNT,
            identifier: RECIPIENT,
            accountResolved: true,
          },
          env
        );
        assert.equal(clinic.sessionAllowed, false);
        assert.equal(clinic.sessionComplete, false);
        assert.equal(clinic.reason, "unauthorized_product");
        assert.equal(clinicFetches, 0);
        assert.equal(calls(), 0);

        const logged = [];
        const service = createOtpService({
          log(row) {
            logged.push(row);
          },
          provider: createFakeOtpProvider(),
          fetchImpl: async () => {
            fetches += 1;
            return jsonResponse(200, { id: "bypassed" });
          },
        });
        const fakeStart = await service.beginChallenge(
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
        assert.equal(fakeStart.server.sessionComplete, false);
        assert.equal(JSON.stringify(fakeStart.public).includes("1234"), false);
        assert.equal(JSON.stringify(logged).includes("1234"), false);
        assert.equal(JSON.stringify(logged).includes(KEY), false);
        assert.equal(fetches, 1);

        assert.throws(
          () => createOtpService({ provider: { deliveryActivated: true } }),
          /otp_delivery_activation_forbidden/
        );
        assert.equal(
          resolveOtpProvider({
            NODE_ENV: "production",
            GETPRO_OTP_PROVIDER: "fake",
            GETPRO_OTP_ALLOW_FIXED_CODE: "1",
          }).name,
          "inactive"
        );
        const forbidden = await createFakeOtpProvider().dispatch({
          code: "1234",
          env: { NODE_ENV: "production", GETPRO_OTP_PROVIDER: "fake" },
        });
        assert.equal(forbidden.reason, "fake_forbidden");
        assert.throws(
          () =>
            attachOtpQaDeliveryDependencies({
              env: { NODE_ENV: "production" },
              databaseIdentityProbe: authorizedProbe(),
            }),
          /otp_qa_dependencies_forbidden/
        );
      });
    } finally {
      resetOtpDatabaseAttachment();
    }
  });
});
