"use strict";

const KEY_RE = /^[a-z][a-z0-9_-]{0,63}$/;
const EMAIL_RE = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/;
const E164_RE = /^\+[1-9][0-9]{7,14}$/;

function normalizeKey(raw) {
  // Migration requires keys already valid for V5 — do not invent keys by stripping chars.
  const key = String(raw || "")
    .trim()
    .toLowerCase();
  if (!KEY_RE.test(key)) return null;
  return key;
}

function normalizeEmail(raw) {
  const email = String(raw || "")
    .trim()
    .toLowerCase();
  if (!email || !EMAIL_RE.test(email) || email.length > 254) return null;
  return email;
}

function normalizePhone(raw) {
  let phone = String(raw || "").trim();
  if (!phone) return null;
  phone = phone.replace(/[^\d+]/g, "");
  if (phone.startsWith("00")) phone = `+${phone.slice(2)}`;
  if (!phone.startsWith("+") && /^\d{9,15}$/.test(phone)) phone = `+${phone}`;
  if (!E164_RE.test(phone)) return null;
  return phone;
}

function mapOrgStatus(status) {
  const s = String(status || "active").toLowerCase();
  if (s === "active") return { org: "active", church: "active" };
  if (s === "inactive") return { org: "inactive", church: "inactive" };
  if (s === "suspended") return { org: "inactive", church: "suspended" };
  if (s === "archived" || s === "dormant") return { org: "retired", church: "archived" };
  return null;
}

function mapMemberStatus(status) {
  const s = String(status || "pending").toLowerCase();
  if (s === "pending") return "pending";
  if (s === "verified" || s === "active") return "active";
  if (s === "suspended") return "suspended";
  if (s === "inactive") return "inactive";
  if (s === "rejected") return "archived";
  return null;
}

function splitFullName(fullName) {
  const parts = String(fullName || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return null;
  if (parts.length === 1) return { firstName: parts[0], lastName: "(unknown)" };
  return {
    firstName: parts.slice(0, -1).join(" "),
    lastName: parts[parts.length - 1],
  };
}

function mapPlanKey(planCode) {
  const key = String(planCode || "free")
    .trim()
    .toLowerCase();
  if (["free", "growth", "professional", "partner"].includes(key)) return key;
  return "free";
}

function mapDataEnvironment(raw, fallback) {
  const v = String(raw || fallback || "")
    .trim()
    .toLowerCase();
  if (["production", "pilot", "demo", "testing"].includes(v)) return v;
  return null;
}

function ok(record, warnings = []) {
  return { ok: true, status: "mapped", record, warnings, quarantine: null };
}

function quarantine(reason, row, warnings = []) {
  return {
    ok: false,
    status: "quarantine",
    record: null,
    warnings,
    quarantine: { reason, row },
  };
}

module.exports = {
  KEY_RE,
  normalizeKey,
  normalizeEmail,
  normalizePhone,
  mapOrgStatus,
  mapMemberStatus,
  splitFullName,
  mapPlanKey,
  mapDataEnvironment,
  ok,
  quarantine,
};
