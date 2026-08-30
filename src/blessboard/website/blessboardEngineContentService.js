"use strict";

/**
 * Canonical BlessBoard website field store: platform.website_content.
 *
 * Content-type mapping (shared lifecycle, product-specific values):
 *   plain text / headings / CTA text     → draft_value / published_value
 *   CTA links                             → URL keys (button_url, …)
 *   images / alt text                     → image keys on the matching section
 *   structured page sections              → per-locator keys; layout stays in CMS
 *   navigation / SEO                      → cms.snapshot + public templates
 *   sermons / ministries / leadership     → entity tables + structured drafts
 *
 * public_pages / page_sections remain a published projection for existing
 * public templates. Entity tables stay product-specific and are not copied
 * into generic text keys.
 */

const contentService = require("../../platform/website/contentService");
const {
  resolveInstance,
} = require("../../platform/website-engine/blessboardBridge");
const {
  stableKeyFromLocator,
  ensureProductFieldsRegistered,
  PRODUCT_CODE,
} = require("../../platform/website/editableFieldSchema");
const { EDITABLE_FIELDS } = require("../services/websiteInlineEditableFields");
const contentRepo = require("../repositories/publicContentRepository");
const settingsRepo = require("../repositories/blessBoardSettingsRepository");
const { registerBlessBoardWebsiteTemplate } = require("./blessboardChurchTemplate");

function snakeToCamel(value) {
  return String(value || "").replace(/_([a-z])/g, (_, ch) => ch.toUpperCase());
}

function overlayKey(sectionKey, fieldKey) {
  return `${sectionKey}::${fieldKey}`;
}

function locatorFromContentKey(contentKey) {
  const parts = String(contentKey || "")
    .split(".")
    .filter(Boolean);
  if (parts.length < 3) return null;
  return {
    pageKey: parts[0],
    sectionKey: parts[1],
    fieldKey: snakeToCamel(parts.slice(2).join("_")),
  };
}

function contentKeyFor(pageKey, sectionKey, fieldKey) {
  return stableKeyFromLocator(pageKey, sectionKey, fieldKey);
}

function readSectionFieldValue(sectionRow, fieldKey, publicContact) {
  if (fieldKey === "email" || fieldKey === "phone" || fieldKey === "address") {
    const contact = publicContact && typeof publicContact === "object" ? publicContact : {};
    if (fieldKey === "address") {
      return contact.addressText != null
        ? String(contact.addressText)
        : contact.address != null
          ? String(contact.address)
          : "";
    }
    return contact[fieldKey] != null ? String(contact[fieldKey]) : "";
  }
  if (!sectionRow) return "";
  if (fieldKey === "heading") {
    return sectionRow.heading != null ? String(sectionRow.heading) : "";
  }
  if (fieldKey === "bodyText") {
    return sectionRow.bodyText != null ? String(sectionRow.bodyText) : "";
  }
  const meta =
    sectionRow.layoutMetadata && typeof sectionRow.layoutMetadata === "object"
      ? sectionRow.layoutMetadata
      : {};
  if (fieldKey === "tagline") {
    if (meta.tagline != null) return String(meta.tagline);
    return sectionRow.bodyText != null ? String(sectionRow.bodyText) : "";
  }
  if (fieldKey === "buttonText") return meta.buttonText != null ? String(meta.buttonText) : "";
  if (fieldKey === "buttonUrl") return meta.buttonUrl != null ? String(meta.buttonUrl) : "";
  if (fieldKey === "eyebrow") return meta.eyebrow != null ? String(meta.eyebrow) : "";
  if (fieldKey === "secondaryButtonText") {
    return meta.secondaryButtonText != null ? String(meta.secondaryButtonText) : "";
  }
  if (fieldKey === "secondaryButtonUrl") {
    return meta.secondaryButtonUrl != null ? String(meta.secondaryButtonUrl) : "";
  }
  if (fieldKey === "image" || fieldKey === "mediaUrl") {
    return sectionRow.mediaUrl != null ? String(sectionRow.mediaUrl) : "";
  }
  return "";
}

