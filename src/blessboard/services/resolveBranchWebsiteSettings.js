"use strict";

/**
 * Prompt 7 Stage 2 — central branch website settings resolver.
 * Resolution: branch override → branch record / branch CMS → church default →
 * approved fallback → platform fallback. Every value carries source metadata.
 */

const scopeRepo = require("../repositories/websiteScopeSettingsRepository");
const settingsRepo = require("../repositories/blessBoardSettingsRepository");
const registry = require("./websiteSettingKeyRegistry");
const {
  assertBranchBelongsToOrg,
  getBranchWebsiteGovernance,
} = require("./branchWebsiteGovernanceService");
const {
  resolvePublicServiceTimesEntries,
} = require("./homeServiceTimesService");

const STATUS = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  NOT_FOUND: "not_found",
  FORBIDDEN: "forbidden",
  LOOKUP_ERROR: "lookup_error",
});

const SOURCE = Object.freeze({
  BRANCH_OVERRIDE: "branch_override",
  BRANCH_RECORD: "branch_record",
  CHURCH_DEFAULT: "church_default",
  PRIMARY_BRANCH_FALLBACK: "primary_branch_fallback",
  PLATFORM_FALLBACK: "platform_fallback",
  HIDDEN: "hidden",
  MISSING: "missing",
});

function resolvedField(value, source, extra) {
  const inherited =
    source === SOURCE.CHURCH_DEFAULT ||
    source === SOURCE.PRIMARY_BRANCH_FALLBACK ||
    source === SOURCE.PLATFORM_FALLBACK;
  return {
    value: value == null ? null : value,
    source,
    inherited: Boolean(inherited),
    locked: Boolean(extra && extra.locked),
    hidden: source === SOURCE.HIDDEN,
    resettable: Boolean(extra && extra.resettable),
  };
}

function pickFirstNonEmpty(candidates) {
  for (const c of candidates) {
    if (c == null) continue;
    if (typeof c === "string" && !String(c).trim()) continue;
    if (Array.isArray(c) && c.length === 0) continue;
    return c;
  }
  return null;
}

/**
 * @param {{ query: Function }} db
 * @param {string} churchId
 */
async function loadChurchSettings(db, churchId) {
  try {
    return await settingsRepo.findChurchSettings(db, churchId);
  } catch {
    return null;
  }
}

/**
 * @param {{ query: Function }} db
 * @param {string|null} branchId
 */
async function loadBranchSettings(db, branchId) {
  if (!branchId) return null;
  try {
    return await settingsRepo.findBranchSettings(db, branchId);
  } catch {
    return null;
  }
}

/**
 * @param {{ query: Function }} db
 * @param {string} branchId
 */
async function loadBranchRow(db, branchId) {
  const res = await db.query(
    `SELECT id, church_id, branch_key, display_name, status, is_primary
       FROM blessboard.branches WHERE id = $1 LIMIT 1`,
    [branchId]
  );
  return res.rows[0] || null;
}

/**
 * Resolve one Stage 2 key for a branch using loaded context.
 */
function resolveOneKey(key, ctx) {
  const def = registry.getKeyDef(key);
  const locked = ctx.lockedKeys.includes(key) || Boolean(def && def.readOnly);
  const active = ctx.activeByKey.get(key) || null;
  const hideAllowed = ctx.hideAllowed && def && def.hideable !== false;

  if (locked && !active) {
    // Locked inherit: still resolve defaults, mark locked.
  }

  if (active && active.isActive && active.inheritanceState === "hidden") {
    if (hideAllowed || locked) {
      return resolvedField(null, SOURCE.HIDDEN, {
        locked,
        resettable: !locked,
      });
    }
  }

  if (active && active.isActive && active.inheritanceState === "override") {
    const raw = registry.fromValueJson(active.valueJson);
    return resolvedField(raw, SOURCE.BRANCH_OVERRIDE, {
      locked,
      resettable: !locked,
    });
  }

  // Branch-owned record sources (not copied into website_scope_settings).
  const branchRecordValue = branchRecordValueForKey(key, ctx);
  if (branchRecordValue != null) {
    return resolvedField(branchRecordValue, SOURCE.BRANCH_RECORD, {
      locked,
      resettable: false,
    });
  }

  const churchValue = churchValueForKey(key, ctx);
  if (churchValue != null) {
    return resolvedField(churchValue, SOURCE.CHURCH_DEFAULT, {
      locked,
      resettable: false,
    });
  }

  const platformValue = platformFallbackForKey(key, ctx);
  if (platformValue != null) {
    return resolvedField(platformValue, SOURCE.PLATFORM_FALLBACK, {
      locked,
      resettable: false,
    });
  }

  return resolvedField(null, SOURCE.MISSING, { locked, resettable: false });
}

