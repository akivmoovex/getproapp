"use strict";

/**
 * V2.04 BB join-request administration (BB-R01–R04).
 * Additive to pastoral /branch-admin/requests — does not replace it.
 * Reuses platform approval workflow + BB join adapter.
 */

const fs = require("fs");
const path = require("path");
const ejs = require("ejs");
const express = require("express");

const {
  createRequireBlessBoardPermission,
} = require("./requireBlessBoardPermission");
const { resolveTenantForAuthorization } = require("./loadBlessBoardAuthorizationContext");
const { createRejectApex } = require("./rejectApex");
const {
  createRequireV5AuthenticatedSession,
} = require("../../platform/http/v5SessionAuthGate");
const { buildBranchAdminShellLocals } = require("./branchAdminShellLocals");
const { CSRF_FIELD, validateCsrf } = require("../../platform/http/v5Csrf");
const {
  APPROVAL_REQUEST_STATUS,
  APPROVAL_REQUEST_STATUSES,
} = require("../../platform/requestApproval");
const {
  JOIN_REQUEST_TYPE,
  JOIN_TARGET_TYPE,
  JOIN_PERMISSION,
  assertResourceScopedReview,
  reviewJoinRequest,
  listJoinRequestsForAdmin,
  getJoinRequestForAdmin,
  createPgMembershipStore,
  RESULT: JOIN_RESULT,
} = require("../services/joinRequest");
const participationRepo = require("../repositories/participationRepository");
const { authorize } = require("../services/blessBoardRbacAuthorizationService");

const VIEWS_ROOT = path.join(__dirname, "..", "..", "..", "views", "blessboard", "v5");
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function renderView(relativePath, data) {
  const filename = path.join(VIEWS_ROOT, relativePath);
  const source = fs.readFileSync(filename, "utf8");
  return ejs.render(source, data, { filename });
}

function presentRequest(request) {
  if (!request) return null;
  const typeLabel =
    request.requestType === JOIN_REQUEST_TYPE.MINISTRY_JOIN
      ? "Join Ministry"
      : request.requestType === JOIN_REQUEST_TYPE.DEPARTMENT_JOIN
        ? "Join Department"
        : request.requestType;
  return {
    ...request,
    typeLabel,
    statusLabel: String(request.status || "")
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase()),
    trackingId: `#REQ-${String(request.id).slice(0, 8).toUpperCase()}`,
  };
}

