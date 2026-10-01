"use strict";

/**
 * BlessBoard join-request adapter constants + resource scope helpers.
 *
 * Ministry / department join MUST create PENDING approval requests.
 * Membership is not activated until approve.
 */

const JOIN_REQUEST_TYPE = Object.freeze({
  MINISTRY_JOIN: "ministry.join",
  DEPARTMENT_JOIN: "department.join",
});

const JOIN_TARGET_TYPE = Object.freeze({
  MINISTRY: "ministry",
  DEPARTMENT: "department",
});

const JOIN_PERMISSION = Object.freeze({
  /** Broader than resource-scoped leader review */
  REVIEW_BROAD: "events.manage",
  DEPARTMENTS_MANAGE: "departments.members.manage",
  MINISTRIES_VIEW: "events.view",
});

/**
 * Resource-scoped review:
 * - If actor has broaderPermission → allow all targets in org/church
 * - Else actor may only review targets listed in managedResourceIds
 */
function assertResourceScopedReview(input) {
  const targetId = String((input && input.targetId) || "").trim();
  if (!targetId) {
    return { ok: false, code: "resource_scope_denied", reason: "target_required" };
  }
  if (input.hasBroaderPermission === true) {
    return { ok: true, scope: "broad" };
  }
  const managed = Array.isArray(input.managedResourceIds)
    ? input.managedResourceIds.map((x) => String(x))
    : [];
  if (managed.includes(targetId)) {
    return { ok: true, scope: "managed" };
  }
  return {
    ok: false,
    code: "resource_scope_denied",
    reason: "not_manager_of_target",
    targetId,
  };
}

module.exports = {
  JOIN_REQUEST_TYPE,
  JOIN_TARGET_TYPE,
  JOIN_PERMISSION,
  assertResourceScopedReview,
};
