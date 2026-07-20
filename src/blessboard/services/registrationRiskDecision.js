"use strict";

/**
 * Deterministic, explainable risk review for public BlessBoard V5 registration.
 * No AI scoring, device fingerprinting, or external fraud vendors.
 */

const authRepo = require("../repositories/blessBoardAuthRepository");
const {
  resolveCallingCode,
  DUPLICATE_PHONE_MESSAGE,
} = require("./normalizeRegistrationPhone");
const { isReservedOrganizationKey } = require("./organizationKey");

const RISK_DECISIONS = Object.freeze({
  ALLOW: "allow",
  REVIEW_REQUIRED: "review_required",
  REJECT: "reject",
});

/** Allowlisted reason codes only — never invent opaque scores. */
const RISK_REASON_CODES = Object.freeze({
  CLEAN: "clean",
  HONEYPOT: "honeypot",
  INVALID_INPUT: "invalid_input",
  DUPLICATE_PHONE: "duplicate_phone",
  DUPLICATE_EMAIL: "duplicate_email",
  SIMILAR_ORGANIZATION: "similar_organization",
  IP_VELOCITY: "ip_velocity",
  IP_VELOCITY_BLOCKED: "ip_velocity_blocked",
  PRIOR_REJECTION: "prior_rejection",
  COUNTRY_PHONE_MISMATCH: "country_phone_mismatch",
  RESERVED_ORGANIZATION_KEY: "reserved_organization_key",
  ADMIN_REJECTED: "admin_rejected",
});

const ALLOWED_REASON_CODE_SET = new Set(Object.values(RISK_REASON_CODES));

const RISK_REASON_LABELS = Object.freeze({
  [RISK_REASON_CODES.CLEAN]: "No risk signals",
  [RISK_REASON_CODES.HONEYPOT]: "Automated form trap triggered",
  [RISK_REASON_CODES.INVALID_INPUT]: "Clearly invalid registration input",
  [RISK_REASON_CODES.DUPLICATE_PHONE]: "Phone already linked to an active registration",
  [RISK_REASON_CODES.DUPLICATE_EMAIL]: "Administrator email already has a BlessBoard account",
  [RISK_REASON_CODES.SIMILAR_ORGANIZATION]:
    "Organization name matches an existing registration at the same city and country",
  [RISK_REASON_CODES.IP_VELOCITY]: "Repeated registration attempts from the same network",
  [RISK_REASON_CODES.IP_VELOCITY_BLOCKED]: "Excessive registration attempts from the same network",
  [RISK_REASON_CODES.PRIOR_REJECTION]: "A matching application was previously rejected",
  [RISK_REASON_CODES.COUNTRY_PHONE_MISMATCH]: "Country and phone country-code appear to conflict",
  [RISK_REASON_CODES.RESERVED_ORGANIZATION_KEY]: "Requested organization key is reserved",
  [RISK_REASON_CODES.ADMIN_REJECTED]: "Rejected by a platform administrator",
});

const REJECT_REASON_CODES = Object.freeze([
  RISK_REASON_CODES.HONEYPOT,
  RISK_REASON_CODES.INVALID_INPUT,
  RISK_REASON_CODES.DUPLICATE_PHONE,
  RISK_REASON_CODES.IP_VELOCITY_BLOCKED,
  RISK_REASON_CODES.RESERVED_ORGANIZATION_KEY,
  RISK_REASON_CODES.ADMIN_REJECTED,
]);

const REVIEW_REASON_CODES = Object.freeze([
  RISK_REASON_CODES.DUPLICATE_EMAIL,
  RISK_REASON_CODES.SIMILAR_ORGANIZATION,
  RISK_REASON_CODES.IP_VELOCITY,
  RISK_REASON_CODES.PRIOR_REJECTION,
  RISK_REASON_CODES.COUNTRY_PHONE_MISMATCH,
]);

const PUBLIC_REVIEW_MESSAGE =
  "Thank you. Your registration needs a short review before we can continue. BlessBoard will assist you — no further action is required right now.";

const PUBLIC_REJECT_MESSAGE =
  "We could not complete this registration right now. Please try again later or contact BlessBoard support.";

