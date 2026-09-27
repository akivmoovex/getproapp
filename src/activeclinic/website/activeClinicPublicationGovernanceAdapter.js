"use strict";

/**
 * ActiveClinic publication governance adapter (PC10).
 *
 * AC owns:
 * - clinic submit / unpublish / publish workflow
 * - review-before-publish and clinic autonomy policy gates
 * - makePublic / availability flips at the route layer (not here)
 *
 * Platform owns generic draft→published transition, version mint,
 * restore-live, audit/moderation, and authorizeWebsiteAction inside
 * publicationService / submissionService.
 *
 * Compatibility: publicationService / submissionService remain the
 * **implementation** surface. HTTP publish/unpublish/restore must enter via
 * platform `publicationOrchestrator`. Submit (AC-only) may call
 * submissionService (or adapter.submit) — not merged with BB governance.
 */

const { PRODUCT } = require("../../platform/registration/constants");
const publicationService = require("../../platform/website/publicationService");
const submissionService = require("../../platform/website/submissionService");

const PRODUCT_CODE = PRODUCT.ACTIVECLINIC;

/**
 * @param {object} db
 * @param {object} request — organizationId, instanceId, actorIdentityId, …
 */
function publish(db, request) {
  return publicationService.publishWebsiteDraft(db, request);
}

/**
 * @param {object} db
 * @param {object} request
 */
function unpublish(db, request) {
  return publicationService.unpublishWebsite(db, request);
}

/**
 * Restore a prior version live (AC governance).
 * @param {object} db
 * @param {object} request
 */
function restore(db, request) {
  return publicationService.restoreWebsiteVersionLive(db, request);
}

/**
 * Submit draft changes for review (AC-only workflow surface).
 * @param {object} db
 * @param {object} request
 */
function submit(db, request) {
  return submissionService.submitWebsiteChanges(db, request);
}

function lifecycleHandlers() {
  return {
    publish,
    unpublish,
    restore,
  };
}

module.exports = {
  PRODUCT_CODE,
  publish,
  unpublish,
  restore,
  submit,
  lifecycleHandlers,
  /** Compatibility re-exports. */
  publishWebsiteDraft: publicationService.publishWebsiteDraft,
  unpublishWebsite: publicationService.unpublishWebsite,
  restoreWebsiteVersionLive: publicationService.restoreWebsiteVersionLive,
  submitWebsiteChanges: submissionService.submitWebsiteChanges,
};
