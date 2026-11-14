"use strict";

/**
 * Shared BlessBoard + ActiveClinic OTP policy.
 * Production values are fixed. Environment variables cannot weaken them.
 * Delivery is not activated by this policy.
 */

const OTP_POLICY = Object.freeze({
  codeLength: 6,
  ttlSeconds: 5 * 60,
  maxAttempts: 5,
  resendCooldownSeconds: 60,
  accountHourlyCap: 5,
  identifierHourlyCap: 5,
  contextHourlyCap: 20,
  providerHourlyCap: 30,
  deliveryAttempts: 3,
  deliveryTimeoutMs: 5000,
  testingCode: "1234",
});

const CHANNELS = Object.freeze(["email", "sms"]);

const PRODUCTS = Object.freeze(["blessboard", "activeclinic"]);

function assertProductionPolicyImmutable(env) {
  const source = env || {};
  const problems = [];
  const length = source.GETPRO_OTP_CODE_LENGTH;
  const ttl = source.GETPRO_OTP_TTL_SECONDS;
  const attempts = source.GETPRO_OTP_MAX_ATTEMPTS;
  const cooldown = source.GETPRO_OTP_RESEND_SECONDS;
  if (length != null && String(length).trim() !== "" && Number(length) !== OTP_POLICY.codeLength) {
    problems.push("code_length");
  }
  if (ttl != null && String(ttl).trim() !== "" && Number(ttl) !== OTP_POLICY.ttlSeconds) {
    problems.push("ttl");
  }
  if (
    attempts != null &&
    String(attempts).trim() !== "" &&
    Number(attempts) !== OTP_POLICY.maxAttempts
  ) {
    problems.push("max_attempts");
  }
  if (
    cooldown != null &&
    String(cooldown).trim() !== "" &&
    Number(cooldown) !== OTP_POLICY.resendCooldownSeconds
  ) {
    problems.push("resend_cooldown");
  }
  return problems;
}

module.exports = {
  OTP_POLICY,
  CHANNELS,
  PRODUCTS,
  assertProductionPolicyImmutable,
};
