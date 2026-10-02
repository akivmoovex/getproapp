"use strict";

/**
 * In-memory test OTP provider. Never active when DEPLOYMENT_ENV=production.
 * Exposes codes only to automated tests via peekTestCode().
 */

const store = new Map();

function assertNotProduction(env) {
  const deployment = String((env && env.DEPLOYMENT_ENV) || process.env.DEPLOYMENT_ENV || "")
    .trim()
    .toLowerCase();
  if (deployment === "production") {
    const err = new Error("test OTP provider cannot run in production");
    err.code = "test_provider_production_guard";
    throw err;
  }
}

function createTestOtpProvider(env) {
  assertNotProduction(env || process.env);

  return {
    name: "test",
    async send({ verificationId, normalizedPhone, code, purpose }) {
      assertNotProduction(env || process.env);
      store.set(String(verificationId), {
        code: String(code),
        normalizedPhone,
        purpose,
        sentAt: Date.now(),
      });
      return {
        ok: true,
        providerVerificationId: `test:${verificationId}`,
      };
    },
    async cancel({ verificationId }) {
      store.delete(String(verificationId));
      return { ok: true };
    },
  };
}

function peekTestCode(verificationId) {
  const row = store.get(String(verificationId));
  return row ? row.code : null;
}

function clearTestOtpStore() {
  store.clear();
}

module.exports = {
  createTestOtpProvider,
  peekTestCode,
  clearTestOtpStore,
};
