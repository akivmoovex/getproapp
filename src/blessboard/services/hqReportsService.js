"use strict";

/**
 * BlessBoard V5 HQ read-only operational reports.
 * All figures are derived from live table aggregates — no placeholders or fake numbers.
 */

const {
  authorizeBlessBoardTenantAccess,
  STATUS: AUTHZ_STATUS,
} = require("../../blessboard/services/authorizeBlessBoardTenantAccess");

const STATUS = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  FORBIDDEN: "forbidden",
  LOOKUP_ERROR: "lookup_error",
});

const YEAR_MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function withClient(db, fn) {
  let client = null;
  let owned = false;
  try {
    if (db && typeof db.connect === "function") {
      client = await db.connect();
      owned = true;
    } else {
      client = db;
    }
    return await fn(client);
  } finally {
    if (owned && client && typeof client.release === "function") client.release();
  }
}

async function requireHq(client, input) {
  if (!input.tenant || !input.actorUserId) {
    return { ok: false, reason: "auth_required" };
  }
  const authz = await authorizeBlessBoardTenantAccess(
    { query: client.query.bind(client) },
    {
      userId: input.actorUserId,
      tenant: input.tenant,
      branchId: null,
    }
  );
  if (!authz.ok) {
    return { ok: false, reason: authz.status || AUTHZ_STATUS.UNAUTHORIZED };
  }
  const roles = authz.context.effectiveRoles || [];
  const allowed = roles.some(
    (r) => r.roleKey === "church_hq_admin" || r.roleKey === "platform_admin"
  );
  if (!allowed) return { ok: false, reason: "hq_required" };
  return { ok: true };
}

function currentYearMonth() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * @param {{ query: Function, connect?: Function }} db
 * @param {{
 *   churchId: string,
 *   actorUserId: string,
 *   tenant: object,
 *   yearMonth?: string,
 * }} input
 */
