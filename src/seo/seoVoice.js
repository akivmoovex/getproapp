"use strict";

/**
 * Brand voice packs for marketplace SEO — tone tokens only; templates live in seoCopy / providerSeoFallback.
 * Resolve via env HTML_DATA_BRAND, then tenant slug; unknown → getpro (safe default).
 */

const { HTML_DATA_BRAND } = require("../platform/branding");

const DEFAULT_VOICE_KEY = "getpro";

/**
 * @typedef {Object} SeoVoiceProfile
 * @property {string} key
 * @property {string} tone
 * @property {string} style
 * @property {string} homeTitleLead — e.g. "Find Trusted" | "Discover Top"
 * @property {string} metaFindOpen — e.g. "Find trusted" | "Discover top" (sentence-start, listing/directory meta)
 * @property {string} metaBrowseOpen — e.g. "Browse trusted" | "Discover top"
 * @property {string} metaCompareOpen — e.g. "Compare trusted" | "Explore top"
 * @property {string} listingTitleLead — e.g. "Top" | "Explore Top" (prefix before category plural or "Service Providers")
 * @property {string} providerCategoryAdj — title: prefix before singular category ("Skilled" / "")
 * @property {string} providerMetaAdj — "trusted" | "skilled" (is a … electrician)
 * @property {string} providerOffersAdj — "trusted" | "top" (offers … services)
 */

const voiceProfiles = {
  getpro: {
    key: "getpro",
    tone: "trust + clarity",
    style: "direct and professional",
    homeTitleLead: "Find Trusted",
    metaFindOpen: "Find trusted",
    metaBrowseOpen: "Browse trusted",
    metaCompareOpen: "Compare trusted",
    listingTitleLead: "Top",
    providerCategoryAdj: "",
    providerMetaAdj: "trusted",
    providerOffersAdj: "trusted",
  },
  pronline: {
    key: "pronline",
    tone: "discovery + energy",
    style: "slightly more dynamic",
    homeTitleLead: "Discover Top",
    metaFindOpen: "Discover top",
    metaBrowseOpen: "Discover top",
    metaCompareOpen: "Explore top",
    listingTitleLead: "Explore Top",
    providerCategoryAdj: "Skilled",
    providerMetaAdj: "skilled",
    providerOffersAdj: "top",
  },
};

/**
 * @param {import('express').Request} [req]
 * @returns {'getpro'|'pronline'}
 */
function resolveSeoVoiceKey(req) {
  if (HTML_DATA_BRAND === "getpro") return "getpro";
  if (HTML_DATA_BRAND === "proonline") return "pronline";
  const slug = req && req.tenant && req.tenant.slug;
  if (slug === "il") return "pronline";
  return DEFAULT_VOICE_KEY;
}

/**
 * @param {import('express').Request} [req]
 * @returns {SeoVoiceProfile}
 */
function getSeoVoiceProfile(req) {
  const key = resolveSeoVoiceKey(req);
  const profile = voiceProfiles[key] || voiceProfiles[DEFAULT_VOICE_KEY];
  return { ...profile, key: profile.key || key };
}

/**
 * Merge partial override (e.g. tests) with GetPro defaults.
 * @param {Partial<SeoVoiceProfile> | null | undefined} partial
 * @returns {SeoVoiceProfile}
 */
function mergeVoiceProfile(partial) {
  const base = { ...voiceProfiles[DEFAULT_VOICE_KEY] };
  if (!partial || typeof partial !== "object") return /** @type {SeoVoiceProfile} */ ({ ...base, key: "getpro" });
  return /** @type {SeoVoiceProfile} */ ({ ...base, ...partial, key: partial.key || base.key });
}

/** @param {SeoVoiceProfile} v @param {string} singularCategory */
function providerCategoryTitleSegment(v, singularCategory) {
  const cat = String(singularCategory || "").trim();
  const adj = String(v.providerCategoryAdj || "").trim();
  if (!adj) return cat;
  return `${adj} ${cat}`.replace(/\s+/g, " ").trim();
}

/** First word of home title lead ("Find" / "Discover"). */
function getSeoVerb(req) {
  const v = getSeoVoiceProfile(req);
  return String(v.homeTitleLead || "").trim().split(/\s+/)[0] || "Find";
}

/** Primary listing adjective from meta open phrase ("trusted" / "top"). */
function getSeoAdjective(req) {
  const v = getSeoVoiceProfile(req);
  const parts = String(v.metaFindOpen || "").trim().split(/\s+/);
  return parts.length > 1 ? parts.slice(1).join(" ") : "trusted";
}

/** Voice key for A/B tone or analytics. */
function getSeoToneVariant(req) {
  return resolveSeoVoiceKey(req);
}

module.exports = {
  voiceProfiles,
  DEFAULT_VOICE_KEY,
  resolveSeoVoiceKey,
  getSeoVoiceProfile,
  mergeVoiceProfile,
  providerCategoryTitleSegment,
  getSeoVerb,
  getSeoAdjective,
  getSeoToneVariant,
};