/** Aligns with platform form rate defaults (15 min / 12). */
const IP_WINDOW_MINUTES = 15;
const IP_REVIEW_THRESHOLD = 5;
const IP_REJECT_THRESHOLD = 12;

const TARGET_RELATION = "blessboard.platform_church_registration_applications";

/**
 * Loopback / RFC1918 — not useful for public abuse scoring (and breaks local test suites).
 * Express rate-limit still applies at the HTTP edge for all clients.
 * @param {unknown} sourceIp
 */
function isPublicSourceIp(sourceIp) {
  const ip = String(sourceIp || "")
    .trim()
    .toLowerCase();
  if (!ip) return false;
  const bare = ip.startsWith("::ffff:") ? ip.slice(7) : ip;
  if (bare === "127.0.0.1" || bare === "::1" || bare === "0:0:0:0:0:0:0:1") return false;
  if (bare.startsWith("10.")) return false;
  if (bare.startsWith("192.168.")) return false;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(bare)) return false;
  if (bare.startsWith("fc") || bare.startsWith("fd") || bare.startsWith("fe80:")) return false;
  return true;
}

/**
 * @param {unknown} codes
 * @returns {string[]}
 */
function filterAllowlistedReasonCodes(codes) {
  if (!Array.isArray(codes)) return [];
  const out = [];
  for (const raw of codes) {
    const code = String(raw || "")
      .trim()
      .toLowerCase();
    if (!ALLOWED_REASON_CODE_SET.has(code)) continue;
    if (code === RISK_REASON_CODES.CLEAN) continue;
    if (!out.includes(code)) out.push(code);
  }
  return out;
}

/**
 * @param {string[]} reasons
 * @returns {"allow"|"review_required"|"reject"}
 */
function decideFromReasonCodes(reasons) {
  const codes = filterAllowlistedReasonCodes(reasons);
  for (const code of codes) {
    if (REJECT_REASON_CODES.includes(code)) return RISK_DECISIONS.REJECT;
  }
  for (const code of codes) {
    if (REVIEW_REASON_CODES.includes(code)) return RISK_DECISIONS.REVIEW_REQUIRED;
  }
  return RISK_DECISIONS.ALLOW;
}

/**
 * @param {string[]} codes
 * @returns {{ code: string, label: string }[]}
 */
function reasonLabelsForAdmin(codes) {
  return filterAllowlistedReasonCodes(codes).map((code) => ({
    code,
    label: RISK_REASON_LABELS[code] || code,
  }));
}

/**
 * When country resolves to a calling code and the E.164 phone uses a different prefix.
 * Diaspora / travel cases go to review — never automatic rejection on this signal alone.
 * @param {unknown} country
 * @param {unknown} normalizedPhone
 */
function hasCountryPhoneMismatch(country, normalizedPhone) {
  const callingCode = resolveCallingCode(country);
  const phone = String(normalizedPhone || "").trim();
  if (!callingCode || !phone.startsWith("+")) return false;
  const digits = phone.slice(1);
  if (!/^\d{7,15}$/.test(digits)) return false;
  return !digits.startsWith(callingCode);
}

/**
 * Exact normalized church name + city + country (uncertain duplicate).
 * Name similarity alone never auto-rejects and does not trigger review.
 * @param {{ query: Function }} db
 * @param {{ churchName: string, city: string, country: string, excludeApplicationId?: string|null }} opts
 */
async function findSimilarOrganizationMatch(db, opts) {
  const churchName = String(opts.churchName || "")
    .trim()
    .toLowerCase();
  const city = String(opts.city || "")
    .trim()
    .toLowerCase();
  const country = String(opts.country || "")
    .trim()
    .toLowerCase();
  if (!churchName || !city || !country) return null;

  const params = [churchName, city, country];
  let excludeSql = "";
  if (opts.excludeApplicationId) {
    params.push(String(opts.excludeApplicationId));
    excludeSql += ` AND id <> $${params.length}::uuid`;
  }
  if (opts.excludeContactEmail) {
    params.push(
      String(opts.excludeContactEmail || "")
        .trim()
        .toLowerCase()
    );
    excludeSql += ` AND lower(contact_email) <> $${params.length}`;
  }

  const r = await db.query(
    `SELECT id, church_name, city, country, application_status, provisioning_status
       FROM ${TARGET_RELATION}
      WHERE lower(church_name) = $1
        AND lower(city) = $2
        AND lower(country) = $3
        AND (
          application_status IN ('submitted', 'duplicate_review')
          OR provisioning_status IN ('provisioning', 'provisioned', 'provisioning_failed')
        )
        ${excludeSql}
      ORDER BY created_at DESC
      LIMIT 1`,
    params
  );
  return r.rows[0] || null;
}

