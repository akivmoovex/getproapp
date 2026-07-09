"use strict";

/** User-facing BlessBoard product name (church vertical). */
const BLESSBOARD_NAME = "BlessBoard";

/** Short product description for SEO / meta tags. */
const BLESSBOARD_TAGLINE =
  "BlessBoard is a church engagement and member platform for branches, members, and ministry teams.";

/** Provider attribution shown under the BlessBoard lockup. */
const BLESSBOARD_POWERED_BY = "Powered by GetPro";

/** Public marketing site for the church vertical. */
const BLESSBOARD_PUBLIC_URL = "https://blessboard.com";

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
  BLESSBOARD_PUBLIC_URL,
  blessboardDocumentTitle,
};
