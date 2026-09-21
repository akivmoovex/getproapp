"use strict";

/**
 * BlessBoard website image-editor coverage catalogue.
 * Every tenant or system image surface is classified so tests fail on unexplained gaps.
 *
 * Classifications:
 *   EDITABLE      — authorized site admin can replace via shared media dialog / picker
 *   SYSTEM_ONLY   — platform/SaaS marketing or soft-fill; not tenant-editable
 *   NOT_APPLICABLE — template has no image slot for this surface
 */

const C = Object.freeze({
  EDITABLE: "EDITABLE",
  SYSTEM_ONLY: "SYSTEM_ONLY",
  NOT_APPLICABLE: "NOT_APPLICABLE",
});

const COVERAGE = Object.freeze([
  // Branding / chrome
  {
    id: "bb.home.logo",
    surface: "Church logo / branding",
    classification: C.EDITABLE,
    editor: "shared_inline_image+hq_branding",
    keys: ["home.logo"],
  },
  {
    id: "bb.home.hero.image",
    surface: "Homepage hero / banner",
    classification: C.EDITABLE,
    editor: "shared_inline_image+hq_branding",
    keys: ["home.hero.image"],
  },
  {
    id: "bb.identity.hero_image_url",
    surface: "Branch identity hero image",
    classification: C.EDITABLE,
    editor: "branch_settings_media_picker",
    keys: ["identity.hero_image_url"],
  },
  {
    id: "bb.seo.og_image_url",
    surface: "Open Graph / social sharing image",
    classification: C.EDITABLE,
    editor: "branch_settings_media_picker",
    keys: ["seo.og_image_url"],
  },

  // Page / section media
  {
    id: "bb.page_hero.image",
    surface: "Page hero / banner (about, ministries, events, …)",
    classification: C.EDITABLE,
    editor: "structured_image",
    keys: ["section.mediaUrl"],
  },
  {
    id: "bb.home.welcome.image",
    surface: "Home welcome media",
    classification: C.EDITABLE,
    editor: "structured_image",
    keys: ["welcome.mediaUrl"],
  },
  {
    id: "bb.about.story.image",
    surface: "About story images",
    classification: C.EDITABLE,
    editor: "structured_image",
    keys: ["about.story.mediaUrl"],
  },
  {
    id: "bb.about.community.image",
    surface: "About community image",
    classification: C.EDITABLE,
    editor: "structured_image",
    keys: ["about.community.mediaUrl"],
  },
  {
    id: "bb.about.life_together.image",
    surface: "About Life Together featured image",
    classification: C.EDITABLE,
    editor: "structured_image",
    keys: ["about.life_together.mediaUrl", "about.gallery.mediaUrl"],
  },
  {
    id: "bb.about.visit_sunday.image",
    surface: "About Visit on Sunday featured image",
    classification: C.EDITABLE,
    editor: "structured_image",
    keys: ["about.visitor_cta.mediaUrl"],
  },
  {
    id: "bb.about.gallery",
    surface: "About gallery grid images (gallery_1..gallery_3 only)",
    classification: C.EDITABLE,
    editor: "structured_image",
    keys: ["about.gallery_1.mediaUrl", "about.gallery_2.mediaUrl", "about.gallery_3.mediaUrl"],
  },
  {
    id: "bb.content_block.media",
    surface: "Generic page content-block media",
    classification: C.EDITABLE,
    editor: "structured_image",
    keys: ["content_block.mediaUrl"],
  },

  // Collections
  {
    id: "bb.leadership.photo",
    surface: "Leadership / pastor / team photos",
    classification: C.EDITABLE,
    editor: "structured_leader+content_admin_media",
    keys: ["leader.imageUrl"],
  },
  {
    id: "bb.ministry.image",
    surface: "Ministry images",
    classification: C.EDITABLE,
    editor: "structured_ministry+content_admin_media",
    keys: ["ministry.imageUrl"],
  },
  {
    id: "bb.event.image",
    surface: "Event images",
    classification: C.EDITABLE,
    editor: "structured_event+content_admin_media",
    keys: ["event.imageUrl"],
  },
  {
    id: "bb.sermon.thumbnail",
    surface: "Sermon thumbnails",
    classification: C.EDITABLE,
    editor: "structured_sermon+content_admin_media",
    keys: ["sermon.imageUrl"],
  },
  {
    id: "bb.giving.qr",
    surface: "Giving QR images",
    classification: C.EDITABLE,
    editor: "structured_giving+content_admin_media",
    keys: ["giving.qrImageUrl"],
  },

  // Variants
  {
    id: "bb.image.mobile_desktop_variants",
    surface: "Separate mobile/desktop image assets",
    classification: C.NOT_APPLICABLE,
    editor: null,
    reason: "Template uses one media reference with desktop/mobile fit preview only.",
  },

  // System / marketing
  {
    id: "bb.apex.marketing",
    surface: "BlessBoard apex SaaS marketing images",
    classification: C.SYSTEM_ONLY,
    editor: null,
    reason: "Global platform marketing — not tenant-editable.",
  },
  {
    id: "bb.softfill.demo",
    surface: "Demo soft-fill images when tenant content is empty",
    classification: C.SYSTEM_ONLY,
    editor: null,
    reason: "Platform soft-fill only; replaced when tenant uploads.",
  },
  {
    id: "bb.shell.getpro",
    surface: "Powered by GetPro / shell chrome marks",
    classification: C.SYSTEM_ONLY,
    editor: null,
    reason: "Platform branding.",
  },
]);

function unexplainedGaps() {
  return COVERAGE.filter((row) => {
    if (!row.classification) return true;
    if (row.classification === "NOT_EDITABLE") return true;
    if (row.classification === C.EDITABLE && !row.editor) return true;
    return false;
  });
}

function rowsByClassification(classification) {
  return COVERAGE.filter((row) => row.classification === classification);
}

module.exports = {
  CLASSIFICATION: C,
  COVERAGE,
  unexplainedGaps,
  rowsByClassification,
};
