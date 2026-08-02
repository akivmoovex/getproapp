"use strict";

/**
 * BlessBoard V5 HQ read-only reports + audit log viewer.
 * Attendance/giving report screens use live aggregates only — no charts, no donor PII.
 */

const express = require("express");
const { renderV5Ejs } = require("./v5EjsTemplateCache");

const {
  createRequireBlessBoardTenantRole,
} = require("./requireBlessBoardTenantRole");
const {
  createRequireBlessBoardPermission,
} = require("./requireBlessBoardPermission");
const { resolveTenantForAuthorization } = require("./loadBlessBoardAuthorizationContext");
const { createRejectApex } = require("./rejectApex");
const { buildHqAdminShellLocals } = require("./hqAdminShellLocals");
const {
  STATUS,
  getHqOperationalReport,
  resolveChurchReportTier,
  resolveChurchExecutiveReports,
  resolveChurchAdvancedAudit,
} = require("../services/hqReportsService");
const {
  getMonthlyAttendanceSummary,
  STATUS: ATT_STATUS,
} = require("../services/attendanceService");
const {
  getMonthlyGivingSummary,
  STATUS: GIV_STATUS,
} = require("../services/givingService");
const {
  listBlessBoardBranches,
  resolveBlessBoardBranchForChurch,
  STATUS: BRANCH_STATUS,
} = require("../services/listBlessBoardBranches");
const {
  listOrganizationAuditEvents,
  OUTCOMES: AUDIT_OUTCOMES,
  STATUS: AUDIT_STATUS,
} = require("../../platform/services/auditEventService");

const { listHqChurchRoles } = require("../services/hqRoleManagementService");

const AUDIT_PAGE_SIZE = 50;
const ACTION_KEY_RE = /^[a-z][a-z0-9_.]{1,95}$/;
const ACTION_CATEGORY_RE = /^[a-z][a-z0-9_]{0,31}$/;
const ENTITY_TYPE_RE = /^[a-z][a-z0-9_]{1,63}$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const AUDIT_ACTION_CATEGORIES = Object.freeze([
  "role",
  "giving",
  "attendance",
  "member",
  "registration",
  "announcement",
  "content",
  "form",
  "request",
  "branch",
  "media",
  "test",
]);

function renderView(relativePath, data) {
  return renderV5Ejs(relativePath, data);
}

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sendControlled(req, res, status, message) {
  const safe = escapeHtml(message);
  const wantsHtml = String(req.get("accept") || "").includes("text/html");
  if (!wantsHtml) {
    return res.status(status).type("text").send(String(message == null ? "" : message));
  }
  return res.status(status).type("html").send(`<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><title>Reports</title>
<link rel="stylesheet" href="/blessboard/v5/hq-admin.css?v=56"/></head>
<body class="bb-hq-body"><main><h1>Unavailable</h1><p>${safe}</p></main></body></html>`);
}

function currentYearMonth() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function normalizeYearMonth(raw) {
  const yearMonth = String(raw || currentYearMonth()).trim();
  return /^\d{4}-\d{2}$/.test(yearMonth) ? yearMonth : currentYearMonth();
}

/**
 * HQ-safe audit rows for HTML — no metadata, secrets, session data, or full UUIDs.
 * @param {object[]} events
 */
function presentAuditEventsForHq(events) {
  return (events || []).map((ev) => {
    const createdAt = ev && ev.createdAt ? ev.createdAt : null;
    let when = "";
    if (createdAt) {
      const d = createdAt instanceof Date ? createdAt : new Date(createdAt);
      when = Number.isNaN(d.getTime()) ? String(createdAt) : d.toISOString();
    }
    return {
      when,
      actionKey: ev && ev.actionKey ? String(ev.actionKey) : "",
      entityType: ev && ev.entityType ? String(ev.entityType) : "",
      outcome: ev && ev.outcome ? String(ev.outcome) : "",
      entityRef: ev && ev.entityId ? String(ev.entityId).slice(-8) : null,
      actorRef: ev && ev.actorUserId ? String(ev.actorUserId).slice(-8) : null,
      branchRef: ev && ev.branchId ? String(ev.branchId).slice(-8) : null,
    };
  });
}