function branchRecordValueForKey(key, ctx) {
  const bs = ctx.branchSettings;
  const branch = ctx.branchRow;
  switch (key) {
    case "identity.branch_display_name":
    case "presentation.branch_display_label":
      return (
        (bs && bs.publicName && String(bs.publicName).trim()) ||
        (branch && branch.display_name && String(branch.display_name).trim()) ||
        null
      );
    case "contact.phone":
      return bs && bs.phone ? String(bs.phone).trim() : null;
    case "contact.email":
      return bs && bs.email ? String(bs.email).trim() : null;
    case "contact.address_line_1":
      return bs && bs.addressLine1 ? String(bs.addressLine1).trim() : null;
    case "contact.address_line_2":
      return bs && bs.addressLine2 ? String(bs.addressLine2).trim() : null;
    case "contact.city":
      return bs && bs.city ? String(bs.city).trim() : null;
    case "contact.province":
      return bs && bs.provinceState ? String(bs.provinceState).trim() : null;
    case "contact.country":
      return bs && bs.countryCode ? String(bs.countryCode).trim() : null;
    case "contact.postal_code":
      return bs && bs.postalCode ? String(bs.postalCode).trim() : null;
    default:
      return null;
  }
}

function churchValueForKey(key, ctx) {
  const cs = ctx.churchSettings;
  const churchName =
    (cs && cs.publicName && String(cs.publicName).trim()) ||
    (ctx.churchDisplayName && String(ctx.churchDisplayName).trim()) ||
    null;

  switch (key) {
    case "identity.tagline":
      return ctx.churchTagline || null;
    case "identity.hero_title":
      return ctx.churchHeroTitle || null;
    case "identity.hero_description":
      return ctx.churchHeroDescription || null;
    case "identity.hero_image_url":
      return ctx.churchHeroImageUrl || null;
    case "identity.hero_primary_action_label":
      return ctx.churchHeroPrimaryLabel || null;
    case "identity.hero_primary_action_url":
      return ctx.churchHeroPrimaryUrl || null;
    case "identity.hero_secondary_action_label":
      return ctx.churchHeroSecondaryLabel || null;
    case "identity.hero_secondary_action_url":
      return ctx.churchHeroSecondaryUrl || null;
    case "contact.phone":
      return cs && cs.primaryPhone ? String(cs.primaryPhone).trim() : null;
    case "contact.email":
      return cs && cs.primaryEmail ? String(cs.primaryEmail).trim() : null;
    case "seo.title":
    case "seo.og_title":
      return null; // composed later with page context
    case "seo.description":
    case "seo.og_description":
      return ctx.churchSeoDescription || null;
    case "seo.og_image_url":
      return ctx.churchOgImageUrl || null;
    case "seo.noindex":
      return null;
    case "presentation.parent_church_label":
      return churchName;
    case "presentation.branch_selector_label":
      return "Locations";
    case "presentation.accent_key":
      return "none";
    case "social.links":
      return ctx.churchSocialLinks && ctx.churchSocialLinks.length
        ? ctx.churchSocialLinks
        : null;
    default:
      return null;
  }
}

function platformFallbackForKey(key, ctx) {
  const branchName =
    (ctx.branchSettings && ctx.branchSettings.publicName) ||
    (ctx.branchRow && ctx.branchRow.display_name) ||
    "Branch";
  switch (key) {
    case "identity.branch_display_name":
    case "presentation.branch_display_label":
      return String(branchName);
    case "presentation.parent_church_label":
      return ctx.churchDisplayName || "Church";
    case "presentation.branch_selector_label":
      return "Locations";
    case "presentation.accent_key":
      return "none";
    case "seo.noindex":
      return false;
    default:
      return null;
  }
}

/**
 * Flatten convenience values from resolved map.
 * @param {Record<string, { value: * }>} values
 */
function flattenValues(values) {
  const out = {};
  for (const [k, meta] of Object.entries(values || {})) {
    out[k] = meta && Object.prototype.hasOwnProperty.call(meta, "value") ? meta.value : null;
  }
  return out;
}

/**
 * Build public contact summary from resolved Stage 2 contact keys + map helpers.
 */
