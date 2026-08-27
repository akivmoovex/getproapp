"use strict";

/**
 * Prompt 7 Stage 3 — field view-models for the branch website settings editor.
 */

const { SOURCE } = require("./resolveBranchWebsiteSettings");
const registry = require("./websiteSettingKeyRegistry");

const STATE_LABELS = Object.freeze({
  inherited: "Inherited from church",
  branch_record: "Using branch information",
  overridden: "Overridden for this branch",
  hidden: "Hidden on branch website",
  locked: "Locked by HQ policy",
  missing: "No value available",
  platform: "Platform default",
});

const EDITOR_SECTIONS = Object.freeze([
  {
    id: "identity",
    title: "Identity",
    keys: [
      "identity.branch_display_name",
      "identity.tagline",
      "identity.hero_title",
      "identity.hero_description",
      "identity.hero_image_url",
      "identity.hero_primary_action_label",
      "identity.hero_primary_action_url",
      "identity.hero_secondary_action_label",
      "identity.hero_secondary_action_url",
    ],
  },
  {
    id: "contact",
    title: "Contact",
    keys: [
      "contact.phone",
      "contact.email",
      "contact.address_line_1",
      "contact.address_line_2",
      "contact.city",
      "contact.province",
      "contact.country",
      "contact.postal_code",
      "contact.map_url",
      "contact.directions_text",
    ],
  },
  {
    id: "social",
    title: "Social links",
    keys: ["social.links"],
  },
  {
    id: "seo",
    title: "SEO",
    keys: [
      "seo.title",
      "seo.description",
      "seo.og_title",
      "seo.og_description",
      "seo.og_image_url",
      "seo.canonical_url",
      "seo.robots",
      "seo.sitemap_include",
      "seo.noindex",
    ],
  },
  {
    id: "presentation",
    title: "Presentation",
    keys: [
      "presentation.branch_display_label",
      "presentation.parent_church_label",
      "presentation.branch_selector_label",
      "presentation.accent_key",
    ],
  },
]);

/**
 * @param {string} source
 * @param {boolean} locked
 * @param {boolean} hidden
 */
function classifyEditorState(source, locked, hidden) {
  if (locked) return "locked";
  if (hidden || source === SOURCE.HIDDEN) return "hidden";
  if (source === SOURCE.BRANCH_OVERRIDE) return "overridden";
  if (source === SOURCE.BRANCH_RECORD) return "branch_record";
  if (source === SOURCE.CHURCH_DEFAULT) return "inherited";
  if (source === SOURCE.PLATFORM_FALLBACK) return "platform";
  if (source === SOURCE.PRIMARY_BRANCH_FALLBACK) return "inherited";
  return "missing";
}

/**
 * @param {*} value
 */
function displayValue(value) {
  if (value == null || value === "") return "";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (!item || typeof item !== "object") return String(item);
        return `${item.platform || "link"}: ${item.href || ""}`;
      })
      .join("; ");
  }
  return String(value);
}

/**
 * @param {string} key
 * @param {object} meta
 * @param {{ parentChurchLabel?: string|null, allowHide?: boolean, allowAccent?: boolean }} ctx
 */
