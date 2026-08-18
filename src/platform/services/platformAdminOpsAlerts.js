"use strict";

/**
 * Derived platform-admin operational alerts for registration / Growth lifecycle.
 *
 * No notification inbox, email, SMS, Slack, or queue. Alerts are recomputed from
 * canonical application, subscription, and audit rows. Stable alertKey values make
 * repeated reads and job runs idempotent (same underlying state → same keys).
 */

const STATUS = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  LOOKUP_ERROR: "lookup_error",
});

const EVENT_TYPES = Object.freeze({
  FOUNDATION_COMPLETED: "foundation_registration_completed",
  GROWTH_TRIAL_STARTED: "growth_trial_started",
  GROWTH_TRIAL_ENDING: "growth_trial_ending_soon",
  GROWTH_ENTERED_GRACE: "growth_entered_grace",
  GROWTH_DOWNGRADED: "growth_downgraded_to_foundation",
  NETWORK_CONTACT: "network_contact_request_submitted",
  REGISTRATION_REVIEW: "registration_requires_review",
  PROVISIONING_FAILED: "provisioning_failed",
  TRIAL_EXPIRY_FAILURES: "trial_expiry_processing_failures",
});

const SEVERITY = Object.freeze({
  CRITICAL: "critical",
  WARN: "warn",
  INFO: "info",
});

const SEVERITY_RANK = Object.freeze({
  [SEVERITY.CRITICAL]: 0,
  [SEVERITY.WARN]: 1,
  [SEVERITY.INFO]: 2,
});

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const ALLOWED_LIMITS = Object.freeze([10, 20, 25, 50]);
const RECENT_WINDOW_DAYS = 7;
const TRIAL_FAILURE_REPEAT_THRESHOLD = 2;

const ADMIN_HREF_PREFIX = "/admin/";

/**
 * Only allow relative platform-admin paths (no external or protocol-relative URLs).
 * @param {string} href
 */
