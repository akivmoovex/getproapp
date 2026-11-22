"use strict";

/**
 * Retention, hold, and consent metadata.
 * A date passing does not delete a record. Releasing a hold does not delete it.
 * No retention period is chosen here.
 */

function elapsedTimeRetentionDecision() {
  return {
    ok: true,
    deletes: false,
    reason: "elapsed_time_does_not_delete",
  };
}

function planLegalHold(input) {
  const source = input && typeof input === "object" ? input : {};
  const reason = String(source.reason || "").trim();
  if (!reason || reason.length > 500) {
    return { ok: false, code: "invalid_input", deleted: false, holdStatus: null };
  }
  if (source.authorizationOk !== true) {
    return { ok: false, code: "access_denied", deleted: false, holdStatus: null };
  }
  return {
    ok: true,
    code: "placed",
    deleted: false,
    holdStatus: "placed",
    reason,
  };
}

function planLegalHoldRelease(input) {
  const source = input && typeof input === "object" ? input : {};
  if (source.authorizationOk !== true || source.releaseAuthorized !== true) {
    return { ok: false, code: "access_denied", deleted: false, holdStatus: "placed" };
  }
  if (source.holdStatus !== "placed") {
    return { ok: false, code: "invalid_input", deleted: false, holdStatus: source.holdStatus || null };
  }
  return { ok: true, code: "released", deleted: false, holdStatus: "released" };
}

function planConsentEvent(input) {
  const source = input && typeof input === "object" ? input : {};
  const scope = String(source.scope || "").trim();
  const method = String(source.method || "").trim();
  const recordedAt = Date.parse(source.recordedAt);
  if (!scope || scope.length > 80 || !method || method.length > 80 || !Number.isFinite(recordedAt)) {
    return { ok: false, code: "invalid_input", withdrawn: false };
  }
  return {
    ok: true,
    code: source.withdrawn === true ? "withdrawn" : "recorded",
    scope,
    method,
    recordedAt: new Date(recordedAt).toISOString(),
    withdrawn: source.withdrawn === true,
  };
}

module.exports = {
  elapsedTimeRetentionDecision,
  planLegalHold,
  planLegalHoldRelease,
  planConsentEvent,
};
