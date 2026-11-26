"use strict";

/**
 * Bridges password-recovery routes to the shared OTP gate.
 * Default deployments stay on password-reset links (activation BLOCKED).
 * When activation is ACTIVE and an eligible account is proven, a code challenge
 * is required before the existing reset-link step may continue.
 */

const { evaluateOtpSessionGate, holdIfOtpRequired } = require("./otpSessionGate");

async function evaluatePasswordRecoveryOtp(input, env) {
  const source = input || {};
  const gate = await evaluateOtpSessionGate(
    {
      workflow: source.workflow,
      env: env || source.env,
      service: source.service,
      activation: source.activation,
      channel: source.channel || "email",
      organizationId: source.organizationId,
      accountId: source.accountId,
      identifier: source.identifier,
      accountResolved: source.accountResolved,
      verification: source.verification,
      context: source.context || source.workflow,
    },
    env || source.env
  );

  if (gate.activation !== "ACTIVE") {
    return {
      mode: "password_reset_link",
      hold: null,
      gate,
      proceedWithLinkReset: true,
      requireCode: false,
    };
  }

  if (gate.sessionAllowed && !gate.otpRequired) {
    return {
      mode: "password_reset_link",
      hold: null,
      gate,
      proceedWithLinkReset: true,
      requireCode: false,
      reason: gate.reason || "otp_not_required",
    };
  }

  return {
    mode: "code_otp_required",
    hold: gate,
    gate,
    proceedWithLinkReset: false,
    requireCode: true,
    attemptId: gate.attemptId || null,
    reason: gate.reason || "otp_required",
  };
}

async function holdPasswordRecoveryIfOtpRequired(input, env) {
  const evaluated = await evaluatePasswordRecoveryOtp(input, env);
  if (evaluated.proceedWithLinkReset) return null;
  return evaluated.hold || (await holdIfOtpRequired(input, env));
}

module.exports = {
  evaluatePasswordRecoveryOtp,
  holdPasswordRecoveryIfOtpRequired,
};
