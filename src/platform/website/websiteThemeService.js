"use strict";

/**
 * Shared website theme selection — draft via platform.website_content (site.theme_id).
 * Does not rewrite content, media, sections, or placement metadata.
 */

const contentService = require("./contentService");
const instanceRepo = require("./instanceRepository");
const { PERMISSIONS, hasWebsitePermission } = require("./permissions");
const { PRODUCT_CODE } = require("./publicWebsiteUrl");
const {
  THEME_CONTENT_KEY,
  defaultThemeIdForProduct,
  normalizeThemeId,
  getTheme,
  listThemesForProduct,
  listSelectableThemesForProduct,
  publicationThemeKeyFor,
} = require("./themeRegistry");
const { slotDefinition } = require("./imagePlacement");

const THEME_PREVIEW_QUERY = "website_theme_preview";

function grantedList(grantedPermissions) {
  return Array.isArray(grantedPermissions) ? grantedPermissions.map(String) : [];
}

function unwrapThemeValue(raw) {
  if (raw == null) return null;
  if (typeof raw === "string") return raw;
  if (typeof raw === "object" && raw.value != null) return String(raw.value);
  return String(raw);
}

function previewThemeIdFromInput(input) {
  if (!input) return null;
  if (input.previewThemeId) return String(input.previewThemeId).trim() || null;
  const q = input.query || {};
  const raw = q[THEME_PREVIEW_QUERY] || q.websiteThemePreview || "";
  return String(raw).trim() || null;
}

/**
 * Compare current section types / image placements against a theme definition.
 * Unsupported items are preserved and flagged — never dropped.
 */
function evaluateThemeCompatibility(theme, input) {
  const sectionTypes = Array.isArray(input && input.sectionTypes)
    ? input.sectionTypes.map(String)
    : [];
  const imageKeys = Array.isArray(input && input.imageContentKeys)
    ? input.imageContentKeys.map(String)
    : [];
  const supportedSections = new Set((theme && theme.sectionTypes) || []);
  const unsupportedSections = [];
  const preservedSections = [];
  for (const type of sectionTypes) {
    const entry = { type, preserved: true };
    if (supportedSections.size && !supportedSections.has(type)) {
      unsupportedSections.push({ ...entry, review: "theme_section_unsupported" });
    } else {
      preservedSections.push(entry);
    }
  }
  const imageFlags = [];
  for (const key of imageKeys) {
    const themeSlot = theme && theme.imageSlots && theme.imageSlots[key];
    const runtimeSlot = slotDefinition(key);
    if (!themeSlot) {
      imageFlags.push({
        contentKey: key,
        preserved: true,
        review: "theme_image_slot_unlisted",
        fallback: "use_runtime_slot_defaults",
        supportsSeparateFraming: runtimeSlot.supportsSeparateFraming === true,
      });
      continue;
    }
    imageFlags.push({
      contentKey: key,
      preserved: true,
      review: null,
      supportsSeparateFraming: themeSlot.supportsSeparateFraming === true,
    });
  }
  return {
    ok: true,
    themeId: theme ? theme.id : null,
    unsupportedSections,
    preservedSections,
    imageFlags,
    dropsContent: false,
  };
}

