"use strict";

const PURPOSES = Object.freeze([
  "phone_verification",
  "invitation_activation",
  "password_recovery",
  "phone_change",
  "suspicious_login",
  "sensitive_action",
]);

const PURPOSE_SET = new Set(PURPOSES);

function isOtpPurpose(value) {
  return PURPOSE_SET.has(String(value || "").trim());
}

module.exports = {
  OTP_PURPOSES: PURPOSES,
  isOtpPurpose,
};
