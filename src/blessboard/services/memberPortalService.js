"use strict";

/**
 * Member portal profile read/update (low-risk fields only).
 */

const { normalizePhone } = require("./settingsValidation");
const {
  requireActiveMemberForTenant,
  STATUS: ACCESS_STATUS,
} = require("./requireActiveMemberForTenant");
const repo = require("../repositories/memberIdentityRepository");

const STATUS = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  FORBIDDEN: ACCESS_STATUS.FORBIDDEN,
  UNAUTHENTICATED: ACCESS_STATUS.UNAUTHENTICATED,
  NO_MEMBERSHIP: ACCESS_STATUS.NO_MEMBERSHIP,
  WRONG_BRANCH: ACCESS_STATUS.WRONG_BRANCH,
  INACTIVE_USER: ACCESS_STATUS.INACTIVE_USER,
  CONFLICT: "conflict",
  LOOKUP_ERROR: "lookup_error",
});

const HTML_RE = /[<>]/;
const NAME_MAX = 100;

/**
 * @param {{ connect?: Function, query?: Function }} db
 * @param {(client: object) => Promise<T>} fn
 * @template T
 */
async function withClient(db, fn) {
  if (db && typeof db.connect === "function") {
    const client = await db.connect();
    try {
      return await fn(client);
    } finally {
      client.release();
    }
  }
  return fn(db);
}

/**
 * @param {object} member
 * @param {object} membership
 */
function publicProfile(member, membership) {
  return {
    preferredName: member.preferredName,
    firstName: member.firstName,
    lastName: member.lastName,
    emailDisplay: member.emailDisplay,
    emailNormalized: member.emailNormalized,
    phoneDisplay: member.phoneDisplay,
    phoneNormalized: member.phoneNormalized,
    membershipStatus: membership.membershipStatus,
    isPrimaryBranch: Boolean(membership.isPrimary),
  };
}

/**
 * @param {{ connect?: Function, query?: Function }} db
 * @param {{ userId: string, churchId: string, branchId: string }} input
 */
async function getMemberPortalProfile(db, input) {
  const access = await requireActiveMemberForTenant(db, input);
  if (!access.ok) {
    return {
      ok: false,
      status: access.status,
      reason: access.reason,
      profile: null,
    };
  }
  return {
    ok: true,
    status: STATUS.OK,
    profile: publicProfile(access.member, access.membership),
    memberId: access.member.id,
  };
}

/**
 * Update preferred name, phone, and email display only.
 * Never changes membership, church, branch, roles, or email_normalized identity.
 * @param {{ connect?: Function, query?: Function }} db
 * @param {object} input
 */
async function updateMemberPortalProfile(db, input) {
  const raw = input && typeof input === "object" ? input : {};
  const access = await requireActiveMemberForTenant(db, {
    userId: raw.userId,
    churchId: raw.churchId,
    branchId: raw.branchId,
  });
  if (!access.ok) {
    return {
      ok: false,
      status: access.status,
      reason: access.reason,
      profile: null,
    };
  }

  // Reject attempts to mutate privileged member fields via the profile form payload.
  const forbiddenFormKeys = [
    "status",
    "membershipStatus",
    "firstName",
    "lastName",
    "emailNormalized",
    "email",
    "role",
    "roles",
    "churchIdForm",
    "branchIdForm",
  ];
  for (const key of forbiddenFormKeys) {
    if (Object.prototype.hasOwnProperty.call(raw, key) && raw[key] !== undefined) {
      return { ok: false, status: STATUS.INVALID_INPUT, reason: `immutable:${key}`, profile: null };
    }
  }

  let preferredName = access.member.preferredName;
  if (raw.preferredName !== undefined) {
    const s = raw.preferredName == null ? "" : String(raw.preferredName).trim();
    if (s && (HTML_RE.test(s) || s.length > NAME_MAX)) {
      return { ok: false, status: STATUS.INVALID_INPUT, reason: "preferred_name", profile: null };
    }
    preferredName = s || null;
  }

  let emailDisplay = access.member.emailDisplay;
  if (raw.emailDisplay !== undefined) {
    const s = raw.emailDisplay == null ? "" : String(raw.emailDisplay).trim();
    if (!s) {
      emailDisplay = access.member.emailNormalized;
    } else if (s.length > 254 || HTML_RE.test(s)) {
      return { ok: false, status: STATUS.INVALID_INPUT, reason: "email_display", profile: null };
    } else {
      // Display may differ in casing/format; identity email_normalized stays fixed.
      emailDisplay = s;
    }
  }

  let phoneNormalized = access.member.phoneNormalized;
  let phoneDisplay = access.member.phoneDisplay;
  if (raw.phone !== undefined) {
    const phoneRaw = raw.phone == null ? "" : String(raw.phone).trim();
    if (!phoneRaw) {
      phoneNormalized = null;
      phoneDisplay = null;
    } else {
      const phone = normalizePhone(phoneRaw);
      if (!phone.ok || !phone.value) {
        return { ok: false, status: STATUS.INVALID_INPUT, reason: "phone", profile: null };
      }
      phoneNormalized = phone.value;
      phoneDisplay = phoneRaw;
    }
  }

  if (!access.member.emailNormalized && !phoneNormalized) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "contact_required", profile: null };
  }

  try {
    return await withClient(db, async (client) => {
      const updated = await repo.updateMemberProfileFields(client, {
        memberId: access.member.id,
        preferredName,
        emailDisplay,
        phoneNormalized,
        phoneDisplay,
      });
      if (!updated) {
        return { ok: false, status: STATUS.FORBIDDEN, reason: "update", profile: null };
      }
      return {
        ok: true,
        status: STATUS.OK,
        profile: publicProfile(updated, access.membership),
      };
    });
  } catch (err) {
    const msg = String((err && err.message) || err || "");
    if (/unique|duplicate/i.test(msg)) {
      return { ok: false, status: STATUS.CONFLICT, reason: "duplicate_contact", profile: null };
    }
    return { ok: false, status: STATUS.LOOKUP_ERROR, reason: "lookup", profile: null };
  }
}

module.exports = {
  STATUS,
  getMemberPortalProfile,
  updateMemberPortalProfile,
  publicProfile,
};
