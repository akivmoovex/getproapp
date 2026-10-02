"use strict";

/**
 * Shared WE01 responsive viewport frame helpers (BlessBoard + ActiveClinic).
 * Tablet/Mobile editor preview loads the same edit URL in a same-origin iframe
 * so public @media rules evaluate against a real 768/390 CSS viewport.
 */

const {
  appendQuery,
  splitPathAndSearch,
  withEditorNavigationQuery,
} = require("../website/publicWebsiteUrl");

const WEBSITE_FRAME_QUERY_KEY = "website_frame";
const WEBSITE_FRAME_QUERY = Object.freeze({ [WEBSITE_FRAME_QUERY_KEY]: "1" });

const VIEWPORT_MODE = Object.freeze({
  DESKTOP: "desktop",
  TABLET: "tablet",
  MOBILE: "mobile",
});

/** Canonical preview widths (Desktop stays same-document; tablet/mobile use iframe). */
const VIEWPORT_WIDTHS = Object.freeze({
  [VIEWPORT_MODE.DESKTOP]: 1440,
  [VIEWPORT_MODE.TABLET]: 768,
  [VIEWPORT_MODE.MOBILE]: 390,
});

/** Widths applied when the iframe engine is active. */
const VIEWPORT_FRAME_WIDTHS = Object.freeze({
  [VIEWPORT_MODE.TABLET]: VIEWPORT_WIDTHS[VIEWPORT_MODE.TABLET],
  [VIEWPORT_MODE.MOBILE]: VIEWPORT_WIDTHS[VIEWPORT_MODE.MOBILE],
});

const VIEWPORT_MESSAGE_SOURCE = "gp-website-editor";
const VIEWPORT_MESSAGE_TYPES = Object.freeze({
  EDITOR_READY: "EDITOR_READY",
  DIRTY_STATE_CHANGED: "DIRTY_STATE_CHANGED",
  SAVE_REQUEST: "SAVE_REQUEST",
  SAVE_RESULT: "SAVE_RESULT",
  VIEWPORT_CHANGED: "VIEWPORT_CHANGED",
  OPEN_EDITOR: "OPEN_EDITOR",
  CONTENT_CHANGED: "CONTENT_CHANGED",
  NAVIGATE: "NAVIGATE",
});

function isWebsiteFrameQueryValue(raw) {
  return String(raw || "") === "1";
}

function isWebsiteFrameRequest(query) {
  if (!query || typeof query !== "object") return false;
  return isWebsiteFrameQueryValue(query.website_frame || query.websiteFrame);
}

function withWebsiteFrameQuery(path) {
  return appendQuery(path, WEBSITE_FRAME_QUERY);
}

function withoutWebsiteFrameQuery(path) {
  if (path == null || path === "") return path == null ? null : "";
  const { pathname, search } = splitPathAndSearch(path);
  if (!search) return pathname;
  const params = new URLSearchParams(search.slice(1));
  params.delete(WEBSITE_FRAME_QUERY_KEY);
  params.delete("websiteFrame");
  const serialized = params.toString();
  return serialized ? `${pathname}?${serialized}` : pathname;
}

/**
 * Build a same-document path for iframe preview.
 * Preserves path + existing query, forces editor draft params, sets website_frame=1.
 * Strips recursive nesting (idempotent if already framed).
 *
 * @param {string} pathOrUrl pathname+search or absolute same-origin URL
 * @param {{ mode?: string }} [opts]
 * @returns {{ ok: true, path: string, width: number|null, mode: string } | { ok: false, code: string }}
 */
function buildEditorViewportFramePath(pathOrUrl, opts) {
  const raw = String(pathOrUrl || "").trim();
  if (!raw) return { ok: false, code: "missing_path" };
  let pathname = raw;
  let search = "";
  try {
    if (/^https?:\/\//i.test(raw)) {
      const u = new URL(raw);
      pathname = u.pathname;
      search = u.search || "";
    } else {
      const split = splitPathAndSearch(raw);
      pathname = split.pathname;
      search = split.search || "";
    }
  } catch {
    return { ok: false, code: "invalid_path" };
  }
  if (!pathname.startsWith("/")) return { ok: false, code: "invalid_path" };

  const mode = String((opts && opts.mode) || VIEWPORT_MODE.MOBILE).toLowerCase();
  if (mode !== VIEWPORT_MODE.TABLET && mode !== VIEWPORT_MODE.MOBILE && mode !== VIEWPORT_MODE.DESKTOP) {
    return { ok: false, code: "invalid_mode" };
  }
  if (mode === VIEWPORT_MODE.DESKTOP) {
    return {
      ok: true,
      path: withoutWebsiteFrameQuery(
        withEditorNavigationQuery(search ? `${pathname}${search}` : pathname)
      ),
      width: VIEWPORT_WIDTHS[VIEWPORT_MODE.DESKTOP],
      mode: VIEWPORT_MODE.DESKTOP,
    };
  }

  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  params.set("website_edit", "1");
  params.set("website_mode", "draft");
  params.set(WEBSITE_FRAME_QUERY_KEY, "1");
  // Prevent nested shell: frame docs never carry a second frame flag stack.
  const serialized = params.toString();
  const path = `${pathname}?${serialized}`;
  return {
    ok: true,
    path,
    width: VIEWPORT_FRAME_WIDTHS[mode],
    mode,
  };
}

/**
 * @param {string} parentOrigin e.g. https://blessboard.neuniversity.org
 * @param {string} frameUrl absolute or path
 */
function isSameOriginFrameUrl(parentOrigin, frameUrl) {
  const origin = String(parentOrigin || "").replace(/\/$/, "");
  const frame = String(frameUrl || "").trim();
  if (!origin || !frame) return false;
  if (frame.startsWith("/")) return true;
  try {
    const u = new URL(frame);
    return u.origin === origin;
  } catch {
    return false;
  }
}

function viewportWidthForMode(mode) {
  const key = String(mode || "").toLowerCase();
  return VIEWPORT_WIDTHS[key] || VIEWPORT_FRAME_WIDTHS[key] || null;
}

function usesIframeViewport(mode) {
  const key = String(mode || "").toLowerCase();
  return key === VIEWPORT_MODE.TABLET || key === VIEWPORT_MODE.MOBILE;
}

module.exports = {
  WEBSITE_FRAME_QUERY_KEY,
  WEBSITE_FRAME_QUERY,
  VIEWPORT_MODE,
  VIEWPORT_WIDTHS,
  VIEWPORT_FRAME_WIDTHS,
  VIEWPORT_MESSAGE_SOURCE,
  VIEWPORT_MESSAGE_TYPES,
  isWebsiteFrameQueryValue,
  isWebsiteFrameRequest,
  withWebsiteFrameQuery,
  withoutWebsiteFrameQuery,
  buildEditorViewportFramePath,
  isSameOriginFrameUrl,
  viewportWidthForMode,
  usesIframeViewport,
};
