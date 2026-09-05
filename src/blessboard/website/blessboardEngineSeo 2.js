"use strict";

/**
 * BlessBoard SEO adapter — shared engine draft keys overlay branch scope settings.
 */

const { resolveWebsiteContent, MODE } = require("../../platform/website/resolver");
const contentService = require("../../platform/website/contentService");
const { findBlessBoardWebsiteInstance } = require("./blessboardWebsiteAdapter");
const { resolveBranchWebsiteSettings } = require("../services/resolveBranchWebsiteSettings");

const BB_SEO_KEYS = Object.freeze([
  "seo.title",
  "seo.description",
  "seo.og_title",
  "seo.og_description",
  "seo.og_image_url",
  "seo.robots",
  "seo.canonical_url",
  "seo.sitemap_include",
  "seo.noindex",
]);

function pickSeoFromFlat(flat) {
  const source = flat && typeof flat === "object" ? flat : {};
  const out = {};
  for (const key of BB_SEO_KEYS) {
    if (source[key] != null) out[key] = source[key];
  }
  return out;
}

async function loadLegacyBlessBoardSeoFlat(db, input) {
  const organizationId = String((input && input.organizationId) || "");
  const churchId = String((input && input.churchId) || "");
  const branchId =
    input && input.branchId != null && String(input.branchId).trim()
      ? String(input.branchId).trim()
      : null;
  if (!organizationId || !churchId || !branchId) return {};
  try {
    const resolved = await resolveBranchWebsiteSettings(db, {
      organizationId,
      churchId,
      branchId,
    });
    if (!resolved || !resolved.ok || !resolved.flat) return {};
    return pickSeoFromFlat(resolved.flat);
  } catch {
    return {};
  }
}

/**
 * SEO editor form state: engine draft rows with legacy branch settings as published baseline.
 */
async function loadBlessBoardSeoEditorState(db, input) {
  const organizationId = String((input && input.organizationId) || "");
  const instance = input && input.instance;
  if (!organizationId || !instance) {
    return { values: {}, published: {} };
  }
  const legacy = await loadLegacyBlessBoardSeoFlat(db, input);
  const rows = await Promise.all(
    BB_SEO_KEYS.map((key) =>
      contentService.getWebsiteContentRow(db, instance.id, organizationId, key)
    )
  );
  const values = {};
  const published = {};
  BB_SEO_KEYS.forEach((key, index) => {
    const row = rows[index];
    const legacyValue = Object.prototype.hasOwnProperty.call(legacy, key) ? legacy[key] : null;
    published[key] = row && row.publishedValue != null ? row.publishedValue : legacyValue;
    values[key] =
      row && row.draftValue != null
        ? row.draftValue
        : row && row.publishedValue != null
          ? row.publishedValue
          : legacyValue;
  });
  return { values, published };
}

/**
 * Public renderer overlay — engine draft/published SEO wins over branch scope settings.
 */
async function overlayBlessBoardEngineSeo(db, seoOverrides, input) {
  const organizationId = String((input && input.organizationId) || "");
  if (!organizationId) return seoOverrides || {};
  const base = seoOverrides && typeof seoOverrides === "object" ? { ...seoOverrides } : {};
  try {
    const instance = await findBlessBoardWebsiteInstance(db, organizationId);
    if (!instance) return base;
    const resolved = await resolveWebsiteContent(db, {
      organizationId,
      instance,
      mode: input && input.preview ? MODE.DRAFT : MODE.LIVE,
    });
    if (!resolved.ok) return base;
    for (const key of BB_SEO_KEYS) {
      if (resolved.values[key] != null) base[key] = resolved.values[key];
    }
    return base;
  } catch {
    return base;
  }
}

/**
 * After engine publish, project published SEO keys onto primary branch scope settings
 * so legacy branch settings and church-wide fallbacks stay aligned with the engine.
 */
async function projectPublishedSeoToBranchScope(db, input) {
  const organizationId = String((input && input.organizationId) || "");
  const churchId = String((input && input.churchId) || "");
  const instance = input && input.instance;
  const branchId =
    input && input.branchId != null && String(input.branchId).trim()
      ? String(input.branchId).trim()
      : null;
  if (!organizationId || !churchId || !instance || !branchId) {
    return { ok: true, projected: 0, skipped: true };
  }
  const { setWebsiteScopeOverride } = require("../services/websiteScopeSettingsService");
  const resolved = await resolveWebsiteContent(db, {
    organizationId,
    instance,
    mode: MODE.LIVE,
  });
  if (!resolved.ok) return { ok: false, projected: 0, code: resolved.code };
  let projected = 0;
  for (const key of BB_SEO_KEYS) {
    const value = resolved.values[key];
    if (value == null) continue;
    const def = require("../services/websiteSettingKeyRegistry").KEY_DEFS[key];
    const saved = await setWebsiteScopeOverride(db, {
      organizationId,
      churchId,
      branchId,
      settingKey: key,
      value,
      actorUserId: input.actorUserId || null,
      allowGovernanceControlled: Boolean(def && def.hqOnly),
    });
    if (saved.ok) projected += 1;
  }
  return { ok: true, projected };
}

const ENGINE_SETTINGS_KEY_RE = /^(seo\.|brand\.)/;
const ENGINE_SETTINGS_ONLY_KEYS = new Set(["home.logo", "home.hero.image"]);

function isEngineWebsiteSettingsKey(contentKey) {
  const key = String(contentKey || "");
  return ENGINE_SETTINGS_KEY_RE.test(key) || ENGINE_SETTINGS_ONLY_KEYS.has(key);
}

/**
 * Publish engine-only website settings (SEO, branding, logo) without a full CMS publish.
 * Used when legacy church publish validation blocks republish but engine drafts exist.
 */
async function publishBlessBoardEngineWebsiteSettingsOnly(db, input) {
  const organizationId = String((input && input.organizationId) || "");
  const churchId = String((input && input.churchId) || "");
  const instance = input && input.instance;
  const actorIdentityId = input && input.actorIdentityId;
  const branchId =
    input && input.branchId != null && String(input.branchId).trim()
      ? String(input.branchId).trim()
      : null;
  if (!organizationId || !instance) {
    return { ok: false, code: "website_instance_not_found" };
  }
  const publicationService = require("../../platform/website/publicationService");
  const rows = await contentService.listWebsiteContent(db, instance, organizationId);
  const changes = contentService.diffContentRows(rows);
  if (!changes.length) {
    return { ok: false, code: "no_engine_changes" };
  }
  if (!changes.every((row) => isEngineWebsiteSettingsKey(row.contentKey))) {
    return { ok: false, code: "not_settings_only" };
  }
  const published = await publicationService.publishWebsiteDraft(db, {
    organizationId,
    instanceId: instance.id,
    expectedProductCode: "blessboard",
    actorIdentityId,
    forceTenantPublish: true,
  });
  if (!published.ok) return published;
  if (churchId && branchId) {
    await projectPublishedSeoToBranchScope(db, {
      organizationId,
      churchId,
      branchId,
      instance,
      actorUserId: actorIdentityId,
    });
  }
  return {
    ok: true,
    code: "published",
    engineOnly: true,
    changedKeys: published.changedKeys || changes.map((row) => row.contentKey),
  };
}

module.exports = {
  BB_SEO_KEYS,
  loadBlessBoardSeoEditorState,
  overlayBlessBoardEngineSeo,
  loadLegacyBlessBoardSeoFlat,
  projectPublishedSeoToBranchScope,
  publishBlessBoardEngineWebsiteSettingsOnly,
  isEngineWebsiteSettingsKey,
};
