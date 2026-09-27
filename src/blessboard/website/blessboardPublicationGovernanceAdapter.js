"use strict";

/**
 * BlessBoard publication governance adapter (PC10).
 *
 * BB owns:
 * - HQ / branch / multi-site governance
 * - church readiness + validation gates
 * - church CMS publish/unpublish/restore draft paths
 * - classic→engine bridge projection (compatibility)
 *
 * Platform owns generic orchestration (permission gate, dispatch, soft
 * savepoints, shared engine version primitives). This adapter does not
 * absorb ActiveClinic submit/unpublish clinic workflows.
 *
 * Compatibility: `churchWebsitePublishService` and
 * `websitePublicationVersionService` remain the **implementation** surface.
 * HTTP and product workflow entry points must call platform
 * `publicationOrchestrator` (registered handlers) — not the services directly.
 */

const { PRODUCT } = require("../../platform/registration/constants");
const {
  publishChurchWebsite,
  unpublishChurchWebsite,
} = require("../services/churchWebsitePublishService");
const {
  createRestoredDraft,
} = require("../services/websitePublicationVersionService");

const PRODUCT_CODE = PRODUCT.BLESSBOARD;

/**
 * @param {object} db
 * @param {object} request — churchId, branchId?, confirmPublish, actorUserId, …
 */
function publish(db, request) {
  return publishChurchWebsite(db, request);
}

/**
 * @param {object} db
 * @param {object} request
 */
function unpublish(db, request) {
  return unpublishChurchWebsite(db, request);
}

/**
 * Restore → draft (BB governance). Live republish remains a separate
 * publishChurchWebsite call after review.
 * @param {object} db
 * @param {object} request
 */
function restore(db, request) {
  return createRestoredDraft(db, request);
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
  lifecycleHandlers,
  /** Compatibility re-exports for callers that prefer the adapter surface. */
  publishChurchWebsite,
  unpublishChurchWebsite,
  createRestoredDraft,
};
