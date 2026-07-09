"use strict";

const ACCOUNT_TYPES = ["member", "branch_admin", "hq_admin", "ministry_leader"];

const LOGIN_PROTECTION = {
  maxFailedAttempts: 5,
  lockoutMinutes: 15,
};

const GENERIC_LOGIN_FAILURE =
  "Login failed. Check your details and try again.";

const LOCKOUT_MESSAGE =
  "Too many failed attempts. Try again later or contact your church administrator.";

const MISSING_FIELDS_MESSAGE = "Please enter your email or phone and password.";

const LOCK_AUDIT_ACTIONS = {
  member: "member_login_locked",
  branch_admin: "branch_admin_login_locked",
  hq_admin: "hq_admin_login_locked",
  ministry_leader: "ministry_leader_login_locked",
};

const LOCK_ENTITY_TYPES = {
  member: "member",
  branch_admin: "church_branch_admin",
  hq_admin: "church_hq_admin",
  ministry_leader: "church_ministry_leader",
};

function normalizeLoginIdentifier(identifier) {
  const raw = String(identifier || "").trim();
  if (!raw) return "";
  if (raw.includes("@")) {
    return raw.toLowerCase().slice(0, 254);
  }
  const digits = raw.replace(/\D/g, "");
  return digits.slice(0, 32);
}

function maskLoginIdentifier(identifierNormalized) {
  const value = String(identifierNormalized || "");
  if (!value) return "";
  if (value.includes("@")) {
    const [local, domain] = value.split("@");
    if (!domain) return "***";
    const head = local.length > 0 ? local.charAt(0) : "";
    return `${head}***@${domain}`;
  }
  if (value.length <= 4) return "****";
  return `***${value.slice(-4)}`;
}

function truncateMeta(value, maxLen = 200) {
  return String(value || "").trim().slice(0, maxLen) || null;
}

function requestLoginMeta(req) {
  return {
    ip_address: truncateMeta(req.ip || (req.connection && req.connection.remoteAddress)),
    user_agent: truncateMeta(req.get && req.get("user-agent")),
  };
}

module.exports = {
  ACCOUNT_TYPES,
  LOGIN_PROTECTION,
  GENERIC_LOGIN_FAILURE,
  LOCKOUT_MESSAGE,
  MISSING_FIELDS_MESSAGE,
  LOCK_AUDIT_ACTIONS,
  LOCK_ENTITY_TYPES,
  normalizeLoginIdentifier,
  maskLoginIdentifier,
  truncateMeta,
  requestLoginMeta,
};
