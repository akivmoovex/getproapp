"use strict";

/**
 * ActiveClinic website image-editor coverage catalogue.
 * Tenant website images must be EDITABLE via the shared media dialog / CMS media field.
 * Global SaaS marketing assets are SYSTEM_ONLY.
 */

const C = Object.freeze({
  EDITABLE: "EDITABLE",
  SYSTEM_ONLY: "SYSTEM_ONLY",
  NOT_APPLICABLE: "NOT_APPLICABLE",
});

const COVERAGE = Object.freeze([
  {
    id: "ac.home.logo",
    surface: "Clinic / facility logo",
    classification: C.EDITABLE,
    editor: "shared_inline_image+cms_branding",
    keys: ["home.logo"],
  },
  {
    id: "ac.home.hero.image",
    surface: "Hero / banner",
    classification: C.EDITABLE,
    editor: "shared_inline_image+cms_branding",
    keys: ["home.hero.image"],
  },
  {
    id: "ac.about.story.image",
    surface: "About / facility story image",
    classification: C.EDITABLE,
    editor: "shared_inline_image",
    keys: ["about.story.image"],
  },
  {
    id: "ac.seo.image",
    surface: "Social sharing image",
    classification: C.EDITABLE,
    editor: "cms_seo_media_field",
    keys: ["seo.image"],
  },
  {
    id: "ac.cms.block.image",
    surface: "CMS page/block images",
    classification: C.EDITABLE,
    editor: "cms_builder_media_picker",
    keys: ["cms.block.image"],
  },
  {
    id: "ac.cms.library.image",
    surface: "Content library item images (gallery / custom content)",
    classification: C.EDITABLE,
    editor: "cms_library_media_field",
    keys: ["cms.library.image"],
  },
  {
    id: "ac.doctor.photo",
    surface: "Doctors / team / staff website photos",
    classification: C.EDITABLE,
    editor: "cms_library_overlay",
    keys: ["library.doctor.image"],
    note: "Operational staff records stay in clinic ops; website photo overlay uses Content Library media field.",
  },
  {
    id: "ac.service.image",
    surface: "Service website images / icons (tenant override)",
    classification: C.EDITABLE,
    editor: "cms_library_overlay",
    keys: ["library.service.image"],
  },
  {
    id: "ac.service.default_icon",
    surface: "Default service / procedure icon pack",
    classification: C.SYSTEM_ONLY,
    editor: null,
    reason: "Platform icon pack used when no tenant override is set.",
  },
  {
    id: "ac.location.facility_photo",
    surface: "Location / facility card photography",
    classification: C.NOT_APPLICABLE,
    editor: null,
    reason: "Public location template has no facility photo slot; addresses/hours are operational.",
  },
  {
    id: "ac.departments",
    surface: "Department imagery",
    classification: C.NOT_APPLICABLE,
    editor: null,
    reason: "No dedicated public department image surface; department appears as doctor metadata text only.",
  },
  {
    id: "ac.image.mobile_desktop_variants",
    surface: "Separate mobile/desktop image assets",
    classification: C.NOT_APPLICABLE,
    editor: null,
    reason: "Template uses a single media reference per field.",
  },
  {
    id: "ac.platform.marketing",
    surface: "ActiveClinic SaaS / directory marketing images",
    classification: C.SYSTEM_ONLY,
    editor: null,
    reason: "Global platform marketing — not tenant-editable.",
  },
  {
    id: "ac.doctor.fallback",
    surface: "Doctor photo fallback silhouette",
    classification: C.SYSTEM_ONLY,
    editor: null,
    reason: "Platform fallback when no tenant photo is configured.",
  },
  {
    id: "ac.directory.demo_hero",
    surface: "Demo clinic directory card heroes",
    classification: C.SYSTEM_ONLY,
    editor: null,
    reason: "Platform soft-fill for demo keys only.",
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
