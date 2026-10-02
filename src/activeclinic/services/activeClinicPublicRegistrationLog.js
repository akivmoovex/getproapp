"use strict";

/**
 * Safe structured logger for ActiveClinic public clinic registration.
 * Never logs PII, tokens, cookies, or SQL parameters.
 */

const crypto = require("crypto");

function newRegistrationRequestId() {
  return `acr_${Date.now().toString(36)}_${crypto.randomBytes(4).toString("hex")}`;
}

function classifyRegistrationError(err) {
  const code = err && err.code ? String(err.code) : null;
  const message = err && err.message ? String(err.message) : "";
  if (code === "42P01" || /clinic_registration_applications/i.test(message) && /does not exist/i.test(message)) {
    return {
      category: "schema_missing",
      safeDatabaseErrorCode: code || "42P01",
      failingOperation: "insert_clinic_registration_application",
      transactionStage: "insert",
    };
  }
  if (code === "42703") {
    return {
      category: "schema_column_missing",
      safeDatabaseErrorCode: code,
      failingOperation: "insert_clinic_registration_application",
      transactionStage: "insert",
    };
  }
  if (code === "23514") {
    return {
      category: "check_constraint",
      safeDatabaseErrorCode: code,
      failingOperation: "insert_clinic_registration_application",
      transactionStage: "insert",
    };
  }
  if (code === "23505") {
    return {
      category: "unique_violation",
      safeDatabaseErrorCode: code,
      failingOperation: "insert_clinic_registration_application",
      transactionStage: "insert",
    };
  }
  if (code === "28000" || code === "28P01" || code === "42501") {
    return {
      category: "database_permission",
      safeDatabaseErrorCode: code,
      failingOperation: "insert_clinic_registration_application",
      transactionStage: "insert",
    };
  }
  if (code === "57P01" || code === "57P03" || code === "08006" || code === "08001") {
    return {
      category: "database_unavailable",
      safeDatabaseErrorCode: code,
      failingOperation: "insert_clinic_registration_application",
      transactionStage: "connect_or_query",
    };
  }
  return {
    category: "unexpected",
    safeDatabaseErrorCode: code || "unknown",
    failingOperation: "insert_clinic_registration_application",
    transactionStage: "unknown",
  };
}

function logClinicApplicationFailed(input) {
  const payload = {
    event: "activeclinic.public.clinic_application_failed",
    route: "/register-clinic",
    requestId: input.requestId || null,
    deploymentCode: input.deploymentCode || null,
    environmentCode: input.environmentCode || null,
    validationCategory: input.validationCategory || null,
    safeDatabaseErrorCode: input.safeDatabaseErrorCode || null,
    exceptionClass: input.exceptionClass || null,
    failingOperation: input.failingOperation || null,
    transactionStage: input.transactionStage || null,
    category: input.category || null,
    timestamp: new Date().toISOString(),
  };
  // eslint-disable-next-line no-console
  console.error(JSON.stringify(payload));
  if (input.includeStack && input.err && input.err.stack) {
    // eslint-disable-next-line no-console
    console.error(String(input.err.stack).split("\n").slice(0, 12).join("\n"));
  }
}

function logClinicApplicationCreated(input) {
  const payload = {
    event: "activeclinic.public.clinic_application_created",
    route: "/register-clinic",
    requestId: input.requestId || null,
    deploymentCode: input.deploymentCode || null,
    environmentCode: input.environmentCode || null,
    applicationReference: input.applicationReference || null,
    timestamp: new Date().toISOString(),
  };
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(payload));
}

module.exports = {
  newRegistrationRequestId,
  classifyRegistrationError,
  logClinicApplicationFailed,
  logClinicApplicationCreated,
};
