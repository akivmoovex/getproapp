"use strict";

/**
 * Pilot feature flags — platform defaults + tenant overrides.
 * Availability = package entitlement (or mode check) AND effective pilot flag.
 * Does not replace entitlements.
 */

const {
  getPilotFlagDefinition,
  listPilotFlagDefinitions,
  PACKAGE_FEATURE_TO_PILOT_FLAG,
  PILOT_FLAGS_BY_KEY,
} = require("../../church/blessBoardPilotFeatureFlags");
const { hasEntitlement, getOrganisationPlan } = require("./churchEntitlementService");
const { resolvePackageFromPlanCode } = require("../../church/blessBoardPackageCatalogue");
const organizationsRepo = require("../../db/pg/church/organizationsRepo");
const auditLogsRepo = require("../../db/pg/church/auditLogsRepo");

const PILOT_FEATURE_DENIED = "PILOT_FEATURE_DENIED";

function asDate(value) {
  if (value == null || value === "") return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function inWindow(row, at) {
  if (!row) return false;
  const t = at.getTime();
  const start = asDate(row.starts_at || row.startsAt);
  const end = asDate(row.ends_at || row.endsAt);
  if (start && t < start.getTime()) return false;
  if (end && t > end.getTime()) return false;
  return true;
}

function isExpired(row, at) {
  if (!row) return false;
  const end = asDate(row.ends_at || row.endsAt);
  return Boolean(end && at.getTime() > end.getTime());
}

function mapFlagRow(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    flagKey: row.flag_key,
    organizationId: row.organization_id != null ? Number(row.organization_id) : null,
    enabled: Boolean(row.enabled),
    startsAt: row.starts_at ? new Date(row.starts_at).toISOString() : null,
    endsAt: row.ends_at ? new Date(row.ends_at).toISOString() : null,
    reason: row.reason || null,
    approverLabel: row.approver_label || null,
    approverActorId: row.approver_actor_id != null ? Number(row.approver_actor_id) : null,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
    updatedByActorId: row.updated_by_actor_id != null ? Number(row.updated_by_actor_id) : null,
  };
}

/**
 * Resolve whether the pilot flag itself allows the feature (ignores entitlements).
 * Missing DB data → catalogue.defaultEnabled (safe, non-breaking fallback).
 */
