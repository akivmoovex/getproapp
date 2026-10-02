"use strict";

/**
 * Shared LivePreview pattern (V2.05 Batch 3).
 * Does not create a second preview engine — reuses WE01 iframe viewport.
 */

const {
  RESPONSIVE_VIEWPORT,
  VIEWPORT_WIDTHS,
  listResponsiveViewportModes,
} = require("./responsiveViewport");

const LIVE_PREVIEW = Object.freeze({
  pattern: "LivePreview",
  engine: "website-inline-edit.js",
  architecture: RESPONSIVE_VIEWPORT.architecture,
  widths: VIEWPORT_WIDTHS,
  flow: Object.freeze([
    "Select",
    "Preview",
    "ApplyDraft",
    "ChangeManager",
    "Publish",
  ]),
});

function buildLivePreviewView(input) {
  const opts = input && typeof input === "object" ? input : {};
  return {
    pattern: LIVE_PREVIEW.pattern,
    stitchScreen: opts.stitchScreen || null,
    previewHref: opts.previewHref || null,
    draftThemeId: opts.draftThemeId || null,
    publishedThemeId: opts.publishedThemeId || null,
    viewports: listResponsiveViewportModes(),
    architecture: LIVE_PREVIEW.architecture,
    engine: LIVE_PREVIEW.engine,
    note: "Theme changes affect presentation only. Content, media, and sections are unchanged.",
  };
}

module.exports = {
  LIVE_PREVIEW,
  buildLivePreviewView,
};
