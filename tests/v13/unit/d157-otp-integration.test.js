"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { createOtpService } = require("../../../src/platform/otp/otpService");
const { createFakeOtpProvider, resolveOtpProvider } = require("../../../src/platform/otp/otpProviders");
const { resolveOtpActivation } = require("../../../src/platform/otp/otpActivation");
const {
  APPROVED_QA_DATA_DIRECTORY,
  APPROVED_QA_SOCKET_DIRECTORY,
  QA_DATABASE_HOST,
  QA_DATABASE_NAME,
  QA_DATABASE_PORT,
  QA_DATABASE_ROLE,
  QA_IDENTITY_KEY,
  QA_INSTANCE_ID,
  bindDurableAttemptBudget,
  createInProcessAttemptBudget,
  evaluateQaLiveDelivery,
} = require("../../../src/platform/otp/otpQaLiveDelivery");
const {
  OBSERVATION_SQL,
  createDatabaseIdentityProbe,
  observeApprovedDatabaseIdentity,
  qaProbeDiagnostics,
} = require("../../../src/platform/otp/otpQaIdentityProbe");
const { attachQaOtpBoot } = require("../../../src/platform/otp/otpQaBoot");
const { resetOtpDatabaseAttachment, evaluateOtpSessionGate } = require("../../../src/platform/otp/otpSessionGate");
const { issueAuthenticatedSessionCookie } = require("../../../src/platform/session/sharedSessionSecurity");
const { beginEligibleRecoveryOtp } = require("../../../src/platform/otp/otpPasswordRecoveryBridge");
const { createResendOtpEmailTransport } = require("../../../src/platform/email/resendOtpTransport");
const {
  KEY,
  PEPPER,
  PASSWORD,
  RECIPIENT,
  approvedQaEnv,
  createMockDurableBudget,
  jsonResponse,
} = require("../helpers/qaDeliveryFixture");

const ORG = "11111111-1111-4111-8111-111111111111";
const ORG_OTHER = "33333333-3333-4333-8333-333333333333";
const ACCOUNT = "22222222-2222-4222-8222-222222222222";
const ROOT = path.resolve(__dirname, "..", "..", "..");

