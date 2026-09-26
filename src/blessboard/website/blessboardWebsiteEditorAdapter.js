"use strict";

/**
 * BlessBoard website-editor product adapter responsibilities (PC07).
 *
 * Product route file (`blessboardWebsiteEditorRoutes.js`) remains the Express
 * mount for BB URLs. Platform handlers live under
 * `src/platform/website/http/*`.
 *
 * This module documents the BB-owned boundary; resolve helpers stay colocated
 * with routes until a later extraction of requireEditor/tenant chrome.
 *
 * BB adapter owns:
 * - pathPrefix + HQ/branch public scope (church-wide vs branch key)
 * - BlessBoard RBAC (`website.edit` / `website.publish`) via catalogue authorize
 * - Engine instance resolve (branchId null for HQ)
 * - Dual-write overlay for classic inline drafts (compatibility)
 * - Church publish via `publishChurchWebsite` (no AC unpublish/submit)
 * - Media-library / websites scope listing for BB tenants
 *
 * Platform handlers own (shared):
 * - CSRF/tenant-override guards helpers
 * - Generic draft save error mapping + pending change counts
 * - Field-history restore / styles-seo-theme-add-section operations
 */

const { PRODUCT_CODE } = require("../../platform/website/publicWebsiteUrl");

function blessBoardEditorProductCode() {
  return PRODUCT_CODE.BLESSBOARD;
}

module.exports = {
  blessBoardEditorProductCode,
};