async function loadWebsiteThemeState(db, input) {
  const organizationId = String((input && input.organizationId) || "").trim();
  const productCode = String((input && (input.productCode || input.product)) || "")
    .trim()
    .toLowerCase();
  if (!organizationId || !productCode) {
    return { ok: false, code: "invalid_input" };
  }
  if (productCode !== PRODUCT_CODE.BLESSBOARD && productCode !== PRODUCT_CODE.ACTIVECLINIC) {
    return { ok: false, code: "invalid_product" };
  }
  const instance =
    (input && input.instance) ||
    (await instanceRepo.findWebsiteInstanceByOrgProduct(db, { organizationId, productCode }));
  if (!instance || instance.organizationId !== organizationId) {
    return { ok: false, code: "website_instance_not_found" };
  }
  const row = await contentService.getWebsiteContentRow(
    db,
    instance.id,
    organizationId,
    THEME_CONTENT_KEY
  );
  const draftRaw = unwrapThemeValue(row ? row.draftValue : null);
  const publishedRaw = unwrapThemeValue(row ? row.publishedValue : null);
  const defaultId = defaultThemeIdForProduct(productCode);
  const draftId = normalizeThemeId(draftRaw || defaultId, productCode);
  const publishedId = normalizeThemeId(publishedRaw || defaultId, productCode);
  const preferDraft = input && input.preferDraft === true;
  let activeId = preferDraft ? draftId : publishedId;
  let previewOnly = false;
  const previewCandidate = previewThemeIdFromInput(input);
  if (previewCandidate && preferDraft) {
    const previewTheme = getTheme(previewCandidate, productCode);
    if (previewTheme && previewTheme.hasWorkingRenderer === true) {
      activeId = previewTheme.id;
      previewOnly = true;
    }
  }
  const draftTheme = getTheme(draftId, productCode);
  const publishedTheme = getTheme(publishedId, productCode);
  const activeTheme = getTheme(activeId, productCode) || getTheme(defaultId, productCode);
  const legacyFallback = !draftRaw && !publishedRaw;
  return {
    ok: true,
    instance,
    contentKey: THEME_CONTENT_KEY,
    available: listThemesForProduct(productCode),
    selectable: listSelectableThemesForProduct(productCode),
    draftThemeId: draftTheme ? draftTheme.id : defaultId,
    publishedThemeId: publishedTheme ? publishedTheme.id : defaultId,
    activeThemeId: activeTheme.id,
    activeTheme,
    draftTheme,
    publishedTheme,
    legacyFallback,
    previewOnly,
    previewThemeId: previewOnly ? activeTheme.id : null,
    publicationThemeKey: publicationThemeKeyFor(activeTheme.id, productCode),
    presentation: {
      themeId: activeTheme.id,
      productCode,
      cssClass: activeTheme.cssClass,
      tokenPack: activeTheme.styling && activeTheme.styling.tokenPack,
      engineTemplateId: activeTheme.engineTemplateId,
      isDefault: activeTheme.isDefault === true,
      legacyFallback,
      previewOnly,
    },
  };
}

async function saveWebsiteThemeDraft(db, input) {
  const granted = grantedList(input && input.grantedPermissions);
  if (!hasWebsitePermission(granted, PERMISSIONS.EDIT)) {
    return { ok: false, code: "forbidden", published: false };
  }
  const organizationId = String((input && input.organizationId) || "").trim();
  const productCode = String((input && (input.productCode || input.product)) || "")
    .trim()
    .toLowerCase();
  if (!organizationId || !productCode) {
    return { ok: false, code: "invalid_input", published: false };
  }
  const theme = getTheme(input.themeId, productCode);
  if (!theme) {
    return { ok: false, code: "invalid_theme", published: false };
  }
  if (theme.hasWorkingRenderer !== true) {
    return { ok: false, code: "theme_renderer_unavailable", published: false };
  }
  // Hard product isolation — never allow cross-product theme ids.
  if (theme.productCode !== productCode) {
    return { ok: false, code: "theme_product_mismatch", published: false };
  }
  const instance =
    (input && input.instance) ||
    (await instanceRepo.findWebsiteInstanceByOrgProduct(db, { organizationId, productCode }));
  if (!instance || instance.organizationId !== organizationId) {
    return { ok: false, code: "website_instance_not_found", published: false };
  }
  const compatibility = evaluateThemeCompatibility(theme, {
    sectionTypes: input.sectionTypes,
    imageContentKeys: input.imageContentKeys,
  });
  const saved = await contentService.saveWebsiteDraft(db, {
    organizationId,
    instanceId: instance.id,
    expectedProductCode: productCode,
    contentKey: THEME_CONTENT_KEY,
    value: theme.id,
    actorIdentityId: input.actorIdentityId || null,
    grantedPermissions: granted,
  });
  if (!saved.ok) {
    return { ...saved, published: false, compatibility };
  }
  return {
    ok: true,
    published: false,
    themeId: theme.id,
    instance,
    compatibility,
  };
}

function presentThemeAttrs(presentation) {
  if (!presentation || !presentation.themeId) return {};
  return {
    websiteThemeId: presentation.themeId,
    websiteThemeProduct: presentation.productCode,
    websiteThemeClass: presentation.cssClass || "",
    websiteThemeLegacyFallback: presentation.legacyFallback === true,
  };
}

module.exports = {
  THEME_CONTENT_KEY,
  THEME_PREVIEW_QUERY,
  evaluateThemeCompatibility,
  loadWebsiteThemeState,
  saveWebsiteThemeDraft,
  presentThemeAttrs,
  publicationThemeKeyFor,
};