function isSafeAdminHref(href) {
  const raw = String(href || "").trim();
  if (!raw.startsWith(ADMIN_HREF_PREFIX)) return false;
  if (raw.includes("://") || raw.startsWith("//")) return false;
  if (/[\s<>"']/.test(raw)) return false;
  return raw.length <= 300;
}

/**
 * @param {unknown} raw
 * @param {number} max
 */
function safeLabel(raw, max = 80) {
  return String(raw == null ? "" : raw)
    .replace(/[\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

/**
 * Strip values that must never appear in alert copy.
 * @param {string} text
 */
function assertNoSensitiveLeak(text) {
  const s = String(text || "");
  if (/password|postgresql:\/\/|session_token|csrf|bearer\s+[a-z0-9._-]+/i.test(s)) {
    return "[redacted]";
  }
  return s;
}

/**
 * @param {object} input
 */
function normalizeAlertListInput(input) {
  const raw = input && typeof input === "object" ? input : {};
  let page = Number.parseInt(String(raw.page != null ? raw.page : "1"), 10);
  if (!Number.isFinite(page) || page < 1) page = 1;
  if (page > 1000) page = 1000;

  let limit = Number.parseInt(String(raw.limit != null ? raw.limit : String(DEFAULT_LIMIT)), 10);
  if (!Number.isFinite(limit) || limit < 1) limit = DEFAULT_LIMIT;
  if (limit > MAX_LIMIT) limit = MAX_LIMIT;
  else if (!ALLOWED_LIMITS.includes(limit)) {
    let best = ALLOWED_LIMITS[0];
    let bestDist = Math.abs(limit - best);
    for (const allowed of ALLOWED_LIMITS) {
      const dist = Math.abs(limit - allowed);
      if (dist < bestDist) {
        best = allowed;
        bestDist = dist;
      }
    }
    limit = best;
  }

  return { page, limit };
}

/**
 * @param {object} row
 * @returns {object|null}
 */
function mapAlert(row) {
  if (!row || !row.alertKey || !row.eventType || !row.href) return null;
  const href = String(row.href);
  if (!isSafeAdminHref(href)) return null;
  return {
    alertKey: String(row.alertKey).slice(0, 160),
    eventType: String(row.eventType),
    severity: row.severity || SEVERITY.INFO,
    title: assertNoSensitiveLeak(safeLabel(row.title, 120)),
    summary: assertNoSensitiveLeak(safeLabel(row.summary, 200)),
    href,
    occurredAt: row.occurredAt || null,
    entityLabel: row.entityLabel ? safeLabel(row.entityLabel, 64) : null,
  };
}

/**
 * Collect candidate alerts from canonical tables (bounded per source).
 * @param {{ query: Function }} db
 * @param {{ perSourceLimit?: number }} [opts]
 */
async function collectRegistrationOpsAlertCandidates(db, opts = {}) {
  const perSource = Math.min(Math.max(Number(opts.perSourceLimit) || 40, 5), 80);
  const windowDays = RECENT_WINDOW_DAYS;

  const [
    foundation,
    trialStarted,
    trialEnding,
    inGrace,
    downgraded,
    network,
    review,
    failed,
    expiryFailures,
  ] = await Promise.all([
    db.query(
      `SELECT a.id AS application_id,
              a.church_name,
              o.organization_key,
              COALESCE(a.provisioned_at, a.updated_at) AS occurred_at
         FROM blessboard.platform_church_registration_applications a
         LEFT JOIN platform.organizations o ON o.id = a.organization_id
        WHERE a.selected_plan = 'foundation'
          AND a.provisioning_status = 'provisioned'
          AND a.organization_id IS NOT NULL
          AND COALESCE(a.provisioned_at, a.updated_at) >= now() - ($1::int * interval '1 day')
        ORDER BY COALESCE(a.provisioned_at, a.updated_at) DESC
        LIMIT $2`,
      [windowDays, perSource]
    ),
    db.query(
      `SELECT os.id AS subscription_id,
              o.organization_key,
              o.display_name,
              os.starts_at AS occurred_at,
              os.ends_at
         FROM platform.organization_subscriptions os
         INNER JOIN platform.plans pl ON pl.id = os.plan_id
         INNER JOIN platform.organizations o ON o.id = os.organization_id
        WHERE os.product_key = 'blessboard'
          AND pl.plan_key = 'growth'
          AND os.status = 'trialing'
          AND os.starts_at <= now()
          AND (os.ends_at IS NULL OR os.ends_at > now())
          AND os.starts_at >= now() - ($1::int * interval '1 day')
        ORDER BY os.starts_at DESC
        LIMIT $2`,
      [windowDays, perSource]
    ),
    db.query(
      `SELECT os.id AS subscription_id,
              o.organization_key,
              o.display_name,
              os.ends_at AS occurred_at
         FROM platform.organization_subscriptions os
         INNER JOIN platform.plans pl ON pl.id = os.plan_id
         INNER JOIN platform.organizations o ON o.id = os.organization_id
        WHERE os.product_key = 'blessboard'
          AND pl.plan_key = 'growth'
          AND os.status = 'trialing'
          AND os.ends_at IS NOT NULL
          AND os.ends_at > now()
          AND os.ends_at <= now() + interval '7 days'
        ORDER BY os.ends_at ASC
        LIMIT $1`,
      [perSource]
    ),
    db.query(
      `SELECT os.id AS subscription_id,
              o.organization_key,
              o.display_name,
              os.ends_at AS occurred_at
         FROM platform.organization_subscriptions os
         INNER JOIN platform.plans pl ON pl.id = os.plan_id
         INNER JOIN platform.organizations o ON o.id = os.organization_id
        WHERE os.product_key = 'blessboard'
          AND pl.plan_key = 'growth'
          AND os.status = 'past_due'
          AND os.starts_at <= now()
          AND os.ends_at IS NOT NULL
          AND os.ends_at > now()
        ORDER BY os.ends_at ASC
        LIMIT $1`,
      [perSource]
    ),
    db.query(
      `SELECT ae.id AS audit_id,
              ae.organization_id,
              o.organization_key,
              o.display_name,
              ae.created_at AS occurred_at
         FROM platform.audit_events ae
         INNER JOIN platform.organizations o ON o.id = ae.organization_id
        WHERE ae.action_key = 'subscription.trial_downgraded_to_foundation'
          AND ae.created_at >= now() - ($1::int * interval '1 day')
        ORDER BY ae.created_at DESC
        LIMIT $2`,
      [windowDays, perSource]
    ),
    db.query(
      `SELECT a.id AS application_id,
              a.church_name,
              a.created_at AS occurred_at
         FROM blessboard.platform_church_registration_applications a
        WHERE a.selected_plan = 'network'
          AND COALESCE(a.support_requested, false) = TRUE
          AND a.organization_id IS NULL
          AND a.application_status IN ('submitted', 'duplicate_review', 'review_required')
        ORDER BY a.created_at DESC
        LIMIT $1`,
      [perSource]
    ),
    db.query(
      `SELECT a.id AS application_id,
              a.church_name,
              a.risk_decision,
              a.application_status,
              COALESCE(a.risk_decided_at, a.updated_at, a.created_at) AS occurred_at
         FROM blessboard.platform_church_registration_applications a
        WHERE a.organization_id IS NULL
          AND a.provisioning_status <> 'provisioned'
          AND (
            a.risk_decision = 'review_required'
            OR a.application_status = 'duplicate_review'
          )
        ORDER BY COALESCE(a.risk_decided_at, a.updated_at, a.created_at) DESC
        LIMIT $1`,
      [perSource]
    ),
    db.query(
      `SELECT a.id AS application_id,
              a.church_name,
              a.provisioning_error_code,
              COALESCE(a.provisioning_failed_at, a.updated_at) AS occurred_at
         FROM blessboard.platform_church_registration_applications a
        WHERE a.provisioning_status = 'provisioning_failed'
        ORDER BY COALESCE(a.provisioning_failed_at, a.updated_at) DESC
        LIMIT $1`,
      [perSource]
    ),
    db.query(
      `SELECT ae.organization_id,
              o.organization_key,
              o.display_name,
              COUNT(*)::int AS failure_count,
              MAX(ae.created_at) AS occurred_at
         FROM platform.audit_events ae
         INNER JOIN platform.organizations o ON o.id = ae.organization_id
        WHERE ae.action_key = 'subscription.trial_expiry_failed'
          AND ae.created_at >= now() - ($1::int * interval '1 day')
        GROUP BY ae.organization_id, o.organization_key, o.display_name
       HAVING COUNT(*) >= $2
        ORDER BY MAX(ae.created_at) DESC
        LIMIT $3`,
      [windowDays, TRIAL_FAILURE_REPEAT_THRESHOLD, perSource]
    ),
  ]);

  /** @type {object[]} */
  const out = [];

  for (const row of foundation.rows || []) {
    const orgKey = row.organization_key ? String(row.organization_key) : null;
    const appId = String(row.application_id);
    out.push({
      alertKey: `foundation_completed:${appId}`,
      eventType: EVENT_TYPES.FOUNDATION_COMPLETED,
      severity: SEVERITY.INFO,
      title: "Foundation registration completed",
      summary: orgKey
        ? `Organization ${orgKey} was provisioned on Foundation.`
        : "A Foundation church registration finished provisioning.",
      href: orgKey
        ? `/admin/organizations/${encodeURIComponent(orgKey)}`
        : `/admin/registration-applications/${encodeURIComponent(appId)}`,
      occurredAt: row.occurred_at,
      entityLabel: orgKey || safeLabel(row.church_name, 40),
    });
  }

  for (const row of trialStarted.rows || []) {
    const orgKey = String(row.organization_key);
    const subId = String(row.subscription_id);
    out.push({
      alertKey: `growth_trial_started:${subId}`,
      eventType: EVENT_TYPES.GROWTH_TRIAL_STARTED,
      severity: SEVERITY.INFO,
      title: "Growth trial started",
      summary: `Organization ${orgKey} began a Growth trial.`,
      href: `/admin/organizations/${encodeURIComponent(orgKey)}`,
      occurredAt: row.occurred_at,
      entityLabel: orgKey,
    });
  }

  for (const row of trialEnding.rows || []) {
    const orgKey = String(row.organization_key);
    const subId = String(row.subscription_id);
    const endsAt = row.occurred_at ? new Date(row.occurred_at).toISOString() : "open";
    out.push({
      alertKey: `growth_trial_ending:${subId}:${endsAt}`,
      eventType: EVENT_TYPES.GROWTH_TRIAL_ENDING,
      severity: SEVERITY.WARN,
      title: "Growth trial ending within seven days",
      summary: `Organization ${orgKey} has a Growth trial ending soon.`,
      href: `/admin/organizations/${encodeURIComponent(orgKey)}`,
      occurredAt: row.occurred_at,
      entityLabel: orgKey,
    });
  }

  for (const row of inGrace.rows || []) {
    const orgKey = String(row.organization_key);
    const subId = String(row.subscription_id);
    out.push({
      alertKey: `growth_grace:${subId}`,
      eventType: EVENT_TYPES.GROWTH_ENTERED_GRACE,
      severity: SEVERITY.WARN,
      title: "Growth entered grace",
      summary: `Organization ${orgKey} is in the Growth trial grace window.`,
      href: `/admin/organizations/${encodeURIComponent(orgKey)}`,
      occurredAt: row.occurred_at,
      entityLabel: orgKey,
    });
  }

  for (const row of downgraded.rows || []) {
    const orgKey = String(row.organization_key);
    const auditId = String(row.audit_id);
    out.push({
      alertKey: `growth_downgraded:${auditId}`,
      eventType: EVENT_TYPES.GROWTH_DOWNGRADED,
      severity: SEVERITY.WARN,
      title: "Growth downgraded to Foundation",
      summary: `Organization ${orgKey} was moved to Foundation after trial expiry.`,
      href: `/admin/organizations/${encodeURIComponent(orgKey)}`,
      occurredAt: row.occurred_at,
      entityLabel: orgKey,
    });
  }

  for (const row of network.rows || []) {
    const appId = String(row.application_id);
    out.push({
      alertKey: `network_contact:${appId}`,
      eventType: EVENT_TYPES.NETWORK_CONTACT,
      severity: SEVERITY.WARN,
      title: "Network contact request submitted",
      summary: "A Network plan support-contact registration is waiting for follow-up.",
      href: `/admin/registration-applications/${encodeURIComponent(appId)}`,
      occurredAt: row.occurred_at,
      entityLabel: safeLabel(row.church_name, 40) || "Network request",
    });
  }

  for (const row of review.rows || []) {
    const appId = String(row.application_id);
    out.push({
      alertKey: `registration_review:${appId}`,
      eventType: EVENT_TYPES.REGISTRATION_REVIEW,
      severity: SEVERITY.WARN,
      title: "Registration requires review",
      summary: "A church registration is held for operator review before provisioning.",
      href: `/admin/registration-applications/${encodeURIComponent(appId)}`,
      occurredAt: row.occurred_at,
      entityLabel: safeLabel(row.church_name, 40) || "Registration",
    });
  }

  for (const row of failed.rows || []) {
    const appId = String(row.application_id);
    const code = row.provisioning_error_code
      ? safeLabel(row.provisioning_error_code, 40)
      : null;
    out.push({
      alertKey: `provisioning_failed:${appId}`,
      eventType: EVENT_TYPES.PROVISIONING_FAILED,
      severity: SEVERITY.CRITICAL,
      title: "Provisioning failed after application creation",
      summary: code
        ? `Provisioning failed (${code}). Open the application for operator follow-up.`
        : "Provisioning failed after the application was saved.",
      href: `/admin/registration-applications/${encodeURIComponent(appId)}`,
      occurredAt: row.occurred_at,
      entityLabel: safeLabel(row.church_name, 40) || "Application",
    });
  }

  for (const row of expiryFailures.rows || []) {
    const orgKey = String(row.organization_key);
    const orgId = String(row.organization_id);
    const count = Number(row.failure_count) || 0;
    out.push({
      alertKey: `trial_expiry_failures:${orgId}:${windowDays}d`,
      eventType: EVENT_TYPES.TRIAL_EXPIRY_FAILURES,
      severity: SEVERITY.CRITICAL,
      title: "Repeated trial-expiry processing failure",
      summary: `Organization ${orgKey} recorded ${count} trial-expiry failures in the last ${windowDays} days.`,
      href: `/admin/organizations/${encodeURIComponent(orgKey)}`,
      occurredAt: row.occurred_at,
      entityLabel: orgKey,
    });
  }

  return out.map(mapAlert).filter(Boolean);
}

/**
 * @param {object[]} alerts
 */
function sortAlerts(alerts) {
  return [...alerts].sort((a, b) => {
    const ra = SEVERITY_RANK[a.severity] != null ? SEVERITY_RANK[a.severity] : 9;
    const rb = SEVERITY_RANK[b.severity] != null ? SEVERITY_RANK[b.severity] : 9;
    if (ra !== rb) return ra - rb;
    const ta = a.occurredAt ? new Date(a.occurredAt).getTime() : 0;
    const tb = b.occurredAt ? new Date(b.occurredAt).getTime() : 0;
    return tb - ta;
  });
}

/**
 * @param {{ query: Function }} db
 * @param {{ page?: unknown, limit?: unknown }} [input]
 */
async function listPlatformAdminOpsAlerts(db, input = {}) {
  const { page, limit } = normalizeAlertListInput(input);
  if (!db || typeof db.query !== "function") {
    return {
      ok: false,
      status: STATUS.LOOKUP_ERROR,
      alerts: [],
      page,
      limit,
      total: 0,
      totalPages: 0,
      reason: "database required",
    };
  }

  try {
    const candidates = sortAlerts(await collectRegistrationOpsAlertCandidates(db));
    // Deduplicate by alertKey (idempotent across overlapping sources).
    const seen = new Set();
    const unique = [];
    for (const alert of candidates) {
      if (seen.has(alert.alertKey)) continue;
      seen.add(alert.alertKey);
      unique.push(alert);
    }

    const total = unique.length;
    const totalPages = total === 0 ? 0 : Math.ceil(total / limit);
    const offset = (page - 1) * limit;
    const alerts = unique.slice(offset, offset + limit);

    return {
      ok: true,
      status: STATUS.OK,
      alerts,
      page,
      limit,
      total,
      totalPages,
    };
  } catch {
    return {
      ok: false,
      status: STATUS.LOOKUP_ERROR,
      alerts: [],
      page,
      limit,
      total: 0,
      totalPages: 0,
      reason: "lookup_error",
    };
  }
}

module.exports = {
  STATUS,
  EVENT_TYPES,
  SEVERITY,
  DEFAULT_LIMIT,
  MAX_LIMIT,
  ALLOWED_LIMITS,
  RECENT_WINDOW_DAYS,
  TRIAL_FAILURE_REPEAT_THRESHOLD,
  ADMIN_HREF_PREFIX,
  isSafeAdminHref,
  normalizeAlertListInput,
  collectRegistrationOpsAlertCandidates,
  listPlatformAdminOpsAlerts,
  mapAlert,
  sortAlerts,
  safeLabel,
  assertNoSensitiveLeak,
};
