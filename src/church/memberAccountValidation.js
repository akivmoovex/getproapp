"use strict";

function validateChangePasswordBody(body) {
  const current_password = String((body && body.current_password) || "");
  const new_password = String((body && body.new_password) || "");
  const confirm_password = String((body && body.confirm_password) || "");

  if (!current_password) {
    return { ok: false, error: "Current password is required.", form: { new_password: "", confirm_password: "" } };
  }
  if (!new_password) {
    return {
      ok: false,
      error: "New password is required.",
      form: { current_password: "", new_password: "", confirm_password: "" },
    };
  }
  if (new_password.length < 8) {
    return {
      ok: false,
      error: "New password must be at least 8 characters.",
      form: { current_password: "", new_password: "", confirm_password: "" },
    };
  }
  if (!confirm_password) {
    return {
      ok: false,
      error: "Please confirm your new password.",
      form: { current_password: "", new_password: "", confirm_password: "" },
    };
  }
  if (new_password !== confirm_password) {
    return {
      ok: false,
      error: "New password and confirmation do not match.",
      form: { current_password: "", new_password: "", confirm_password: "" },
    };
  }

  return {
    ok: true,
    current_password,
    new_password,
    confirm_password,
    form: { current_password: "", new_password: "", confirm_password: "" },
  };
}

module.exports = {
  validateChangePasswordBody,
};
