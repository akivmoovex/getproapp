"use strict";

/**
 * Map field-agent submission photos into companies.logo_url + companies.gallery_json at publish time.
 * URLs are reused as-is (same paths as public/uploads/field-agent or absolute http(s)); no storage copy.
 */

const MAX_LOGO_LEN = 500;
const MAX_URL_LEN = 2000;
const MAX_GALLERY_ITEMS = 24;

function isAllowedPublicPhotoUrl(u) {
  const s = String(u || "").trim();
  if (!s) return false;
  if (s.length > MAX_URL_LEN) return false;
  if (s.startsWith("/uploads/field-agent/")) return true;
  if (/^https?:\/\//i.test(s)) return true;
  return false;
}

/**
 * Parse work_photos_json: JSON array of path strings (upload pipeline) or legacy {url} objects.
 * @param {unknown} raw
 * @returns {string[]}
 */
function parseWorkPhotoUrls(raw) {
  try {
    const j = JSON.parse(String(raw || "[]"));
    if (!Array.isArray(j)) return [];
    const out = [];
    for (const x of j) {
      let url = "";
      if (typeof x === "string") url = x.trim();
      else if (x && typeof x.url === "string") url = String(x.url).trim();
      if (url && isAllowedPublicPhotoUrl(url)) out.push(url.slice(0, MAX_URL_LEN));
      if (out.length >= MAX_GALLERY_ITEMS) break;
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * @param {object} submissionRow — field_agent_provider_submissions row (photo_profile_url, work_photos_json)
 * @returns {{ logoUrl: string, galleryJson: string }}
 */
function buildCompanyPhotosFromFieldAgentSubmission(submissionRow) {
  try {
    if (!submissionRow || typeof submissionRow !== "object") {
      return { logoUrl: "", galleryJson: "[]" };
    }
    const logoRaw = String(submissionRow.photo_profile_url || "").trim().slice(0, MAX_LOGO_LEN);
    const logoUrl = isAllowedPublicPhotoUrl(logoRaw) ? logoRaw : "";

    const workUrls = parseWorkPhotoUrls(submissionRow.work_photos_json);
    const galleryItems = workUrls.map((url) => ({ url, caption: "" }));
    const galleryJson = JSON.stringify(galleryItems);
    return { logoUrl, galleryJson };
  } catch {
    return { logoUrl: "", galleryJson: "[]" };
  }
}

module.exports = {
  buildCompanyPhotosFromFieldAgentSubmission,
  isAllowedPublicPhotoUrl,
};