function approvedRow(extra) {
  return {
    current_database: QA_DATABASE_NAME,
    inet_server_port: QA_DATABASE_PORT,
    server_addr: QA_DATABASE_HOST,
    current_user: QA_DATABASE_ROLE,
    identity_key: QA_IDENTITY_KEY,
    environment_code: "testing",
    cluster_name: QA_INSTANCE_ID,
    data_directory: APPROVED_QA_DATA_DIRECTORY,
    unix_socket_directories: APPROVED_QA_SOCKET_DIRECTORY,
    ...(extra || {}),
  };
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

function loginInput(extra) {
  return {
    rawToken: "login-token",
    organizationId: ORG,
    accountId: ACCOUNT,
    otpIdentifier: RECIPIENT,
    accountResolved: true,
    otpWorkflow: "blessboard.member_login",
    ...(extra || {}),
  };
}

describe("D157 OTP integration", () => {
  it("keeps the observation query free of expected identity claims", () => {
    assert.match(OBSERVATION_SQL, /current_database\(\)/);
    assert.match(OBSERVATION_SQL, /inet_server_port\(\)/);
    assert.match(OBSERVATION_SQL, /current_user/);
    assert.match(OBSERVATION_SQL, /data_directory/);
    assert.match(OBSERVATION_SQL, /unix_socket_directories/);
    assert.match(OBSERVATION_SQL, /cluster_name/);
    assert.match(OBSERVATION_SQL, /platform\.database_identity/);
    assert.equal(OBSERVATION_SQL.includes(QA_DATABASE_NAME), false);
    assert.equal(OBSERVATION_SQL.includes(QA_INSTANCE_ID), false);
    assert.equal(OBSERVATION_SQL.includes(QA_IDENTITY_KEY), false);
    assert.equal(OBSERVATION_SQL.includes("5432"), false);
  });

  it("refuses a shared port, a wrong database, and a caller-supplied identity before any query", async () => {
    let queries = 0;
    const query = async () => {
      queries += 1;
      return approvedRow();
    };
    const shared = await observeApprovedDatabaseIdentity(
      { nonce: "n1", connect: { host: "127.0.0.1", port: "5432", database: QA_DATABASE_NAME, username: QA_DATABASE_ROLE } },
      { query }
    );
    assert.equal(shared.ok, false);
    assert.equal(shared.reason, "database_port_shared");
    const wrongDb = await observeApprovedDatabaseIdentity(
      {
        nonce: "n2",
        connect: { host: "127.0.0.1", port: "55432", database: "postgres", username: QA_DATABASE_ROLE },
        identityKey: QA_IDENTITY_KEY,
        dataDirectory: APPROVED_QA_DATA_DIRECTORY,
      },
      { query }
    );
    assert.equal(wrongDb.ok, false);
    assert.equal(queries, 0);
  });

  it("builds the observation from the query row and rejects the wrong cluster", async () => {
    const env = approvedQaEnv({ DATABASE_IDENTITY_EXPECTED: "caller-supplied-key" });
    let seenSql = "";
    const probe = createDatabaseIdentityProbe({
      env,
      query: async (sql) => {
        seenSql = sql;
        return approvedRow();
      },
    });
    const decision = await evaluateQaLiveDelivery(env, {
      productCode: "blessboard",
      purpose: "login",
      destination: RECIPIENT,
      attemptBudgetStore: createMockDurableBudget(),
      databaseIdentity: { currentDatabase: "postgres", identityKey: "forged" },
      databaseIdentityProbe: probe,
    });
    assert.equal(decision.authorized, true);
    assert.match(seenSql, /current_database\(\)/);
    assert.equal(JSON.stringify(decision).includes(PASSWORD), false);

    const mismatch = await evaluateQaLiveDelivery(env, {
      productCode: "blessboard",
      purpose: "login",
      destination: RECIPIENT,
      attemptBudgetStore: createMockDurableBudget(),
      databaseIdentityProbe: createDatabaseIdentityProbe({
        query: async () => approvedRow({ cluster_name: "shared-cluster", inet_server_port: "5432", current_user: "postgres" }),
      }),
    });
    assert.equal(mismatch.authorized, false);
    assert.ok(mismatch.reasons.includes("database_identity_mismatch"));

    const socket = await evaluateQaLiveDelivery(env, {
      productCode: "blessboard",
      purpose: "login",
      destination: RECIPIENT,
      attemptBudgetStore: createMockDurableBudget(),
      databaseIdentityProbe: createDatabaseIdentityProbe({
        query: async () => approvedRow({ unix_socket_directories: "/tmp" }),
      }),
    });
    assert.equal(socket.authorized, false);
    assert.ok(socket.reasons.includes("database_identity_mismatch"));
  });

  it("does not construct a PostgreSQL client while refusing a live connect", async () => {
    const before = qaProbeDiagnostics().livePgClientConstructions;
    let constructed = 0;
    const probe = createDatabaseIdentityProbe({
      env: approvedQaEnv(),
      clientFactory(config) {
        constructed += 1;
        assert.equal(config.host, "127.0.0.1");
        assert.equal(config.port, 55432);
        assert.equal(config.database, QA_DATABASE_NAME);
        assert.equal(config.user, QA_DATABASE_ROLE);
        return {
          async connect() {
            throw new Error("not_postgres");
          },
          async query() {
            throw new Error("not_postgres");
          },
          async end() {},
        };
      },
    });
    const report = await probe({
      nonce: "live-stop",
      connect: {
        host: "127.0.0.1",
        port: "55432",
        database: QA_DATABASE_NAME,
        username: QA_DATABASE_ROLE,
      },
    });
    assert.equal(report.ok, false);
    assert.equal(report.reason, "database_identity_unverified");
    assert.equal(JSON.stringify(report).includes(PASSWORD), false);
    assert.equal(constructed, 1);
    assert.equal(qaProbeDiagnostics().livePgClientConstructions, before);
  });

  it("attaches the QA boot path only for an approved testing target", async () => {
    await withFetchGuard(async (calls) => {
      resetOtpDatabaseAttachment();
      try {
        const secretsOnly = attachQaOtpBoot({
          NODE_ENV: "test",
          DEPLOYMENT_ENV: "testing",
          DATABASE_IDENTITY_ENV: "testing",
          RESEND_API_KEY: KEY,
          GETPRO_OTP_PEPPER: PEPPER,
        });
        assert.equal(secretsOnly.ok, false);
        assert.equal(secretsOnly.reason, "qa_live_delivery_not_approved");

        const sharedPort = attachQaOtpBoot(
          approvedQaEnv({
            DATABASE_URL: `postgresql://${QA_DATABASE_ROLE}:${PASSWORD}@127.0.0.1:5432/${QA_DATABASE_NAME}`,
          })
        );
        assert.equal(sharedPort.ok, false);
        assert.equal(sharedPort.reason, "database_port_shared");

        const production = attachQaOtpBoot(
          approvedQaEnv({ NODE_ENV: "production", DEPLOYMENT_ENV: "production", DATABASE_IDENTITY_ENV: "production" })
        );
        assert.equal(production.ok, false);
        assert.equal(production.reason, "production_environment");

        const inactive = approvedQaEnv();
        delete inactive.GETPRO_OTP_ACTIVATION;
        delete inactive.GETPRO_OTP_QA_LIVE_DELIVERY;
        const res = responseDouble();
        const issued = await issueAuthenticatedSessionCookie(requestDouble(), res, loginInput({ env: inactive }));
        assert.equal(issued.ok, true);
        assert.equal(res.cookies.length, 1);
        assert.equal(calls(), 0);
        assert.equal(resolveOtpActivation(inactive).status, "BLOCKED");
        assert.equal(resolveOtpProvider({}).deliveryActivated, false);
        assert.throws(
          () => createOtpService({ provider: { deliveryActivated: true, async dispatch() {} } }),
          /otp_delivery_activation_forbidden/
        );
      } finally {
        resetOtpDatabaseAttachment();
      }
    });
  });

  it("reaches login through boot, probe, budget, and transport without a real network call", async () => {
    const original = globalThis.fetch;
    let network = 0;
    globalThis.fetch = async (url) => {
      network += 1;
      assert.equal(String(url), "https://api.resend.com/emails");
      return jsonResponse(200, { id: "mock-message" });
    };
    resetOtpDatabaseAttachment();
    try {
      const env = approvedQaEnv();
      let queries = 0;
      let bypassed = 0;
      const store = createMockDurableBudget();
      const skipped = await issueAuthenticatedSessionCookie(requestDouble(), responseDouble(), loginInput({ env }));
      assert.equal(skipped.ok, false);
      assert.equal(skipped.code, "otp_required");
      assert.equal(skipped.gate.sessionComplete, false);
      assert.equal(queries, 0);
      assert.equal(network, 0);

      const attached = attachQaOtpBoot(env, {
        query: async (sql) => {
          queries += 1;
          assert.match(sql, /platform\.database_identity/);
          return approvedRow();
        },
        clientFactory() {
          throw new Error("live_client_forbidden");
        },
        attemptBudgetStore: store,
        fetchImpl: async () => {
          bypassed += 1;
          return jsonResponse(200, { id: "boot-must-ignore-this" });
        },
      });
      assert.equal(attached.ok, true);
      assert.equal(attached.budgetAttached, true);

      const blocked = responseDouble();
      const started = await issueAuthenticatedSessionCookie(requestDouble(), blocked, loginInput({ env }));
      assert.equal(started.ok, false);
      assert.equal(started.code, "otp_required");
      assert.equal(started.gate.sessionAllowed, false);
      assert.equal(started.gate.sessionComplete, false);
      assert.equal(blocked.cookies.length, 0);
      assert.equal(JSON.stringify(started).includes("1234"), false);
      assert.equal(JSON.stringify(started).includes(KEY), false);
      assert.equal(queries, 1);
      assert.equal(network, 1);
      assert.equal(bypassed, 0);
      assert.equal(store.snapshot().used, 1);
    } finally {
      globalThis.fetch = original;
      resetOtpDatabaseAttachment();
    }
  });

  it("rejects the wrong product, purpose, sender, recipient, key, and pepper before fetch", async () => {
    await withFetchGuard(async (calls) => {
      resetOtpDatabaseAttachment();
      try {
        const env = approvedQaEnv();
        let queries = 0;
        attachQaOtpBoot(env, {
          query: async () => {
            queries += 1;
            return approvedRow();
          },
          attemptBudgetStore: createMockDurableBudget(),
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
        assert.equal(clinic.reason, "unauthorized_product");
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
        assert.equal(recovery.reason, "unauthorized_purpose");
        assert.equal(queries, 0);

        const transport = createResendOtpEmailTransport(env, {
          databaseIdentityProbe: createDatabaseIdentityProbe({
            query: async () => {
              queries += 1;
              return approvedRow();
            },
          }),
          attemptBudgetStore: createMockDurableBudget(),
          fetchImpl: async () => {
            throw new Error("fetch_should_not_run");
          },
        });
        const stranger = await transport({
          productCode: "blessboard",
          purpose: "login",
          destination: "stranger@example.com",
          text: "code",
          idempotencyKey: "d157-stranger",
        });
        assert.equal(stranger.ok, false);
        assert.equal(stranger.reason, "qa_recipient_not_allowlisted");
        const missingKey = await createResendOtpEmailTransport(
          approvedQaEnv({ RESEND_API_KEY: "" }),
          { fetchImpl: async () => jsonResponse(200, { id: "x" }) }
        )({
          productCode: "blessboard",
          purpose: "login",
          destination: RECIPIENT,
          text: "code",
          idempotencyKey: "d157-key",
        });
        assert.equal(missingKey.reason, "missing_api_key");
        const missingPepper = await evaluateQaLiveDelivery(approvedQaEnv({ GETPRO_OTP_PEPPER: "" }), {
          productCode: "blessboard",
          purpose: "login",
          destination: RECIPIENT,
          attemptBudgetStore: createMockDurableBudget(),
          databaseIdentityProbe: async () => {
            queries += 1;
            throw new Error("probe_should_not_run");
          },
        });
        assert.ok(missingPepper.reasons.includes("otp_pepper_missing"));
        assert.equal(queries, 0);
        assert.equal(calls(), 0);
      } finally {
        resetOtpDatabaseAttachment();
      }
    });
  });

  it("reserves at most three attempts across retries, concurrency, and a restarted wrapper", async () => {
    await withFetchGuard(async (calls) => {
      const budget = createMockDurableBudget();
      let attempts = 0;
      const transport = createResendOtpEmailTransport(approvedQaEnv(), {
        databaseIdentityProbe: createDatabaseIdentityProbe({ query: async () => approvedRow() }),
        attemptBudgetStore: budget,
        fetchImpl: async () => {
          attempts += 1;
          if (attempts < 3) {
            const error = new Error("timeout");
            error.name = "TimeoutError";
            throw error;
          }
          return jsonResponse(500, { name: "provider_unavailable" });
        },
      });
      const failed = await transport({
        productCode: "blessboard",
        purpose: "login",
        destination: RECIPIENT,
        text: "code",
        idempotencyKey: "d157-retry",
      });
      assert.equal(failed.ok, false);
      assert.equal(attempts, 3);
      assert.equal(budget.snapshot().used, 3);
      const { openDurableQaAttemptBudget } = require("../../../src/platform/otp/otpQaAttemptBudget");
      const restarted = openDurableQaAttemptBudget({ directory: budget.directory, runId: budget.runId });
      assert.equal(restarted.tryReserve().ok, false);
      assert.equal(restarted.snapshot().restartSafe, true);
      const isolated = createInProcessAttemptBudget();
      assert.equal(isolated.restartSafe, false);
      assert.equal(isolated.tryReserve().ok, true);
      const parallel = bindDurableAttemptBudget({ durable: true, restartSafe: true, used: 2 });
      const results = await Promise.all([parallel.tryReserve(), parallel.tryReserve(), parallel.tryReserve()]);
      assert.equal(results.filter((item) => item.ok).length, 1);
      assert.equal(calls(), 0);

      let rejected = 0;
      const rejectTransport = createResendOtpEmailTransport(approvedQaEnv(), {
        databaseIdentityProbe: createDatabaseIdentityProbe({ query: async () => approvedRow() }),
        attemptBudgetStore: createMockDurableBudget(),
        fetchImpl: async () => {
          rejected += 1;
          return jsonResponse(422, { name: "invalid_to" });
        },
      });
      const rejection = await rejectTransport({
        productCode: "blessboard",
        purpose: "login",
        destination: RECIPIENT,
        text: "code",
        idempotencyKey: "d157-reject",
      });
      assert.equal(rejection.ok, false);
      assert.equal(rejected, 1);
    });
  });

  it("withholds the session until a correct code and rejects expiry, replay, and the wrong tenant", async () => {
    let now = Date.parse("2026-11-27T00:00:00.000Z");
    const service = createOtpService({
      clock: () => now,
      provider: createFakeOtpProvider(),
    });
    const input = {
      action: "auth.login",
      productCode: "blessboard",
      channel: "email",
      organizationId: ORG,
      accountId: ACCOUNT,
      identifier: RECIPIENT,
      accountResolved: true,
    };
    const env = approvedQaEnv();
    const started = await service.beginChallenge(input, env);
    assert.equal(started.server.sessionComplete, false);
    const wrong = await service.verifyChallenge(
      { action: "auth.login", attemptId: started.server.attemptId, code: "0000", productCode: "blessboard", organizationId: ORG, accountId: ACCOUNT, channel: "email" },
      env
    );
    assert.equal(wrong.server.reason, "invalid_code");
    const verified = await service.verifyChallenge(
      { action: "auth.login", attemptId: started.server.attemptId, code: "1234", productCode: "blessboard", organizationId: ORG, accountId: ACCOUNT, channel: "email" },
      env
    );
    assert.equal(verified.server.sessionComplete, false);
    const otherTenant = await service.completeProtectedAction(
      { server: { ...verified.server, organizationId: ORG_OTHER }, channel: "email" },
      "auth.login"
    );
    assert.equal(otherTenant.sessionComplete, false);
    const completed = await service.completeProtectedAction({ server: verified.server, channel: "email" }, "auth.login");
    assert.equal(completed.sessionComplete, true);
    const replay = await service.completeProtectedAction({ server: verified.server, channel: "email" }, "auth.login");
    assert.equal(replay.sessionComplete, false);

    const expiring = createOtpService({ clock: () => now, provider: createFakeOtpProvider() });
    const second = await expiring.beginChallenge(input, env);
    now += 6 * 60 * 1000;
    const expired = await expiring.verifyChallenge(
      { action: "auth.login", attemptId: second.server.attemptId, code: "1234", productCode: "blessboard", organizationId: ORG, accountId: ACCOUNT, channel: "email" },
      env
    );
    assert.equal(expired.server.reason, "expired");
    assert.equal(expired.server.sessionComplete, false);
  });

  it("points runtime boot at the QA attachment and keeps fetch out of that boot", () => {
    const runtime = fs.readFileSync(path.join(ROOT, "src/platform/http/moovexPlatformRuntimeServer.js"), "utf8");
    const boot = fs.readFileSync(path.join(ROOT, "src/platform/otp/otpQaBoot.js"), "utf8");
    const probe = fs.readFileSync(path.join(ROOT, "src/platform/otp/otpQaIdentityProbe.js"), "utf8");
    assert.match(runtime, /attachQaOtpBoot\(env\)/);
    assert.doesNotMatch(boot, /fetchImpl/);
    assert.doesNotMatch(probe, /api\.resend\.com/);
    assert.match(probe, /function defaultClientFactory/);
    assert.equal(qaProbeDiagnostics().livePgClientConstructions, 0);
  });
});
