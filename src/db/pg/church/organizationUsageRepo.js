"use strict";

/**
 * Tenant-scoped package usage meters (monthly + storage cache).
 */

/** Pool has connect() and no release(); PoolClient has both and must not be re-connected. */
function isPgPool(db) {
  return Boolean(db) && typeof db.connect === "function" && typeof db.release !== "function";
}

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
 * Adjust external email meter (positive or negative). Clamped at 0.
 * Used to release unused reserved quota after partial delivery failure.
 */
async function adjustExternalEmails(db, organizationId, usageMonth, delta) {
  const n = Math.trunc(Number(delta) || 0);
  if (n === 0) {
    return findUsageMonth(db, organizationId, usageMonth);
  }
  await getOrCreateUsageMonth(db, organizationId, usageMonth);
  const r = await db.query(
    `UPDATE public.church_organization_usage_months
     SET external_emails_count = GREATEST(0, external_emails_count + $3),
         updated_at = now()
     WHERE organization_id = $1 AND usage_month = $2::date
     RETURNING organization_id, usage_month::text AS usage_month,
               external_emails_count, scheduled_reports_count`,
    [organizationId, usageMonth, n]
  );
  return r.rows[0] ?? null;
}

/**
 * Atomically reserve up to `requested` external email sends under a hard monthly limit.
 * Concurrent workers cannot both reserve beyond the limit (row lock + conditional increment).
 *
 * @param {import("pg").Pool | import("pg").PoolClient} db
 * @param {number} organizationId
 * @param {string} usageMonth
 * @param {number} requested
 * @param {number | null | string} limit - numeric hard limit, or null/fair_use/unlimited
 * @returns {Promise<{ reserved: number, used: number, limit: number|null|string, remaining: number|null }>}
 */
