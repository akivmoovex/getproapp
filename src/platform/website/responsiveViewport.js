"use strict";

/**
 * Shared ResponsiveViewport contract (V2.05 Batch 3).
 * Live preview widths for Desktop / Tablet / Mobile.
 * Frame switching stays in the single WE01 iframe engine
 * (public/platform/website-inline-edit.js + editorViewportFrame.js).
 */

const {
  VIEWPORT_MODE,
  VIEWPORT_WIDTHS,
  VIEWPORT_FRAME_WIDTHS,
  usesIframeViewport,
  viewportWidthForMode,
  buildEditorViewportFramePath,
} = require("../website-engine/editorViewportFrame");

const RESPONSIVE_VIEWPORT = Object.freeze({
  pattern: "ResponsiveViewport",
  architecture: "iframe",
  enginePath: "/platform/website-inline-edit.js",
  widths: VIEWPORT_WIDTHS,
  /** Modes that load the same-origin iframe engine. Desktop stays same-document. */
  iframeModes: Object.freeze(["tablet", "mobile"]),
});

function listResponsiveViewportModes() {
  return Object.freeze([
    {
      mode: VIEWPORT_MODE.DESKTOP,
      label: "Desktop",
      width: VIEWPORT_WIDTHS.desktop,
      usesIframe: false,
    },
    {
      mode: VIEWPORT_MODE.TABLET,
      label: "Tablet",
      width: VIEWPORT_WIDTHS.tablet,
      usesIframe: true,
    },
    {
      mode: VIEWPORT_MODE.MOBILE,
      label: "Mobile",
      width: VIEWPORT_WIDTHS.mobile,
      usesIframe: true,
    },
  ]);
}

module.exports = {
  RESPONSIVE_VIEWPORT,
  VIEWPORT_WIDTHS,
  VIEWPORT_MODE,
  VIEWPORT_FRAME_WIDTHS,
  listResponsiveViewportModes,
  usesIframeViewport,
  viewportWidthForMode,
  buildEditorViewportFramePath,
};
