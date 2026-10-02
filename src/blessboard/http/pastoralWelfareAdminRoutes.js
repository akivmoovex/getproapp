"use strict";

/**
 * HQ pastoral care + welfare admin routes.
 * Case mutations go through services only. List pages stay metadata-only.
 */

const express = require("express");
const { renderV5Ejs } = require("./v5EjsTemplateCache");
const {
  createRequireBlessBoardPermission,
} = require("./requireBlessBoardPermission");
const { resolveTenantForAuthorization } = require("./loadBlessBoardAuthorizationContext");
const { createRejectApex } = require("./rejectApex");
const { buildHqAdminShellLocals } = require("./hqAdminShellLocals");
const {
  CSRF_FIELD,
  validateCsrf,
} = require("../../platform/http/v5Csrf");
const { authorize } = require("../services/blessBoardRbacAuthorizationService");
const pastoral = require("../services/pastoralCareService");
const welfare = require("../services/welfareCareService");

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
  if (!wantsHtml) return res.status(status).type("text").send(String(message || ""));
  return res.status(status).type("html").send(`<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><title>Pastoral care</title>
<link rel="stylesheet" href="/blessboard/v5/hq-admin.css?v=75"/></head>
<body class="bb-hq-body"><main class="bb-hq-login-unavailable">
<h1>${status === 401 ? "Sign-in required" : "Unavailable"}</h1>
<p>${safe}</p><p><a href="/hq">HQ home</a></p></main></body></html>`);
}

function redirectWith(res, path, kind, code) {
  const q = kind === "error" ? `error=${encodeURIComponent(code)}` : `notice=${encodeURIComponent(code)}`;
  return res.redirect(303, `${path}?${q}`);
}

/**
 * @param {{
 *   getPool: () => { query: Function },
 *   isApexHost: (req: import('express').Request) => boolean,
 *   env?: NodeJS.ProcessEnv,
 * }} deps
 */
