"use strict";

/**
 * Branch-admin member registration review + member directory (hostname primary branch scope).
 * HQ/platform may open registrations by key within the same church.
 */

const express = require("express");

const {
  createRequireBlessBoardPermission,
} = require("./requireBlessBoardPermission");
const { resolveTenantForAuthorization } = require("./loadBlessBoardAuthorizationContext");
const { createRejectApex } = require("./rejectApex");
const {
  createRequireV5AuthenticatedSession,
} = require("../../platform/http/v5SessionAuthGate");
const { CSRF_FIELD, validateCsrf } = require("../../platform/http/v5Csrf");
const {
  listMemberRegistrations,
  getMemberRegistrationForManager,
  approveMemberRegistration,
  rejectMemberRegistration,
  reviewMemberRegistration,
  listBranchMembersForManager,
  getBranchMembershipOverviewForManager,
  getBranchMemberForManager,
  STATUS,
} = require("../services/memberRegistrationService");
const {
  getMembershipApplicationForReview,
} = require("../services/membershipWorkflowService");
const {
  buildAddMemberFormModel,
  parseAddMemberFormBody,
} = require("../services/blessBoardStaffAddMemberFormService");
const {
  beginStaffAddMemberFlow,
  handleMatchStep,
  confirmStaffAddMemberCreate,
  reviewModelFromDraft,
  FLOW_CODE,
} = require("../services/blessBoardStaffAddMemberFlowService");
const {
  resolveAdminCapabilities,
  buildProfileModel,
  submitEditMember,
  submitChurchIdChange,
  submitPortalAccess,
  submitMembershipStatus,
  submitBranchTransfer,
  loadMemberHistory,
  RESULT: ADMIN_RESULT,
} = require("../services/blessBoardStaffMemberAdminUiService");
const { PORTAL_ACCESS_STATUS } = require("../services/memberDomainConstants");
const { listBlessBoardBranches } = require("../services/listBlessBoardBranches");
const {
  authorize: authorizeBlessBoard,
} = require("../services/blessBoardRbacAuthorizationService");
const {
  renderBranchAdminView,
  sendLoginUnavailable,
} = require("./branchAdminRoutes");
const { buildBranchAdminShellLocals } = require("./branchAdminShellLocals");

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Safe structured log — no PII / no rejection notes.
 * @param {object} fields
 */
function logReviewEvent(fields) {
  try {
    // eslint-disable-next-line no-console
    console.info(
      JSON.stringify({
        scope: "blessboard.member_registration_review",
        ...fields,
      })
    );
  } catch {
    /* ignore */
  }
}

function churchDisplayFallback(tenant) {
  if (tenant && tenant.church && tenant.church.displayName) {
    return tenant.church.displayName;
  }
  return "your church";
}

/**
 * @param {{
 *   getPool: () => { query: Function },
 *   isApexHost: (req: import('express').Request) => boolean,
 *   env?: NodeJS.ProcessEnv,
 *   sendUnavailable?: Function,
 * }} deps
 */
