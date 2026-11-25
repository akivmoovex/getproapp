"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { createOtpService } = require("../../../src/platform/otp/otpService");
const { createMemoryOtpStore } = require("../../../src/platform/otp/otpChallengeStore");
const { createPostgresOtpStore } = require("../../../src/platform/otp/otpPostgresStore");
const { evaluateOtpSessionGate } = require("../../../src/platform/otp/otpSessionGate");
const {
  assertOtpProductionStartup,
  publishedTestingPepper,
} = require("../../../src/platform/otp/otpEnvironment");
const { OTP_POLICY } = require("../../../src/platform/otp/otpPolicy");

const ORG = "11111111-1111-4111-8111-111111111111";
const OTHER = "33333333-3333-4333-8333-333333333333";
const ACCOUNT = "22222222-2222-4222-8222-222222222222";

function testingEnv(extra) {
  return {
    NODE_ENV: "test",
    DEPLOYMENT_ENV: "testing",
    DATABASE_IDENTITY_ENV: "testing",
    DATABASE_IDENTITY_EXPECTED: "moovex-platform-v7",
    PLATFORM_DEPLOYMENT_CODE: "moovex-platform-testing",
    GETPRO_OTP_ALLOW_FIXED_CODE: "1",
    GETPRO_OTP_PEPPER: publishedTestingPepper({ NODE_ENV: "test" }),
    ...extra,
  };
}

function productionEnv(extra) {
  return {
    NODE_ENV: "production",
    DEPLOYMENT_ENV: "production",
    DATABASE_IDENTITY_ENV: "production",
    DATABASE_IDENTITY_EXPECTED: "moovex-platform-v7",
    PLATFORM_DEPLOYMENT_CODE: "moovex-platform-production",
    GETPRO_OTP_PEPPER: "unit-test-otp-pepper-32b-minimum!!",
    ...extra,
  };
}

function login(extra) {
  return {
    action: "auth.login",
    productCode: "blessboard",
    channel: "email",
    organizationId: ORG,
    accountId: ACCOUNT,
    identifier: "otp@v13d19.example",
    accountResolved: true,
    ...extra,
  };
}

function racingStore() {
  const base = createMemoryOtpStore();
  const waiters = [];
  return {
    ...base,
    consumeVerified(id) {
      return new Promise((resolve) => {
        waiters.push(() => resolve(base.consumeVerified(id)));
        if (waiters.length === 2) {
          const ready = waiters.splice(0, waiters.length);
          for (const run of ready) run();
        }
      });
    },
  };
}

