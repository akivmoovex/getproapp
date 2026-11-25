"use strict";

/**
 * Approved Resend sender identities.
 * A domain in this catalog is not verified until GETPRO_RESEND_VERIFIED_DOMAINS
 * lists it. DNS values are not stored here.
 */

const SENDERS = Object.freeze({
  blessboard: Object.freeze({
    product: "blessboard",
    name: "BlessBoard Security",
    email: "security@notify.blessboard.com",
    domain: "notify.blessboard.com",
  }),
  activeclinic: Object.freeze({
    product: "activeclinic",
    name: "ActiveClinic Security",
    email: "security@notify.activeclinic.org",
    domain: "notify.activeclinic.org",
  }),
  pronline: Object.freeze({
    product: "pronline",
    name: "PROnline Security",
    email: "security@notify.pronline.org",
    domain: "notify.pronline.org",
  }),
});

function verifiedDomainSet(env) {
  const raw = String((env && env.GETPRO_RESEND_VERIFIED_DOMAINS) || "");
  return new Set(
    raw
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean)
  );
}

function productKey(productCode) {
  const value = String(productCode || "")
    .trim()
    .toLowerCase();
  if (value === "blessboard" || value === "bb") return "blessboard";
  if (value === "activeclinic" || value === "ac") return "activeclinic";
  if (value === "pronline" || value === "platform" || value === "shared") return "pronline";
  if (value === "neuniversity" || value === "ne-university") return "neuniversity";
  return value;
}

function emailDomain(value) {
  const raw = String(value || "").trim().toLowerCase();
  const angled = raw.match(/<([^>]+)>/);
  const email = angled ? angled[1] : raw;
  const at = email.lastIndexOf("@");
  if (at < 1) return "";
  return email.slice(at + 1).replace(/[^a-z0-9.-]/g, "");
}

function isCatalogDomain(domain) {
  const value = String(domain || "").trim().toLowerCase();
  return Object.values(SENDERS).some((sender) => sender.domain === value);
}

function resolveProductSender(productCode, env) {
  const key = productKey(productCode);
  if (key === "neuniversity") {
    return { ok: false, reason: "not_configured", product: key };
  }
  const sender = SENDERS[key];
  if (!sender) return { ok: false, reason: "unknown_product", product: key || "missing" };
  const verified = verifiedDomainSet(env);
  if (!verified.has(sender.domain)) {
    return { ok: false, reason: "domain_not_verified", product: key, sender };
  }
  return {
    ok: true,
    reason: "verified",
    product: key,
    sender,
    fromHeader: `${sender.name} <${sender.email}>`,
  };
}

function approvedSenderOptions(from, env) {
  const domain = emailDomain(from);
  if (!isCatalogDomain(domain)) return {};
  return {
    enforceApprovedSender: true,
    verifiedDomains: [...verifiedDomainSet(env)],
  };
}

module.exports = {
  SENDERS,
  verifiedDomainSet,
  productKey,
  emailDomain,
  isCatalogDomain,
  resolveProductSender,
  approvedSenderOptions,
};
