"use strict";

/**
 * ActiveClinic classic CMS product adapter (PC11).
 *
 * Product routes: `activeClinicWebsiteCmsRoutes.js` +
 * `clinicWebsiteCmsService.js` / `clinicWebsiteCms.js`.
 *
 * AC adapter owns:
 * - PAGE_TEMPLATES / SECTION_TYPES / BLOCK_TYPES catalogues
 * - CMS_KEYS and SETTINGS_KEYS content semantics
 * - clinic autonomy / booking catalogue coupling
 * - library placements (`clinicWebsiteLibraryService`)
 * - `/app/settings/website/*` chrome and URLs
 *
 * Platform owns (shared CMS mechanisms — authoritative):
 * - media folder notice / redirect helpers
 * - ordered-list draft mutators (clinicWebsiteCmsService imports platform directly)
 * - batch draft key save (`contentService.saveWebsiteDraftEntries`)
 * - website_media + folders (PC08)
 * - publication / submit via AC governance adapter (PC10 / PL04)
 */

const { PRODUCT_CODE } = require("../../platform/website/publicWebsiteUrl");
const {
  folderNoticeMessage,
  folderRedirect,
} = require("../../platform/website/http/websiteCmsFolderHttp");

/**
 * Product CMS boundary: folder helpers from platform. Ordered-list mutators are
 * consumed directly from `cmsOrderedListDraft` by clinicWebsiteCmsService (PL05).
 */
function classicCmsProductCode() {
  return PRODUCT_CODE.ACTIVECLINIC;
}

module.exports = {
  classicCmsProductCode,
  folderNoticeMessage,
  folderRedirect,
};