function createJoinRequestAdminRouter(deps) {
  const getPool = deps.getPool;
  const isApexHost = deps.isApexHost;
  const env = deps.env || process.env;
  const sendUnavailable = deps.sendUnavailable;
  const isProduction = String(env.NODE_ENV || "") === "production";
  const loginNext = "/branch-admin/join-requests";
  const membershipStore =
    (deps && deps.membershipStore) || createPgMembershipStore();
  const resolveManagedResourceIds =
    typeof deps.resolveManagedResourceIds === "function"
      ? deps.resolveManagedResourceIds
      : null;

  const router = express.Router();
  const requireView = createRequireBlessBoardPermission("events.view", null, {
    getPool,
  });

  const rejectApex = createRejectApex({
    isApexHost,
    sendUnavailable,
    mode: "unlessTenant",
  });
  const requireSession = createRequireV5AuthenticatedSession({ loginNext });

  function gateView(req, res, next) {
    if (!requireSession(req, res, { loginNext: req.originalUrl || loginNext })) {
      return;
    }
    return requireView(req, res, next);
  }

  function validateCsrfPost(req, res) {
    const submitted = req.body && req.body[CSRF_FIELD];
    if (!validateCsrf(req, submitted, env)) {
      res.status(403).type("text").send("Invalid security token. Refresh and try again.");
      return false;
    }
    return true;
  }

  function tenantScope(req, res) {
    const tenant = resolveTenantForAuthorization(req);
    if (!tenant || !tenant.church || !tenant.organization) {
      res.status(403).type("text").send("Church context is required.");
      return null;
    }
    return {
      tenant,
      organizationId: tenant.organization.id,
      churchId: tenant.church.id,
      branchId: tenant.primaryBranch ? tenant.primaryBranch.id : null,
      branchName:
        (tenant.primaryBranch &&
          (tenant.primaryBranch.displayName || tenant.primaryBranch.name)) ||
        "Branch",
      actorUserId: req.v5Session && req.v5Session.session && req.v5Session.session.userId,
    };
  }

  async function shellLocals(req, res, extra) {
    const base = await buildBranchAdminShellLocals(req, res, {
      getPool,
      env,
      isProduction,
      activeNav: "participation",
      pageTitle: (extra && extra.pageTitle) || "Requests Inbox",
    });
    return {
      ...base,
      csrfField: CSRF_FIELD,
      shellKind: "branch",
      ...(extra || {}),
    };
  }

  async function resolveReviewScope(scope) {
    const authz = await authorize(getPool(), {
      permission: JOIN_PERMISSION.REVIEW_BROAD,
      actor: { userId: scope.actorUserId },
      tenantContext: {
        organizationId: scope.organizationId,
        churchId: scope.churchId,
        primaryBranchId: scope.branchId || null,
      },
      resourceContext: {
        organizationId: scope.organizationId,
        churchId: scope.churchId,
        branchId: scope.branchId || null,
      },
    });
    const hasBroaderPermission = Boolean(authz && authz.allowed);
    let managedResourceIds = [];
    if (!hasBroaderPermission) {
      if (resolveManagedResourceIds) {
        managedResourceIds = await resolveManagedResourceIds(scope);
      } else {
        managedResourceIds = [];
      }
      managedResourceIds = Array.isArray(managedResourceIds)
        ? managedResourceIds.map((x) => String(x))
        : [];
    }
    return { hasBroaderPermission, managedResourceIds };
  }

  async function enrichRequests(requests) {
    const out = [];
    for (const reqRow of requests) {
      const presented = presentRequest(reqRow);
      let memberName = null;
      let memberNumber = null;
      let targetName = null;
      let message = null;
      try {
        if (reqRow.requesterSubjectType === "member") {
          const { rows } = await getPool().query(
            `SELECT first_name, last_name, preferred_name, member_number
               FROM blessboard.members WHERE id = $1 LIMIT 1`,
            [reqRow.requesterSubjectId]
          );
          if (rows[0]) {
            memberName =
              rows[0].preferred_name ||
              [rows[0].first_name, rows[0].last_name].filter(Boolean).join(" ");
            memberNumber = rows[0].member_number;
          }
        }
        if (reqRow.targetType === JOIN_TARGET_TYPE.MINISTRY) {
          const ministry = await participationRepo.findMinistryById(
            getPool(),
            reqRow.targetId
          );
          targetName = ministry && (ministry.name || ministry.title);
        } else if (reqRow.targetType === JOIN_TARGET_TYPE.DEPARTMENT) {
          const { rows } = await getPool().query(
            `SELECT name FROM blessboard.departments WHERE id = $1 LIMIT 1`,
            [reqRow.targetId]
          );
          targetName = rows[0] && rows[0].name;
        }
        if (reqRow.payload && reqRow.payload.message) {
          message = String(reqRow.payload.message);
        }
      } catch (_e) {
        /* presentation enrichment optional */
      }
      out.push({
        ...presented,
        memberName: memberName || "Member",
        memberNumber,
        targetName: targetName || reqRow.targetType,
        message,
      });
    }
    return out;
  }

  // —— R01 Inbox ——
  router.get(
    "/branch-admin/join-requests",
    rejectApex,
    gateView,
    async (req, res) => {
      const scope = tenantScope(req, res);
      if (!scope) return;
      const statusRaw = String((req.query && req.query.status) || "pending")
        .trim()
        .toLowerCase();
      const statusFilter =
        statusRaw === "all"
          ? "all"
          : APPROVAL_REQUEST_STATUSES.includes(statusRaw)
            ? statusRaw
            : "pending";

      const listed = await listJoinRequestsForAdmin(getPool(), {
        organizationId: scope.organizationId,
        status: statusFilter === "all" ? null : statusFilter,
        limit: 100,
      });
      const requests = await enrichRequests(listed.ok ? listed.requests : []);
      const counts = {
        pending: 0,
        approved: 0,
        rejected: 0,
        cancelled: 0,
        all: 0,
      };
      for (const st of APPROVAL_REQUEST_STATUSES) {
        const part = await listJoinRequestsForAdmin(getPool(), {
          organizationId: scope.organizationId,
          status: st,
          limit: 500,
        });
        counts[st] = part.ok ? part.requests.length : 0;
      }
      counts.all =
        counts.pending + counts.approved + counts.rejected + counts.cancelled;

      const html = renderView(
        "join-requests/inbox.ejs",
        await shellLocals(req, res, {
          pageTitle: "Requests Inbox",
          stitchScreen: "BB-R01",
          requests,
          statusFilter,
          counts,
          branchName: scope.branchName,
          saved: String((req.query && req.query.saved) || ""),
        })
      );
      return res.status(200).type("html").send(html);
    }
  );

  // —— R04 Ministry members (before :id) ——
  router.get(
    "/branch-admin/join-requests/ministries/:ministryId",
    rejectApex,
    gateView,
    async (req, res) => {
      const scope = tenantScope(req, res);
      if (!scope) return;
      const ministryId = String(req.params.ministryId || "");
      if (!UUID_RE.test(ministryId)) {
        return res.status(404).type("text").send("Ministry not found.");
      }

      let ministry = null;
      let memberships = [];
      try {
        ministry = await participationRepo.findMinistryById(getPool(), ministryId);
        if (!ministry || String(ministry.churchId) !== String(scope.churchId)) {
          return res.status(404).type("text").send("Ministry not found.");
        }
        memberships = await participationRepo.listMinistryMembershipsForMinistry(
          getPool(),
          { ministryId, status: null }
        );
      } catch (_e) {
        return res.status(404).type("text").send("Ministry not found.");
      }

      const pendingReqs = await listJoinRequestsForAdmin(getPool(), {
        organizationId: scope.organizationId,
        status: APPROVAL_REQUEST_STATUS.PENDING,
        targetType: JOIN_TARGET_TYPE.MINISTRY,
        targetId: ministryId,
        limit: 50,
      });
      const pending = await enrichRequests(pendingReqs.ok ? pendingReqs.requests : []);
      const active = memberships.filter((m) => m.status === "active");
      const pendingMemberships = memberships.filter((m) => m.status === "pending");

      const html = renderView(
        "join-requests/ministry-members.ejs",
        await shellLocals(req, res, {
          pageTitle: "Ministry Members",
          stitchScreen: "BB-R04",
          ministry,
          active,
          pendingMemberships,
          pending,
          branchName: scope.branchName,
        })
      );
      return res.status(200).type("html").send(html);
    }
  );

  // —— R03 decision confirmation ——
  router.get(
    "/branch-admin/join-requests/:id/decision",
    rejectApex,
    gateView,
    async (req, res) => {
      const scope = tenantScope(req, res);
      if (!scope) return;
      const id = String(req.params.id || "");
      if (!UUID_RE.test(id)) {
        return res.status(404).type("text").send("Request not found.");
      }
      const loaded = await getJoinRequestForAdmin(getPool(), {
        organizationId: scope.organizationId,
        requestId: id,
      });
      if (!loaded.ok) {
        return res
          .status(loaded.code === JOIN_RESULT.TENANT_MISMATCH ? 403 : 404)
          .type("text")
          .send("Request not found.");
      }
      const [enriched] = await enrichRequests([loaded.request]);
      const reviewScope = await resolveReviewScope(scope);
      const scopeCheck = assertResourceScopedReview({
        targetId: loaded.request.targetId,
        managedResourceIds: reviewScope.managedResourceIds,
        hasBroaderPermission: reviewScope.hasBroaderPermission,
      });
      const decisionIntent = String((req.query && req.query.decision) || "")
        .trim()
        .toLowerCase();
      const saved = String((req.query && req.query.saved) || "")
        .trim()
        .toLowerCase();
      const html = renderView(
        "join-requests/decision.ejs",
        await shellLocals(req, res, {
          pageTitle: "Request Decision",
          stitchScreen: "BB-R03",
          request: enriched,
          decision:
            decisionIntent ||
            (saved
              ? saved
              : loaded.request.status !== APPROVAL_REQUEST_STATUS.PENDING
                ? loaded.request.status
                : "approve"),
          saved,
          canDecide:
            scopeCheck.ok &&
            loaded.request.status === APPROVAL_REQUEST_STATUS.PENDING &&
            !saved,
          scopeDenied: !scopeCheck.ok,
          branchName: scope.branchName,
          error: null,
          values: { reason: "" },
        })
      );
      return res.status(200).type("html").send(html);
    }
  );

  // —— R02 review ——
  router.get(
    "/branch-admin/join-requests/:id",
    rejectApex,
    gateView,
    async (req, res) => {
      const scope = tenantScope(req, res);
      if (!scope) return;
      const id = String(req.params.id || "");
      if (!UUID_RE.test(id)) {
        return res.status(404).type("text").send("Request not found.");
      }
      const loaded = await getJoinRequestForAdmin(getPool(), {
        organizationId: scope.organizationId,
        requestId: id,
      });
      if (!loaded.ok) {
        return res
          .status(loaded.code === JOIN_RESULT.TENANT_MISMATCH ? 403 : 404)
          .type("text")
          .send("Request not found.");
      }
      const [enriched] = await enrichRequests([loaded.request]);
      const reviewScope = await resolveReviewScope(scope);
      const scopeCheck = assertResourceScopedReview({
        targetId: loaded.request.targetId,
        managedResourceIds: reviewScope.managedResourceIds,
        hasBroaderPermission: reviewScope.hasBroaderPermission,
      });

      const html = renderView(
        "join-requests/review.ejs",
        await shellLocals(req, res, {
          pageTitle: "Request Review",
          stitchScreen: "BB-R02",
          request: enriched,
          decisions: loaded.decisions || [],
          canReview:
            scopeCheck.ok &&
            loaded.request.status === APPROVAL_REQUEST_STATUS.PENDING,
          scopeDenied: !scopeCheck.ok,
          branchName: scope.branchName,
          error: null,
          values: { reason: "" },
        })
      );
      return res.status(200).type("html").send(html);
    }
  );

  router.post(
    "/branch-admin/join-requests/:id/decide",
    rejectApex,
    gateView,
    async (req, res) => {
      const scope = tenantScope(req, res);
      if (!scope) return;
      if (!validateCsrfPost(req, res)) return;
      const id = String(req.params.id || "");
      if (!UUID_RE.test(id)) {
        return res.status(404).type("text").send("Request not found.");
      }

      const decision = String((req.body && req.body.decision) || "")
        .trim()
        .toLowerCase();
      const reason = String((req.body && req.body.reason) || "").trim();
      const reviewScope = await resolveReviewScope(scope);

      const result = await reviewJoinRequest(
        getPool(),
        {
          requestId: id,
          organizationId: scope.organizationId,
          actorUserId: scope.actorUserId,
          decision,
          reason,
        },
        {
          hasBroaderPermission: reviewScope.hasBroaderPermission,
          managedResourceIds: reviewScope.managedResourceIds,
          membershipStore,
        }
      );

      if (!result.ok) {
        const loaded = await getJoinRequestForAdmin(getPool(), {
          organizationId: scope.organizationId,
          requestId: id,
        });
        const [enriched] = loaded.ok
          ? await enrichRequests([loaded.request])
          : [null];
        const message =
          result.code === JOIN_RESULT.SELF_APPROVAL_DENIED
            ? "You cannot approve or reject your own request."
            : result.code === JOIN_RESULT.RESOURCE_SCOPE_DENIED
              ? "You are not authorized to review this ministry/department."
              : result.code === JOIN_RESULT.REASON_REQUIRED
                ? "Rejection reason is required (at least 3 characters)."
                : result.code === JOIN_RESULT.TENANT_MISMATCH
                  ? "Request is outside this church."
                  : "Could not complete decision.";
        if (!enriched) {
          return res.status(403).type("text").send(message);
        }
        const html = renderView(
          "join-requests/decision.ejs",
          await shellLocals(req, res, {
            pageTitle: "Request Decision",
            stitchScreen: "BB-R03",
            request: enriched,
            decision,
            saved: "",
            canDecide: enriched.status === APPROVAL_REQUEST_STATUS.PENDING,
            scopeDenied: result.code === JOIN_RESULT.RESOURCE_SCOPE_DENIED,
            branchName: scope.branchName,
            error: message,
            values: { reason },
          })
        );
        const status =
          result.code === JOIN_RESULT.SELF_APPROVAL_DENIED ||
          result.code === JOIN_RESULT.RESOURCE_SCOPE_DENIED ||
          result.code === JOIN_RESULT.TENANT_MISMATCH
            ? 403
            : 400;
        return res.status(status).type("html").send(html);
      }

      return res.redirect(
        303,
        `/branch-admin/join-requests/${id}/decision?saved=${encodeURIComponent(decision)}`
      );
    }
  );

  return router;
}

module.exports = {
  createJoinRequestAdminRouter,
  presentRequest,
};