describe("G185 shared OTP store", () => {
  it("lets worker B verify a challenge issued by worker A and consume it once", async () => {
    const now = 1_700_000_000_000;
    const store = createMemoryOtpStore();
    const env = testingEnv();
    const first = createOtpService({ store, clock: () => now });
    const second = createOtpService({ store, clock: () => now });
    const issued = await first.beginChallenge(login(), env);
    assert.equal(issued.server.issued, true);
    assert.equal(issued.server.sessionComplete, false);
    const verified = await second.verifyChallenge(
      { ...login(), attemptId: issued.server.attemptId, code: "1234" },
      env
    );
    assert.equal(verified.server.reason, "verified");
    assert.equal(verified.server.sessionComplete, false);
    const completed = await second.completeProtectedAction(verified, "auth.login");
    assert.equal(completed.sessionComplete, true);
    const replay = await first.completeProtectedAction(verified, "auth.login");
    assert.equal(replay.sessionComplete, false);
    const again = await second.verifyChallenge(
      { ...login(), attemptId: issued.server.attemptId, code: "1234" },
      env
    );
    assert.equal(again.server.reason, "replay");
    assert.equal(again.server.sessionComplete, false);
  });

  it("allows only one of two concurrent completions to create a session", async () => {
    const now = 1_700_000_000_000;
    const store = racingStore();
    const env = testingEnv();
    const issuer = createOtpService({ store, clock: () => now });
    const issued = await issuer.beginChallenge(login(), env);
    const verified = await issuer.verifyChallenge(
      { ...login(), attemptId: issued.server.attemptId, code: "1234" },
      env
    );
    const [left, right] = await Promise.all([
      issuer.completeProtectedAction(verified, "auth.login"),
      issuer.completeProtectedAction(verified, "auth.login"),
    ]);
    const sessions = [left, right].filter((row) => row.sessionComplete === true);
    assert.equal(sessions.length, 1);
  });

  it("rejects expired, exhausted, and cancelled challenges without a session", async () => {
    let now = 1_700_000_000_000;
    const store = createMemoryOtpStore();
    const env = testingEnv();
    const service = createOtpService({ store, clock: () => now });
    const issued = await service.beginChallenge(login(), env);
    now += OTP_POLICY.ttlSeconds * 1000;
    const expired = await service.verifyChallenge(
      { ...login(), attemptId: issued.server.attemptId, code: "1234" },
      env
    );
    assert.equal(expired.server.reason, "expired");
    assert.equal((await service.completeProtectedAction(expired, "auth.login")).sessionComplete, false);

    now = 1_700_000_000_000;
    const attempts = createOtpService({ store: createMemoryOtpStore(), clock: () => now });
    const fresh = await attempts.beginChallenge(login(), env);
    let last = null;
    for (let i = 0; i < OTP_POLICY.maxAttempts; i += 1) {
      last = await attempts.verifyChallenge(
        { ...login(), attemptId: fresh.server.attemptId, code: "000000" },
        env
      );
    }
    assert.equal(last.server.reason, "exhausted");
    const sixth = await attempts.verifyChallenge(
      { ...login(), attemptId: fresh.server.attemptId, code: "1234" },
      env
    );
    assert.equal(sixth.server.sessionComplete, false);
    assert.notEqual(sixth.server.reason, "verified");

    const replaced = createOtpService({ store: createMemoryOtpStore(), clock: () => now });
    const first = await replaced.beginChallenge(login(), env);
    now += OTP_POLICY.resendCooldownSeconds * 1000;
    const next = await replaced.beginChallenge(login(), env);
    assert.equal(next.server.issued, true);
    const cancelled = await replaced.verifyChallenge(
      { ...login(), attemptId: first.server.attemptId, code: "1234" },
      env
    );
    assert.notEqual(cancelled.server.reason, "verified");
    assert.equal((await replaced.completeProtectedAction(cancelled, "auth.login")).sessionComplete, false);
  });

  it("keeps product and tenant boundaries and fails closed without a pepper or a database", async () => {
    const now = 1_700_000_000_000;
    const store = createMemoryOtpStore();
    const env = testingEnv();
    const service = createOtpService({ store, clock: () => now });
    const issued = await service.beginChallenge(login(), env);
    const cross = await service.verifyChallenge(
      {
        ...login(),
        organizationId: OTHER,
        attemptId: issued.server.attemptId,
        code: "1234",
      },
      env
    );
    assert.equal(cross.server.reason, "cross_tenant");
    assert.equal(cross.server.sessionComplete, false);
    const otherProduct = await service.verifyChallenge(
      {
        ...login({ productCode: "activeclinic" }),
        attemptId: issued.server.attemptId,
        code: "1234",
      },
      env
    );
    assert.notEqual(otherProduct.server.reason, "verified");

    const missing = await service.beginChallenge(
      login(),
      testingEnv({ GETPRO_OTP_PEPPER: "", SESSION_SECRET: "" })
    );
    assert.equal(missing.server.reason, "pepper");
    assert.equal(missing.server.sessionComplete, false);
    const wrongPepper = await service.verifyChallenge(
      { ...login(), attemptId: issued.server.attemptId, code: "1234" },
      testingEnv({ GETPRO_OTP_PEPPER: "y".repeat(32) })
    );
    assert.equal(wrongPepper.server.reason, "invalid_code");
    assert.equal(wrongPepper.server.sessionComplete, false);

    const logs = [];
    const failing = createOtpService({
      clock: () => now,
      log(event) {
        logs.push(event);
      },
      store: {
        ...createMemoryOtpStore(),
        findPending() {
          const error = new Error("plaintext-1234");
          error.code = "db_down";
          throw error;
        },
      },
    });
    const down = await failing.beginChallenge(login(), env);
    assert.equal(down.server.reason, "store_unavailable");
    assert.equal(down.server.sessionComplete, false);
    assert.equal(JSON.stringify(down).includes("1234"), false);
    assert.equal(JSON.stringify(logs).includes("1234"), false);

    const production = createOtpService({ env: productionEnv(), clock: () => now });
    const blocked = await production.beginChallenge(login(), productionEnv());
    assert.equal(blocked.server.reason, "store_unavailable");
    assert.equal(blocked.server.sessionComplete, false);
    assert.throws(
      () => publishedTestingPepper(productionEnv()),
      /otp_test_pepper_forbidden/
    );
    assert.throws(
      () => assertOtpProductionStartup(productionEnv({
        GETPRO_OTP_PEPPER: publishedTestingPepper({ NODE_ENV: "test" }),
      })),
      /published_testing_pepper/
    );
    assert.doesNotThrow(() => assertOtpProductionStartup(productionEnv()));
    assert.equal(
      publishedTestingPepper({ NODE_ENV: "test" }),
      publishedTestingPepper({ NODE_ENV: "test" })
    );
  });

  it("sends conditional updates and does not keep a thrown database message", async () => {
    const calls = [];
    const pool = {
      async query(sql, params) {
        calls.push(sql);
        if (sql.includes("INSERT INTO platform.otp_rate_buckets")) {
          return { rows: [{ attempt_count: 1 }] };
        }
        if (sql.includes("SET consumed = true")) {
          const error = new Error("leak-1234");
          throw error;
        }
        return { rows: [] };
      },
    };
    const store = createPostgresOtpStore(pool);
    await store.compareAndVerify("11111111-1111-4111-8111-111111111111", Date.now());
    const verified = calls.find((sql) => sql.includes("SET status = 'verified'"));
    assert.match(verified, /consumed = false/);
    const consumed = await store.consumeVerified("11111111-1111-4111-8111-111111111111").catch((error) => error);
    assert.equal(consumed.code, "otp_store_unavailable");
    assert.equal(String(consumed.message).includes("1234"), false);
    assert.equal(calls.some((sql) => sql.includes("consumed = false")), true);
  });

  it("uses one process pool for later workers and does not keep a second memory store", async () => {
    const { attachOtpDatabase, resetOtpDatabaseAttachment, resolveProcessOtpService } = require(
      "../../../src/platform/otp/otpSessionGate"
    );
    const calls = [];
    const pool = {
      async query(sql) {
        calls.push(sql);
        return { rows: [] };
      },
    };
    attachOtpDatabase(pool);
    try {
      const service = resolveProcessOtpService();
      await service.store.findPending({
        productCode: "blessboard",
        organizationId: "11111111-1111-4111-8111-111111111111",
        accountId: "22222222-2222-4222-8222-222222222222",
        purpose: "login",
        channel: "email",
        sessionId: null,
      });
      assert.match(calls[0], /platform\.otp_challenges/);
      assert.equal(calls[0].includes("CREATE TABLE"), false);
    } finally {
      resetOtpDatabaseAttachment();
    }
  });
});