async function resolvePilotFlag(pool, opts = {}) {
  const flagKey = String(opts.flagKey || "").trim();
  const def = getPilotFlagDefinition(flagKey);
  const at = opts.at instanceof Date ? opts.at : new Date();
  const organizationId =
    opts.organizationId != null ? Number(opts.organizationId) : null;

  if (!def) {
    return {
      flagKey,
      known: false,
      flagAllows: false,
      source: "unknown_flag",
      enabled: false,
      expired: false,
      reason: "Unknown pilot flag.",
      definition: null,
      platform: null,
      tenant: null,
      at: at.toISOString(),
    };
  }

  let platform = null;
  let tenant = null;
  try {
    if (pool && typeof pool.query === "function") {
      const p = await pool.query(
        `SELECT * FROM public.church_pilot_feature_flag_platform_defaults
         WHERE flag_key = $1 LIMIT 1`,
        [flagKey]
      );
      platform = mapFlagRow(p.rows[0] || null);
      if (organizationId) {
        const t = await pool.query(
          `SELECT * FROM public.church_pilot_feature_flag_tenant_overrides
           WHERE organization_id = $1 AND flag_key = $2 LIMIT 1`,
          [organizationId, flagKey]
        );
        tenant = mapFlagRow(t.rows[0] || null);
      }
    }
  } catch {
    // Table missing / DB error → catalogue fallback (safe).
    return {
      flagKey,
      known: true,
      flagAllows: Boolean(def.defaultEnabled),
      source: "catalogue_fallback",
      enabled: Boolean(def.defaultEnabled),
      expired: false,
      reason: "Pilot flag store unavailable; using catalogue default.",
      definition: def,
      platform: null,
      tenant: null,
      at: at.toISOString(),
    };
  }

  // Tenant override wins when present and in window (or expired → deny).
  if (tenant) {
    if (isExpired(tenant, at)) {
      return {
        flagKey,
        known: true,
        flagAllows: false,
        source: "tenant_expired",
        enabled: false,
        expired: true,
        reason: tenant.reason || "Tenant pilot flag expired.",
        definition: def,
        platform,
        tenant,
        at: at.toISOString(),
      };
    }
    if (!inWindow(tenant, at)) {
      return {
        flagKey,
        known: true,
        flagAllows: false,
        source: "tenant_not_started",
        enabled: false,
        expired: false,
        reason: tenant.reason || "Tenant pilot flag not yet active.",
        definition: def,
        platform,
        tenant,
        at: at.toISOString(),
      };
    }
    return {
      flagKey,
      known: true,
      flagAllows: Boolean(tenant.enabled),
      source: "tenant_override",
      enabled: Boolean(tenant.enabled),
      expired: false,
      reason: tenant.reason || null,
      definition: def,
      platform,
      tenant,
      at: at.toISOString(),
    };
  }

  if (platform) {
    if (isExpired(platform, at)) {
      return {
        flagKey,
        known: true,
        flagAllows: false,
        source: "platform_expired",
        enabled: false,
        expired: true,
        reason: platform.reason || "Platform pilot flag expired.",
        definition: def,
        platform,
        tenant: null,
        at: at.toISOString(),
      };
    }
    if (!inWindow(platform, at)) {
      return {
        flagKey,
        known: true,
        flagAllows: false,
        source: "platform_not_started",
        enabled: false,
        expired: false,
        reason: platform.reason || "Platform pilot flag not yet active.",
        definition: def,
        platform,
        tenant: null,
        at: at.toISOString(),
      };
    }
    return {
      flagKey,
      known: true,
      flagAllows: Boolean(platform.enabled),
      source: "platform_default",
      enabled: Boolean(platform.enabled),
      expired: false,
      reason: platform.reason || null,
      definition: def,
      platform,
      tenant: null,
      at: at.toISOString(),
    };
  }

  // Missing rows → catalogue default
  return {
    flagKey,
    known: true,
    flagAllows: Boolean(def.defaultEnabled),
    source: "catalogue_default",
    enabled: Boolean(def.defaultEnabled),
    expired: false,
    reason: null,
    definition: def,
    platform: null,
    tenant: null,
    at: at.toISOString(),
  };
}

async function entitlementAllows(pool, def, organizationId, plan, at) {
  const mode = def.entitlementMode || "entitlement";
  if (mode === "platform_action") {
    return { ok: true, reason: null };
  }
  if (mode === "any_active_org") {
    if (!organizationId) return { ok: false, reason: "Organisation required." };
    return { ok: true, reason: null };
  }

  let resolvedPlan = plan;
  if (!resolvedPlan && pool && organizationId) {
    resolvedPlan = await getOrganisationPlan(pool, organizationId);
  }
  const packageCode =
    (resolvedPlan && resolvedPlan.packageCode) ||
    (resolvedPlan && resolvedPlan.plan_code
      ? resolvePackageFromPlanCode(resolvedPlan.plan_code).packageCode
      : null);

  if (mode === "growth_package") {
    const ok = packageCode === "growth";
    return {
      ok,
      reason: ok ? null : "Requires Growth package.",
      plan: resolvedPlan,
      packageCode: packageCode || "foundation",
    };
  }
  if (mode === "foundation_package") {
    // Dormancy is Foundation-only; Growth (incl. trial) is excluded by dormancy service.
    let isGrowth = packageCode === "growth";
    if (!isGrowth && pool && organizationId) {
      try {
        const churchGrowthTrialService = require("./churchGrowthTrialService");
        const trial = await churchGrowthTrialService.findActiveGrowthTrial(pool, organizationId, {
          at,
        });
        if (trial) isGrowth = true;
      } catch {
        /* ignore */
      }
    }
    const ok = !isGrowth;
    return {
      ok,
      reason: ok ? null : "Dormancy automation applies to Foundation organisations only.",
      plan: resolvedPlan,
      packageCode: isGrowth ? "growth" : packageCode || "foundation",
    };
  }

  // entitlement mode
  if (!def.entitlementKey) {
    return { ok: false, reason: "Pilot flag misconfigured (missing entitlement key)." };
  }
  const ok = hasEntitlement(resolvedPlan, def.entitlementKey);
  return {
    ok,
    reason: ok ? null : `Package entitlement ${def.entitlementKey} is not included.`,
    plan: resolvedPlan,
    packageCode: (resolvedPlan && resolvedPlan.packageCode) || "foundation",
  };
}