function parseAuditActionFilter(raw) {
  const value = String(raw || "")
    .trim()
    .toLowerCase();
  if (!value) return "";
  return ACTION_KEY_RE.test(value) ? value : "";
}

function parseAuditActionCategoryFilter(raw) {
  const value = String(raw || "")
    .trim()
    .toLowerCase();
  if (!value) return "";
  if (!ACTION_CATEGORY_RE.test(value)) return "";
  if (AUDIT_ACTION_CATEGORIES.includes(value)) return value;
  return "";
}

function parseAuditEntityTypeFilter(raw) {
  const value = String(raw || "")
    .trim()
    .toLowerCase();
  if (!value) return "";
  return ENTITY_TYPE_RE.test(value) ? value : "";
}

function parseAuditOutcomeFilter(raw) {
  const value = String(raw || "")
    .trim()
    .toLowerCase();
  if (!value) return "";
  return AUDIT_OUTCOMES.includes(value) ? value : "";
}

function parseAuditDateFilter(raw) {
  const value = String(raw || "").trim();
  if (!value) return "";
  return DATE_RE.test(value) ? value : "";
}

function parseAuditActorFilter(raw) {
  const value = String(raw || "").trim();
  if (!value) return "";
  return UUID_RE.test(value) ? value : "";
}