describe("G186 OTP session boundary", () => {
  it("opens a session only after the shared challenge is consumed", async () => {
    const now = 1_700_000_000_000;
    const store = createMemoryOtpStore();
    const service = createOtpService({ store, clock: () => now });
    const env = testingEnv();
    const started = await evaluateOtpSessionGate(
      {
        workflow: "blessboard.hq_administrator_login",
        activation: "ACTIVE",
        service,
        organizationId: ORG,
        accountId: ACCOUNT,
        channel: "email",
        identifier: "otp@v13d19.example",
      },
      env
    );
    assert.equal(started.sessionAllowed, false);
    assert.equal(started.sessionComplete, false);
    const failed = await evaluateOtpSessionGate(
      {
        workflow: "blessboard.hq_administrator_login",
        activation: "ACTIVE",
        service,
        organizationId: ORG,
        accountId: ACCOUNT,
        channel: "email",
        identifier: "otp@v13d19.example",
        verification: { attemptId: started.attemptId, code: "000000" },
      },
      env
    );
    assert.equal(failed.sessionAllowed, false);
    const passed = await evaluateOtpSessionGate(
      {
        workflow: "blessboard.hq_administrator_login",
        activation: "ACTIVE",
        service,
        organizationId: ORG,
        accountId: ACCOUNT,
        channel: "email",
        identifier: "otp@v13d19.example",
        verification: { attemptId: started.attemptId, code: "1234" },
      },
      env
    );
    assert.equal(passed.sessionComplete, true);
    assert.equal(passed.sessionAllowed, true);
    const replay = await evaluateOtpSessionGate(
      {
        workflow: "blessboard.hq_administrator_login",
        activation: "ACTIVE",
        service,
        organizationId: ORG,
        accountId: ACCOUNT,
        channel: "email",
        identifier: "otp@v13d19.example",
        verification: { attemptId: started.attemptId, code: "1234" },
      },
      env
    );
    assert.equal(replay.sessionAllowed, false);
    const blocked = await evaluateOtpSessionGate(
      {
        workflow: "activeclinic.staff_login",
        organizationId: ORG,
        accountId: ACCOUNT,
        identifier: "staff@example.com",
      },
      productionEnv()
    );
    assert.equal(blocked.activation, "BLOCKED");
    assert.equal(blocked.sessionAllowed, true);
    assert.equal(blocked.sessionComplete, false);
  });
});
