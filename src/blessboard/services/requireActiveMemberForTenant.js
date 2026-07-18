"use strict";

/**
 * Fail-closed gate: active login user + active member + active branch membership.
 * Admin roles alone never grant member portal access.
 */

const repo = require("../repositories/memberIdentityRepository");

const STATUS = Object.freeze({
  OK: "ok",
  UNAUTHENTICATED: "unauthenticated",
  FORBIDDEN: "forbidden",
  INACTIVE_USER: "inactive_user",
  NO_MEMBERSHIP: "no_membership",
  INACTIVE_MEMBER: "inactive_member",
  WRONG_BRANCH: "wrong_branch",
  LOOKUP_ERROR: "lookup_error",
});

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
 * @param {{ connect?: Function, query?: Function }} db
 * @param {{ userId: string, churchId: string, branchId: string }} input
 */
async function requireActiveMemberForTenant(db, input) {
  const userId = String((input && input.userId) || "").trim();
  const churchId = String((input && input.churchId) || "").trim();
  const branchId = String((input && input.branchId) || "").trim();

  if (!userId) {
    return {
      ok: false,
      status: STATUS.UNAUTHENTICATED,
      reason: "user_id",
      member: null,
      membership: null,
    };
  }
  if (!churchId || !branchId) {
    return {
      ok: false,
      status: STATUS.FORBIDDEN,
      reason: "tenant",
      member: null,
      membership: null,
    };
  }

  try {
    return await withClient(db, async (client) => {
      const user = await repo.findUserById(client, userId);
      if (!user || user.status !== "active") {
        return {
          ok: false,
          status: STATUS.INACTIVE_USER,
          reason: "user",
          member: null,
          membership: null,
        };
      }

      const church = await repo.findChurchById(client, churchId);
      if (!church || church.status !== "active") {
        return {
          ok: false,
          status: STATUS.FORBIDDEN,
          reason: "church",
          member: null,
          membership: null,
        };
      }

      const branch = await repo.findBranchById(client, branchId);
      if (!branch || String(branch.church_id) !== churchId || branch.status !== "active") {
        return {
          ok: false,
          status: STATUS.FORBIDDEN,
          reason: "branch",
          member: null,
          membership: null,
        };
      }

      const member = await repo.findActiveMemberByUserId(client, { churchId, userId });
      if (!member) {
        return {
          ok: false,
          status: STATUS.NO_MEMBERSHIP,
          reason: "no_member",
          member: null,
          membership: null,
        };
      }

      const membership = await repo.findMembership(client, member.id, branchId);
      if (!membership || membership.membershipStatus !== "active") {
        return {
          ok: false,
          status: STATUS.WRONG_BRANCH,
          reason: "membership",
          member,
          membership: null,
        };
      }

      return {
        ok: true,
        status: STATUS.OK,
        member,
        membership,
      };
    });
  } catch {
    return {
      ok: false,
      status: STATUS.LOOKUP_ERROR,
      reason: "lookup",
      member: null,
      membership: null,
    };
  }
}

module.exports = {
  STATUS,
  requireActiveMemberForTenant,
};