function buildFieldViewModel(key, meta, ctx) {
  const def = registry.getKeyDef(key) || {};
  const source = (meta && meta.source) || SOURCE.MISSING;
  const locked = Boolean(meta && meta.locked) || Boolean(def.readOnly);
  const hidden = Boolean(meta && meta.hidden) || source === SOURCE.HIDDEN;
  const state = classifyEditorState(source, locked, hidden);
  const value = meta && Object.prototype.hasOwnProperty.call(meta, "value") ? meta.value : null;
  const allowHide = Boolean(ctx.allowHide) && def.hideable !== false && !locked;
  const hqOnly = Boolean(def.hqOnly);

  let detail = "";
  if (state === "inherited") {
    detail = ctx.parentChurchLabel
      ? `Inherited from church: ${ctx.parentChurchLabel}`
      : "Inherited from church";
  } else if (state === "branch_record") {
    detail = value != null && value !== "" ? `Using branch value: ${displayValue(value)}` : "Using branch information";
  } else if (state === "overridden") {
    detail = "This branch has a website override";
  } else if (state === "hidden") {
    detail = "Hidden on this branch website";
  } else if (state === "locked") {
    detail = def.readOnly
      ? "Controlled by HQ policy — parent church identity cannot be renamed here"
      : "Controlled by HQ policy";
  } else if (state === "platform") {
    detail = "Using platform default";
  } else {
    detail = "No value available yet";
  }

  const canOverride =
    !locked &&
    state !== "locked" &&
    !(hqOnly && !ctx.allowGovernanceControlled) &&
    !(key === "presentation.accent_key" && !ctx.allowAccent);
  const canReset = !locked && (state === "overridden" || state === "hidden");
  const canHide = allowHide && (state === "inherited" || state === "branch_record" || state === "overridden" || state === "platform" || state === "missing");
  const canRestore = !locked && state === "hidden";

  return {
    key,
    label: def.description || key,
    type: def.type || "short_text",
    maxLen: def.maxLen || 200,
    enumValues: def.enumValues || null,
    state,
    stateLabel: STATE_LABELS[state] || STATE_LABELS.missing,
    detail,
    source,
    value,
    display: displayValue(value),
    inputValue: value == null || Array.isArray(value) || typeof value === "object" ? "" : String(value),
    locked,
    canOverride,
    canReset,
    canHide,
    canRestore,
    showBranchRecordLink: state === "branch_record" && key.startsWith("contact."),
  };
}

/**
 * @param {object} resolved — resolveBranchWebsiteSettings result
 * @param {object} options
 */
function buildEditorViewModel(resolved, options) {
  const opts = options || {};
  const values = (resolved && resolved.values) || {};
  const ctx = {
    parentChurchLabel: (resolved && resolved.parentChurchLabel) || opts.parentChurchLabel || null,
    allowHide: Boolean(resolved && resolved.governance && resolved.governance.allowHideOptionalPages),
    allowAccent: Boolean(resolved && resolved.governance && resolved.governance.allowAccentTreatment),
    allowGovernanceControlled: opts.allowGovernanceControlled !== false,
  };

  const sections = EDITOR_SECTIONS.map((section) => ({
    id: section.id,
    title: section.title,
    fields: section.keys.map((key) => buildFieldViewModel(key, values[key], ctx)),
  }));

  const serviceTimes = resolved && resolved.serviceTimes ? resolved.serviceTimes : null;
  let serviceTimesState = "missing";
  let serviceTimesLabel = STATE_LABELS.missing;
  let serviceTimesDetail = "No service times available";
  if (serviceTimes && serviceTimes.entries && serviceTimes.entries.length) {
    if (serviceTimes.source === SOURCE.BRANCH_OVERRIDE) {
      serviceTimesState = "overridden";
      serviceTimesLabel = "Branch-local service times";
      serviceTimesDetail =
        "These times are owned by this branch. Visitors no longer see the church-wide fallback.";
    } else if (serviceTimes.source === SOURCE.CHURCH_DEFAULT) {
      serviceTimesState = "inherited";
      serviceTimesLabel = STATE_LABELS.inherited;
      serviceTimesDetail = ctx.parentChurchLabel
        ? `Showing church-wide times from ${ctx.parentChurchLabel} until this branch adds its own.`
        : "Showing church-wide service times until this branch adds its own.";
    } else if (serviceTimes.source === SOURCE.PRIMARY_BRANCH_FALLBACK) {
      serviceTimesState = "inherited";
      serviceTimesLabel = "Using primary branch fallback";
      serviceTimesDetail = "Church-wide times are empty; primary branch times are shown as fallback.";
    }
  }

  return {
    sections,
    serviceTimes: {
      state: serviceTimesState,
      stateLabel: serviceTimesLabel,
      detail: serviceTimesDetail,
      source: serviceTimes && serviceTimes.source,
      entries: (serviceTimes && serviceTimes.entries) || [],
      hasBranchLocal: serviceTimes && serviceTimes.source === SOURCE.BRANCH_OVERRIDE,
      inherited: Boolean(serviceTimes && serviceTimes.inherited),
    },
    governance: resolved && resolved.governance ? resolved.governance : null,
    stateLabels: STATE_LABELS,
  };
}

module.exports = {
  STATE_LABELS,
  EDITOR_SECTIONS,
  classifyEditorState,
  displayValue,
  buildFieldViewModel,
  buildEditorViewModel,
};