/**
 * Combined check: entitlement/mode AND pilot flag.
 */
async function isPilotFeatureAvailable(pool, opts = {}) {
  const flagKey = String(opts.flagKey || "").trim();
  const def = getPilotFlagDefinition(flagKey);
  const at = opts.at instanceof Date ? opts.at : new Date();
  const organizationId =
    opts.organizationId != null ? Number(opts.organizationId) : null;

  if (!def) {
    return {
      available: false,
      flagKey,
      entitlementAllows: false,
      flagAllows: false,
      reason: "Unknown pilot flag.",
      source: "unknown_flag",
      at: at.toISOString(),
    };
  }

  const ent = await entitlementAllows(pool, def, organizationId, opts.plan || null, at);
  const flag = await resolvePilotFlag(pool, {
    organizationId,
    flagKey,
    at,
  });

  const available = Boolean(ent.ok && flag.flagAllows);
  let reason = null;
  if (!ent.ok) reason = ent.reason;
  else if (!flag.flagAllows) {
    reason =
      flag.reason ||
      (flag.expired
        ? "Pilot flag expired."
        : "Pilot feature flag is disabled for this organisation.");
  }

  return {
    available,
    flagKey,
    entitlementAllows: Boolean(ent.ok),
    flagAllows: Boolean(flag.flagAllows),
    reason,
    source: flag.source,
    expired: Boolean(flag.expired),
    definition: def,
    plan: ent.plan || opts.plan || null,
    packageCode: ent.packageCode || null,
    flag,
    at: at.toISOString(),
  };
}

async function assertPilotFeatureAvailable(pool, opts = {}) {
  const result = await isPilotFeatureAvailable(pool, opts);
  if (result.available) return result;
  const err = Object.assign(
    new Error(result.reason || "Pilot feature is not available."),
    {
      code: result.entitlementAllows === false ? "PACKAGE_FEATURE_DENIED" : PILOT_FEATURE_DENIED,
      flagKey: result.flagKey,
      pilot: result,
    }
  );
  throw err;
}

function parseFlagInput(body, opts = {}) {
  const errors = [];
  const enabledRaw = body && body.enabled;
  const enabled =
    enabledRaw === true ||
    enabledRaw === "true" ||
    enabledRaw === "1" ||
    enabledRaw === "on" ||
    enabledRaw === "yes";
  const startsAt = asDate(body && body.starts_at);
  const endsAt = asDate(body && body.ends_at);
  if ((body && body.starts_at) && !startsAt) errors.push("Invalid starts_at.");
  if ((body && body.ends_at) && !endsAt) errors.push("Invalid ends_at.");
  if (startsAt && endsAt && startsAt.getTime() > endsAt.getTime()) {
    errors.push("starts_at must be before ends_at.");
  }
  const reason = String((body && body.reason) || "").trim().slice(0, 2000) || null;
  const approverLabel =
    String((body && body.approver_label) || opts.defaultApprover || "")
      .trim()
      .slice(0, 200) || null;
  if (!approverLabel) errors.push("Approver is required.");
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      enabled,
      startsAt,
      endsAt,
      reason,
      approverLabel,
    },
  };
}