function applyOverlayToSections(sections, overlayMap) {
  if (!overlayMap || !overlayMap.size) return sections || [];
  return (sections || []).map((section) => {
    const key = String(section.sectionKey || "");
    const heading = overlayMap.get(overlayKey(key, "heading"));
    const bodyText = overlayMap.get(overlayKey(key, "bodyText"));
    const buttonText = overlayMap.get(overlayKey(key, "buttonText"));
    const buttonUrl = overlayMap.get(overlayKey(key, "buttonUrl"));
    const tagline = overlayMap.get(overlayKey(key, "tagline"));
    const eyebrow = overlayMap.get(overlayKey(key, "eyebrow"));
    const secondaryButtonText = overlayMap.get(overlayKey(key, "secondaryButtonText"));
    const secondaryButtonUrl = overlayMap.get(overlayKey(key, "secondaryButtonUrl"));
    const mediaUrl = overlayMap.get(overlayKey(key, "image")) || overlayMap.get(overlayKey(key, "mediaUrl"));
    if (
      heading === undefined &&
      bodyText === undefined &&
      buttonText === undefined &&
      buttonUrl === undefined &&
      tagline === undefined &&
      eyebrow === undefined &&
      secondaryButtonText === undefined &&
      secondaryButtonUrl === undefined &&
      mediaUrl === undefined
    ) {
      return section;
    }
    const layoutMetadata = {
      ...(section.layoutMetadata && typeof section.layoutMetadata === "object"
        ? section.layoutMetadata
        : {}),
    };
    if (buttonText !== undefined) layoutMetadata.buttonText = buttonText;
    if (buttonUrl !== undefined) layoutMetadata.buttonUrl = buttonUrl;
    if (tagline !== undefined) layoutMetadata.tagline = tagline;
    if (eyebrow !== undefined) layoutMetadata.eyebrow = eyebrow;
    if (secondaryButtonText !== undefined) layoutMetadata.secondaryButtonText = secondaryButtonText;
    if (secondaryButtonUrl !== undefined) layoutMetadata.secondaryButtonUrl = secondaryButtonUrl;
    return {
      ...section,
      heading: heading !== undefined ? heading : section.heading,
      bodyText:
        bodyText !== undefined
          ? bodyText
          : tagline !== undefined && key === "footer"
            ? tagline
            : section.bodyText,
      mediaUrl: mediaUrl !== undefined ? mediaUrl : section.mediaUrl,
      layoutMetadata,
    };
  });
}

async function resolveEngineInstance(db, input) {
  registerBlessBoardWebsiteTemplate();
  ensureProductFieldsRegistered(PRODUCT_CODE.BLESSBOARD);
  if (input && input.createIfMissing === false) {
    const {
      findBlessBoardWebsiteInstance,
    } = require("./blessboardWebsiteAdapter");
    const organizationId = String((input && input.organizationId) || "").trim();
    if (!organizationId) return { ok: false, instance: null };
    const found = await findBlessBoardWebsiteInstance(
      db,
      organizationId,
      input.branchId || null
    );
    if (found) return { ok: true, instance: found, created: false };
    return { ok: false, instance: null };
  }
  return resolveInstance(db, input);
}

async function loadFieldOverlayMap(db, input) {
  const mode = String((input && input.mode) || "draft") === "live" ? "live" : "draft";
  const organizationId = String((input && input.organizationId) || "").trim();
  if (!organizationId) return new Map();
  const resolved = await resolveEngineInstance(db, {
    organizationId,
    branchId: input.branchId || null,
    slug: input.slug || null,
    createIfMissing: input.createIfMissing,
  });
  if (!resolved.ok || !resolved.instance) return new Map();
  const rows = await contentService.listWebsiteContent(db, resolved.instance, organizationId);
  const pageKey = input.pageKey ? String(input.pageKey) : null;
  const map = new Map();
  for (const row of rows) {
    const locator = locatorFromContentKey(row.contentKey);
    if (!locator) continue;
    if (pageKey && locator.pageKey !== pageKey && !(locator.pageKey === "home" && locator.sectionKey === "footer")) {
      continue;
    }
    const value = mode === "live" ? row.publishedValue : row.draftValue != null ? row.draftValue : row.publishedValue;
    if (value == null) continue;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const src = value.src || value.url || "";
      if (src) map.set(overlayKey(locator.sectionKey, locator.fieldKey), String(src));
      if (value.alt) map.set(overlayKey(locator.sectionKey, `${locator.fieldKey}Alt`), String(value.alt));
      continue;
    }
    map.set(overlayKey(locator.sectionKey, locator.fieldKey), String(value));
  }
  return map;
}

