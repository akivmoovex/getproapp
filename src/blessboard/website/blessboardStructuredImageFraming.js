"use strict";

/**
 * BlessBoard structured image framing capability (V2.02).
 * Category-A surfaces mount platform Universal Image Editor.
 * Category-B (QR / replace-only) must not expose Adjust Picture.
 */

const FRAMING_KIND = Object.freeze({
  image: true,
  leader: true,
  ministry: true,
  event: true,
  sermon: true,
  video: false,
  giving_method: false,
  service_times: false,
  social_link: false,
  page_section: false,
});

/**
 * @param {string} draftKind
 * @param {{ fieldName?: string|null }} [opts]
 */
function structuredImageFramingEnabled(draftKind, opts) {
  const kind = String(draftKind || "");
  if (FRAMING_KIND[kind] !== true) return false;
  const fieldName = opts && opts.fieldName != null ? String(opts.fieldName) : "";
  // Giving QR uses buildImageForm with fieldName qrImageUrl — replace-only.
  if (fieldName === "qrImageUrl" || fieldName === "qr_image_url") return false;
  return true;
}

module.exports = {
  FRAMING_KIND,
  structuredImageFramingEnabled,
};