function createPastoralWelfareAdminRouter(deps) {
  const router = express.Router();
  const getPool = deps.getPool;
  const isApexHost = deps.isApexHost;
  const env = deps.env || process.env;
  const isProduction = String(env.NODE_ENV || "") === "production";

  const requirePastoralLanding = async (req, res, next) => {
    try {
      const session =
        req.v5Session && req.v5Session.authenticated && req.v5Session.session
          ? req.v5Session.session
          : null;
      if (!session || !session.userId) {
        return sendControlled(req, res, 401, "Sign-in is required.");
      }
      const tenant = resolveTenantForAuthorization(req);
      if (!tenant || tenant.resolved !== true) {
        return sendControlled(req, res, 403, "You do not have access to this site.");
      }
      const resourceContext = {
        organizationId: tenant.organization.id,
        churchId: tenant.church.id,
        branchId: tenant.primaryBranch && tenant.primaryBranch.id ? tenant.primaryBranch.id : null,
      };
      const view = await authorize(getPool(), {
        actor: { userId: session.userId },
        permission: "pastoral_cases.view_assigned",
        tenantContext: tenant,
        resourceContext,
      });
      const referral = await authorize(getPool(), {
        actor: { userId: session.userId },
        permission: "pastoral_referrals.create",
        tenantContext: tenant,
        resourceContext,
      });
      if (!view.allowed && !referral.allowed) {
        return sendControlled(req, res, 404, "Not found.");
      }
      return next();
    } catch {
      return sendControlled(req, res, 503, "Access check is temporarily unavailable.");
    }
  };
  const requireWelfareView = createRequireBlessBoardPermission(
    "welfare_cases.view_assigned",
    null,
    { getPool, concealAsNotFound: true }
  );

  const rejectApex = createRejectApex({
    isApexHost,
    mode: "unlessTenant",
    sendUnavailable: (req, res) => sendControlled(req, res, 404, "Not found on this host."),
  });

  function gateStaff(req, res, next) {
    const session =
      req.v5Session && req.v5Session.authenticated && req.v5Session.session
        ? req.v5Session.session
        : null;
    if (!session || !session.userId) {
      return res.redirect(
        303,
        `/login?next=${encodeURIComponent(req.originalUrl || "/hq/pastoral-care")}`
      );
    }
    const tenant = resolveTenantForAuthorization(req);
    if (!tenant || tenant.resolved !== true) {
      return sendControlled(req, res, 403, "You do not have access to this site.");
    }
    return next();
  }

  async function shellLocals(req, res, activeNav, extra) {
    return buildHqAdminShellLocals(req, res, {
      env,
      isProduction,
      getPool,
      activeNav,
      pageTitle: (extra && extra.pageTitle) || "Pastoral care",
      extra: { shellKind: "hq", ...(extra || {}) },
    });
  }

  function tenantIds(req) {
    const tenant = resolveTenantForAuthorization(req);
    const session = req.v5Session && req.v5Session.session;
    return {
      tenant,
      actorUserId: session && session.userId,
      organizationId: tenant.organization.id,
      churchId: tenant.church.id,
      branchId: tenant.primaryBranch && tenant.primaryBranch.id ? tenant.primaryBranch.id : null,
      tenantContext: tenant,
    };
  }

  function validateCsrfPost(req, res) {
    const submitted = req.body && req.body[CSRF_FIELD];
    if (!validateCsrf(req, submitted, env)) {
      sendControlled(req, res, 403, "Invalid or missing CSRF token.");
      return false;
    }
    return true;
  }

  // ---- Pastoral care ----
  router.get("/hq/pastoral-care", rejectApex, gateStaff, requirePastoralLanding, async (req, res) => {
    return res
      .status(200)
      .type("html")
      .send(
        renderV5Ejs(
          "hq/pastoral-care.ejs",
          await shellLocals(req, res, "pastoral-care", {
            pageTitle: "Pastoral care",
            notice: req.query.notice || "",
            error: req.query.error || "",
          })
        )
      );
  });

  router.get(
    "/hq/pastoral-care/cases",
    rejectApex,
    gateStaff,
    requirePastoralLanding,
    async (req, res) => {
      const ids = tenantIds(req);
      const listed = await pastoral.listPastoralCases(getPool(), {
        actorUserId: ids.actorUserId,
        organizationId: ids.organizationId,
        churchId: ids.churchId,
        branchId: ids.branchId,
        tenantContext: ids.tenantContext,
      });
      if (!listed.ok) {
        return sendControlled(
          req,
          res,
          listed.status === pastoral.STATUS.FORBIDDEN ? 403 : 503,
          "Cases unavailable."
        );
      }
      return res
        .status(200)
        .type("html")
        .send(
          renderV5Ejs(
            "hq/pastoral-care-cases.ejs",
            await shellLocals(req, res, "pastoral-care", {
              pageTitle: "Pastoral cases",
              cases: listed.cases,
              notice: req.query.notice || "",
              error: req.query.error || "",
            })
          )
        );
    }
  );

  router.post("/hq/pastoral-care/cases", rejectApex, gateStaff, async (req, res) => {
    if (!validateCsrfPost(req, res)) return;
    const ids = tenantIds(req);
    const body = req.body || {};
    const created = await pastoral.createPastoralCase(getPool(), {
      actorUserId: ids.actorUserId,
      organizationId: ids.organizationId,
      churchId: ids.churchId,
      branchId: ids.branchId || body.branchId,
      tenantContext: ids.tenantContext,
      caseKey: body.caseKey,
      title: body.title,
      category: body.category || "referral",
      confidentialityLevel: body.confidentialityLevel || "general_care",
      memberId: body.memberId || null,
      isReferral: String(body.isReferral || "") === "1",
    });
    if (!created.ok) {
      return redirectWith(res, "/hq/pastoral-care/cases", "error", created.reason || "failed");
    }
    return redirectWith(res, `/hq/pastoral-care/cases/${created.case.id}`, "notice", "created");
  });

  router.get(
    "/hq/pastoral-care/cases/:id",
    rejectApex,
    gateStaff,
    async (req, res) => {
      const id = String(req.params.id || "");
      if (!UUID_RE.test(id)) return sendControlled(req, res, 404, "Not found.");
      const ids = tenantIds(req);
      const detail = await pastoral.getPastoralCaseDetail(getPool(), {
        actorUserId: ids.actorUserId,
        organizationId: ids.organizationId,
        churchId: ids.churchId,
        branchId: ids.branchId,
        tenantContext: ids.tenantContext,
        caseId: id,
        includeNoteBodies: true,
      });
      if (!detail.ok) return sendControlled(req, res, 404, "Not found.");
      return res
        .status(200)
        .type("html")
        .send(
          renderV5Ejs(
            "hq/pastoral-care-case-detail.ejs",
            await shellLocals(req, res, "pastoral-care", {
              pageTitle: detail.case.title || "Pastoral case",
              pastoralCase: detail.case,
              notes: detail.notes,
              accessWarning: detail.accessWarning,
              notice: req.query.notice || "",
              error: req.query.error || "",
            })
          )
        );
    }
  );

  router.post("/hq/pastoral-care/cases/:id/assign", rejectApex, gateStaff, async (req, res) => {
    if (!validateCsrfPost(req, res)) return;
    const id = String(req.params.id || "");
    const ids = tenantIds(req);
    const body = req.body || {};
    const result = await pastoral.assignPastoralCase(getPool(), {
      ...ids,
      caseId: id,
      assigneeUserId: body.assigneeUserId,
      assignmentRole: body.assignmentRole || "minister",
    });
    const back = `/hq/pastoral-care/cases/${id}`;
    if (!result.ok) return redirectWith(res, back, "error", result.reason || "failed");
    return redirectWith(res, back, "notice", "assigned");
  });

  router.post("/hq/pastoral-care/cases/:id/notes", rejectApex, gateStaff, async (req, res) => {
    if (!validateCsrfPost(req, res)) return;
    const id = String(req.params.id || "");
    const ids = tenantIds(req);
    const body = req.body || {};
    const result = await pastoral.addPastoralCaseNote(getPool(), {
      ...ids,
      caseId: id,
      body: body.body,
      noteVisibility: body.noteVisibility || "referrer_safe",
    });
    const back = `/hq/pastoral-care/cases/${id}`;
    if (!result.ok) return redirectWith(res, back, "error", result.reason || "failed");
    return redirectWith(res, back, "notice", "note_added");
  });

  router.post(
    "/hq/pastoral-care/cases/:id/confidentiality",
    rejectApex,
    gateStaff,
    async (req, res) => {
      if (!validateCsrfPost(req, res)) return;
      const id = String(req.params.id || "");
      const ids = tenantIds(req);
      const result = await pastoral.changePastoralConfidentiality(getPool(), {
        ...ids,
        caseId: id,
        confidentialityLevel: (req.body && req.body.confidentialityLevel) || "",
      });
      const back = `/hq/pastoral-care/cases/${id}`;
      if (!result.ok) return redirectWith(res, back, "error", result.reason || "failed");
      return redirectWith(res, back, "notice", "confidentiality_updated");
    }
  );

  router.post("/hq/pastoral-care/cases/:id/escalate", rejectApex, gateStaff, async (req, res) => {
    if (!validateCsrfPost(req, res)) return;
    const id = String(req.params.id || "");
    const ids = tenantIds(req);
    const result = await pastoral.escalatePastoralCase(getPool(), { ...ids, caseId: id });
    const back = `/hq/pastoral-care/cases/${id}`;
    if (!result.ok) return redirectWith(res, back, "error", result.reason || "failed");
    return redirectWith(res, back, "notice", "escalated");
  });

  router.post("/hq/pastoral-care/cases/:id/close", rejectApex, gateStaff, async (req, res) => {
    if (!validateCsrfPost(req, res)) return;
    const id = String(req.params.id || "");
    const ids = tenantIds(req);
    const result = await pastoral.closePastoralCase(getPool(), { ...ids, caseId: id });
    const back = `/hq/pastoral-care/cases/${id}`;
    if (!result.ok) return redirectWith(res, back, "error", result.reason || "failed");
    return redirectWith(res, back, "notice", "closed");
  });

  router.post("/hq/pastoral-care/cases/:id/reopen", rejectApex, gateStaff, async (req, res) => {
    if (!validateCsrfPost(req, res)) return;
    const id = String(req.params.id || "");
    const ids = tenantIds(req);
    const result = await pastoral.reopenPastoralCase(getPool(), { ...ids, caseId: id });
    const back = `/hq/pastoral-care/cases/${id}`;
    if (!result.ok) return redirectWith(res, back, "error", result.reason || "failed");
    return redirectWith(res, back, "notice", "reopened");
  });

  router.post("/hq/pastoral-care/cases/:id/archive", rejectApex, gateStaff, async (req, res) => {
    if (!validateCsrfPost(req, res)) return;
    const id = String(req.params.id || "");
    const ids = tenantIds(req);
    const result = await pastoral.archivePastoralCase(getPool(), { ...ids, caseId: id });
    const back = `/hq/pastoral-care/cases/${id}`;
    if (!result.ok) return redirectWith(res, back, "error", result.reason || "failed");
    return redirectWith(res, back, "notice", "archived");
  });

  // ---- Welfare ----
  router.get("/hq/welfare", rejectApex, gateStaff, requireWelfareView, async (req, res) => {
    return res
      .status(200)
      .type("html")
      .send(
        renderV5Ejs(
          "hq/welfare.ejs",
          await shellLocals(req, res, "welfare", {
            pageTitle: "Welfare",
            notice: req.query.notice || "",
            error: req.query.error || "",
          })
        )
      );
  });

  router.get(
    "/hq/welfare/requests",
    rejectApex,
    gateStaff,
    requireWelfareView,
    async (req, res) => {
      const ids = tenantIds(req);
      const listed = await welfare.listWelfareRequests(getPool(), {
        actorUserId: ids.actorUserId,
        organizationId: ids.organizationId,
        churchId: ids.churchId,
        branchId: ids.branchId,
        tenantContext: ids.tenantContext,
      });
      if (!listed.ok) {
        return sendControlled(req, res, 403, "Welfare requests unavailable.");
      }
      return res
        .status(200)
        .type("html")
        .send(
          renderV5Ejs(
            "hq/welfare-requests.ejs",
            await shellLocals(req, res, "welfare", {
              pageTitle: "Welfare requests",
              requests: listed.requests,
              notice: req.query.notice || "",
              error: req.query.error || "",
            })
          )
        );
    }
  );

  router.post("/hq/welfare/cases", rejectApex, gateStaff, async (req, res) => {
    if (!validateCsrfPost(req, res)) return;
    const ids = tenantIds(req);
    const body = req.body || {};
    const created = await welfare.createWelfareCase(getPool(), {
      ...ids,
      caseKey: body.caseKey,
      title: body.title,
      memberId: body.memberId || null,
    });
    if (!created.ok) {
      return redirectWith(res, "/hq/welfare/requests", "error", created.reason || "failed");
    }
    return redirectWith(res, "/hq/welfare/requests", "notice", "case_created");
  });

  router.post("/hq/welfare/requests", rejectApex, gateStaff, async (req, res) => {
    if (!validateCsrfPost(req, res)) return;
    const ids = tenantIds(req);
    const body = req.body || {};
    const created = await welfare.createWelfareRequest(getPool(), {
      ...ids,
      welfareCaseId: body.welfareCaseId,
      operationalSummary: body.operationalSummary,
      assistanceType: body.assistanceType || "other",
      amountRequested: body.amountRequested,
      currencyCode: body.currencyCode,
    });
    if (!created.ok) {
      return redirectWith(res, "/hq/welfare/requests", "error", created.reason || "failed");
    }
    return redirectWith(
      res,
      `/hq/welfare/requests/${created.request.id}`,
      "notice",
      "created"
    );
  });

  router.get(
    "/hq/welfare/requests/:id",
    rejectApex,
    gateStaff,
    requireWelfareView,
    async (req, res) => {
      const id = String(req.params.id || "");
      if (!UUID_RE.test(id)) return sendControlled(req, res, 404, "Not found.");
      const ids = tenantIds(req);
      const detail = await welfare.getWelfareRequestDetail(getPool(), {
        ...ids,
        requestId: id,
      });
      if (!detail.ok) return sendControlled(req, res, 404, "Not found.");
      return res
        .status(200)
        .type("html")
        .send(
          renderV5Ejs(
            "hq/welfare-request-detail.ejs",
            await shellLocals(req, res, "welfare", {
              pageTitle: "Welfare request",
              welfareRequest: detail.request,
              approvals: detail.approvals,
              distributions: detail.distributions,
              notice: req.query.notice || "",
              error: req.query.error || "",
            })
          )
        );
    }
  );

  router.post(
    "/hq/welfare/requests/:id/decide",
    rejectApex,
    gateStaff,
    async (req, res) => {
      if (!validateCsrfPost(req, res)) return;
      const id = String(req.params.id || "");
      const ids = tenantIds(req);
      const body = req.body || {};
      const result = await welfare.decideWelfareRequest(getPool(), {
        ...ids,
        requestId: id,
        decision: body.decision,
        decisionReason: body.decisionReason,
        amountApproved: body.amountApproved,
        financeInstructionSummary: body.financeInstructionSummary,
      });
      const back = `/hq/welfare/requests/${id}`;
      if (!result.ok) return redirectWith(res, back, "error", result.reason || "failed");
      return redirectWith(res, back, "notice", body.decision || "decided");
    }
  );

  router.post(
    "/hq/welfare/requests/:id/distribute",
    rejectApex,
    gateStaff,
    async (req, res) => {
      if (!validateCsrfPost(req, res)) return;
      const id = String(req.params.id || "");
      const ids = tenantIds(req);
      const body = req.body || {};
      const result = await welfare.recordWelfareDistribution(getPool(), {
        ...ids,
        requestId: id,
        amountDistributed: body.amountDistributed,
        currencyCode: body.currencyCode,
        distributionMethod: body.distributionMethod || "other",
        recipientAcknowledged: String(body.recipientAcknowledged || "") === "1",
        distributionNote: body.distributionNote,
      });
      const back = `/hq/welfare/requests/${id}`;
      if (!result.ok) return redirectWith(res, back, "error", result.reason || "failed");
      return redirectWith(res, back, "notice", "distributed");
    }
  );

  return router;
}

module.exports = {
  createPastoralWelfareAdminRouter,
};