function presentGovernanceActors(roles) {
  const byId = new Map();
  for (const row of roles || []) {
    if (!row || !row.userId) continue;
    const id = String(row.userId);
    if (byId.has(id)) continue;
    const label =
      (row.displayName && String(row.displayName).trim()) ||
      `Staff ·${id.slice(-8)}`;
    byId.set(id, { userId: id, label });
  }
  return Array.from(byId.values()).sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * @param {{
 *   getPool: () => { query: Function },
 *   isApexHost: (req: import('express').Request) => boolean,
 *   env?: NodeJS.ProcessEnv,
 *   sendUnavailable?: Function,
 * }} deps
 */
function createHqReportsRouter(deps) {
  const getPool = deps.getPool;
  const isApexHost = deps.isApexHost;
  const env = deps.env || process.env;
  const sendUnavailable = deps.sendUnavailable;
  const isProduction = String(env.NODE_ENV || "") === "production";

  const router = express.Router();
  const requireAccess = createRequireBlessBoardTenantRole({
    getPool,
    allowedRoles: ["church_hq_admin", "platform_admin"],
  });
  const requireAuditView = createRequireBlessBoardPermission("audit.view", null, { getPool });

  const rejectApex = createRejectApex({
    isApexHost,
    sendUnavailable,
    mode: "unlessTenant",
  });

  function gate(req, res, next) {
    const sessionOk = Boolean(req.v5Session && req.v5Session.authenticated);
    if (!sessionOk) {
      const wantsHtml = String(req.get("accept") || "").includes("text/html");
      if (wantsHtml) {
        return res.redirect(303, `/login?next=${encodeURIComponent(req.originalUrl || "/hq/reports")}`);
      }
      return sendControlled(req, res, 401, "Sign-in is required.");
    }
    return requireAccess(req, res, next);
  }

  async function shellLocals(req, res, activeNav, extra) {
    return buildHqAdminShellLocals(req, res, {
      env,
      isProduction,
      activeNav,
      getPool,
      pageTitle:
        (extra && extra.pageTitle) ||
        (activeNav === "audit"
          ? "Audit"
          : activeNav === "attendance"
            ? "Attendance report"
            : activeNav === "giving"
              ? "Giving report"
              : activeNav === "executive"
                ? "Executive dashboard"
                : activeNav === "governance"
                  ? "Governance audit"
                  : "Reports"),
      extra: {
        shellKind: "hq",
        ...(extra || {}),
      },
    });
  }

  async function resolveOptionalBranch(req, res, churchId) {
    const branchKey = String((req.query && req.query.branch) || "")
      .trim()
      .toLowerCase();
    if (!branchKey) {
      return { ok: true, branchId: null, branchKey: "", branchDisplayName: null };
    }
    const resolved = await resolveBlessBoardBranchForChurch(getPool(), churchId, branchKey);
    if (!resolved.ok) {
      if (resolved.status === BRANCH_STATUS.LOOKUP_ERROR) {
        sendControlled(req, res, 503, "Branch lookup is temporarily unavailable.");
        return { ok: false };
      }
      sendControlled(req, res, 404, "That branch is not available for this church.");
      return { ok: false };
    }
    return {
      ok: true,
      branchId: resolved.branch.id,
      branchKey: resolved.branch.key,
      branchDisplayName: resolved.branch.displayName,
    };
  }

  router.get("/hq/reports", rejectApex, gate, async (req, res) => {
    const tenant = resolveTenantForAuthorization(req);
    const session = req.v5Session && req.v5Session.session;
    if (!tenant || !tenant.church || !session || !session.userId) {
      return sendControlled(req, res, 403, "You do not have access to this site.");
    }
    const yearMonth = normalizeYearMonth(req.query && req.query.month);
    const branch = await resolveOptionalBranch(req, res, tenant.church.id);
    if (!branch.ok) return;

    const [result, branches] = await Promise.all([
      getHqOperationalReport(getPool(), {
        churchId: tenant.church.id,
        actorUserId: session.userId,
        tenant,
        yearMonth,
        branchId: branch.branchId,
      }),
      listBlessBoardBranches(getPool(), tenant.church.id),
    ]);
    if (!result.ok) {
      return sendControlled(
        req,
        res,
        result.status === STATUS.FORBIDDEN ? 403 : 503,
        "Reports are temporarily unavailable."
      );
    }
    const reportTier = result.report.reportTier || "basic";
    const html = renderView(
      "hq/reports.ejs",
      await shellLocals(req, res, "reports", {
        pageTitle: "HQ reports",
        report: result.report,
        reportTier,
        yearMonth: result.report.yearMonth,
        branchFilter: branch.branchKey,
        branches: branches.ok ? branches.branches : [],
      })
    );
    return res.status(200).type("html").send(html);
  });

  router.get("/hq/reports/attendance", rejectApex, gate, async (req, res) => {
    const tenant = resolveTenantForAuthorization(req);
    const session = req.v5Session && req.v5Session.session;
    if (!tenant || !tenant.church || !session || !session.userId) {
      return sendControlled(req, res, 403, "You do not have access to this site.");
    }
    const yearMonth = normalizeYearMonth(req.query && req.query.month);
    const branch = await resolveOptionalBranch(req, res, tenant.church.id);
    if (!branch.ok) return;

    const tierResult = await resolveChurchReportTier(getPool(), tenant.church.id);
    const reportTier =
      tierResult.ok && tierResult.reportTier ? tierResult.reportTier : "basic";
    const advancedEntitled = reportTier === "advanced";

    if (!advancedEntitled) {
      const branches = await listBlessBoardBranches(getPool(), tenant.church.id);
      const html = renderView(
        "hq/attendance-report.ejs",
        await shellLocals(req, res, "attendance", {
          pageTitle: "Attendance report",
          summary: null,
          reportTier,
          advancedEntitled: false,
          yearMonth,
          branchFilter: branch.branchKey,
          branchDisplayName: branch.branchDisplayName,
          branches: branches.ok ? branches.branches : [],
        })
      );
      return res.status(200).type("html").send(html);
    }

    const [summary, branches] = await Promise.all([
      getMonthlyAttendanceSummary(getPool(), {
        churchId: tenant.church.id,
        branchId: branch.branchId,
        yearMonth,
        actorUserId: session.userId,
        tenant,
      }),
      listBlessBoardBranches(getPool(), tenant.church.id),
    ]);
    if (!summary.ok) {
      return sendControlled(
        req,
        res,
        summary.status === ATT_STATUS.FORBIDDEN ? 403 : 503,
        "Attendance report is temporarily unavailable."
      );
    }
    const html = renderView(
      "hq/attendance-report.ejs",
      await shellLocals(req, res, "attendance", {
        pageTitle: "Attendance report",
        summary: summary.summary,
        reportTier,
        advancedEntitled: true,
        yearMonth,
        branchFilter: branch.branchKey,
        branchDisplayName: branch.branchDisplayName,
        branches: branches.ok ? branches.branches : [],
      })
    );
    return res.status(200).type("html").send(html);
  });

  router.get("/hq/reports/executive", rejectApex, gate, async (req, res) => {
    const tenant = resolveTenantForAuthorization(req);
    const session = req.v5Session && req.v5Session.session;
    if (!tenant || !tenant.church || !session || !session.userId) {
      return sendControlled(req, res, 403, "You do not have access to this site.");
    }
    const yearMonth = normalizeYearMonth(req.query && req.query.month);
    const branch = await resolveOptionalBranch(req, res, tenant.church.id);
    if (!branch.ok) return;

    const execResult = await resolveChurchExecutiveReports(getPool(), tenant.church.id);
    const executiveEntitled = Boolean(execResult.ok && execResult.executiveEntitled);

    if (!executiveEntitled) {
      const branches = await listBlessBoardBranches(getPool(), tenant.church.id);
      const html = renderView(
        "hq/executive-dashboard.ejs",
        await shellLocals(req, res, "executive", {
          pageTitle: "Executive dashboard",
          report: null,
          executiveEntitled: false,
          activeBranchCount: 0,
          yearMonth,
          branchFilter: branch.branchKey,
          branchDisplayName: branch.branchDisplayName,
          branches: branches.ok ? branches.branches : [],
        })
      );
      return res.status(200).type("html").send(html);
    }

    // Pool-level parallel only — do not Promise.all on a single pg Client.
    const [result, branches] = await Promise.all([
      getHqOperationalReport(getPool(), {
        churchId: tenant.church.id,
        actorUserId: session.userId,
        tenant,
        yearMonth,
        branchId: branch.branchId,
      }),
      listBlessBoardBranches(getPool(), tenant.church.id),
    ]);
    if (!result.ok) {
      return sendControlled(
        req,
        res,
        result.status === STATUS.FORBIDDEN ? 403 : 503,
        "Executive dashboard is temporarily unavailable."
      );
    }

    let activeBranchCount = branches.ok ? Number(branches.activeCount) || 0 : 0;
    if (branch.branchId && branches.ok) {
      activeBranchCount = branches.branches.some((b) => b.key === branch.branchKey) ? 1 : 0;
    }

    const html = renderView(
      "hq/executive-dashboard.ejs",
      await shellLocals(req, res, "executive", {
        pageTitle: "Executive dashboard",
        report: result.report,
        executiveEntitled: true,
        activeBranchCount,
        yearMonth: result.report.yearMonth,
        branchFilter: branch.branchKey,
        branchDisplayName: branch.branchDisplayName,
        branches: branches.ok ? branches.branches : [],
      })
    );
    return res.status(200).type("html").send(html);
  });

  router.get("/hq/reports/giving", rejectApex, gate, async (req, res) => {
    const tenant = resolveTenantForAuthorization(req);
    const session = req.v5Session && req.v5Session.session;
    if (!tenant || !tenant.church || !session || !session.userId) {
      return sendControlled(req, res, 403, "You do not have access to this site.");
    }
    const yearMonth = normalizeYearMonth(req.query && req.query.month);
    const branch = await resolveOptionalBranch(req, res, tenant.church.id);
    if (!branch.ok) return;

    const tierResult = await resolveChurchReportTier(getPool(), tenant.church.id);
    const reportTier =
      tierResult.ok && tierResult.reportTier ? tierResult.reportTier : "basic";
    const advancedEntitled = reportTier === "advanced";

    if (!advancedEntitled) {
      const branches = await listBlessBoardBranches(getPool(), tenant.church.id);
      const html = renderView(
        "hq/giving-report.ejs",
        await shellLocals(req, res, "giving", {
          pageTitle: "Giving report",
          summary: null,
          reportTier,
          advancedEntitled: false,
          yearMonth,
          branchFilter: branch.branchKey,
          branchDisplayName: branch.branchDisplayName,
          branches: branches.ok ? branches.branches : [],
        })
      );
      return res.status(200).type("html").send(html);
    }

    const [summary, branches] = await Promise.all([
      getMonthlyGivingSummary(getPool(), {
        churchId: tenant.church.id,
        branchId: branch.branchId,
        yearMonth,
        actorUserId: session.userId,
        tenant,
      }),
      listBlessBoardBranches(getPool(), tenant.church.id),
    ]);
    if (!summary.ok) {
      return sendControlled(
        req,
        res,
        summary.status === GIV_STATUS.FORBIDDEN ? 403 : 503,
        "Giving report is temporarily unavailable."
      );
    }
    const html = renderView(
      "hq/giving-report.ejs",
      await shellLocals(req, res, "giving", {
        pageTitle: "Giving report",
        summary: summary.summary,
        reportTier,
        advancedEntitled: true,
        yearMonth,
        branchFilter: branch.branchKey,
        branchDisplayName: branch.branchDisplayName,
        branches: branches.ok ? branches.branches : [],
      })
    );
    return res.status(200).type("html").send(html);
  });

  router.get("/hq/audit", rejectApex, gate, requireAuditView, async (req, res) => {
    const tenant = resolveTenantForAuthorization(req);
    const session = req.v5Session && req.v5Session.session;
    if (!tenant || !tenant.church || !tenant.organization || !session || !session.userId) {
      return sendControlled(req, res, 403, "You do not have access to this site.");
    }
    const beforeRaw = req.query && req.query.before ? String(req.query.before).trim() : "";
    const before = beforeRaw || null;
    const actionFilter = parseAuditActionFilter(req.query && req.query.action);
    const entityTypeFilter = parseAuditEntityTypeFilter(req.query && req.query.entity);
    const outcomeFilter = parseAuditOutcomeFilter(req.query && req.query.outcome);

    const listed = await listOrganizationAuditEvents(getPool(), {
      organizationId: tenant.organization.id,
      churchId: tenant.church.id,
      before,
      actionKey: actionFilter || null,
      entityType: entityTypeFilter || null,
      outcome: outcomeFilter || null,
      limit: AUDIT_PAGE_SIZE,
    });
    if (!listed.ok) {
      const badFilter =
        listed.reason === "action_key" ||
        listed.reason === "entity_type" ||
        listed.reason === "outcome";
      return sendControlled(
        req,
        res,
        listed.status === AUDIT_STATUS.FORBIDDEN ? 403 : badFilter ? 400 : 503,
        badFilter ? "That audit filter is not valid." : "Audit log is temporarily unavailable."
      );
    }
    const nextBefore =
      listed.nextBefore instanceof Date
        ? listed.nextBefore.toISOString()
        : listed.nextBefore
          ? String(listed.nextBefore)
          : null;
    const html = renderView(
      "hq/audit.ejs",
      await shellLocals(req, res, "audit", {
        pageTitle: "Audit trail",
        events: presentAuditEventsForHq(listed.events),
        hasMore: Boolean(listed.hasMore),
        nextBefore,
        actionFilter,
        entityTypeFilter,
        outcomeFilter,
        outcomes: AUDIT_OUTCOMES,
        pageSize: AUDIT_PAGE_SIZE,
      })
    );
    return res.status(200).type("html").send(html);
  });

  router.get("/hq/audit/governance", rejectApex, gate, async (req, res) => {
    const tenant = resolveTenantForAuthorization(req);
    const session = req.v5Session && req.v5Session.session;
    if (!tenant || !tenant.church || !tenant.organization || !session || !session.userId) {
      return sendControlled(req, res, 403, "You do not have access to this site.");
    }

    const auditGate = await resolveChurchAdvancedAudit(getPool(), tenant.church.id);
    const governanceEntitled = Boolean(auditGate.ok && auditGate.advancedAuditEntitled);

    const beforeRaw = req.query && req.query.before ? String(req.query.before).trim() : "";
    const before = beforeRaw || null;
    const actionCategoryFilter = parseAuditActionCategoryFilter(req.query && req.query.category);
    const outcomeFilter = parseAuditOutcomeFilter(req.query && req.query.outcome);
    const dateFromFilter = parseAuditDateFilter(req.query && req.query.from);
    const dateToFilter = parseAuditDateFilter(req.query && req.query.to);
    const actorFilter = parseAuditActorFilter(req.query && req.query.actor);
    const branch = await resolveOptionalBranch(req, res, tenant.church.id);
    if (!branch.ok) return;

    if (!governanceEntitled) {
      const branches = await listBlessBoardBranches(getPool(), tenant.church.id);
      const html = renderView(
        "hq/governance-audit.ejs",
        await shellLocals(req, res, "governance", {
          pageTitle: "Governance audit",
          governanceEntitled: false,
          events: [],
          hasMore: false,
          nextBefore: null,
          actionCategoryFilter: "",
          outcomeFilter: "",
          dateFromFilter: "",
          dateToFilter: "",
          actorFilter: "",
          branchFilter: branch.branchKey,
          branchDisplayName: branch.branchDisplayName,
          branches: branches.ok ? branches.branches : [],
          actors: [],
          actionCategories: AUDIT_ACTION_CATEGORIES,
          outcomes: AUDIT_OUTCOMES,
          pageSize: AUDIT_PAGE_SIZE,
        })
      );
      return res.status(200).type("html").send(html);
    }

    const [listed, branches, staff] = await Promise.all([
      listOrganizationAuditEvents(getPool(), {
        organizationId: tenant.organization.id,
        churchId: tenant.church.id,
        branchId: branch.branchId,
        actorUserId: actorFilter || null,
        actionCategory: actionCategoryFilter || null,
        outcome: outcomeFilter || null,
        createdOnOrAfter: dateFromFilter || null,
        createdToDate: dateToFilter || null,
        before,
        limit: AUDIT_PAGE_SIZE,
      }),
      listBlessBoardBranches(getPool(), tenant.church.id),
      listHqChurchRoles(getPool(), {
        actorUserId: session.userId,
        organizationId: tenant.organization.id,
        churchId: tenant.church.id,
        limit: 200,
        offset: 0,
      }),
    ]);

    if (!listed.ok) {
      const badFilter =
        listed.reason === "action_category" ||
        listed.reason === "outcome" ||
        listed.reason === "branch_id" ||
        listed.reason === "actor_user_id" ||
        listed.reason === "created_on_or_after" ||
        listed.reason === "created_to_date";
      return sendControlled(
        req,
        res,
        listed.status === AUDIT_STATUS.FORBIDDEN ? 403 : badFilter ? 400 : 503,
        badFilter ? "That governance filter is not valid." : "Governance audit is temporarily unavailable."
      );
    }

    if (actorFilter && staff.ok) {
      const allowed = presentGovernanceActors(staff.roles).some((a) => a.userId === actorFilter);
      if (!allowed) {
        return sendControlled(req, res, 400, "That actor is not available for this church.");
      }
    }

    const nextBefore =
      listed.nextBefore instanceof Date
        ? listed.nextBefore.toISOString()
        : listed.nextBefore
          ? String(listed.nextBefore)
          : null;

    const html = renderView(
      "hq/governance-audit.ejs",
      await shellLocals(req, res, "governance", {
        pageTitle: "Governance audit",
        governanceEntitled: true,
        events: presentAuditEventsForHq(listed.events),
        hasMore: Boolean(listed.hasMore),
        nextBefore,
        actionCategoryFilter,
        outcomeFilter,
        dateFromFilter,
        dateToFilter,
        actorFilter,
        branchFilter: branch.branchKey,
        branchDisplayName: branch.branchDisplayName,
        branches: branches.ok ? branches.branches : [],
        actors: staff.ok ? presentGovernanceActors(staff.roles) : [],
        actionCategories: AUDIT_ACTION_CATEGORIES,
        outcomes: AUDIT_OUTCOMES,
        pageSize: AUDIT_PAGE_SIZE,
      })
    );
    return res.status(200).type("html").send(html);
  });

  return router;
}

module.exports = {
  createHqReportsRouter,
};