function createBranchRegistrationAdminRouter(deps) {
  const getPool = deps.getPool;
  const isApexHost = deps.isApexHost;
  const env = deps.env || process.env;
  const isProduction = String(env.NODE_ENV || "") === "production";

  const router = express.Router();
  const requireAccess = createRequireBlessBoardPermission("members.view", null, { getPool });
  const requireCreate = createRequireBlessBoardPermission("members.create", null, { getPool });
  const requireEdit = createRequireBlessBoardPermission("members.edit", null, { getPool });
  const requireBlock = createRequireBlessBoardPermission("members.block", null, { getPool });
  const requireChurchId = createRequireBlessBoardPermission(
    "members.manage_church_id",
    null,
    { getPool }
  );

  function sendMissingTenantContext(req, res) {
    return sendLoginUnavailable(
      req,
      res,
      403,
      "Your account is signed in, but this branch workspace could not be loaded. Confirm you are assigned to an active organization and branch, then sign in again."
    );
  }

  const requireSession = createRequireV5AuthenticatedSession({
    loginNext: "/branch-admin/registrations",
  });

  const rejectApex = createRejectApex({
    isApexHost,
    mode: "unlessTenant",
    sendUnavailable: (req, res) => {
      if (!(req.v5Session && req.v5Session.authenticated)) {
        requireSession(req, res, {
          loginNext: req.originalUrl || "/branch-admin/registrations",
        });
        return;
      }
      return sendMissingTenantContext(req, res);
    },
  });

  function gateAccess(req, res, next) {
    const nextUrl = req.originalUrl || "/branch-admin/registrations";
    if (!requireSession(req, res, { loginNext: nextUrl })) return;
    const tenant = resolveTenantForAuthorization(req);
    if (!tenant || tenant.resolved !== true) {
      return sendMissingTenantContext(req, res);
    }
    return requireAccess(req, res, next);
  }

  function gateCreate(req, res, next) {
    const nextUrl = req.originalUrl || "/branch-admin/members/new";
    if (!requireSession(req, res, { loginNext: nextUrl })) return;
    const tenant = resolveTenantForAuthorization(req);
    if (!tenant || tenant.resolved !== true) {
      return sendMissingTenantContext(req, res);
    }
    return requireCreate(req, res, next);
  }

  function gateEdit(req, res, next) {
    const nextUrl = req.originalUrl || "/branch-admin/members";
    if (!requireSession(req, res, { loginNext: nextUrl })) return;
    const tenant = resolveTenantForAuthorization(req);
    if (!tenant || tenant.resolved !== true) {
      return sendMissingTenantContext(req, res);
    }
    return requireEdit(req, res, next);
  }

  function gateBlock(req, res, next) {
    const nextUrl = req.originalUrl || "/branch-admin/members";
    if (!requireSession(req, res, { loginNext: nextUrl })) return;
    const tenant = resolveTenantForAuthorization(req);
    if (!tenant || tenant.resolved !== true) {
      return sendMissingTenantContext(req, res);
    }
    return requireBlock(req, res, next);
  }

  function gateChurchId(req, res, next) {
    const nextUrl = req.originalUrl || "/branch-admin/members";
    if (!requireSession(req, res, { loginNext: nextUrl })) return;
    const tenant = resolveTenantForAuthorization(req);
    if (!tenant || tenant.resolved !== true) {
      return sendMissingTenantContext(req, res);
    }
    return requireChurchId(req, res, next);
  }

  function organizationIdFrom(req) {
    const tenant = resolveTenantForAuthorization(req);
    return tenant && tenant.organization && tenant.organization.id
      ? tenant.organization.id
      : null;
  }

  async function loadScopedMember(req, res, scope) {
    const id = String(req.params.id || "").trim();
    if (!UUID_RE.test(id)) {
      sendLoginUnavailable(req, res, 404, "Member not found.");
      return null;
    }
    const loaded = await getBranchMemberForManager(getPool(), {
      memberId: id,
      actorUserId: scope.actorUserId,
      churchId: scope.churchId,
      branchId: scope.branchId,
    });
    if (!loaded.ok || !loaded.member) {
      const code =
        loaded.status === STATUS.FORBIDDEN
          ? 403
          : loaded.status === STATUS.NOT_FOUND
            ? 404
            : 503;
      sendLoginUnavailable(
        req,
        res,
        code,
        code === 404 ? "Member not found." : "You do not have access to this member."
      );
      return null;
    }
    return loaded.member;
  }

  async function shellLocals(req, res, activeNav, extra) {
    return buildBranchAdminShellLocals(req, res, {
      getPool,
      env,
      isProduction,
      activeNav,
      extra,
    });
  }

  function hostScope(req, res) {
    const tenant = resolveTenantForAuthorization(req);
    if (!tenant || !tenant.church || !tenant.church.id || !tenant.primaryBranch) {
      sendLoginUnavailable(req, res, 403, "You do not have access to this site.");
      return null;
    }
    const session = req.v5Session && req.v5Session.session;
    if (!session || !session.userId) {
      sendLoginUnavailable(req, res, 401, "Sign-in is required.");
      return null;
    }
    return {
      churchId: tenant.church.id,
      branchId: tenant.primaryBranch.id,
      actorUserId: session.userId,
    };
  }

  function validateCsrfPost(req, res) {
    const submitted = req.body && req.body[CSRF_FIELD];
    if (!validateCsrf(req, submitted, env)) {
      sendLoginUnavailable(req, res, 403, "Invalid or missing CSRF token.");
      return false;
    }
    return true;
  }

  // --- registrations ---
  router.get("/branch-admin/registrations", rejectApex, gateAccess, async (req, res) => {
    const scope = hostScope(req, res);
    if (!scope) return;

    const q = String((req.query && req.query.q) || "").slice(0, 100);
    const status = String((req.query && req.query.status) || "").trim().toLowerCase();
    const page = Math.max(Number((req.query && req.query.page) || 1) || 1, 1);
    const limit = 20;
    const offset = (page - 1) * limit;

    const listed = await listMemberRegistrations(getPool(), {
      actorUserId: scope.actorUserId,
      churchId: scope.churchId,
      branchId: scope.branchId,
      status: status || null,
      q: q || null,
      limit,
      offset,
    });

    if (!listed.ok) {
      logReviewEvent({
        op: "list",
        outcome: "denied",
        churchId: scope.churchId,
        branchId: scope.branchId,
        reason: listed.reason,
      });
      return sendLoginUnavailable(
        req,
        res,
        listed.status === STATUS.FORBIDDEN ? 403 : 503,
        "Registrations are temporarily unavailable."
      );
    }

    const totalPages = Math.max(1, Math.ceil(listed.total / limit));
    const html = renderBranchAdminView(
      "branch-admin/registrations.ejs",
      await shellLocals(req, res, "registrations", {
        pageTitle: "Verification queue",
        items: listed.items,
        total: listed.total,
        page,
        totalPages,
        limit,
        q,
        statusFilter: status,
        error: null,
        saved: String((req.query && req.query.saved) || ""),
      })
    );
    return res.status(200).type("html").send(html);
  });

  router.get(
    "/branch-admin/registrations/:registrationKey",
    rejectApex,
    gateAccess,
    async (req, res) => {
      const scope = hostScope(req, res);
      if (!scope) return;
      const registrationKey = String(req.params.registrationKey || "").trim();

      const loaded = await getMembershipApplicationForReview(getPool(), {
        registrationId: registrationKey,
        actorUserId: scope.actorUserId,
        churchId: scope.churchId,
        tenant: resolveTenantForAuthorization(req),
      });

      if (!loaded.ok || !loaded.registration) {
        const code =
          loaded.status === STATUS.FORBIDDEN
            ? 403
            : loaded.status === STATUS.NOT_FOUND
              ? 404
              : 503;
        return sendLoginUnavailable(
          req,
          res,
          code,
          code === 404 ? "Registration not found." : "You do not have access to this registration."
        );
      }

      const html = renderBranchAdminView(
        "branch-admin/registration-detail.ejs",
        await shellLocals(req, res, "registrations", {
          pageTitle: "Registration review",
          registration: loaded.registration,
          membershipReviewEvents: loaded.reviewEvents || [],
          canViewPastoralNotes: Boolean(loaded.canViewPastoralNotes),
          hostBranchId: scope.branchId,
          error: null,
          saved: String((req.query && req.query.saved) || ""),
        })
      );
      return res.status(200).type("html").send(html);
    }
  );

  async function postDecision(req, res, action) {
    const scope = hostScope(req, res);
    if (!scope) return;
    if (!validateCsrfPost(req, res)) return;

    const registrationKey = String(req.params.registrationKey || "").trim();
    const reviewNotes =
      req.body && req.body.review_notes != null ? String(req.body.review_notes) : null;

    const loaded = await getMemberRegistrationForManager(getPool(), {
      registrationId: registrationKey,
      actorUserId: scope.actorUserId,
      churchId: scope.churchId,
    });
    if (!loaded.ok || !loaded.registration) {
      return sendLoginUnavailable(req, res, 403, "You do not have access to this registration.");
    }

    let result;
    if (action === "approve") {
      // Account creation is not offered in this phase — ignore any client flag.
      result = await approveMemberRegistration(getPool(), {
        registrationId: registrationKey,
        actorUserId: scope.actorUserId,
        reviewNotes,
      });
    } else if (action === "reject") {
      result = await rejectMemberRegistration(getPool(), {
        registrationId: registrationKey,
        actorUserId: scope.actorUserId,
        reviewNotes,
      });
    } else {
      result = await reviewMemberRegistration(getPool(), {
        registrationId: registrationKey,
        actorUserId: scope.actorUserId,
      });
    }

    logReviewEvent({
      op: action,
      outcome: result.ok ? "ok" : "fail",
      churchId: scope.churchId,
      branchId: loaded.registration.branchId,
      registrationId: registrationKey,
      reason: result.ok ? null : result.reason || result.status,
    });

    if (!result.ok) {
      const html = renderBranchAdminView(
        "branch-admin/registration-detail.ejs",
        await shellLocals(req, res, "registrations", {
          pageTitle: "Registration review",
          registration: loaded.registration,
          hostBranchId: scope.branchId,
          error: "This registration could not be updated. It may have already been decided.",
          saved: "",
        })
      );
      return res.status(409).type("html").send(html);
    }

    return res.redirect(
      303,
      `/branch-admin/registrations/${encodeURIComponent(registrationKey)}?saved=${action}`
    );
  }

  router.post(
    "/branch-admin/registrations/:registrationKey/approve",
    rejectApex,
    gateAccess,
    (req, res, next) => {
      Promise.resolve(postDecision(req, res, "approve")).catch(next);
    }
  );

  router.post(
    "/branch-admin/registrations/:registrationKey/reject",
    rejectApex,
    gateAccess,
    (req, res, next) => {
      Promise.resolve(postDecision(req, res, "reject")).catch(next);
    }
  );

  // --- members directory (V2.04 BB-M01) ---
  router.get("/branch-admin/members", rejectApex, gateAccess, async (req, res) => {
    const scope = hostScope(req, res);
    if (!scope) return;

    const q = String((req.query && req.query.q) || "").slice(0, 100);
    const status = String((req.query && req.query.status) || "").trim().toLowerCase();
    const portal = String((req.query && req.query.portal) || "").trim().toLowerCase();
    const page = Math.max(Number((req.query && req.query.page) || 1) || 1, 1);
    const limit = 20;
    const offset = (page - 1) * limit;
    const tenant = resolveTenantForAuthorization(req);

    const listed = await listBranchMembersForManager(getPool(), {
      actorUserId: scope.actorUserId,
      churchId: scope.churchId,
      branchId: scope.branchId,
      status: status || null,
      portalAccessStatus: portal || null,
      q: q || null,
      limit,
      offset,
      tenant,
    });

    if (!listed.ok) {
      logReviewEvent({
        op: "members_list",
        outcome: "denied",
        churchId: scope.churchId,
        branchId: scope.branchId,
        reason: listed.reason,
      });
      if (listed.status === STATUS.FORBIDDEN) {
        return sendLoginUnavailable(
          req,
          res,
          403,
          "You do not have permission to view members."
        );
      }
      if (listed.status === STATUS.INVALID_INPUT) {
        return sendLoginUnavailable(
          req,
          res,
          400,
          "Members could not be loaded for this branch."
        );
      }
      return sendLoginUnavailable(
        req,
        res,
        503,
        "Members are temporarily unavailable."
      );
    }

    const overview = await getBranchMembershipOverviewForManager(getPool(), {
      actorUserId: scope.actorUserId,
      churchId: scope.churchId,
      branchId: scope.branchId,
      organizationId:
        tenant && tenant.organization && tenant.organization.id
          ? tenant.organization.id
          : null,
      tenant,
    });

    const overviewSafe = overview && overview.ok
      ? {
          statusCounts: overview.statusCounts,
          reviewQueue: overview.reviewQueue,
          openTransfers: overview.openTransfers,
          visitorSummary: overview.visitorSummary,
        }
      : {
          statusCounts: { total: listed.total, byStatus: {} },
          reviewQueue: { total: 0, items: [] },
          openTransfers: { total: 0, items: [] },
          visitorSummary: { available: false, total: 0 },
        };

    let canCreateMember = false;
    try {
      const createAuthz = await authorizeBlessBoard(getPool(), {
        permission: "members.create",
        actor: { userId: scope.actorUserId },
        tenantContext: {
          organizationId: tenant && tenant.organization ? tenant.organization.id : null,
          churchId: scope.churchId,
          primaryBranchId: scope.branchId,
        },
        resourceContext: {
          organizationId: tenant && tenant.organization ? tenant.organization.id : null,
          churchId: scope.churchId,
          branchId: scope.branchId,
        },
      });
      canCreateMember = Boolean(createAuthz && createAuthz.allowed === true);
    } catch (_e) {
      canCreateMember = false;
    }

    const totalPages = Math.max(1, Math.ceil(listed.total / limit));
    const html = renderBranchAdminView(
      "branch-admin/members.ejs",
      await shellLocals(req, res, "members", {
        pageTitle: "Members",
        items: listed.items,
        total: listed.total,
        page,
        totalPages,
        limit,
        q,
        statusFilter: status,
        portalFilter: portal,
        overview: overviewSafe,
        canCreateMember,
        addMemberHref: canCreateMember ? "/branch-admin/members/new" : null,
        loadGpOpsAssets: true,
        loadPhoneField: false,
      })
    );
    return res.status(200).type("html").send(html);
  });

  // --- staff Add Member (V2.04 BB-M02) — before :id ---
  router.get("/branch-admin/members/new", rejectApex, gateCreate, async (req, res) => {
    const scope = hostScope(req, res);
    if (!scope) return;
    const tenant = resolveTenantForAuthorization(req);
    const branches = await listBlessBoardBranches(getPool(), scope.churchId, {
      includeIds: true,
    });
    const formModel = await buildAddMemberFormModel(getPool(), {
      churchId: scope.churchId,
      defaultBranchId: scope.branchId,
    });
    const html = renderBranchAdminView(
      "branch-admin/member-add.ejs",
      await shellLocals(req, res, "members", {
        pageTitle: "Register New Member",
        form: formModel,
        branches: branches.ok ? branches.branches : [],
        defaultBranchId: scope.branchId,
        organizationName:
          tenant && tenant.organization && tenant.organization.displayName
            ? tenant.organization.displayName
            : churchDisplayFallback(tenant),
        loadGpOpsAssets: true,
        loadPhoneField: true,
      })
    );
    return res.status(200).type("html").send(html);
  });

  router.post("/branch-admin/members/new", rejectApex, gateCreate, async (req, res) => {
    const scope = hostScope(req, res);
    if (!scope) return;
    if (!validateCsrfPost(req, res)) return;

    const tenant = resolveTenantForAuthorization(req);
    const organizationId =
      tenant && tenant.organization && tenant.organization.id
        ? tenant.organization.id
        : null;
    if (!organizationId) {
      return sendLoginUnavailable(req, res, 403, "Organization context is required.");
    }

    const parsed = parseAddMemberFormBody(req.body || {});
    if (!parsed.values.branchId) {
      parsed.values.branchId = scope.branchId;
      parsed.branchId = scope.branchId;
      // Empty select values (missing branch UUID options) must not keep a stale
      // "Assigned branch is required" error after the workspace default applies.
      parsed.fieldErrors = (parsed.fieldErrors || []).filter(
        (err) => !(err && err.field === "branch_id")
      );
      parsed.ok = (parsed.fieldErrors || []).length === 0;
    }
    if (parsed.branchId && parsed.branchId !== scope.branchId) {
      parsed.ok = false;
      parsed.fieldErrors = (parsed.fieldErrors || []).concat([
        {
          field: "branch_id",
          message: "Assigned branch must be this branch workspace.",
        },
      ]);
    }

    const started = await beginStaffAddMemberFlow(
      getPool(),
      {
        actorUserId: scope.actorUserId,
        organizationId,
        churchId: scope.churchId,
        parsed,
        env,
      },
      {}
    );

    if (started.code === FLOW_CODE.VALIDATION || (!started.ok && started.step === "form")) {
      return renderAddMemberForm(req, res, scope, tenant, {
        values: started.values || parsed.values,
        fieldErrors: started.fieldErrors || parsed.fieldErrors || [],
        status: 400,
      });
    }

    if (started.step === "match") {
      return renderMatchStep(req, res, {
        draftToken: started.draftToken,
        draft: started.draft,
        matches: started.matches || [],
        blocked: started.code === FLOW_CODE.MATCH_BLOCKED,
        churchIdPreview: started.churchIdPreview,
        status: started.code === FLOW_CODE.MATCH_BLOCKED ? 409 : 200,
      });
    }

    if (started.step === "review") {
      return renderReviewStep(req, res, {
        draftToken: started.draftToken,
        draft: started.draft,
        status: 200,
      });
    }

    return renderAddMemberForm(req, res, scope, tenant, {
      values: parsed.values,
      fieldErrors: [
        { field: "_form", message: "Unable to continue member creation." },
      ],
      status: 500,
    });
  });

  router.post("/branch-admin/members/new/match", rejectApex, gateCreate, async (req, res) => {
    const scope = hostScope(req, res);
    if (!scope) return;
    if (!validateCsrfPost(req, res)) return;
    const tenant = resolveTenantForAuthorization(req);
    const organizationId =
      tenant && tenant.organization && tenant.organization.id
        ? tenant.organization.id
        : null;
    if (!organizationId) {
      return sendLoginUnavailable(req, res, 403, "Organization context is required.");
    }

    const result = await handleMatchStep(
      getPool(),
      {
        actorUserId: scope.actorUserId,
        organizationId,
        churchId: scope.churchId,
        draftToken: req.body && req.body.draft_token,
        action: req.body && req.body.action,
        memberId: req.body && (req.body.member_id || req.body.subject_ref),
        env,
      },
      {}
    );

    if (result.code === FLOW_CODE.UNAUTHORIZED) {
      return sendLoginUnavailable(req, res, 403, "You do not have access to this draft.");
    }
    if (result.code === FLOW_CODE.INVALID_DRAFT) {
      return renderAddMemberForm(req, res, scope, tenant, {
        values: {},
        fieldErrors: [
          {
            field: "_form",
            message: "This registration draft expired. Enter the details again.",
          },
        ],
        status: 400,
      });
    }
    if (result.step === "open_existing" && result.memberId) {
      return res.redirect(303, `/branch-admin/members/${result.memberId}`);
    }
    if (result.step === "form") {
      return renderAddMemberForm(req, res, scope, tenant, {
        values: result.values || {},
        status: 200,
      });
    }
    if (result.step === "review") {
      return renderReviewStep(req, res, {
        draftToken: result.draftToken,
        draft: result.draft,
        status: 200,
      });
    }
    if (result.step === "match") {
      return renderMatchStep(req, res, {
        draftToken: result.draftToken || (req.body && req.body.draft_token),
        draft: result.draft,
        matches: result.matches || [],
        blocked: result.code === FLOW_CODE.MATCH_BLOCKED,
        status: 409,
      });
    }
    return sendLoginUnavailable(req, res, 400, "Invalid match action.");
  });

  router.post("/branch-admin/members/new/review", rejectApex, gateCreate, async (req, res) => {
    const scope = hostScope(req, res);
    if (!scope) return;
    if (!validateCsrfPost(req, res)) return;
    const tenant = resolveTenantForAuthorization(req);
    const organizationId =
      tenant && tenant.organization && tenant.organization.id
        ? tenant.organization.id
        : null;
    if (!organizationId) {
      return sendLoginUnavailable(req, res, 403, "Organization context is required.");
    }

    const result = await confirmStaffAddMemberCreate(
      getPool(),
      {
        actorUserId: scope.actorUserId,
        organizationId,
        churchId: scope.churchId,
        draftToken: req.body && req.body.draft_token,
        action: req.body && req.body.action,
        env,
      },
      {}
    );

    if (result.code === FLOW_CODE.UNAUTHORIZED) {
      return sendLoginUnavailable(req, res, 403, "You do not have access to this draft.");
    }
    if (result.code === FLOW_CODE.INVALID_DRAFT) {
      return renderAddMemberForm(req, res, scope, tenant, {
        values: {},
        fieldErrors: [
          {
            field: "_form",
            message: "This registration draft expired. Enter the details again.",
          },
        ],
        status: 400,
      });
    }
    if (result.step === "form") {
      return renderAddMemberForm(req, res, scope, tenant, {
        values: result.values || {},
        status: 200,
      });
    }
    if (result.step === "match") {
      return renderMatchStep(req, res, {
        draftToken: result.draftToken || (req.body && req.body.draft_token),
        draft: result.draft,
        matches: result.matches || [],
        blocked: result.code === FLOW_CODE.MATCH_BLOCKED,
        status: 409,
      });
    }
    if (
      (result.code === FLOW_CODE.CREATED || result.code === FLOW_CODE.IDEMPOTENT_REPLAY) &&
      result.memberId
    ) {
      return res.redirect(303, `/branch-admin/members/${result.memberId}/created`);
    }
    return renderReviewStep(req, res, {
      draftToken: result.draftToken || (req.body && req.body.draft_token),
      draft: result.draft,
      fieldErrors: result.fieldErrors || [
        { field: "_form", message: "Unable to create this membership." },
      ],
      status: 400,
    });
  });

  router.get("/branch-admin/members/:id/created", rejectApex, gateCreate, async (req, res) => {
    const scope = hostScope(req, res);
    if (!scope) return;
    const id = String(req.params.id || "").trim();
    if (!UUID_RE.test(id)) {
      return sendLoginUnavailable(req, res, 404, "Member not found.");
    }
    const loaded = await getBranchMemberForManager(getPool(), {
      memberId: id,
      actorUserId: scope.actorUserId,
      churchId: scope.churchId,
      branchId: scope.branchId,
    });
    if (!loaded.ok || !loaded.member) {
      return sendLoginUnavailable(
        req,
        res,
        loaded.status === STATUS.FORBIDDEN ? 403 : 404,
        "Member not found."
      );
    }
    const html = renderBranchAdminView(
      "branch-admin/member-created.ejs",
      await shellLocals(req, res, "members", {
        pageTitle: "Member created",
        member: {
          ...loaded.member,
          memberNumber: loaded.member.memberNumber || null,
          portalAccessStatus: loaded.member.portalAccessStatus || "not_activated",
        },
        productIdentifier: loaded.member.memberNumber || null,
        loadGpOpsAssets: true,
      })
    );
    return res.status(200).type("html").send(html);
  });

  async function renderAddMemberForm(req, res, scope, tenant, opts) {
    const options = opts || {};
    const branches = await listBlessBoardBranches(getPool(), scope.churchId, {
      includeIds: true,
    });
    const formModel = await buildAddMemberFormModel(getPool(), {
      churchId: scope.churchId,
      defaultBranchId: scope.branchId,
      values: options.values || {},
      fieldErrors: options.fieldErrors || [],
      matches: options.matches || [],
      errors: options.errors || {},
    });
    const html = renderBranchAdminView(
      "branch-admin/member-add.ejs",
      await shellLocals(req, res, "members", {
        pageTitle: "Register New Member",
        form: formModel,
        branches: branches.ok ? branches.branches : [],
        defaultBranchId: scope.branchId,
        organizationName:
          tenant && tenant.organization && tenant.organization.displayName
            ? tenant.organization.displayName
            : churchDisplayFallback(tenant),
        loadGpOpsAssets: true,
        loadPhoneField: true,
      })
    );
    return res.status(options.status || 200).type("html").send(html);
  }

  async function renderMatchStep(req, res, opts) {
    const options = opts || {};
    const html = renderBranchAdminView(
      "branch-admin/member-match.ejs",
      await shellLocals(req, res, "members", {
        pageTitle: "Possible Existing Member Detected",
        draftToken: options.draftToken,
        draft: options.draft,
        matches: options.matches || [],
        blocked: Boolean(options.blocked),
        churchIdPreview: options.churchIdPreview,
        loadGpOpsAssets: true,
      })
    );
    return res.status(options.status || 200).type("html").send(html);
  }

  async function renderReviewStep(req, res, opts) {
    const options = opts || {};
    const draft = options.draft || {};
    const html = renderBranchAdminView(
      "branch-admin/member-review.ejs",
      await shellLocals(req, res, "members", {
        pageTitle: "Review New Member Record",
        draftToken: options.draftToken,
        draft,
        review: reviewModelFromDraft(draft, {
          fieldErrors: options.fieldErrors || [],
        }),
        loadGpOpsAssets: true,
      })
    );
    return res.status(options.status || 200).type("html").send(html);
  }

  router.get("/branch-admin/members/:id/edit", rejectApex, gateEdit, async (req, res) => {
    const scope = hostScope(req, res);
    if (!scope) return;
    const member = await loadScopedMember(req, res, scope);
    if (!member) return;
    const organizationId = organizationIdFrom(req);
    const profile = buildProfileModel(member, { canEditMember: true });
    const html = renderBranchAdminView(
      "branch-admin/member-edit.ejs",
      await shellLocals(req, res, "members", {
        pageTitle: "Edit Member",
        profile,
        member,
        loadGpOpsAssets: true,
      })
    );
    return res.status(200).type("html").send(html);
  });

  router.post("/branch-admin/members/:id/edit", rejectApex, gateEdit, async (req, res) => {
    const scope = hostScope(req, res);
    if (!scope) return;
    if (!validateCsrfPost(req, res)) return;
    const member = await loadScopedMember(req, res, scope);
    if (!member) return;
    const organizationId = organizationIdFrom(req);
    if (!organizationId) {
      return sendLoginUnavailable(req, res, 403, "Organization context is required.");
    }
    const body = req.body || {};
    const updated = await submitEditMember(
      getPool(),
      {
        actorUserId: scope.actorUserId,
        organizationId,
        churchId: scope.churchId,
        branchId: scope.branchId,
        memberId: member.id,
        firstName: body.first_name,
        lastName: body.last_name,
        preferredName: body.preferred_name,
        email: body.email,
        phone: body.phone,
        phoneVerified: true,
        dateOfBirth: body.date_of_birth || undefined,
        occupation: body.occupation,
        maritalStatus: body.marital_status || null,
        numberOfChildren:
          body.number_of_children === "" || body.number_of_children == null
            ? undefined
            : Number(body.number_of_children),
        address: { line1: body.address_line_1 },
        nextOfKin: {
          name: body.next_of_kin_name,
          relationship: body.next_of_kin_relationship,
          phone: body.next_of_kin_phone,
        },
      },
      {}
    );

    if (body.membership_status && String(body.membership_status) !== String(member.status)) {
      const statusResult = await submitMembershipStatus(
        getPool(),
        {
          actorUserId: scope.actorUserId,
          organizationId,
          churchId: scope.churchId,
          branchId: scope.branchId,
          memberId: member.id,
          membershipStatus: body.membership_status,
          reason: body.membership_reason,
        },
        {}
      );
      if (!statusResult.ok) {
        const profile = buildProfileModel(member, { canEditMember: true });
        const html = renderBranchAdminView(
          "branch-admin/member-edit.ejs",
          await shellLocals(req, res, "members", {
            pageTitle: "Edit Member",
            profile,
            member,
            values: { membershipStatus: body.membership_status, membershipReason: body.membership_reason },
            fieldErrors: [
              {
                field: "membership_status",
                message: "Unable to update membership status.",
              },
            ],
            loadGpOpsAssets: true,
          })
        );
        return res.status(400).type("html").send(html);
      }
    }

    if (!updated.ok) {
      const profile = buildProfileModel(member, { canEditMember: true });
      const html = renderBranchAdminView(
        "branch-admin/member-edit.ejs",
        await shellLocals(req, res, "members", {
          pageTitle: "Edit Member",
          profile,
          member,
          fieldErrors: [
            {
              field: "_form",
              message:
                updated.code === ADMIN_RESULT.UNAUTHORIZED
                  ? "You do not have permission to edit this member."
                  : "Unable to save member profile.",
            },
          ],
          loadGpOpsAssets: true,
        })
      );
      return res
        .status(updated.code === ADMIN_RESULT.UNAUTHORIZED ? 403 : 400)
        .type("html")
        .send(html);
    }
    return res.redirect(303, `/branch-admin/members/${member.id}?notice=profile_saved`);
  });

  router.get("/branch-admin/members/:id/church-id", rejectApex, gateChurchId, async (req, res) => {
    const scope = hostScope(req, res);
    if (!scope) return;
    const member = await loadScopedMember(req, res, scope);
    if (!member) return;
    const html = renderBranchAdminView(
      "branch-admin/member-church-id.ejs",
      await shellLocals(req, res, "members", {
        pageTitle: "Manage Church ID",
        member,
        loadGpOpsAssets: true,
      })
    );
    return res.status(200).type("html").send(html);
  });

  router.post("/branch-admin/members/:id/church-id", rejectApex, gateChurchId, async (req, res) => {
    const scope = hostScope(req, res);
    if (!scope) return;
    if (!validateCsrfPost(req, res)) return;
    const member = await loadScopedMember(req, res, scope);
    if (!member) return;
    const organizationId = organizationIdFrom(req);
    if (!organizationId) {
      return sendLoginUnavailable(req, res, 403, "Organization context is required.");
    }
    const result = await submitChurchIdChange(
      getPool(),
      {
        actorUserId: scope.actorUserId,
        organizationId,
        churchId: scope.churchId,
        branchId: scope.branchId,
        memberId: member.id,
        memberNumber: req.body && req.body.member_number,
        reason: req.body && req.body.reason,
      },
      {}
    );
    if (!result.ok) {
      const html = renderBranchAdminView(
        "branch-admin/member-church-id.ejs",
        await shellLocals(req, res, "members", {
          pageTitle: "Manage Church ID",
          member,
          values: {
            memberNumber: req.body && req.body.member_number,
            reason: req.body && req.body.reason,
          },
          errorMessage:
            result.code === ADMIN_RESULT.UNAUTHORIZED
              ? "You do not have permission to manage Church ID."
              : result.code === ADMIN_RESULT.REASON_REQUIRED
                ? "A change reason is required."
                : result.code === ADMIN_RESULT.DUPLICATE_CHURCH_ID
                  ? "That Church ID is already assigned in this church."
                  : "Unable to update Church ID.",
          loadGpOpsAssets: true,
        })
      );
      return res
        .status(result.code === ADMIN_RESULT.UNAUTHORIZED ? 403 : 400)
        .type("html")
        .send(html);
    }
    return res.redirect(303, `/branch-admin/members/${member.id}?notice=church_id_updated`);
  });

  router.get("/branch-admin/members/:id/access", rejectApex, gateBlock, async (req, res) => {
    const scope = hostScope(req, res);
    if (!scope) return;
    const member = await loadScopedMember(req, res, scope);
    if (!member) return;
    const html = renderBranchAdminView(
      "branch-admin/member-access.ejs",
      await shellLocals(req, res, "members", {
        pageTitle: "Member Access",
        member,
        loadGpOpsAssets: true,
      })
    );
    return res.status(200).type("html").send(html);
  });

  router.post("/branch-admin/members/:id/access", rejectApex, gateBlock, async (req, res) => {
    const scope = hostScope(req, res);
    if (!scope) return;
    if (!validateCsrfPost(req, res)) return;
    const member = await loadScopedMember(req, res, scope);
    if (!member) return;
    const organizationId = organizationIdFrom(req);
    if (!organizationId) {
      return sendLoginUnavailable(req, res, 403, "Organization context is required.");
    }
    const result = await submitPortalAccess(
      getPool(),
      {
        actorUserId: scope.actorUserId,
        organizationId,
        churchId: scope.churchId,
        branchId: scope.branchId,
        memberId: member.id,
        portalAccessStatus: req.body && req.body.portal_access_status,
        reason: req.body && req.body.reason,
      },
      { env }
    );
    if (!result.ok) {
      const html = renderBranchAdminView(
        "branch-admin/member-access.ejs",
        await shellLocals(req, res, "members", {
          pageTitle: "Member Access",
          member,
          errorMessage:
            result.code === ADMIN_RESULT.UNAUTHORIZED
              ? "You do not have permission to manage portal access."
              : "Unable to update portal access.",
          loadGpOpsAssets: true,
        })
      );
      return res
        .status(result.code === ADMIN_RESULT.UNAUTHORIZED ? 403 : 400)
        .type("html")
        .send(html);
    }
    return res.redirect(303, `/branch-admin/members/${member.id}/access?notice=access_updated`);
  });

  router.get("/branch-admin/members/:id/access/block", rejectApex, gateBlock, async (req, res) => {
    const scope = hostScope(req, res);
    if (!scope) return;
    const member = await loadScopedMember(req, res, scope);
    if (!member) return;
    const html = renderBranchAdminView(
      "branch-admin/member-access-block.ejs",
      await shellLocals(req, res, "members", {
        pageTitle: "Block Member Access",
        member,
        loadGpOpsAssets: true,
      })
    );
    return res.status(200).type("html").send(html);
  });

  router.post("/branch-admin/members/:id/access/block", rejectApex, gateBlock, async (req, res) => {
    const scope = hostScope(req, res);
    if (!scope) return;
    if (!validateCsrfPost(req, res)) return;
    const member = await loadScopedMember(req, res, scope);
    if (!member) return;
    const organizationId = organizationIdFrom(req);
    if (!organizationId) {
      return sendLoginUnavailable(req, res, 403, "Organization context is required.");
    }
    const result = await submitPortalAccess(
      getPool(),
      {
        actorUserId: scope.actorUserId,
        organizationId,
        churchId: scope.churchId,
        branchId: scope.branchId,
        memberId: member.id,
        portalAccessStatus: PORTAL_ACCESS_STATUS.BLOCKED,
        reason: req.body && req.body.reason,
      },
      { env }
    );
    if (!result.ok) {
      const html = renderBranchAdminView(
        "branch-admin/member-access-block.ejs",
        await shellLocals(req, res, "members", {
          pageTitle: "Block Member Access",
          member,
          values: { reason: req.body && req.body.reason },
          errorMessage:
            result.code === ADMIN_RESULT.UNAUTHORIZED
              ? "You do not have permission to block portal access."
              : result.code === ADMIN_RESULT.REASON_REQUIRED
                ? "A block reason is required."
                : "Unable to block portal access.",
          loadGpOpsAssets: true,
        })
      );
      return res
        .status(result.code === ADMIN_RESULT.UNAUTHORIZED ? 403 : 400)
        .type("html")
        .send(html);
    }
    return res.redirect(303, `/branch-admin/members/${member.id}/access?notice=blocked`);
  });

  router.get("/branch-admin/members/:id/transfer", rejectApex, gateEdit, async (req, res) => {
    const scope = hostScope(req, res);
    if (!scope) return;
    const member = await loadScopedMember(req, res, scope);
    if (!member) return;
    const branches = await listBlessBoardBranches(getPool(), scope.churchId);
    const html = renderBranchAdminView(
      "branch-admin/member-transfer.ejs",
      await shellLocals(req, res, "members", {
        pageTitle: "Branch Transfer",
        member,
        branches: branches.ok ? branches.branches : [],
        loadGpOpsAssets: true,
      })
    );
    return res.status(200).type("html").send(html);
  });

  router.post("/branch-admin/members/:id/transfer", rejectApex, gateEdit, async (req, res) => {
    const scope = hostScope(req, res);
    if (!scope) return;
    if (!validateCsrfPost(req, res)) return;
    const member = await loadScopedMember(req, res, scope);
    if (!member) return;
    const organizationId = organizationIdFrom(req);
    if (!organizationId) {
      return sendLoginUnavailable(req, res, 403, "Organization context is required.");
    }
    if (!(req.body && (req.body.confirm_transfer === "1" || req.body.confirm_transfer === "on"))) {
      const branches = await listBlessBoardBranches(getPool(), scope.churchId);
      const html = renderBranchAdminView(
        "branch-admin/member-transfer.ejs",
        await shellLocals(req, res, "members", {
          pageTitle: "Branch Transfer",
          member,
          branches: branches.ok ? branches.branches : [],
          values: {
            toBranchId: req.body && req.body.to_branch_id,
            reason: req.body && req.body.reason,
          },
          errorMessage: "Confirm that historical attendance will remain unchanged.",
          loadGpOpsAssets: true,
        })
      );
      return res.status(400).type("html").send(html);
    }
    const tenant = resolveTenantForAuthorization(req);
    const result = await submitBranchTransfer(
      getPool(),
      {
        actorUserId: scope.actorUserId,
        organizationId,
        churchId: scope.churchId,
        branchId: scope.branchId,
        memberId: member.id,
        toBranchId: req.body && req.body.to_branch_id,
        reason: req.body && req.body.reason,
        tenant,
      },
      {}
    );
    if (!result.ok) {
      const branches = await listBlessBoardBranches(getPool(), scope.churchId);
      const html = renderBranchAdminView(
        "branch-admin/member-transfer.ejs",
        await shellLocals(req, res, "members", {
          pageTitle: "Branch Transfer",
          member,
          branches: branches.ok ? branches.branches : [],
          values: {
            toBranchId: req.body && req.body.to_branch_id,
            reason: req.body && req.body.reason,
          },
          errorMessage:
            result.code === ADMIN_RESULT.UNAUTHORIZED
              ? "You do not have permission to transfer members."
              : result.code === ADMIN_RESULT.REASON_REQUIRED
                ? "A transfer reason is required."
                : "Unable to request branch transfer.",
          loadGpOpsAssets: true,
        })
      );
      return res
        .status(result.code === ADMIN_RESULT.UNAUTHORIZED ? 403 : 400)
        .type("html")
        .send(html);
    }
    return res.redirect(303, `/branch-admin/members/${member.id}?notice=transfer_requested`);
  });

  router.get("/branch-admin/members/:id/history", rejectApex, gateAccess, async (req, res) => {
    const scope = hostScope(req, res);
    if (!scope) return;
    const member = await loadScopedMember(req, res, scope);
    if (!member) return;
    const organizationId = organizationIdFrom(req);
    if (!organizationId) {
      return sendLoginUnavailable(req, res, 403, "Organization context is required.");
    }
    const history = await loadMemberHistory(
      getPool(),
      {
        actorUserId: scope.actorUserId,
        organizationId,
        churchId: scope.churchId,
        branchId: scope.branchId,
        memberId: member.id,
      },
      {}
    );
    if (!history.ok) {
      return sendLoginUnavailable(
        req,
        res,
        history.code === ADMIN_RESULT.UNAUTHORIZED ? 403 : 400,
        "Unable to load member history."
      );
    }
    const html = renderBranchAdminView(
      "branch-admin/member-history.ejs",
      await shellLocals(req, res, "members", {
        pageTitle: "Member History",
        member,
        historyEvents: history.events || [],
        loadGpOpsAssets: true,
      })
    );
    return res.status(200).type("html").send(html);
  });

  router.get("/branch-admin/members/:id", rejectApex, gateAccess, async (req, res) => {
    const scope = hostScope(req, res);
    if (!scope) return;
    const member = await loadScopedMember(req, res, scope);
    if (!member) return;
    const organizationId = organizationIdFrom(req);
    const capabilities = organizationId
      ? await resolveAdminCapabilities(
          getPool(),
          {
            actorUserId: scope.actorUserId,
            organizationId,
            churchId: scope.churchId,
            branchId: scope.branchId,
          },
          {}
        )
      : {};
    const noticeKey = String((req.query && req.query.notice) || "").trim();
    const noticeMap = {
      profile_saved: "Member profile saved.",
      church_id_updated: "Church ID updated.",
      transfer_requested: "Branch transfer requested. Historical attendance was left unchanged.",
    };
    const html = renderBranchAdminView(
      "branch-admin/member-detail.ejs",
      await shellLocals(req, res, "members", {
        pageTitle: "Member Admin Profile",
        member,
        profile: buildProfileModel(member, capabilities),
        capabilities,
        flashNotice: noticeMap[noticeKey] || null,
        loadGpOpsAssets: true,
      })
    );
    return res.status(200).type("html").send(html);
  });

  return router;
}

module.exports = {
  createBranchRegistrationAdminRouter,
};
