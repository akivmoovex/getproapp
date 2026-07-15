"use strict";

/**
 * Tenant-scoped package usage meters (monthly + storage cache).
 */

/**
 * @param {string | null | undefined} timezone
 * @param {Date} [now]
 * @returns {string} YYYY-MM-01
 */
function usageMonthKeyForTimezone(timezone, now = new Date()) {
  let tz = String(timezone || "UTC").trim() || "UTC";
  try {
    // Validate IANA name
    Intl.DateTimeFormat(undefined, { timeZone: tz });
  } catch {
    tz = "UTC";
  }
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  return `${year}-${month}-01`;
}

/**
 * @param {import("pg").Pool | import("pg").PoolClient} db
 * @param {number} organizationId
 * @param {string} usageMonth YYYY-MM-01
 */
async function getOrCreateUsageMonth(db, organizationId, usageMonth) {
  const r = await db.query(
    `INSERT INTO public.church_organization_usage_months (
       organization_id, usage_month
     ) VALUES ($1, $2::date)
     ON CONFLICT (organization_id, usage_month) DO UPDATE
       SET updated_at = public.church_organization_usage_months.updated_at
     RETURNING organization_id, usage_month::text AS usage_month,
               external_emails_count, scheduled_reports_count,
               created_at, updated_at`,
    [organizationId, usageMonth]
  );
  return r.rows[0];
}

/**
 * @param {import("pg").Pool | import("pg").PoolClient} db
 * @param {number} organizationId
 * @param {string} usageMonth
 */
async function findUsageMonth(db, organizationId, usageMonth) {
  const r = await db.query(
    `SELECT organization_id, usage_month::text AS usage_month,
            external_emails_count, scheduled_reports_count,
            created_at, updated_at
     FROM public.church_organization_usage_months
     WHERE organization_id = $1 AND usage_month = $2::date
     LIMIT 1`,
    [organizationId, usageMonth]
  );
  return r.rows[0] ?? null;
}

/**
 * Increment external email meter for a tenant month. Scoped by organization_id.
 * @returns {Promise<object>}
 */
async function incrementExternalEmails(db, organizationId, usageMonth, by = 1) {
  const n = Math.max(0, Math.floor(Number(by) || 0));
  const r = await db.query(
    `INSERT INTO public.church_organization_usage_months (
       organization_id, usage_month, external_emails_count
     ) VALUES ($1, $2::date, $3)
     ON CONFLICT (organization_id, usage_month) DO UPDATE
       SET external_emails_count =
             public.church_organization_usage_months.external_emails_count + EXCLUDED.external_emails_count,
           updated_at = now()
     RETURNING organization_id, usage_month::text AS usage_month,
               external_emails_count, scheduled_reports_count`,
    [organizationId, usageMonth, n]
  );
  return r.rows[0];
}

/**
 * Increment scheduled-report meter for a tenant month.
 * @returns {Promise<object>}
 */
async function incrementScheduledReports(db, organizationId, usageMonth, by = 1) {
  const n = Math.max(0, Math.floor(Number(by) || 0));
  const r = await db.query(
    `INSERT INTO public.church_organization_usage_months (
       organization_id, usage_month, scheduled_reports_count
     ) VALUES ($1, $2::date, $3)
     ON CONFLICT (organization_id, usage_month) DO UPDATE
       SET scheduled_reports_count =
             public.church_organization_usage_months.scheduled_reports_count + EXCLUDED.scheduled_reports_count,
           updated_at = now()
     RETURNING organization_id, usage_month::text AS usage_month,
               external_emails_count, scheduled_reports_count`,
    [organizationId, usageMonth, n]
  );
  return r.rows[0];
}

/**
 * Adjust cached storage bytes (can be negative on delete). Clamped at 0.
 */
async function adjustStorageBytesUsed(db, organizationId, deltaBytes) {
  const delta = Math.trunc(Number(deltaBytes) || 0);
  const r = await db.query(
    `UPDATE public.church_organizations
     SET storage_bytes_used = GREATEST(0, COALESCE(storage_bytes_used, 0) + $2),
         updated_at = now()
     WHERE id = $1
     RETURNING id, storage_bytes_used`,
    [organizationId, delta]
  );
  return r.rows[0] ?? null;
}

/**
 * One-shot SUM of known attachment tables → cache. Not for every page request.
 */
async function reconcileStorageBytesUsed(db, organizationId) {
  const r = await db.query(
    `WITH totals AS (
       SELECT COALESCE(SUM(file_size)::bigint, 0) AS bytes
       FROM (
         SELECT file_size FROM public.church_hq_broadcast_attachments WHERE organization_id = $1
         UNION ALL
         SELECT file_size FROM public.church_announcement_attachments WHERE organization_id = $1
       ) a
     )
     UPDATE public.church_organizations o
     SET storage_bytes_used = totals.bytes,
         storage_bytes_reconciled_at = now(),
         updated_at = now()
     FROM totals
     WHERE o.id = $1
     RETURNING o.id, o.storage_bytes_used, o.storage_bytes_reconciled_at`,
    [organizationId]
  );
  return r.rows[0] ?? null;
}

module.exports = {
  usageMonthKeyForTimezone,
  getOrCreateUsageMonth,
  findUsageMonth,
  incrementExternalEmails,
  incrementScheduledReports,
  adjustStorageBytesUsed,
  reconcileStorageBytesUsed,
};
