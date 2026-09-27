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
 * Platform owns (shared CMS mechanisms):
 * - media folder notice / redirect helpers
 * - ordered-list draft mutators
 * - batch draft key save (`contentService.saveWebsiteDraftEntries`)
 * - website_media + folders (PC08)
 * - publication / submit via AC governance adapter (PC10)
 */

const { PRODUCT_CODE } = require("../../platform/website/publicWebsiteUrl");
const {
  folderNoticeMessage,
  folderRedirect,
} = require("../../platform/website/http/websiteCmsFolderHttp");
const cmsOrderedListDraft = require("../../platform/website/cmsOrderedListDraft");

function classicCmsProductCode() {
  return PRODUCT_CODE.ACTIVECLINIC;
}

module.exports = {
  classicCmsProductCode,
  folderNoticeMessage,
  folderRedirect,
  reorderByIds: cmsOrderedListDraft.reorderByIds,
  removeById: cmsOrderedListDraft.removeById,
  upsertById: cmsOrderedListDraft.upsertById,
};