async function saveFieldDraft(db, input) {
  registerBlessBoardWebsiteTemplate();
  ensureProductFieldsRegistered(PRODUCT_CODE.BLESSBOARD);
  const pageKey = String((input && input.pageKey) || "").trim();
  const sectionKey = String((input && input.sectionKey) || "").trim();
  const fieldKey = String((input && input.fieldKey) || "").trim();
  const organizationId = String((input && input.organizationId) || "").trim();
  if (!organizationId || !pageKey || !sectionKey || !fieldKey) {
    return { ok: false, code: "invalid_input" };
  }
  const resolved = await resolveEngineInstance(db, {
    organizationId,
    branchId: input.branchId || null,
    slug: input.slug || null,
    actorIdentityId: input.actorIdentityId || null,
  });
  if (!resolved.ok || !resolved.instance) {
    return { ok: false, code: "website_instance_not_found" };
  }
  return contentService.saveWebsiteDraft(db, {
    organizationId,
    instanceId: resolved.instance.id,
    expectedProductCode: "blessboard",
    contentKey: contentKeyFor(pageKey, sectionKey, fieldKey),
    value: input.value,
    actorIdentityId: input.actorIdentityId || null,
    grantedPermissions: input.grantedPermissions,
  });
}

async function seedFieldContentFromPages(db, input) {
  registerBlessBoardWebsiteTemplate();
  ensureProductFieldsRegistered(PRODUCT_CODE.BLESSBOARD);
  const organizationId = String((input && input.organizationId) || "").trim();
  const churchId = String((input && input.churchId) || "").trim();
  if (!organizationId || !churchId) {
    return { ok: false, seeded: 0, reason: "missing_scope" };
  }
  const resolved = await resolveEngineInstance(db, {
    organizationId,
    branchId: input.branchId || null,
    slug: input.slug || null,
    actorIdentityId: input.actorIdentityId || null,
  });
  if (!resolved.ok || !resolved.instance) {
    return { ok: false, seeded: 0, reason: "website_instance_not_found" };
  }

  const settings = await settingsRepo.findChurchSettings(db, churchId);
  const publicContact = {
    email: settings && settings.primaryEmail,
    phone: settings && settings.primaryPhone,
    addressText: null,
  };
  const entries = [];
  const pageCache = new Map();
  const sectionCache = new Map();
  for (const field of EDITABLE_FIELDS) {
    const pageKey = field.pageKey === "home" || field.sectionKey !== "footer" ? field.pageKey : "home";
    const cacheKey = `${pageKey}::${input.branchId || "hq"}`;
    if (!pageCache.has(cacheKey)) {
      pageCache.set(
        cacheKey,
        await contentRepo.findPageByScopeForProvision(db, {
          churchId,
          branchId: input.branchId || null,
          pageKey,
        })
      );
    }
    const page = pageCache.get(cacheKey);
    let section = null;
    if (page) {
      const sectionCacheKey = `${page.id}::${field.sectionKey}`;
      if (!sectionCache.has(sectionCacheKey)) {
        sectionCache.set(
          sectionCacheKey,
          await contentRepo.findSectionByPageAndKeyForProvision(db, page.id, field.sectionKey)
        );
      }
      section = sectionCache.get(sectionCacheKey);
    }
    const value = readSectionFieldValue(section, field.fieldKey, publicContact);
    entries.push({
      contentKey: contentKeyFor(field.pageKey, field.sectionKey, field.fieldKey),
      value: value == null ? "" : value,
      publish: input.publish === true,
    });
  }
  const seeded = await contentService.seedWebsiteContent(
    db,
    resolved.instance,
    entries,
    input.actorIdentityId || null
  );
  return { ok: Boolean(seeded && seeded.ok), instance: resolved.instance, ...seeded };
}

async function overwriteEngineFieldsFromPages(db, input) {
  registerBlessBoardWebsiteTemplate();
  ensureProductFieldsRegistered(PRODUCT_CODE.BLESSBOARD);
  const organizationId = String((input && input.organizationId) || "").trim();
  const churchId = String((input && input.churchId) || "").trim();
  if (!organizationId || !churchId) {
    return { ok: false, updated: 0, reason: "missing_scope" };
  }
  const resolved = await resolveEngineInstance(db, {
    organizationId,
    branchId: input.branchId || null,
    slug: input.slug || null,
    actorIdentityId: input.actorIdentityId || null,
  });
  if (!resolved.ok || !resolved.instance) {
    return { ok: false, updated: 0, reason: "website_instance_not_found" };
  }
  const settings = await settingsRepo.findChurchSettings(db, churchId);
  const publicContact = {
    email: settings && settings.primaryEmail,
    phone: settings && settings.primaryPhone,
    addressText: null,
  };
  let updated = 0;
  for (const field of EDITABLE_FIELDS) {
    const page = await contentRepo.findPageByScope(db, {
      churchId,
      branchId: input.branchId || null,
      pageKey: field.pageKey,
    });
    let section = null;
    if (page) {
      section = await contentRepo.findSectionByPageAndKey(db, page.id, field.sectionKey);
    }
    const value = readSectionFieldValue(section, field.fieldKey, publicContact);
    const saved = await contentService.saveWebsiteDraft(db, {
      organizationId,
      instanceId: resolved.instance.id,
      expectedProductCode: "blessboard",
      contentKey: contentKeyFor(field.pageKey, field.sectionKey, field.fieldKey),
      value: value == null ? "" : value,
      actorIdentityId: input.actorIdentityId || null,
    });
    if (saved && saved.ok) updated += 1;
  }
  return { ok: true, updated, instance: resolved.instance };
}