/**
 * @param {{ query: Function }} db
 * @param {{ contactEmail: string, contactPhoneNormalized?: string|null }} opts
 */
async function findPriorRejectedMatch(db, opts) {
  const email = String(opts.contactEmail || "")
    .trim()
    .toLowerCase();
  const phone = String(opts.contactPhoneNormalized || "").trim();
  if (!email && !phone) return null;

  const r = await db.query(
    `SELECT id, contact_email, contact_phone_normalized, application_status, rejection_reason
       FROM ${TARGET_RELATION}
      WHERE application_status = 'rejected'
        AND (
          ($1::text <> '' AND lower(contact_email) = $1)
          OR ($2::text <> '' AND contact_phone_normalized = $2)
        )
      ORDER BY created_at DESC
      LIMIT 1`,
    [email, phone]
  );
  return r.rows[0] || null;
}

/**
 * @param {{ query: Function }} db
 * @param {string|null} sourceIp
 * @param {number} [windowMinutes]
 */
async function countRecentApplicationsByIp(db, sourceIp, windowMinutes = IP_WINDOW_MINUTES) {
  const ip = String(sourceIp || "").trim().slice(0, 64);
  if (!ip) return 0;
  const window = Math.min(Math.max(Number(windowMinutes) || IP_WINDOW_MINUTES, 1), 120);
  const r = await db.query(
    `SELECT COUNT(*)::int AS c
       FROM ${TARGET_RELATION}
      WHERE source_ip = $1
        AND created_at >= now() - ($2::int * interval '1 minute')`,
    [ip, window]
  );
  return Number(r.rows[0] && r.rows[0].c) || 0;
}

/**
 * @param {{ query: Function }} db
 * @param {string} contactPhoneNormalized
 */
async function findOccupyingPhoneMatch(db, contactPhoneNormalized) {
  const phone = String(contactPhoneNormalized || "").trim();
  if (!phone) return null;
  const r = await db.query(
    `SELECT id, contact_email, application_status, provisioning_status
       FROM ${TARGET_RELATION}
      WHERE contact_phone_normalized = $1
        AND (
          application_status IN ('submitted', 'duplicate_review')
          OR provisioning_status IN ('provisioning', 'provisioned', 'provisioning_failed')
        )
      ORDER BY created_at DESC
      LIMIT 1`,
    [phone]
  );
  return r.rows[0] || null;
}

/**
 * Evaluate registration risk. Call after field validation, before insert/provision.
 * @param {{ query: Function }} db
 * @param {{
 *   data?: object|null,
 *   sourceIp?: string|null,
 *   honeypot?: boolean,
 *   organizationKey?: string|null,
 *   skipPhoneLookup?: boolean,
 * }} input
 */