function buildContactFromResolved(values, coords) {
  const get = (k) => (values[k] && values[k].hidden ? null : values[k] && values[k].value);
  const email = get("contact.email") || "";
  const phone = get("contact.phone") || "";
  const lines = [
    get("contact.address_line_1"),
    get("contact.address_line_2"),
    [get("contact.city"), get("contact.province")].filter(Boolean).join(", "),
    get("contact.postal_code"),
    get("contact.country"),
  ]
    .map((p) => (p == null ? "" : String(p).trim()))
    .filter(Boolean);
  const mapUrl = get("contact.map_url") || null;
  const directionsText = get("contact.directions_text") || "";
  const hasMap = Boolean(mapUrl || (coords && coords.latitude != null));
  return {
    email,
    phone,
    addressLines: lines,
    addressText: lines.join("\n"),
    mapUrl,
    directionsText,
    latitude: coords ? coords.latitude : null,
    longitude: coords ? coords.longitude : null,
    hasMap,
    hasAny: Boolean(email || phone || lines.length || hasMap),
    sources: {
      email: values["contact.email"] && values["contact.email"].source,
      phone: values["contact.phone"] && values["contact.phone"].source,
      address: values["contact.address_line_1"] && values["contact.address_line_1"].source,
    },
  };
}

/**
 * @param {{ connect?: Function, query?: Function }} db
 * @param {{
 *   organizationId: string,
 *   churchId: string,
 *   branchId: string,
 *   churchDisplayName?: string|null,
 *   churchTagline?: string|null,
 *   churchHeroTitle?: string|null,
 *   churchHeroDescription?: string|null,
 *   churchHeroImageUrl?: string|null,
 *   churchHeroPrimaryLabel?: string|null,
 *   churchHeroPrimaryUrl?: string|null,
 *   churchHeroSecondaryLabel?: string|null,
 *   churchHeroSecondaryUrl?: string|null,
 *   churchSeoDescription?: string|null,
 *   churchOgImageUrl?: string|null,
 *   churchSocialLinks?: object[]|null,
 *   settingKeys?: string[],
 * }} input
 */
