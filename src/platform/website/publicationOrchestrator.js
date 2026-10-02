"use strict";

/**
 * Platform publication orchestrator (PC10).
 *
 * Platform owns generic publication mechanics:
 * - draft → published transition orchestration
 * - authorization contract invocation (permission hooks)
 * - product-handler dispatch (via registered lifecycle adapters)
 * - shared version / audit primitives (publicationService)
 * - shared soft-savepoint transaction boundaries
 *
 * Product governance adapters own product-specific rules and call into
 * existing compatibility services (churchWebsitePublishService /
 * publicationService / submissionService). Workflows stay product-shaped;
 * catalogues and tenant isolation are not merged.
 *
 * Prefer this module + lifecycleOrchestrator over product-conditional forests.
 */

const lifecycle = require("../website-engine/lifecycleOrchestrator");
const publicationService = require("./publicationService");
const publicationTransaction = require("./publicationTransaction");
const { assertWebsiteAction, PERMISSIONS } = require("../website-engine/permissionHooks");

const ACTION = lifecycle.ACTION;
const STAGE = lifecycle.STAGE;

/**
 * Invoke the shared authorization contract for a publication action.
 * Does not widen grants — callers supply product-resolved permissions.
 *
 * @param {string[]} grantedPermissions
 * @param {string} action — publish | unpublish | restore | edit
 */
function invokePublicationAuthorization(grantedPermissions, action) {
  return assertWebsiteAction(grantedPermissions, action);
}

/**
 * Canonical publish entry: permission gate → product governance adapter.
 * @param {object} db
 * @param {{ productCode: string, grantedPermissions?: string[], request?: object }} input
 */
function publish(db, input) {
  return lifecycle.publishWebsite(db, input);
}

/**
 * Canonical unpublish entry.
 * @param {object} db
 * @param {{ productCode: string, grantedPermissions?: string[], request?: object }} input
 */
function unpublish(db, input) {
  return lifecycle.unpublishWebsite(db, input);
}

/**
 * Canonical restore entry.
 * @param {object} db
 * @param {{ productCode: string, grantedPermissions?: string[], request?: object }} input
 */
function restore(db, input) {
  return lifecycle.restoreWebsiteVersion(db, input);
}

/**
 * Register product governance handlers (publish / unpublish / restore [/ submit]).
 * Thin alias of lifecycleOrchestrator.registerProductLifecycle.
 */
function registerPublicationGovernance(productCode, handlers) {
  return lifecycle.registerProductLifecycle(productCode, handlers);
}

function resolvePublicationGovernance(productCode) {
  return lifecycle.resolveProductLifecycle(productCode);
}

module.exports = {
  ACTION,
  STAGE,
  PERMISSIONS,
  invokePublicationAuthorization,
  publish,
  unpublish,
  restore,
  registerPublicationGovernance,
  resolvePublicationGovernance,
  runLifecycleAction: lifecycle.runLifecycleAction,
  /** Shared engine version mint + moderation/audit. */
  createPublicationVersion: publicationService.createPublicationVersion,
  /** Shared soft savepoint for compatibility projections. */
  runSoftSavepoint: publicationTransaction.runSoftSavepoint,
  /** Compatibility: underlying services remain the implementation for adapters. */
  publicationService,
  publicationTransaction,
  lifecycleOrchestrator: lifecycle,
};
