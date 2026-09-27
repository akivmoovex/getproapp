"use strict";

/**
 * BlessBoard classic CMS product adapter (PC11).
 *
 * Product route: `contentAdminRoutes.js` — HQ/branch content admin URLs,
 * operational media (`blessboard.media_assets`), structured drafts, entity
 * catalogues, inheritance, draft-review publish.
 *
 * BB adapter owns:
 * - section / entity catalogues and PAGE_KEY semantics
 * - structured draft kinds + church/branch scope
 * - HQ/branch inheritance and conflict UX
 * - operational media library vs website-engine media
 * - classic draft-changes publish path
 *
 * Platform owns (shared CMS mechanisms — authoritative):
 * - media folder notice / redirect helpers (`websiteCmsFolderHttp`)
 * - website-engine draft persistence (`contentService`)
 * - ordered-list draft mutators (`cmsOrderedListDraft`)
 * - publication / version / restore (PC10 / PL04)
 * - website editor HTTP kit (PC07)
 *
 * PL05: platform folder/ordered-list/batch helpers are authoritative.
 * Editor overlay dual-write + syncDraftToEngine remain until PL06 (public still
 * needs classic projection for live parity).
 */

const { PRODUCT_CODE } = require("../../platform/website/publicWebsiteUrl");
const {
  folderNoticeMessage,
  folderRedirect,
} = require("../../platform/website/http/websiteCmsFolderHttp");

function classicCmsProductCode() {
  return PRODUCT_CODE.BLESSBOARD;
}

module.exports = {
  classicCmsProductCode,
  folderNoticeMessage,
  folderRedirect,
};
