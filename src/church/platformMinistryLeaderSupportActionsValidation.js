"use strict";

function validateResetMinistryLeaderPasswordBody(body) {
  const newPassword = String((body && body.new_password) || "");
  const confirmPassword = String((body && body.confirm_password) || "");

  if (!newPassword) {
    return { ok: false, error: "New password is required." };
  }
  if (newPassword.length < 8) {
    return { ok: false, error: "New password must be at least 8 characters." };
  }
  if (!confirmPassword) {
    return { ok: false, error: "Password confirmation is required." };
  }
  if (newPassword !== confirmPassword) {
    return { ok: false, error: "Password confirmation does not match." };
  }

  return { ok: true, new_password: newPassword };
}

function validateDeactivateMinistryLeaderBody(body) {
  const reason = String((body && body.reason) || "").trim();
  if (reason.length < 3) {
    return { ok: false, error: "Deactivate reason is required (at least 3 characters)." };
  }
  if (reason.length > 500) {
    return { ok: false, error: "Deactivate reason must be at most 500 characters." };
  }
  return { ok: true, reason };
}

function validateActivateMinistryLeaderBody(body) {
  const reason = String((body && body.reason) || "").trim().slice(0, 500);
  return { ok: true, reason: reason || null };
}

function validateUnlockMinistryLeaderLoginBody(body) {
  const reason = String((body && body.reason) || "").trim().slice(0, 500);
  return { ok: true, reason: reason || null };
}

module.exports = {
  validateResetMinistryLeaderPasswordBody,
  validateDeactivateMinistryLeaderBody,
  validateActivateMinistryLeaderBody,
  validateUnlockMinistryLeaderLoginBody,
};
