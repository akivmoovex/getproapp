"use strict";

/**
 * Actions that require OTP before any session or privileged step completes.
 * One registry for BlessBoard and ActiveClinic.
 */

const PROTECTED_ACTIONS = Object.freeze({
  "auth.login": Object.freeze({
    purpose: "login",
    mandatory: true,
    preAuth: true,
    requiresSession: false,
  }),
  "auth.password_recovery": Object.freeze({
    purpose: "password_recovery",
    mandatory: true,
    preAuth: true,
    requiresSession: false,
  }),
  "auth.account_activation": Object.freeze({
    purpose: "account_activation",
    mandatory: true,
    preAuth: true,
    requiresSession: false,
  }),
  "admin.role_change": Object.freeze({
    purpose: "admin_operation",
    mandatory: true,
    preAuth: false,
    requiresSession: true,
  }),
  "admin.member_export": Object.freeze({
    purpose: "admin_operation",
    mandatory: true,
    preAuth: false,
    requiresSession: true,
  }),
  "admin.security_setting": Object.freeze({
    purpose: "admin_operation",
    mandatory: true,
    preAuth: false,
    requiresSession: true,
  }),
});

function getProtectedAction(action) {
  const key = String(action || "").trim();
  return PROTECTED_ACTIONS[key] || null;
}

module.exports = {
  PROTECTED_ACTIONS,
  getProtectedAction,
};
