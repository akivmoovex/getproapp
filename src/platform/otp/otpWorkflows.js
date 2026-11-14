"use strict";

/**
 * BlessBoard and ActiveClinic workflows that use the shared OTP engine.
 * Patient portal activation is not public appointment booking.
 */

const WORKFLOWS = Object.freeze({
  "blessboard.hq_administrator_login": workflow("blessboard", "auth.login", "hq_administrator"),
  "blessboard.branch_administrator_login": workflow("blessboard", "auth.login", "branch_administrator"),
  "blessboard.church_staff_login": workflow("blessboard", "auth.login", "church_staff"),
  "blessboard.unified_staff_login": workflow("blessboard", "auth.login", "unified_staff"),
  "blessboard.member_login": workflow("blessboard", "auth.login", "member"),
  "blessboard.forgot_password": workflow("blessboard", "auth.password_recovery", "account"),
  "blessboard.member_activation": workflow("blessboard", "auth.account_activation", "member"),
  "blessboard.role_permission_change": workflow("blessboard", "admin.role_change", "staff_role"),
  "activeclinic.clinic_administrator_login": workflow("activeclinic", "auth.login", "clinic_administrator"),
  "activeclinic.staff_login": workflow("activeclinic", "auth.login", "staff"),
  "activeclinic.patient_login": workflow("activeclinic", "auth.login", "patient"),
  "activeclinic.forgot_password": workflow("activeclinic", "auth.password_recovery", "account"),
  "activeclinic.patient_forgot_password": workflow("activeclinic", "auth.password_recovery", "patient"),
  "activeclinic.patient_portal_activation": workflow("activeclinic", "auth.account_activation", "patient", {
    independentOfBooking: true,
  }),
  "activeclinic.staff_role_change": workflow("activeclinic", "admin.role_change", "staff_role"),
  "activeclinic.patient_account_action": workflow("activeclinic", "admin.security_setting", "patient_account"),
});

function workflow(productCode, action, actor, extra) {
  return Object.freeze({
    productCode,
    action,
    actor,
    independentOfBooking: Boolean(extra && extra.independentOfBooking),
  });
}

function getOtpWorkflow(id) {
  const key = String(id || "").trim();
  const found = WORKFLOWS[key];
  if (!found) return null;
  return Object.freeze({ id: key, ...found });
}

module.exports = {
  WORKFLOWS,
  getOtpWorkflow,
};
