"use strict";

/**
 * Foundation package quota warning copy (80% / 90% / 100%).
 * Wording lives here only — partials and routes render structured objects.
 *
 * Applies to members, administrators/leadership, storage, and external emails.
 * Fair-use / unlimited meters (Growth) produce no warnings.
 * Does not enforce quotas.
 */

const QUOTA_METER_DEFS = Object.freeze({
  members: {
    entitlementKey: "members.max_active",
    subject: "Active members",
    restrictedAction: "Verifying or activating additional members",
    archiveGuidance: "Archive or suspend members you no longer need",
  },
  admins: {
    entitlementKey: "admins.max",
    subject: "Administrator and leadership accounts",
    restrictedAction: "Adding administrator or leadership accounts",
    archiveGuidance: "Deactivate unused administrator or leadership accounts",
  },
  storage: {
    entitlementKey: "storage.bytes",
    subject: "Storage",
    restrictedAction: "Uploading new attachments",
    archiveGuidance: "Delete unused files or attachments",
  },
  externalEmails: {
    entitlementKey: "external_emails.monthly",
    subject: "External emails this month",
    restrictedAction: "Sending additional external emails this month",
    archiveGuidance: "Wait for next month’s allowance or reduce non-essential sends",
  },
});

const WARNING_METER_KEYS = Object.freeze(Object.keys(QUOTA_METER_DEFS));

function alertClassForBand(band) {
  if (band >= 100) return "church-alert--warning";
  if (band >= 90) return "church-alert--warning";
  return "church-alert--info";
}

function roleForBand(band) {
  return band >= 100 ? "alert" : "status";
}

/**
 * @param {object} meter - quotaToMeter result (used, limit, warningBand, status, display)
 * @param {{ packageCode?: string, packageLabel?: string, meterKey: string }} ctx
 * @returns {object | null}
 */
function buildQuotaWarning(meter, ctx) {
  if (!meter || !ctx || !ctx.meterKey) return null;
  const def = QUOTA_METER_DEFS[ctx.meterKey];
  if (!def) return null;

  // Growth fair-use / unlimited — no Foundation-style warnings.
  if (meter.limit == null || meter.limit === "fair_use") return null;
  if (typeof meter.limit !== "number" || !(meter.limit > 0)) return null;

  let band = meter.warningBand;
  if (band == null) {
    if (meter.status === "exceeded" || meter.status === "at_limit") band = 100;
    else if (meter.status === "warn_90") band = 90;
    else if (meter.status === "near" || meter.status === "warn_80") band = 80;
  }
  if (band == null || band < 80) return null;

  const packageLabel = ctx.packageLabel || "Foundation";
  const usageLabel = meter.display || `${meter.used} / ${meter.limit}`;
  const upgradeHint = `Growth uses fair-use capacity for this meter.`;

  if (band >= 100) {
    const legacyOver = meter.status === "exceeded" || meter.used > meter.limit;
    return {
      key: def.entitlementKey,
      meterKey: ctx.meterKey,
      band: 100,
      level: "limit",
      alertClass: alertClassForBand(100),
      role: roleForBand(100),
      title: `${def.subject} at package limit`,
      message: legacyOver
        ? `${def.subject} are over the ${packageLabel} limit (${usageLabel}). ${def.restrictedAction} is restricted.`
        : `${def.restrictedAction} is restricted. ${def.subject} are at the ${packageLabel} limit (${usageLabel}).`,
      existingDataNote: "Existing data remains available.",
      guidance: `${def.archiveGuidance}, or upgrade to Growth.`,
      restrictedAction: def.restrictedAction,
      upgradeHint,
      display: usageLabel,
    };
  }

  if (band >= 90) {
    return {
      key: def.entitlementKey,
      meterKey: ctx.meterKey,
      band: 90,
      level: "strong",
      alertClass: alertClassForBand(90),
      role: roleForBand(90),
      title: `${def.subject} nearing limit`,
      message: `${def.subject} are at 90% of the ${packageLabel} limit (${usageLabel}).`,
      existingDataNote: null,
      guidance: `${def.archiveGuidance} before you reach capacity.`,
      restrictedAction: null,
      upgradeHint: null,
      display: usageLabel,
    };
  }

  return {
    key: def.entitlementKey,
    meterKey: ctx.meterKey,
    band: 80,
    level: "info",
    alertClass: alertClassForBand(80),
    role: roleForBand(80),
    title: `${def.subject} usage notice`,
    message: `${def.subject} are at 80% of the ${packageLabel} limit (${usageLabel}).`,
    existingDataNote: null,
    guidance: null,
    restrictedAction: null,
    upgradeHint: null,
    display: usageLabel,
  };
}

/**
 * @param {object} meters - snapshot.meters
 * @param {{ packageCode?: string, packageLabel?: string, meterKeys?: string[] }} [opts]
 * @returns {object[]}
 */
function buildQuotaWarningsFromMeters(meters, opts = {}) {
  if (!meters || typeof meters !== "object") return [];
  const keys = Array.isArray(opts.meterKeys) && opts.meterKeys.length ? opts.meterKeys : WARNING_METER_KEYS;
  const out = [];
  for (const meterKey of keys) {
    const warning = buildQuotaWarning(meters[meterKey], {
      meterKey,
      packageCode: opts.packageCode,
      packageLabel: opts.packageLabel,
    });
    if (warning) out.push(warning);
  }
  // Strongest first for list pages.
  out.sort((a, b) => b.band - a.band);
  return out;
}

/**
 * @param {object | null} snapshot - getOrganisationUsageSnapshot result
 * @param {{ meterKeys?: string[] }} [opts]
 */
function buildQuotaWarningsFromSnapshot(snapshot, opts = {}) {
  if (!snapshot || !snapshot.meters) return [];
  return buildQuotaWarningsFromMeters(snapshot.meters, {
    packageCode: snapshot.packageCode,
    packageLabel: snapshot.packageLabel,
    meterKeys: opts.meterKeys,
  });
}

/**
 * Single-line hard-limit failure copy for action responses (members/admins/storage/email).
 * @param {'members'|'admins'|'storage'|'externalEmails'} meterKey
 * @param {{ packageLabel?: string, used?: number, limit?: number, display?: string }} [opts]
 */
function formatHardLimitFailureMessage(meterKey, opts = {}) {
  const def = QUOTA_METER_DEFS[meterKey];
  if (!def) return "Package limit reached.";
  const packageLabel = opts.packageLabel || "Foundation";
  const usageLabel =
    opts.display ||
    (opts.used != null && opts.limit != null ? `${opts.used} / ${opts.limit}` : null);
  const usagePart = usageLabel ? ` (${usageLabel})` : "";
  return (
    `${def.restrictedAction} is restricted. ${def.subject} are at the ${packageLabel} limit${usagePart}. ` +
    `Existing data remains available. ${def.archiveGuidance}, or upgrade to Growth.`
  );
}

/**
 * Filter warnings for a relevant admin surface (list/action page).
 * @param {object[]} warnings
 * @param {string[]} meterKeys
 */
function filterQuotaWarnings(warnings, meterKeys) {
  const set = new Set(meterKeys || []);
  return (warnings || []).filter((w) => set.has(w.meterKey));
}

module.exports = {
  QUOTA_METER_DEFS,
  WARNING_METER_KEYS,
  buildQuotaWarning,
  buildQuotaWarningsFromMeters,
  buildQuotaWarningsFromSnapshot,
  formatHardLimitFailureMessage,
  filterQuotaWarnings,
  alertClassForBand,
};