async function getHqOperationalReport(db, input) {
  const churchId = String((input && input.churchId) || "").trim();
  if (!UUID_RE.test(churchId)) {
    return { ok: false, status: STATUS.INVALID_INPUT, report: null, reason: "church_id" };
  }
  const yearMonth = String((input && input.yearMonth) || currentYearMonth()).trim();
  if (!YEAR_MONTH_RE.test(yearMonth)) {
    return { ok: false, status: STATUS.INVALID_INPUT, report: null, reason: "year_month" };
  }

  try {
    return await withClient(db, async (client) => {
      const hq = await requireHq(client, input);
      if (!hq.ok) {
        return { ok: false, status: STATUS.FORBIDDEN, report: null, reason: hq.reason };
      }

      // Soft entitlement resolve for reporting tier — never crash public/admin reads on missing sub data.
      let reportTier = "basic";
      try {
        const {
          resolveOrganizationEntitlementsSafe,
          hasFeature,
          FEATURE_KEYS,
        } = require("../../platform/services/entitlementService");
        const orgRow = await client.query(
          `SELECT organization_id FROM blessboard.churches WHERE id = $1`,
          [churchId]
        );
        const organizationId = orgRow.rows[0] && orgRow.rows[0].organization_id;
        if (organizationId) {
          const soft = await resolveOrganizationEntitlementsSafe(client, {
            organizationId,
          });
          if (hasFeature(soft.entitlements, FEATURE_KEYS.ADVANCED_REPORTS)) {
            reportTier = "advanced";
          } else if (hasFeature(soft.entitlements, FEATURE_KEYS.BASIC_REPORTS)) {
            reportTier = "basic";
          }
          if (input.requireAdvanced === true && reportTier !== "advanced") {
            return {
              ok: false,
              status: STATUS.FORBIDDEN,
              report: null,
              reason: "advanced_reports_not_entitled",
            };
          }
        }
      } catch {
        reportTier = "basic";
      }

      const activeMembers = await client.query(
        `SELECT b.id AS branch_id, b.branch_key, b.display_name,
                COUNT(m.id)::int AS active_member_count
           FROM blessboard.branches b
           LEFT JOIN blessboard.member_branch_memberships m
             ON m.branch_id = b.id
            AND m.membership_status = 'active'
          WHERE b.church_id = $1
            AND b.status = 'active'
          GROUP BY b.id, b.branch_key, b.display_name
          ORDER BY b.display_name ASC`,
        [churchId]
      );

      const pendingRegs = await client.query(
        `SELECT b.id AS branch_id, b.branch_key, b.display_name,
                COUNT(r.id)::int AS pending_count
           FROM blessboard.branches b
           LEFT JOIN blessboard.member_registrations r
             ON r.branch_id = b.id
            AND r.status IN ('submitted', 'under_review')
          WHERE b.church_id = $1
          GROUP BY b.id, b.branch_key, b.display_name
          ORDER BY b.display_name ASC`,
        [churchId]
      );

      const announcements = await client.query(
        `SELECT
            COUNT(*) FILTER (WHERE a.status = 'published')::int AS published_count,
            COUNT(DISTINCT ar.member_id)::int AS unique_readers,
            COUNT(ar.id)::int AS read_receipt_count
           FROM blessboard.announcements a
           LEFT JOIN blessboard.announcement_reads ar
             ON ar.announcement_id = a.id
            AND ar.read_at IS NOT NULL
          WHERE a.church_id = $1`,
        [churchId]
      );

      const events = await client.query(
        `SELECT
            COUNT(e.id)::int AS published_event_count,
            COUNT(er.id)::int AS registration_count
           FROM blessboard.events e
           LEFT JOIN blessboard.event_registrations er
             ON er.event_id = e.id
            AND er.status = 'registered'
          WHERE e.church_id = $1
            AND e.status = 'published'`,
        [churchId]
      );

      const attendance = await client.query(
        `SELECT
            COALESCE(SUM(en.count), 0)::int AS total_count,
            COUNT(DISTINCT e.id)::int AS event_count
           FROM blessboard.attendance_events e
           INNER JOIN blessboard.attendance_entries en
             ON en.attendance_event_id = e.id
          WHERE e.church_id = $1
            AND to_char(e.event_date, 'YYYY-MM') = $2
            AND e.status IN ('submitted', 'approved', 'archived')`,
        [churchId, yearMonth]
      );

      const giving = await client.query(
        `SELECT
            e.currency,
            COALESCE(SUM(e.amount), 0)::text AS total_amount,
            COUNT(e.id)::int AS entry_count
           FROM blessboard.giving_entries e
          WHERE e.church_id = $1
            AND to_char(e.giving_date, 'YYYY-MM') = $2
            AND e.status IN ('submitted', 'approved')
          GROUP BY e.currency
          ORDER BY e.currency ASC`,
        [churchId, yearMonth]
      );

      const openRequests = await client.query(
        `SELECT
            COUNT(*) FILTER (WHERE status IN ('submitted', 'in_review'))::int AS open_count,
            COUNT(*) FILTER (WHERE status = 'submitted')::int AS submitted_count,
            COUNT(*) FILTER (WHERE status = 'in_review')::int AS in_review_count
           FROM blessboard.member_requests
          WHERE church_id = $1`,
        [churchId]
      );

      return {
        ok: true,
        status: STATUS.OK,
        report: {
          churchId,
          yearMonth,
          generatedAt: new Date().toISOString(),
          reportTier,
          activeMembersByBranch: activeMembers.rows.map((r) => ({
            branchId: r.branch_id,
            branchKey: r.branch_key,
            displayName: r.display_name,
            activeMemberCount: Number(r.active_member_count) || 0,
          })),
          registrationsPendingByBranch: pendingRegs.rows.map((r) => ({
            branchId: r.branch_id,
            branchKey: r.branch_key,
            displayName: r.display_name,
            pendingCount: Number(r.pending_count) || 0,
          })),
          announcements: {
            publishedCount: Number(announcements.rows[0].published_count) || 0,
            uniqueReaders: Number(announcements.rows[0].unique_readers) || 0,
            readReceiptCount: Number(announcements.rows[0].read_receipt_count) || 0,
          },
          events: {
            publishedEventCount: Number(events.rows[0].published_event_count) || 0,
            registrationCount: Number(events.rows[0].registration_count) || 0,
          },
          attendance: {
            yearMonth,
            totalCount: Number(attendance.rows[0].total_count) || 0,
            eventCount: Number(attendance.rows[0].event_count) || 0,
          },
          giving: {
            yearMonth,
            byCurrency: giving.rows.map((r) => ({
              currency: r.currency,
              totalAmount: String(r.total_amount),
              entryCount: Number(r.entry_count) || 0,
            })),
          },
          openRequests: {
            openCount: Number(openRequests.rows[0].open_count) || 0,
            submittedCount: Number(openRequests.rows[0].submitted_count) || 0,
            inReviewCount: Number(openRequests.rows[0].in_review_count) || 0,
          },
        },
      };
    });
  } catch (err) {
    return {
      ok: false,
      status: STATUS.LOOKUP_ERROR,
      report: null,
      reason: err && err.message ? String(err.message) : "error",
    };
  }
}

module.exports = {
  STATUS,
  getHqOperationalReport,
};