async function projectPublishedFieldsToPages(db, input) {
  const { applyFieldDraft } = require("../services/websiteDraftApplyService");
  const organizationId = String((input && input.organizationId) || "").trim();
  const churchId = String((input && input.churchId) || "").trim();
  if (!organizationId || !churchId) {
    return { ok: false, applied: 0, reason: "missing_scope" };
  }
  const overlay = await loadFieldOverlayMap(db, {
    organizationId,
    churchId,
    branchId: input.branchId || null,
    mode: "live",
  });
  let applied = 0;
  for (const field of EDITABLE_FIELDS) {
    const value = overlay.get(overlayKey(field.sectionKey, field.fieldKey));
    if (value === undefined) continue;
    await applyFieldDraft(
      db,
      {
        pageKey: field.pageKey,
        sectionKey: field.sectionKey,
        fieldKey: field.fieldKey,
        newValue: value,
      },
      { churchId, branchId: input.branchId || null }
    );
    applied += 1;
  }
  return { ok: true, applied };
}

async function applyPublishedEngineFieldsToPage(db, input) {
  const pageKey = String((input && input.pageKey) || "").trim();
  const organizationId = String((input && input.organizationId) || "").trim();
  if (!organizationId || !pageKey) {
    return { page: input.page || null, sections: input.sections || [] };
  }
  const overlay = await loadFieldOverlayMap(db, {
    organizationId,
    branchId: input.branchId || null,
    pageKey,
    mode: "live",
    createIfMissing: false,
  });
  return {
    page: input.page || null,
    sections: applyOverlayToSections(input.sections || [], overlay),
  };
}

async function seedUnpublishedEngineContent(db, input) {
  try {
    const {
      resolveInstance,
      CMS_SNAPSHOT,
    } = require("../../platform/website-engine/blessboardBridge");
    const resolved = await resolveInstance(db, {
      organizationId: input.organizationId,
      branchId: input.branchId || null,
      slug: input.slug || null,
      actorIdentityId: input.actorIdentityId || null,
      status: "coming_soon",
      lifecycleStatus: "provisional",
    });
    if (resolved.ok && resolved.instance) {
      await contentService.seedWebsiteContent(
        db,
        resolved.instance,
        [
          {
            contentKey: CMS_SNAPSHOT,
            value: {
              themeKey: "default",
              branchId: input.branchId || null,
              pageKeys: [],
              pages: [],
              navigation: [],
              entities: {},
            },
            publish: false,
          },
        ],
        input.actorIdentityId || null
      );
    }
    await seedFieldContentFromPages(db, {
      ...input,
      publish: false,
    });
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

async function countUnpublishedEngineFields(db, input) {
  const organizationId = String((input && input.organizationId) || "").trim();
  if (!organizationId) return 0;
  const resolved = await resolveEngineInstance(db, {
    organizationId,
    branchId: input.branchId || null,
  });
  if (!resolved.ok || !resolved.instance) return 0;
  const rows = await contentService.listWebsiteContent(db, resolved.instance, organizationId);
  let count = 0;
  for (const row of rows) {
    if (row.contentKey === "cms.snapshot") continue;
    const draft = row.draftValue;
    const published = row.publishedValue;
    if (JSON.stringify(draft) !== JSON.stringify(published)) count += 1;
  }
  return count;
}

module.exports = {
  contentKeyFor,
  locatorFromContentKey,
  overlayKey,
  applyOverlayToSections,
  resolveEngineInstance,
  loadFieldOverlayMap,
  saveFieldDraft,
  seedFieldContentFromPages,
  overwriteEngineFieldsFromPages,
  projectPublishedFieldsToPages,
  applyPublishedEngineFieldsToPage,
  seedUnpublishedEngineContent,
  countUnpublishedEngineFields,
};
