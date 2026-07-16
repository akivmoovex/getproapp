"use strict";

/** User-facing BlessBoard product name (church vertical). */
const BLESSBOARD_NAME = "BlessBoard";

/** Short product description for SEO / meta tags. */
const BLESSBOARD_TAGLINE =
  "BlessBoard is a church engagement and member platform for branches, members, and ministry teams.";

/** Provider attribution shown under the BlessBoard lockup. */
const BLESSBOARD_POWERED_BY = "Powered by GetPro";

const { getBlessBoardPublicUrl } = require("./blessBoardEnv");

/**
 * Temporary default Open Graph image until brand asset is added.
 * Replace BLESSBOARD_SOCIAL_PREVIEW_IMAGE_PATH when the file below exists on disk.
 */
const BLESSBOARD_SOCIAL_PREVIEW_IMAGE_PATH = "/church/images/homepage/desktop-hero-auditorium.jpg";

/** Target 1200×630 brand asset — add to repo to replace the temporary image above. */
const BLESSBOARD_SOCIAL_PREVIEW_TARGET_PATH =
  "/images/brand/blessboard-social-preview-1200x630.jpg";

function blessboardDefaultOgImageUrl() {
  return `${getBlessBoardPublicUrl()}${BLESSBOARD_SOCIAL_PREVIEW_IMAGE_PATH}`;
}

/**
 * @param {string} [pageTitle]
 * @returns {string}
 */
function blessboardDocumentTitle(pageTitle) {
  if (!pageTitle || !String(pageTitle).trim()) return BLESSBOARD_NAME;
  return `${String(pageTitle).trim()} | ${BLESSBOARD_NAME}`;
}

module.exports = {
  BLESSBOARD_NAME,
  BLESSBOARD_TAGLINE,
  BLESSBOARD_POWERED_BY,
  get BLESSBOARD_PUBLIC_URL() {
    return getBlessBoardPublicUrl();
  },
  getBlessBoardPublicUrl,
  BLESSBOARD_SOCIAL_PREVIEW_IMAGE_PATH,
  BLESSBOARD_SOCIAL_PREVIEW_TARGET_PATH,
  blessboardDocumentTitle,
  blessboardDefaultOgImageUrl,
};
