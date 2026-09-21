"use strict";

/**
 * Shared rules for BlessBoard section image ↔ YouTube conversion (Bug 22).
 * Draft overlay and publish apply must use the same mediaUrl / layoutMetadata rules.
 *
 * mediaKind:
 *   - "image"   — photograph only (videoUrl cleared; previousVideo* retained for restore)
 *   - "youtube" — YouTube/Vimeo URL in layoutMetadata; mediaUrl is poster/thumbnail only
 *
 * Never write a video stream URL into mediaUrl (public heroes render <img src=mediaUrl>).
 * Poster only for YouTube drafts — never payload.videoUrl as an image src.
 */

/**
 * @param {{
 *   draftKind: "image"|"video",
 *   payload?: Record<string, unknown>,
 *   existingMediaUrl?: string|null,
 *   existingLayout?: Record<string, unknown>|null,
 * }} input
 */
function resolveSectionMediaFromDraft(input) {
  const draftKind = String((input && input.draftKind) || "");
  const payload = (input && input.payload) || {};
  const existingLayout =
    input && input.existingLayout && typeof input.existingLayout === "object"
      ? input.existingLayout
      : {};
  const existingMediaUrl =
    input && input.existingMediaUrl != null ? String(input.existingMediaUrl) : null;

  if (draftKind === "image") {
    const imageUrl =
      payload.imageUrl != null && String(payload.imageUrl).trim()
        ? String(payload.imageUrl).trim()
        : null;
    return {
      mediaUrl: imageUrl,
      layoutPatch: {
        mediaKind: "image",
        altText: payload.altText != null ? payload.altText : null,
        focal: payload.focal != null ? payload.focal : null,
        fit: payload.fit != null ? payload.fit : null,
        videoUrl: null,
        videoTitle: null,
        previousVideoUrl:
          existingLayout.videoUrl != null
            ? existingLayout.videoUrl
            : existingLayout.previousVideoUrl != null
              ? existingLayout.previousVideoUrl
              : null,
        previousVideoTitle:
          existingLayout.videoTitle != null
            ? existingLayout.videoTitle
            : existingLayout.previousVideoTitle != null
              ? existingLayout.previousVideoTitle
              : null,
      },
    };
  }

  if (draftKind === "video") {
    const thumb =
      payload.thumbnailUrl != null && String(payload.thumbnailUrl).trim()
        ? String(payload.thumbnailUrl).trim()
        : null;
    const previousImageUrl =
      existingMediaUrl && (!thumb || existingMediaUrl !== thumb)
        ? existingMediaUrl
        : existingLayout.previousImageUrl != null
          ? existingLayout.previousImageUrl
          : null;
    return {
      // Poster only — never payload.videoUrl (YouTube link is not an image src).
      mediaUrl: thumb,
      layoutPatch: {
        mediaKind: "youtube",
        videoUrl: payload.videoUrl != null ? payload.videoUrl : null,
        videoTitle: payload.title != null ? payload.title : null,
        previousImageUrl,
      },
    };
  }

  return {
    mediaUrl: null,
    layoutPatch: {},
  };
}

module.exports = {
  resolveSectionMediaFromDraft,
};
