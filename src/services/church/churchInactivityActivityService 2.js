"use strict";

/**
 * Foundation inactivity / dormancy — activity calculation.
 * Automated background jobs are NOT treated as genuine church activity.
 */

const FIRST_WARNING_MONTHS = 10;
const FINAL_WARNING_MONTHS = 11;
const DORMANT_MONTHS = 12;
const DATA_PRESERVE_DAYS = 90;

/**
 * Compute last genuine activity for an organisation.
 * Returns { certain: false } when calculation is incomplete/uncertain.
 */
async function calculateOrganisationActivity(pool, organizationId) {
  const orgId = Number(organizationId);
  if (!Number.isFinite(orgId) || orgId <= 0) {
    return { certain: false, reason: "invalid_organization_id" };
  }

  try {
    const orgR = await pool.query(
      `SELECT id, created_at, status, plan_code
       FROM public.church_organizations WHERE id = $1 LIMIT 1`,
      [orgId]
    );
    const org = orgR.rows[0];
    if (!org) return { certain: false, reason: "organization_not_found" };
    if (!org.created_at) return { certain: false, reason: "missing_created_at" };

    const sources = [];

    // Administrator login (HQ + branch admins only — not automated systems)
    const adminLogin = await pool.query(
      `SELECT MAX(ts) AS last_at FROM (
         SELECT MAX(last_successful_login_at) AS ts
         FROM public.church_hq_admins
         WHERE organization_id = $1 AND last_successful_login_at IS NOT NULL
         UNION ALL
         SELECT MAX(last_successful_login_at) AS ts
         FROM public.church_branch_admins
         WHERE organization_id = $1 AND last_successful_login_at IS NOT NULL
       ) s`,
      [orgId]
    );
    if (adminLogin.rows[0] && adminLogin.rows[0].last_at) {
      sources.push({
        key: "administrator_login",
        at: new Date(adminLogin.rows[0].last_at),
      });
    }

    // Attendance activity (records + Foundation check-ins — genuine church ops)
    const attendance = await pool.query(
      `SELECT GREATEST(MAX(created_at), MAX(updated_at), MAX(service_date::timestamptz)) AS last_at
       FROM public.church_attendance_records
       WHERE organization_id = $1`,
      [orgId]
    );
    if (attendance.rows[0] && attendance.rows[0].last_at) {
      sources.push({ key: "attendance", at: new Date(attendance.rows[0].last_at) });
    }
    const checkIns = await pool
      .query(
        `SELECT GREATEST(MAX(checked_in_at), MAX(created_at), MAX(updated_at)) AS last_at
         FROM public.church_attendance_check_ins
         WHERE organization_id = $1 AND status = 'active'`,
        [orgId]
      )
      .catch(() => ({ rows: [{ last_at: null }] }));
    if (checkIns.rows[0] && checkIns.rows[0].last_at) {
      sources.push({ key: "attendance_check_in", at: new Date(checkIns.rows[0].last_at) });
    }

    // Events
    const events = await pool.query(
      `SELECT GREATEST(MAX(created_at), MAX(updated_at)) AS last_at
       FROM public.church_events
       WHERE organization_id = $1`,
      [orgId]
    );
    if (events.rows[0] && events.rows[0].last_at) {
      sources.push({ key: "events", at: new Date(events.rows[0].last_at) });
    }

    // Broadcasts (HQ broadcasts created/updated by humans via portal — not job delivery rows)
    const broadcasts = await pool.query(
      `SELECT GREATEST(MAX(created_at), MAX(updated_at)) AS last_at
       FROM public.church_hq_broadcasts
       WHERE organization_id = $1`,
      [orgId]
    );
    if (broadcasts.rows[0] && broadcasts.rows[0].last_at) {
      sources.push({ key: "broadcasts", at: new Date(broadcasts.rows[0].last_at) });
    }

    // Member activity (successful member login only — not system audits)
    const members = await pool.query(
      `SELECT MAX(last_successful_login_at) AS last_at
       FROM public.church_members
       WHERE organization_id = $1 AND last_successful_login_at IS NOT NULL`,
      [orgId]
    );
    if (members.rows[0] && members.rows[0].last_at) {
      sources.push({ key: "member_activity", at: new Date(members.rows[0].last_at) });
    }

    // Baseline: organisation creation always anchors certainty
    sources.push({ key: "organization_created", at: new Date(org.created_at) });

    let lastAt = null;
    let lastKey = null;
    for (const s of sources) {
      if (!s.at || Number.isNaN(s.at.getTime())) continue;
      if (!lastAt || s.at.getTime() > lastAt.getTime()) {
        lastAt = s.at;
        lastKey = s.key;
      }
    }

    if (!lastAt) {
      return { certain: false, reason: "no_usable_timestamps", organizationId: orgId };
    }

    return {
      certain: true,
      organizationId: orgId,
      organizationCreatedAt: new Date(org.created_at),
      lastActivityAt: lastAt,
      primarySource: lastKey,
      sources: sources.map((s) => ({ key: s.key, at: s.at.toISOString() })),
      status: org.status,
      plan_code: org.plan_code,
    };
  } catch (err) {
    return {
      certain: false,
      reason: "calculation_error",
      error: String(err && err.message ? err.message : err).slice(0, 300),
      organizationId: orgId,
    };
  }
}

function monthsBetween(earlier, later) {
  const a = earlier instanceof Date ? earlier : new Date(earlier);
  const b = later instanceof Date ? later : new Date(later);
  const ms = b.getTime() - a.getTime();
  return ms / (1000 * 60 * 60 * 24 * 30.436875); // average month length
}

function inactivityMonths(activity, at = new Date()) {
  if (!activity || !activity.certain || !activity.lastActivityAt) return null;
  return monthsBetween(activity.lastActivityAt, at);
}

function classifyInactivity(activity, at = new Date()) {
  const months = inactivityMonths(activity, at);
  if (months == null) {
    return { certain: false, reason: activity && activity.reason ? activity.reason : "uncertain" };
  }
  return {
    certain: true,
    monthsInactive: months,
    eligibleForFirstWarning: months >= FIRST_WARNING_MONTHS && months < FINAL_WARNING_MONTHS,
    eligibleForFinalWarning: months >= FINAL_WARNING_MONTHS && months < DORMANT_MONTHS,
    eligibleForDormant: months >= DORMANT_MONTHS,
    thresholds: {
      firstWarningMonths: FIRST_WARNING_MONTHS,
      finalWarningMonths: FINAL_WARNING_MONTHS,
      dormantMonths: DORMANT_MONTHS,
      dataPreserveDays: DATA_PRESERVE_DAYS,
    },
  };
}

module.exports = {
  FIRST_WARNING_MONTHS,
  FINAL_WARNING_MONTHS,
  DORMANT_MONTHS,
  DATA_PRESERVE_DAYS,
  calculateOrganisationActivity,
  monthsBetween,
  inactivityMonths,
  classifyInactivity,
};
