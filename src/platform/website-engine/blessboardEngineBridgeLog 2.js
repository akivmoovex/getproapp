"use strict";

/**
 * Structured observability for BlessBoard → shared-engine dual-write.
 * Never logs secrets, credentials, snapshots, or request bodies.
 */

const EVENT = "blessboard.website.engine_bridge";

function safeId(value) {
  if (value == null) return null;
  const text = String(value).trim();
  if (!text) return null;
  return text.slice(0, 80);
}

function safeClass(value) {
  if (value == null) return "unknown";
  return String(value).replace(/\s+/g, "_").slice(0, 80) || "unknown";
}

/**
 * @param {"failure"|"warning"} outcome
 * @param {object} fields
 */
function logBlessBoardEngineBridge(outcome, fields) {
  const payload = {
    event: EVENT,
    outcome: outcome === "warning" ? "warning" : "failure",
    productCode: "blessboard",
    timestamp: new Date().toISOString(),
    operation: safeId(fields && fields.operation) || "publishFromLegacy",
    organizationId: safeId(fields && fields.organizationId),
    instanceId: safeId(fields && fields.instanceId),
    churchId: safeId(fields && fields.churchId),
    branchId: safeId(fields && fields.branchId),
    actorIdentityId: safeId(fields && fields.actorIdentityId),
    actorUserId: safeId(fields && fields.actorUserId),
    cmsPublicationVersionId: safeId(fields && fields.cmsPublicationVersionId),
    engineVersionId: safeId(fields && fields.engineVersionId),
    engineCode: safeId(fields && fields.engineCode),
    errorClass: safeClass((fields && fields.errorClass) || (fields && fields.engineCode)),
  };
  // eslint-disable-next-line no-console
  console.error(JSON.stringify(payload));
  return payload;
}

function logBlessBoardEngineBridgeFailure(fields) {
  return logBlessBoardEngineBridge("failure", fields);
}

function logBlessBoardEngineBridgeWarning(fields) {
  return logBlessBoardEngineBridge("warning", fields);
}

module.exports = {
  EVENT,
  logBlessBoardEngineBridge,
  logBlessBoardEngineBridgeFailure,
  logBlessBoardEngineBridgeWarning,
};