async function tryReserveExternalEmailsUpTo(db, organizationId, usageMonth, requested, limit) {
  const want = Math.max(0, Math.floor(Number(requested) || 0));
  if (want === 0) {
    const current = await getOrCreateUsageMonth(db, organizationId, usageMonth);
    const used = current.external_emails_count || 0;
    return {
      reserved: 0,
      used,
      limit: typeof limit === "number" ? limit : limit || null,
      remaining: typeof limit === "number" ? Math.max(0, limit - used) : null,
    };
  }

  const numericLimit = typeof limit === "number" ? limit : null;
  const ownsClient = isPgPool(db);
  const client = ownsClient ? await db.connect() : null;
  const runner = client || db;

  try {
    if (client) await runner.query("BEGIN");
    await runner.query(
      `INSERT INTO public.church_organization_usage_months (organization_id, usage_month)
       VALUES ($1, $2::date)
       ON CONFLICT (organization_id, usage_month) DO NOTHING`,
      [organizationId, usageMonth]
    );
    const locked = await runner.query(
      `SELECT external_emails_count
       FROM public.church_organization_usage_months
       WHERE organization_id = $1 AND usage_month = $2::date
       FOR UPDATE`,
      [organizationId, usageMonth]
    );
    const usedBefore = Number(locked.rows[0]?.external_emails_count) || 0;
    let reserve = want;
    if (numericLimit != null) {
      reserve = Math.min(want, Math.max(0, numericLimit - usedBefore));
    }
    let usedAfter = usedBefore;
    if (reserve > 0) {
      const updated = await runner.query(
        `UPDATE public.church_organization_usage_months
         SET external_emails_count = external_emails_count + $3,
             updated_at = now()
         WHERE organization_id = $1 AND usage_month = $2::date
         RETURNING external_emails_count`,
        [organizationId, usageMonth, reserve]
      );
      usedAfter = Number(updated.rows[0]?.external_emails_count) || usedBefore + reserve;
    }
    if (client) await runner.query("COMMIT");
    return {
      reserved: reserve,
      used: usedAfter,
      limit: numericLimit != null ? numericLimit : limit || null,
      remaining: numericLimit != null ? Math.max(0, numericLimit - usedAfter) : null,
    };
  } catch (err) {
    if (client) {
      try {
        await runner.query("ROLLBACK");
      } catch {
        /* ignore */
      }
    }
    throw err;
  } finally {
    if (client) client.release();
  }
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
 * Adjust cached storage bytes (positive or negative). Clamped at 0.
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
 * Atomically reserve storage bytes under a hard limit.
 * Concurrent uploads cannot both succeed past the limit (org row FOR UPDATE).
 *
 * @returns {Promise<{ reserved: number, used: number, limit: number|null }>}
 */
async function tryReserveStorageBytes(db, organizationId, bytes, limit) {
  const want = Math.max(0, Math.trunc(Number(bytes) || 0));
  const numericLimit = typeof limit === "number" ? limit : null;
  const ownsClient = isPgPool(db);
  const client = ownsClient ? await db.connect() : null;
  const runner = client || db;

  try {
    if (client) await runner.query("BEGIN");
    const locked = await runner.query(
      `SELECT storage_bytes_used
       FROM public.church_organizations
       WHERE id = $1
       FOR UPDATE`,
      [organizationId]
    );
    if (!locked.rows[0]) {
      if (client) await runner.query("ROLLBACK");
      return { reserved: 0, used: 0, limit: numericLimit };
    }
    const usedBefore = Number(locked.rows[0].storage_bytes_used) || 0;
    if (want === 0) {
      if (client) await runner.query("COMMIT");
      return {
        reserved: 0,
        used: usedBefore,
        limit: numericLimit,
      };
    }
    if (numericLimit != null && usedBefore + want > numericLimit) {
      if (client) await runner.query("COMMIT");
      return {
        reserved: 0,
        used: usedBefore,
        limit: numericLimit,
      };
    }
    const updated = await runner.query(
      `UPDATE public.church_organizations
       SET storage_bytes_used = GREATEST(0, COALESCE(storage_bytes_used, 0) + $2),
           updated_at = now()
       WHERE id = $1
       RETURNING storage_bytes_used`,
      [organizationId, want]
    );
    if (client) await runner.query("COMMIT");
    return {
      reserved: want,
      used: Number(updated.rows[0]?.storage_bytes_used) || usedBefore + want,
      limit: numericLimit,
    };
  } catch (err) {
    if (client) {
      try {
        await runner.query("ROLLBACK");
      } catch {
        /* ignore */
      }
    }
    throw err;
  } finally {
    if (client) client.release();
  }
}

/**
 * Atomically reserve up to `requested` scheduled-report slots under a hard monthly limit.
 */
async function tryReserveScheduledReportsUpTo(db, organizationId, usageMonth, requested, limit) {
  const want = Math.max(0, Math.floor(Number(requested) || 0));
  if (want === 0) {
    const current = await getOrCreateUsageMonth(db, organizationId, usageMonth);
    const used = current.scheduled_reports_count || 0;
    return {
      reserved: 0,
      used,
      limit: typeof limit === "number" ? limit : limit || null,
      remaining: typeof limit === "number" ? Math.max(0, limit - used) : null,
    };
  }

  const numericLimit = typeof limit === "number" ? limit : null;
  const ownsClient = isPgPool(db);
  const client = ownsClient ? await db.connect() : null;
  const runner = client || db;

  try {
    if (client) await runner.query("BEGIN");
    await runner.query(
      `INSERT INTO public.church_organization_usage_months (organization_id, usage_month)
       VALUES ($1, $2::date)
       ON CONFLICT (organization_id, usage_month) DO NOTHING`,
      [organizationId, usageMonth]
    );
    const locked = await runner.query(
      `SELECT scheduled_reports_count
       FROM public.church_organization_usage_months
       WHERE organization_id = $1 AND usage_month = $2::date
       FOR UPDATE`,
      [organizationId, usageMonth]
    );
    const usedBefore = Number(locked.rows[0]?.scheduled_reports_count) || 0;
    let reserve = want;
    if (numericLimit != null) {
      reserve = Math.min(want, Math.max(0, numericLimit - usedBefore));
    }
    let usedAfter = usedBefore;
    if (reserve > 0) {
      const updated = await runner.query(
        `UPDATE public.church_organization_usage_months
         SET scheduled_reports_count = scheduled_reports_count + $3,
             updated_at = now()
         WHERE organization_id = $1 AND usage_month = $2::date
         RETURNING scheduled_reports_count`,
        [organizationId, usageMonth, reserve]
      );
      usedAfter = Number(updated.rows[0]?.scheduled_reports_count) || usedBefore + reserve;
    }
    if (client) await runner.query("COMMIT");
    return {
      reserved: reserve,
      used: usedAfter,
      limit: numericLimit != null ? numericLimit : limit || null,
      remaining: numericLimit != null ? Math.max(0, numericLimit - usedAfter) : null,
    };
  } catch (err) {
    if (client) {
      try {
        await runner.query("ROLLBACK");
      } catch {
        /* ignore */
      }
    }
    throw err;
  } finally {
    if (client) client.release();
  }
}

/**
 * Adjust scheduled-report meter (can be negative to release a reservation).
 */
async function adjustScheduledReports(db, organizationId, usageMonth, delta) {
  const n = Math.trunc(Number(delta) || 0);
  if (n === 0) {
    return findUsageMonth(db, organizationId, usageMonth);
  }
  await getOrCreateUsageMonth(db, organizationId, usageMonth);
  const r = await db.query(
    `UPDATE public.church_organization_usage_months
     SET scheduled_reports_count = GREATEST(0, scheduled_reports_count + $3),
         updated_at = now()
     WHERE organization_id = $1 AND usage_month = $2::date
     RETURNING organization_id, usage_month::text AS usage_month,
               external_emails_count, scheduled_reports_count`,
    [organizationId, usageMonth, n]
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
  adjustExternalEmails,
  tryReserveExternalEmailsUpTo,
  incrementScheduledReports,
  adjustScheduledReports,
  tryReserveScheduledReportsUpTo,
  adjustStorageBytesUsed,
  tryReserveStorageBytes,
  reconcileStorageBytesUsed,
};
