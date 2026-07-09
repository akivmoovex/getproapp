"use strict";

function validateResetMemberPasswordBody(body) {
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

function validateSuspendMemberBody(body) {
  const reason = String((body && body.reason) || "").trim();
  if (reason.length < 3) {
    return { ok: false, error: "Suspend reason is required (at least 3 characters)." };
  }
  return { ok: true, reason: reason.slice(0, 2000) };
}

function validateReactivateMemberBody(body) {
  const reason = String((body && body.reason) || "").trim().slice(0, 2000);
  return { ok: true, reason: reason || null };
}

function validateVerifyMemberBody(body, currentStatus) {
  if (currentStatus === "verified") {
    return { ok: false, error: "Member is already verified." };
  }
  if (!["pending", "rejected", "suspended"].includes(currentStatus)) {
    return { ok: false, error: "Member cannot be verified from current status." };
  }
  const reason = String((body && body.reason) || "").trim().slice(0, 2000);
  return { ok: true, reason: reason || null };
}

module.exports = {
  validateResetMemberPasswordBody,
  validateSuspendMemberBody,
  validateReactivateMemberBody,
  validateVerifyMemberBody,
};