async function resolveBranchWebsiteSettings(db, input) {
  const organizationId = String((input && input.organizationId) || "").trim();
  const churchId = String((input && input.churchId) || "").trim();
  const branchId = String((input && input.branchId) || "").trim();

  const check = await assertBranchBelongsToOrg(db, {
    organizationId,
    churchId,
    branchId,
  });
  if (!check.ok) {
    return {
      ok: false,
      status: check.status,
      branchId: null,
      branchKey: null,
      values: {},
      flat: {},
      serviceTimes: null,
      governance: null,
    };
  }

  try {
    const branchRow = await loadBranchRow(db, branchId);
    if (!branchRow) {
      return {
        ok: false,
        status: STATUS.NOT_FOUND,
        branchId: null,
        branchKey: null,
        values: {},
        flat: {},
        serviceTimes: null,
        governance: null,
      };
    }

    const gov = await getBranchWebsiteGovernance(db, {
      organizationId,
      churchId,
      branchId,
    });
    const lockedKeys =
      gov.ok && gov.effective ? gov.effective.lockedSettingKeys.slice() : [];
    // Parent church label is never branch-writable.
    if (!lockedKeys.includes("presentation.parent_church_label")) {
      lockedKeys.push("presentation.parent_church_label");
    }
    const hideAllowed =
      gov.ok && gov.effective ? Boolean(gov.effective.allowHideOptionalPages) : false;
    const allowAccent =
      gov.ok && gov.effective ? Boolean(gov.effective.allowAccentTreatment) : false;

    const [churchSettings, branchSettings, activeRows, serviceTimes] = await Promise.all([
      loadChurchSettings(db, churchId),
      loadBranchSettings(db, branchId),
      scopeRepo.listActiveForBranch(db, { churchId, branchId }),
      resolvePublicServiceTimesEntries(db, { churchId, branchId }),
    ]);

    const activeByKey = new Map();
    for (const row of activeRows || []) {
      if (row && row.settingKey) activeByKey.set(row.settingKey, row);
    }

    const ctx = {
      lockedKeys,
      hideAllowed,
      allowAccent,
      activeByKey,
      churchSettings,
      branchSettings,
      branchRow,
      churchDisplayName: input.churchDisplayName || null,
      churchTagline: input.churchTagline || null,
      churchHeroTitle: input.churchHeroTitle || null,
      churchHeroDescription: input.churchHeroDescription || null,
      churchHeroImageUrl: input.churchHeroImageUrl || null,
      churchHeroPrimaryLabel: input.churchHeroPrimaryLabel || null,
      churchHeroPrimaryUrl: input.churchHeroPrimaryUrl || null,
      churchHeroSecondaryLabel: input.churchHeroSecondaryLabel || null,
      churchHeroSecondaryUrl: input.churchHeroSecondaryUrl || null,
      churchSeoDescription: input.churchSeoDescription || null,
      churchOgImageUrl: input.churchOgImageUrl || null,
      churchSocialLinks: input.churchSocialLinks || null,
    };

    const keys =
      Array.isArray(input.settingKeys) && input.settingKeys.length
        ? input.settingKeys.map(registry.normalizeSettingKey).filter(Boolean)
        : registry.STAGE2_SETTING_KEYS.slice();

    const values = {};
    for (const key of keys) {
      if (key === "presentation.accent_key" && !allowAccent) {
        values[key] = resolvedField("none", SOURCE.PLATFORM_FALLBACK, {
          locked: true,
          resettable: false,
        });
        continue;
      }
      values[key] = resolveOneKey(key, ctx);
    }

    let serviceTimesMeta = {
      entries: [],
      source: SOURCE.MISSING,
      inherited: false,
    };
    if (serviceTimes && serviceTimes.ok && serviceTimes.entries && serviceTimes.entries.length) {
      const src =
        serviceTimes.source === "branch"
          ? SOURCE.BRANCH_OVERRIDE
          : serviceTimes.source === "church"
            ? SOURCE.CHURCH_DEFAULT
            : serviceTimes.source === "primary_fallback"
              ? SOURCE.PRIMARY_BRANCH_FALLBACK
              : SOURCE.MISSING;
      serviceTimesMeta = {
        entries: serviceTimes.entries,
        source: src,
        inherited: src === SOURCE.CHURCH_DEFAULT || src === SOURCE.PRIMARY_BRANCH_FALLBACK,
      };
    }

    const coords =
      branchSettings &&
      branchSettings.latitude != null &&
      branchSettings.longitude != null
        ? {
            latitude: Number(branchSettings.latitude),
            longitude: Number(branchSettings.longitude),
          }
        : null;

    return {
      ok: true,
      status: STATUS.OK,
      branchId: String(branchRow.id),
      branchKey: String(branchRow.branch_key || ""),
      branchStatus: String(branchRow.status || ""),
      isPrimary: Boolean(branchRow.is_primary),
      values,
      flat: flattenValues(values),
      contact: buildContactFromResolved(values, coords),
      serviceTimes: serviceTimesMeta,
      governance: gov.ok ? gov.effective : null,
      parentChurchLabel:
        (values["presentation.parent_church_label"] &&
          values["presentation.parent_church_label"].value) ||
        input.churchDisplayName ||
        null,
    };
  } catch {
    return {
      ok: false,
      status: STATUS.LOOKUP_ERROR,
      branchId: null,
      branchKey: null,
      values: {},
      flat: {},
      serviceTimes: null,
      governance: null,
    };
  }
}

/**
 * Church-wide service times with primary fallback source labeling.
 * @param {{ connect?: Function, query?: Function }} db
 * @param {{ churchId: string, primaryBranchId: string }} input
 */
async function resolveChurchWideServiceTimes(db, input) {
  const churchId = String((input && input.churchId) || "").trim();
  const primaryBranchId = String((input && input.primaryBranchId) || "").trim();
  let resolved = await resolvePublicServiceTimesEntries(db, {
    churchId,
    branchId: null,
  });
  if (resolved && resolved.ok && resolved.entries && resolved.entries.length) {
    return {
      entries: resolved.entries,
      source: SOURCE.CHURCH_DEFAULT,
      inherited: false,
    };
  }
  if (primaryBranchId) {
    resolved = await resolvePublicServiceTimesEntries(db, {
      churchId,
      branchId: primaryBranchId,
    });
    if (resolved && resolved.ok && resolved.entries && resolved.entries.length) {
      return {
        entries: resolved.entries,
        source: SOURCE.PRIMARY_BRANCH_FALLBACK,
        inherited: true,
      };
    }
  }
  return { entries: [], source: SOURCE.MISSING, inherited: false };
}

module.exports = {
  STATUS,
  SOURCE,
  resolveBranchWebsiteSettings,
  resolveChurchWideServiceTimes,
  flattenValues,
  buildContactFromResolved,
  pickFirstNonEmpty,
  resolvedField,
};