async function evaluateRegistrationRisk(db, input = {}) {
  const reasons = [];
  const decidedAt = new Date().toISOString();

  if (input.honeypot) {
    reasons.push(RISK_REASON_CODES.HONEYPOT);
    return finalize(reasons, decidedAt, { duplicatePhoneMessage: null });
  }

  const data = input.data && typeof input.data === "object" ? input.data : null;
  if (!data) {
    reasons.push(RISK_REASON_CODES.INVALID_INPUT);
    return finalize(reasons, decidedAt, { duplicatePhoneMessage: null });
  }

  const orgKey = String(input.organizationKey || data.organization_key || "").trim();
  if (orgKey && isReservedOrganizationKey(orgKey)) {
    reasons.push(RISK_REASON_CODES.RESERVED_ORGANIZATION_KEY);
  }

  if (hasCountryPhoneMismatch(data.country, data.contact_phone_normalized)) {
    reasons.push(RISK_REASON_CODES.COUNTRY_PHONE_MISMATCH);
  }

  if (!db || typeof db.query !== "function") {
    return finalize(reasons, decidedAt, { duplicatePhoneMessage: null });
  }

  if (!input.skipPhoneLookup && data.contact_phone_normalized) {
    const phoneHit = await findOccupyingPhoneMatch(db, data.contact_phone_normalized);
    if (phoneHit) {
      const hitEmail = String(phoneHit.contact_email || "")
        .trim()
        .toLowerCase();
      const myEmail = String(data.contact_email || "")
        .trim()
        .toLowerCase();
      // Same email + same phone is soft idempotency (browser retry), not a conflict.
      if (!myEmail || hitEmail !== myEmail) {
        reasons.push(RISK_REASON_CODES.DUPLICATE_PHONE);
        return finalize(reasons, decidedAt, {
          duplicatePhoneMessage: DUPLICATE_PHONE_MESSAGE,
        });
      }
    }
  }

  const email = String(data.contact_email || "")
    .trim()
    .toLowerCase();
  if (email) {
    const existingUser = await authRepo.findUserByEmail(db, email);
    if (existingUser) {
      reasons.push(RISK_REASON_CODES.DUPLICATE_EMAIL);
    }
  }

  const similar = await findSimilarOrganizationMatch(db, {
    churchName: data.church_name,
    city: data.city,
    country: data.country,
    excludeContactEmail: email || null,
  });
  if (similar) {
    reasons.push(RISK_REASON_CODES.SIMILAR_ORGANIZATION);
  }

  const prior = await findPriorRejectedMatch(db, {
    contactEmail: email,
    contactPhoneNormalized: data.contact_phone_normalized || null,
  });
  if (prior) {
    reasons.push(RISK_REASON_CODES.PRIOR_REJECTION);
  }

  const ipCount = isPublicSourceIp(input.sourceIp)
    ? await countRecentApplicationsByIp(db, input.sourceIp, IP_WINDOW_MINUTES)
    : 0;
  if (ipCount >= IP_REJECT_THRESHOLD) {
    reasons.push(RISK_REASON_CODES.IP_VELOCITY_BLOCKED);
  } else if (ipCount >= IP_REVIEW_THRESHOLD) {
    reasons.push(RISK_REASON_CODES.IP_VELOCITY);
  }

  return finalize(reasons, decidedAt, { duplicatePhoneMessage: null });
}

/**
 * @param {string[]} reasons
 * @param {string} decidedAt
 * @param {{ duplicatePhoneMessage: string|null }} extra
 */
function finalize(reasons, decidedAt, extra) {
  const reasonCodes = filterAllowlistedReasonCodes(reasons);
  const decision = decideFromReasonCodes(reasonCodes);
  return {
    decision,
    reasonCodes: decision === RISK_DECISIONS.ALLOW ? [] : reasonCodes,
    decidedAt,
    labels: reasonLabelsForAdmin(reasonCodes),
    publicMessage:
      decision === RISK_DECISIONS.REJECT
        ? extra.duplicatePhoneMessage || PUBLIC_REJECT_MESSAGE
        : decision === RISK_DECISIONS.REVIEW_REQUIRED
          ? PUBLIC_REVIEW_MESSAGE
          : null,
    field:
      reasonCodes.includes(RISK_REASON_CODES.DUPLICATE_PHONE)
        ? "phone"
        : reasonCodes.includes(RISK_REASON_CODES.RESERVED_ORGANIZATION_KEY)
          ? "organization_key"
          : null,
  };
}

module.exports = {
  RISK_DECISIONS,
  RISK_REASON_CODES,
  RISK_REASON_LABELS,
  REJECT_REASON_CODES,
  REVIEW_REASON_CODES,
  ALLOWED_REASON_CODE_SET,
  PUBLIC_REVIEW_MESSAGE,
  PUBLIC_REJECT_MESSAGE,
  DUPLICATE_PHONE_MESSAGE,
  IP_WINDOW_MINUTES,
  IP_REVIEW_THRESHOLD,
  IP_REJECT_THRESHOLD,
  filterAllowlistedReasonCodes,
  decideFromReasonCodes,
  reasonLabelsForAdmin,
  hasCountryPhoneMismatch,
  findSimilarOrganizationMatch,
  findPriorRejectedMatch,
  countRecentApplicationsByIp,
  findOccupyingPhoneMatch,
  evaluateRegistrationRisk,
  isPublicSourceIp,
};
