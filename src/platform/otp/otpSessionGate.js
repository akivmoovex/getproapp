"use strict";

/**
 * Session and sensitive-action gate.
 * A blocked deployment continues the existing login path.
 * An active policy withholds the session until the shared OTP check passes.
 */

const { createOtpService } = require("./otpService");
const { getProtectedAction } = require("./otpProtectedActions");
const { resolveOtpActivation } = require("./otpActivation");
const { getOtpWorkflow } = require("./otpWorkflows");

let sharedService = null;
let sharedPool = null;

function attachOtpDatabase(pool) {
  if (!pool || typeof pool.query !== "function") {
    const error = new Error("otp_store_unavailable");
    error.code = "otp_store_unavailable";
    throw error;
  }
  sharedPool = pool;
  sharedService = null;
  return pool;
}

function resetOtpDatabaseAttachment() {
  sharedPool = null;
  sharedService = null;
}

function serviceFor(input) {
  if (input && input.service) return input.service;
  return resolveProcessOtpService();
}

function resolveProcessOtpService() {
  if (!sharedService) {
    sharedService = sharedPool ? createOtpService({ pool: sharedPool }) : createOtpService();
  }
  return sharedService;
}

async function evaluateOtpSessionGate(input, env) {
  const source = env || (input && input.env) || {};
  const workflow = getOtpWorkflow(input && input.workflow);
  if (!workflow) {
    return {
      ok: false,
      sessionAllowed: false,
      otpRequired: true,
      sessionComplete: false,
      activation: "BLOCKED",
      reason: "unknown_workflow",
    };
  }
  const action = getProtectedAction(workflow.action);
  if (!action || action.mandatory !== true) {
    return {
      ok: false,
      sessionAllowed: false,
      otpRequired: true,
      sessionComplete: false,
      activation: "BLOCKED",
      reason: "action_not_mandatory",
      workflow: workflow.id,
    };
  }
  const activation = resolveOtpActivation(source, input && input.activation);
  if (activation.status !== "ACTIVE") {
    return {
      ok: true,
      sessionAllowed: true,
      otpRequired: false,
      sessionComplete: false,
      activation: "BLOCKED",
      reasons: activation.reasons,
      workflow: workflow.id,
      productCode: workflow.productCode,
      action: workflow.action,
    };
  }

  const otp = serviceFor(input);
  const binding = {
    action: workflow.action,
    productCode: workflow.productCode,
    channel: input.channel || "email",
    organizationId: input.organizationId,
    accountId: input.accountId,
    sessionId: input.sessionId || null,
    identifier: input.identifier,
    accountResolved: input.accountResolved !== false,
    context: input.context || workflow.id,
  };
  if (!input.verification) {
    const started = await otp.beginChallenge(binding, source);
    return {
      ok: false,
      sessionAllowed: false,
      otpRequired: true,
      sessionComplete: false,
      activation: "ACTIVE",
      workflow: workflow.id,
      productCode: workflow.productCode,
      action: workflow.action,
      public: started.public,
      attemptId: started.server && started.server.attemptId,
      reason: started.server && started.server.reason,
    };
  }
  const verified = await otp.verifyChallenge(
    {
      ...binding,
      attemptId: input.verification.attemptId,
      code: input.verification.code,
      purpose: input.verification.purpose,
    },
    source
  );
  const completed = await otp.completeProtectedAction(verified, workflow.action);
  return {
    ok: completed.sessionComplete === true,
    sessionAllowed: completed.sessionComplete === true,
    otpRequired: completed.sessionComplete !== true,
    sessionComplete: completed.sessionComplete === true,
    activation: "ACTIVE",
    workflow: workflow.id,
    productCode: workflow.productCode,
    action: workflow.action,
    reason: completed.reason,
    public: verified.public,
  };
}

async function holdIfOtpRequired(input, env) {
  const gate = await evaluateOtpSessionGate(input, env || (input && input.env));
  if (gate.sessionAllowed) return null;
  return gate;
}

module.exports = {
  evaluateOtpSessionGate,
  holdIfOtpRequired,
  attachOtpDatabase,
  resetOtpDatabaseAttachment,
  resolveProcessOtpService,
};