async function insertAudit(pool, entry) {
  await pool.query(
    `INSERT INTO public.church_pilot_feature_flag_audit (
       scope, organization_id, flag_key,
       previous_enabled, new_enabled,
       previous_starts_at, previous_ends_at,
       new_starts_at, new_ends_at,
       reason, approver_label, actor_type, actor_id
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
    [
      entry.scope,
      entry.organizationId || null,
      entry.flagKey,
      entry.previousEnabled,
      entry.newEnabled,
      entry.previousStartsAt,
      entry.previousEndsAt,
      entry.newStartsAt,
      entry.newEndsAt,
      entry.reason,
      entry.approverLabel,
      entry.actorType || "platform_admin",
      entry.actorId || null,
    ]
  );
}

/**
 * Upsert platform default. Duplicate updates overwrite the single row (unique flag_key)
 * and always write an audit row.
 */
async function setPlatformPilotFlag(pool, flagKey, body, actor = {}) {
  const def = getPilotFlagDefinition(flagKey);
  if (!def) {
    const err = new Error("Unknown pilot flag.");
    err.code = "VALIDATION";
    throw err;
  }
  const parsed = parseFlagInput(body, {
    defaultApprover: actor.label || actor.username || null,
  });
  if (!parsed.ok) {
    const err = new Error(parsed.errors.join(" "));
    err.code = "VALIDATION";
    err.errors = parsed.errors;
    throw err;
  }
  const v = parsed.value;
  const existing = await pool.query(
    `SELECT * FROM public.church_pilot_feature_flag_platform_defaults WHERE flag_key = $1 LIMIT 1`,
    [flagKey]
  );
  const prev = existing.rows[0] || null;

  const r = await pool.query(
    `INSERT INTO public.church_pilot_feature_flag_platform_defaults (
       flag_key, enabled, starts_at, ends_at, reason, approver_label, approver_actor_id,
       updated_by_actor_id, updated_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$7,now())
     ON CONFLICT (flag_key) DO UPDATE SET
       enabled = EXCLUDED.enabled,
       starts_at = EXCLUDED.starts_at,
       ends_at = EXCLUDED.ends_at,
       reason = EXCLUDED.reason,
       approver_label = EXCLUDED.approver_label,
       approver_actor_id = EXCLUDED.approver_actor_id,
       updated_by_actor_id = EXCLUDED.updated_by_actor_id,
       updated_at = now()
     RETURNING *`,
    [
      flagKey,
      v.enabled,
      v.startsAt ? v.startsAt.toISOString() : null,
      v.endsAt ? v.endsAt.toISOString() : null,
      v.reason,
      v.approverLabel,
      actor.id != null ? Number(actor.id) : null,
    ]
  );

  await insertAudit(pool, {
    scope: "platform",
    organizationId: null,
    flagKey,
    previousEnabled: prev ? Boolean(prev.enabled) : null,
    newEnabled: v.enabled,
    previousStartsAt: prev && prev.starts_at ? prev.starts_at : null,
    previousEndsAt: prev && prev.ends_at ? prev.ends_at : null,
    newStartsAt: v.startsAt,
    newEndsAt: v.endsAt,
    reason: v.reason,
    approverLabel: v.approverLabel,
    actorType: "platform_admin",
    actorId: actor.id,
  });

  try {
    await auditLogsRepo.insertAuditLog(pool, {
      organization_id: null,
      branch_id: null,
      actor_type: "platform_admin",
      actor_id: actor.id || null,
      action: "platform_pilot_flag_updated",
      entity_type: "pilot_feature_flag",
      entity_id: null,
      target_label: flagKey,
      metadata_json: {
        scope: "platform",
        flag_key: flagKey,
        enabled: v.enabled,
        duplicate_update: Boolean(prev),
      },
    });
  } catch {
    /* ignore */
  }

  return mapFlagRow(r.rows[0]);
}

async function setTenantPilotFlag(pool, organizationId, flagKey, body, actor = {}) {
  const def = getPilotFlagDefinition(flagKey);
  if (!def) {
    const err = new Error("Unknown pilot flag.");
    err.code = "VALIDATION";
    throw err;
  }
  const orgId = Number(organizationId);
  const org = await organizationsRepo.findOrganizationById(pool, orgId);
  if (!org) {
    const err = new Error("Organisation not found.");
    err.code = "NOT_FOUND";
    throw err;
  }
  const parsed = parseFlagInput(body, {
    defaultApprover: actor.label || actor.username || null,
  });
  if (!parsed.ok) {
    const err = new Error(parsed.errors.join(" "));
    err.code = "VALIDATION";
    err.errors = parsed.errors;
    throw err;
  }
  const v = parsed.value;
  const existing = await pool.query(
    `SELECT * FROM public.church_pilot_feature_flag_tenant_overrides
     WHERE organization_id = $1 AND flag_key = $2 LIMIT 1`,
    [orgId, flagKey]
  );
  const prev = existing.rows[0] || null;

  const r = await pool.query(
    `INSERT INTO public.church_pilot_feature_flag_tenant_overrides (
       organization_id, flag_key, enabled, starts_at, ends_at, reason, approver_label,
       approver_actor_id, updated_by_actor_id, updated_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8,now())
     ON CONFLICT (organization_id, flag_key) DO UPDATE SET
       enabled = EXCLUDED.enabled,
       starts_at = EXCLUDED.starts_at,
       ends_at = EXCLUDED.ends_at,
       reason = EXCLUDED.reason,
       approver_label = EXCLUDED.approver_label,
       approver_actor_id = EXCLUDED.approver_actor_id,
       updated_by_actor_id = EXCLUDED.updated_by_actor_id,
       updated_at = now()
     RETURNING *`,
    [
      orgId,
      flagKey,
      v.enabled,
      v.startsAt ? v.startsAt.toISOString() : null,
      v.endsAt ? v.endsAt.toISOString() : null,
      v.reason,
      v.approverLabel,
      actor.id != null ? Number(actor.id) : null,
    ]
  );

  await insertAudit(pool, {
    scope: "tenant",
    organizationId: orgId,
    flagKey,
    previousEnabled: prev ? Boolean(prev.enabled) : null,
    newEnabled: v.enabled,
    previousStartsAt: prev && prev.starts_at ? prev.starts_at : null,
    previousEndsAt: prev && prev.ends_at ? prev.ends_at : null,
    newStartsAt: v.startsAt,
    newEndsAt: v.endsAt,
    reason: v.reason,
    approverLabel: v.approverLabel,
    actorType: "platform_admin",
    actorId: actor.id,
  });

  try {
    await auditLogsRepo.insertAuditLog(pool, {
      organization_id: orgId,
      branch_id: null,
      actor_type: "platform_admin",
      actor_id: actor.id || null,
      action: "platform_pilot_flag_updated",
      entity_type: "pilot_feature_flag",
      entity_id: orgId,
      target_label: flagKey,
      metadata_json: {
        scope: "tenant",
        flag_key: flagKey,
        enabled: v.enabled,
        duplicate_update: Boolean(prev),
      },
    });
  } catch {
    /* ignore */
  }

  return mapFlagRow(r.rows[0]);
}

async function listPilotFlagAudit(pool, opts = {}) {
  const limit = Math.min(Math.max(Number(opts.limit) || 40, 1), 100);
  const params = [];
  const where = [];
  if (opts.flagKey) {
    params.push(String(opts.flagKey));
    where.push(`flag_key = $${params.length}`);
  }
  if (opts.organizationId != null) {
    params.push(Number(opts.organizationId));
    where.push(`organization_id = $${params.length}`);
  }
  params.push(limit);
  const r = await pool.query(
    `SELECT * FROM public.church_pilot_feature_flag_audit
     ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     ORDER BY created_at DESC, id DESC
     LIMIT $${params.length}`,
    params
  );
  return r.rows;
}

async function listEffectiveFlagsForOrganisation(pool, organizationId, opts = {}) {
  const at = opts.at instanceof Date ? opts.at : new Date();
  const plan = opts.plan || (await getOrganisationPlan(pool, organizationId));
  const out = [];
  for (const def of listPilotFlagDefinitions()) {
    const availability = await isPilotFeatureAvailable(pool, {
      organizationId,
      flagKey: def.key,
      plan,
      at,
    });
    out.push(availability);
  }
  return out;
}

/**
 * Mark expired tenant/platform rows in audit when automatic expiry is observed.
 * Resolution already denies expired flags; this records housekeeping.
 */
async function processExpiredPilotFlags(pool, opts = {}) {
  const at = opts.at instanceof Date ? opts.at : new Date();
  const limit = Math.min(Math.max(Number(opts.limit) || 50, 1), 200);
  const expiredTenant = await pool.query(
    `SELECT * FROM public.church_pilot_feature_flag_tenant_overrides
     WHERE enabled = true AND ends_at IS NOT NULL AND ends_at < $1
     ORDER BY ends_at ASC
     LIMIT $2`,
    [at.toISOString(), limit]
  );
  const expiredPlatform = await pool.query(
    `SELECT * FROM public.church_pilot_feature_flag_platform_defaults
     WHERE enabled = true AND ends_at IS NOT NULL AND ends_at < $1
     ORDER BY ends_at ASC
     LIMIT $2`,
    [at.toISOString(), limit]
  );

  const processed = [];
  for (const row of expiredTenant.rows) {
    await pool.query(
      `UPDATE public.church_pilot_feature_flag_tenant_overrides
       SET enabled = false, updated_at = now(), reason = COALESCE(reason, '') || CASE
         WHEN reason IS NULL OR reason = '' THEN 'Auto-expired.'
         WHEN reason LIKE '%Auto-expired.%' THEN ''
         ELSE ' Auto-expired.'
       END
       WHERE id = $1 AND enabled = true`,
      [row.id]
    );
    await insertAudit(pool, {
      scope: "tenant",
      organizationId: row.organization_id,
      flagKey: row.flag_key,
      previousEnabled: true,
      newEnabled: false,
      previousStartsAt: row.starts_at,
      previousEndsAt: row.ends_at,
      newStartsAt: row.starts_at,
      newEndsAt: row.ends_at,
      reason: "Automatic expiry",
      approverLabel: "system",
      actorType: "system",
      actorId: null,
    });
    processed.push({
      scope: "tenant",
      organizationId: row.organization_id,
      flagKey: row.flag_key,
    });
  }
  for (const row of expiredPlatform.rows) {
    await pool.query(
      `UPDATE public.church_pilot_feature_flag_platform_defaults
       SET enabled = false, updated_at = now(), reason = COALESCE(reason, '') || CASE
         WHEN reason IS NULL OR reason = '' THEN 'Auto-expired.'
         WHEN reason LIKE '%Auto-expired.%' THEN ''
         ELSE ' Auto-expired.'
       END
       WHERE id = $1 AND enabled = true`,
      [row.id]
    );
    await insertAudit(pool, {
      scope: "platform",
      organizationId: null,
      flagKey: row.flag_key,
      previousEnabled: true,
      newEnabled: false,
      previousStartsAt: row.starts_at,
      previousEndsAt: row.ends_at,
      newStartsAt: row.starts_at,
      newEndsAt: row.ends_at,
      reason: "Automatic expiry",
      approverLabel: "system",
      actorType: "system",
      actorId: null,
    });
    processed.push({ scope: "platform", organizationId: null, flagKey: row.flag_key });
  }
  return { at: at.toISOString(), processed, count: processed.length };
}

module.exports = {
  PILOT_FEATURE_DENIED,
  PACKAGE_FEATURE_TO_PILOT_FLAG,
  PILOT_FLAGS_BY_KEY,
  getPilotFlagDefinition,
  listPilotFlagDefinitions,
  resolvePilotFlag,
  isPilotFeatureAvailable,
  assertPilotFeatureAvailable,
  setPlatformPilotFlag,
  setTenantPilotFlag,
  listPilotFlagAudit,
  listEffectiveFlagsForOrganisation,
  processExpiredPilotFlags,
  parseFlagInput,
};
