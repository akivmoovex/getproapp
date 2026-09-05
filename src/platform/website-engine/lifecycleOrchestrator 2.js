"use strict";

/**
 * Canonical entry point for website publication state changes.
 *
 * Product code no longer decides publication semantics: it registers a
 * projection handler and the engine orchestrates permission checks, delegation,
 * and result normalisation. The product handler is responsible for committing
 * its public projection and the engine version inside one transaction.
 */

const { assertWebsiteAction, PERMISSIONS } = require("./permissionHooks");
const { PRODUCT_CODE } = require("./productSchemaRegistry");

const ACTION = Object.freeze({
  PUBLISH: "publish",
  UNPUBLISH: "unpublish",
  RESTORE: "restore",
});

const STAGE = Object.freeze({
  PERMISSION: "permission",
  PRODUCT: "product_not_registered",
  PROJECTION: "projection",
});

/** @type {Map<string, {publish?: Function, unpublish?: Function, restore?: Function}>} */
const OVERRIDES = new Map();

const BUILTIN = Object.freeze({
  [PRODUCT_CODE.BLESSBOARD]: Object.freeze({
    publish: (db, request) =>
      require("../../blessboard/services/churchWebsitePublishService").publishChurchWebsite(
        db,
        request
      ),
    unpublish: (db, request) =>
      require("../../blessboard/services/churchWebsitePublishService").unpublishChurchWebsite(
        db,
        request
      ),
    restore: (db, request) =>
      require("../../blessboard/services/websitePublicationVersionService").createRestoredDraft(
        db,
        request
      ),
  }),
  [PRODUCT_CODE.ACTIVECLINIC]: Object.freeze({
    publish: (db, request) =>
      require("../website/publicationService").publishWebsiteDraft(db, request),
    unpublish: (db, request) =>
      require("../website/publicationService").unpublishWebsite(db, request),
  }),
});

/**
 * @param {string} productCode
 * @param {{publish?: Function, unpublish?: Function, restore?: Function}} handlers
 */
function registerProductLifecycle(productCode, handlers) {
  const key = String(productCode || "").trim();
  if (!key || !handlers || typeof handlers !== "object") return false;
  OVERRIDES.set(key, { ...(OVERRIDES.get(key) || {}), ...handlers });
  return true;
}

function resolveProductLifecycle(productCode) {
  const key = String(productCode || "").trim();
  return { ...(BUILTIN[key] || {}), ...(OVERRIDES.get(key) || {}) };
}

function defaultGrantsFor(action) {
  return action === ACTION.RESTORE
    ? [PERMISSIONS.RESTORE]
    : [PERMISSIONS.PUBLISH];
}

/**
 * @param {object} db
 * @param {{
 *   action: string,
 *   productCode: string,
 *   grantedPermissions?: string[],
 *   request?: object,
 * }} input
 */
async function runLifecycleAction(db, input) {
  const action = String((input && input.action) || "").trim();
  const productCode = String((input && input.productCode) || "").trim();
  const granted =
    input && Array.isArray(input.grantedPermissions) && input.grantedPermissions.length
      ? input.grantedPermissions
      : defaultGrantsFor(action);

  const gate = assertWebsiteAction(granted, action);
  if (!gate.ok) {
    return {
      ok: false,
      engineOrchestrated: true,
      stage: STAGE.PERMISSION,
      reason: gate.code,
      status: gate.code === "unknown_action" ? "invalid_input" : "forbidden",
    };
  }

  const lifecycle = resolveProductLifecycle(productCode);
  const handler = lifecycle && lifecycle[action];
  if (typeof handler !== "function") {
    return {
      ok: false,
      engineOrchestrated: true,
      stage: STAGE.PRODUCT,
      reason: `${productCode || "unknown"}_${action}_unavailable`,
      status: "invalid_input",
    };
  }

  const result = await handler(db, (input && input.request) || {});
  return {
    ...(result && typeof result === "object" ? result : { ok: false, reason: "no_result" }),
    engineOrchestrated: true,
    stage: STAGE.PROJECTION,
  };
}

/**
 * @param {object} db
 * @param {{productCode: string, grantedPermissions?: string[], request?: object}} input
 */
function publishWebsite(db, input) {
  return runLifecycleAction(db, { ...input, action: ACTION.PUBLISH });
}

/**
 * @param {object} db
 * @param {{productCode: string, grantedPermissions?: string[], request?: object}} input
 */
function unpublishWebsite(db, input) {
  return runLifecycleAction(db, { ...input, action: ACTION.UNPUBLISH });
}

/**
 * @param {object} db
 * @param {{productCode: string, grantedPermissions?: string[], request?: object}} input
 */
function restoreWebsiteVersion(db, input) {
  return runLifecycleAction(db, { ...input, action: ACTION.RESTORE });
}

module.exports = {
  ACTION,
  STAGE,
  registerProductLifecycle,
  resolveProductLifecycle,
  runLifecycleAction,
  publishWebsite,
  unpublishWebsite,
  restoreWebsiteVersion,
};
