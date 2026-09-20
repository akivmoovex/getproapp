"use strict";

/**
 * Public registration errors must never be blank or leak internal codes.
 */

const { sanitizePublicErrorMessage } = require("../http/sharedApiError");

const DEFAULT_PUBLIC_REGISTRATION_ERROR =
  "We could not save your request right now. Please try again shortly.";

const INTERNAL_PUBLIC_ERROR = /^(schema_mismatch|deployment_not_found|provision_failure|provisioning_failed|database_conflict|internal_error|db_error|pool_unavailable|invalid_input|transaction_error)$/i;

/**
 * @param {unknown} value
 * @param {string} [fallback]
 * @returns {string}
 */
function safeRegistrationPublicError(value, fallback) {
  const fb = String(fallback == null ? "" : fallback).trim() || DEFAULT_PUBLIC_REGISTRATION_ERROR;
  const text = String(value == null ? "" : value).trim();
  if (!text || INTERNAL_PUBLIC_ERROR.test(text)) return fb;
  return sanitizePublicErrorMessage(text, fb);
}

module.exports = {
  DEFAULT_PUBLIC_REGISTRATION_ERROR,
  safeRegistrationPublicError,
};
