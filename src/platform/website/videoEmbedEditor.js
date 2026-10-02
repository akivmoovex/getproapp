"use strict";

/**
 * Shared VideoEmbedEditor (V2.05 Batch 4).
 * Validates YouTube/Vimeo https URLs, builds privacy-friendly embeds.
 * Stores URL references only — never downloads video or accepts raw iframe HTML.
 */

const YOUTUBE_HOSTS = Object.freeze(
  new Set([
    "youtube.com",
    "www.youtube.com",
    "m.youtube.com",
    "music.youtube.com",
    "youtube-nocookie.com",
    "www.youtube-nocookie.com",
    "youtu.be",
    "www.youtu.be",
  ])
);

const VIMEO_HOSTS = Object.freeze(
  new Set(["vimeo.com", "www.vimeo.com", "player.vimeo.com"])
);

const VIDEO_EMBED_EDITOR = Object.freeze({
  pattern: "VideoEmbedEditor",
  storesDownloadedVideo: false,
  allowsRawIframeHtml: false,
  autoplayDefault: false,
  supportedProviders: Object.freeze(["youtube", "vimeo"]),
});

function stripTags(raw) {
  return String(raw == null ? "" : raw)
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function looksLikeRawHtmlEmbed(raw) {
  const text = String(raw == null ? "" : raw);
  return /<\s*iframe\b/i.test(text) || /<\s*script\b/i.test(text) || /javascript:/i.test(text);
}

function extractYouTubeId(parsed) {
  const host = String(parsed.hostname || "").toLowerCase();
  const path = String(parsed.pathname || "");
  if (host === "youtu.be" || host === "www.youtu.be") {
    const id = path.replace(/^\//, "").split("/")[0];
    return /^[\w-]{6,}$/.test(id) ? id : null;
  }
  if (path.includes("/embed/") || path.includes("/shorts/") || path.includes("/live/")) {
    const parts = path.split("/").filter(Boolean);
    const id = parts[parts.length - 1];
    return /^[\w-]{6,}$/.test(id) ? id : null;
  }
  const v = parsed.searchParams.get("v");
  if (v && /^[\w-]{6,}$/.test(v)) return v;
  return null;
}

function extractVimeoId(parsed) {
  const host = String(parsed.hostname || "").toLowerCase();
  const path = String(parsed.pathname || "");
  if (host === "player.vimeo.com") {
    const m = path.match(/\/video\/(\d+)/);
    return m ? m[1] : null;
  }
  const m = path.match(/\/(\d{6,})(?:\/|$)/);
  return m ? m[1] : null;
}

/**
 * Validate a video URL for draft storage.
 * Empty string is allowed (clear). Raw iframe HTML is rejected.
 * @param {unknown} raw
 * @returns {{ ok: true, value: string, provider: string|null } | { ok: false, error: string, code?: string }}
 */
function validateVideoEmbedUrl(raw) {
  if (raw == null || raw === "") {
    return { ok: true, value: "", provider: null };
  }
  if (looksLikeRawHtmlEmbed(raw)) {
    return {
      ok: false,
      error: "Paste a YouTube or Vimeo link — raw iframe HTML is not allowed.",
      code: "raw_iframe_forbidden",
    };
  }
  const plain = stripTags(raw);
  if (!plain) return { ok: true, value: "", provider: null };
  if (plain.length > 2000) {
    return { ok: false, error: "Keep this under 2000 characters.", code: "too_long" };
  }
  if (/[<>"]/.test(plain)) {
    return { ok: false, error: "Video link contains invalid characters.", code: "invalid_chars" };
  }
  let parsed;
  try {
    parsed = new URL(plain);
  } catch {
    return { ok: false, error: "Enter a valid YouTube or Vimeo link.", code: "invalid_url" };
  }
  if (parsed.protocol !== "https:") {
    return { ok: false, error: "Video links must use https.", code: "https_required" };
  }
  const host = String(parsed.hostname || "").toLowerCase();
  if (YOUTUBE_HOSTS.has(host)) {
    const id = extractYouTubeId(parsed);
    return { ok: true, value: parsed.toString(), provider: "youtube", videoId: id || null };
  }
  if (VIMEO_HOSTS.has(host)) {
    const id = extractVimeoId(parsed);
    return { ok: true, value: parsed.toString(), provider: "vimeo", videoId: id || null };
  }
  return {
    ok: false,
    error: "Only YouTube and Vimeo links are supported.",
    code: "unsupported_host",
  };
}

/**
 * Build a privacy-friendly embed URL (no autoplay by default).
 * @param {string} rawUrl
 * @param {{ autoplay?: boolean, title?: string }} [opts]
 */
function buildVideoEmbedPresentation(rawUrl, opts) {
  const options = opts && typeof opts === "object" ? opts : {};
  const checked = validateVideoEmbedUrl(rawUrl);
  if (!checked.ok || !checked.value) {
    return {
      ok: checked.ok !== false,
      embedUrl: null,
      provider: null,
      sourceUrl: "",
      autoplay: false,
      title: options.title || "Video",
      error: checked.ok === false ? checked.error : null,
      code: checked.code || null,
    };
  }
  const autoplay = options.autoplay === true;
  let embedUrl = null;
  if (checked.provider === "youtube" && checked.videoId) {
    const params = new URLSearchParams();
    params.set("rel", "0");
    params.set("modestbranding", "1");
    if (autoplay) params.set("autoplay", "1");
    embedUrl = `https://www.youtube-nocookie.com/embed/${checked.videoId}?${params.toString()}`;
  } else if (checked.provider === "vimeo" && checked.videoId) {
    const params = new URLSearchParams();
    params.set("title", "0");
    params.set("byline", "0");
    if (autoplay) params.set("autoplay", "1");
    embedUrl = `https://player.vimeo.com/video/${checked.videoId}?${params.toString()}`;
  }
  if (!embedUrl) {
    return {
      ok: true,
      embedUrl: null,
      provider: checked.provider,
      sourceUrl: checked.value,
      videoId: checked.videoId || null,
      autoplay: false,
      title: options.title || "Video",
      error: "Video link is recognized but cannot be embedded yet.",
      code: "embed_unavailable",
    };
  }
  return {
    ok: true,
    embedUrl,
    provider: checked.provider,
    sourceUrl: checked.value,
    videoId: checked.videoId || null,
    autoplay,
    title: options.title || "Video",
    allow:
      autoplay
        ? "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        : "accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share",
    referrerPolicy: "strict-origin-when-cross-origin",
  };
}

/** Template helper — returns embed presentation or null. */
function presentVideoEmbed(rawUrl, opts) {
  const presented = buildVideoEmbedPresentation(rawUrl, opts);
  if (!presented.ok || !presented.embedUrl) return null;
  return presented;
}

module.exports = {
  VIDEO_EMBED_EDITOR,
  YOUTUBE_HOSTS,
  VIMEO_HOSTS,
  looksLikeRawHtmlEmbed,
  validateVideoEmbedUrl,
  buildVideoEmbedPresentation,
  presentVideoEmbed,
};
