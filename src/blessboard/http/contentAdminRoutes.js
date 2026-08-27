"use strict";

/**
 * BlessBoard V5 public content administration (HQ church-wide, HQ branch scope, branch-admin).
 */

const fs = require("fs");
const path = require("path");
const ejs = require("ejs");
const express = require("express");

const {
  createRequireBlessBoardPermission,
} = require("./requireBlessBoardPermission");
const {
  createRequireAnyBlessBoardPermission,
} = require("./requireBlessBoardShellAccess");
const {
  CONTENT_SHELL_VISIBLE_PERMISSIONS,
} = require("./shellVisiblePermissions");
const { resolveTenantForAuthorization } = require("./loadBlessBoardAuthorizationContext");
const { createRejectApex } = require("./rejectApex");
const { buildHqAdminShellLocals } = require("./hqAdminShellLocals");
const { buildBranchAdminShellLocals } = require("./branchAdminShellLocals");
const {
  listBlessBoardBranches,
} = require("../services/listBlessBoardBranches");
const {
  resolveWebsiteScope,
  STATUS: WEBSITE_SCOPE_STATUS,
  SCOPE_TYPE: WEBSITE_SCOPE_TYPE,
} = require("../services/resolveWebsiteScope");
const {
  resolveWebsiteMode,
  WEBSITE_MODE,
} = require("../services/resolveWebsiteMode");
const {
  authorize,
} = require("../services/blessBoardRbacAuthorizationService");
const {
  canonicalChurchWideHqContentPath,
} = require("./singleSiteHqContentCanonical");
const {
  authorizeBlessBoardTenantAccess,
  STATUS: AUTHZ_STATUS,
} = require("../services/authorizeBlessBoardTenantAccess");
const {
  CSRF_FIELD,
  validateCsrf,
} = require("../../platform/http/v5Csrf");
const multer = require("multer");
const { createMediaUploadService, STATUS: MEDIA_STATUS } = require("../media/mediaUploadService");
const { areMediaUploadsEnabled } = require("../config/mediaUploadsEnabled");
const { MAX_ANY_BYTES, VISIBILITY } = require("../media/mediaConstants");
const {
  provisionEmptyPublicPages,
  listAdminPages,
  getAdminPageBundle,
  updatePublicPage,
  createPageSection,
  updatePageSection,
  createLeader,
  updateLeader,
  listAdminLeaders,
  createMinistry,
  updateMinistry,
  listAdminMinistries,
  createEvent,
  updateEvent,
  listAdminEvents,
  createSermon,
  updateSermon,
  listAdminSermons,
  createContactChannel,
  updateContactChannel,
  listAdminContactChannels,
  createGivingMethod,
  updateGivingMethod,
  listAdminGivingMethods,
  STATUS: ADMIN_STATUS,
} = require("../services/publicContentAdminService");
const { PAGE_KEY_TITLES } = require("../services/publicContentConstants");
const repo = require("../repositories/publicContentRepository");
const {
  SERVICE_TIMES_SECTION_KEY,
  DAYS: SERVICE_TIME_DAYS,
  entriesFromSection,
  ensureCanonicalServiceTimesSection,
  saveHomeServiceTimes,
  repairHomeContentFoundation,
  STATUS: SERVICE_TIMES_STATUS,
} = require("../services/homeServiceTimesService");
const {
  getBranchPageInheritanceState,
  createBranchPageOverride,
  removeBranchPageOverride,
  publishBranchScopedPage,
  INHERITANCE_MODE,
  STATUS: INHERITANCE_STATUS,
} = require("../services/websiteBranchPageInheritanceService");

const VIEWS_ROOT = path.join(__dirname, "..", "..", "..", "views", "blessboard", "v5");

const ENTITY_ROUTES = Object.freeze({
  leadership: {
    title: "Leadership",
    pageKey: "leadership",
    listFn: listAdminLeaders,
    createFn: createLeader,
    updateFn: updateLeader,
    findFn: repo.findLeaderById,
  },
  ministries: {
    title: "Ministries",
    pageKey: "ministries",
    listFn: listAdminMinistries,
    createFn: createMinistry,
    updateFn: updateMinistry,
    findFn: repo.findMinistryById,
  },
  events: {
    title: "Events",
    pageKey: "events",
    listFn: listAdminEvents,
    createFn: createEvent,
    updateFn: updateEvent,
    findFn: repo.findEventById,
  },
  sermons: {
    title: "Sermons",
    pageKey: "sermons",
    listFn: listAdminSermons,
    createFn: createSermon,
    updateFn: updateSermon,
    findFn: repo.findSermonById,
  },
  contact: {
    title: "Contact channels",
    pageKey: "contact",
    listFn: listAdminContactChannels,
    createFn: createContactChannel,
    updateFn: updateContactChannel,
    findFn: repo.findContactChannelById,
  },
  giving: {
    title: "Giving methods",
    pageKey: "giving",
    listFn: listAdminGivingMethods,
    createFn: createGivingMethod,
    updateFn: updateGivingMethod,
    findFn: repo.findGivingMethodById,
  },
});

/**
 * @param {string} relativePath
 * @param {object} data
 */
function renderContentAdminView(relativePath, data) {
  const filename = path.join(VIEWS_ROOT, relativePath);
  const source = fs.readFileSync(filename, "utf8");
  return ejs.render(source, data, { filename });
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {number} status
 * @param {string} message
 * @param {'hq'|'branch'} shellKind
 */
function sendControlled(req, res, status, message, shellKind) {
  const safe = escapeHtml(message);
  const wantsHtml = String(req.get("accept") || "").includes("text/html");
  if (!wantsHtml) {
    return res.status(status).type("text").send(String(message == null ? "" : message));
  }
  const css =
    shellKind === "hq"
      ? "/blessboard/v5/hq-admin.css?v=56"
      : "/blessboard/v5/branch-admin.css?v=39";
  const bodyClass = shellKind === "hq" ? "bb-hq-body" : "bb-ba-body";
  return res.status(status).type("html").send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Content · BlessBoard</title>
  <link rel="stylesheet" href="${css}" />
</head>
<body class="${bodyClass}">
  <main class="bb-ca-unavailable">
    <h1>${status === 401 ? "Sign-in required" : status === 404 ? "Not found" : "Unavailable"}</h1>
    <p>${safe}</p>
    <p><a href="/">Church homepage</a></p>
  </main>
</body>
</html>`);
}

/**
 * @param {object|null} page
 * @param {{ churchId: string, branchId: string|null }} scope
 */
function verifyPageScope(page, scope) {
  if (!page || page.churchId !== scope.churchId) return false;
  if (scope.branchId) return page.branchId === scope.branchId;
  return page.branchId == null;
}

/**
 * @param {object|null} item
 * @param {{ churchId: string, branchId: string|null }} scope
 */
function verifyEntityScope(item, scope) {
  if (!item || item.churchId !== scope.churchId) return false;
  if (scope.branchId) return item.branchId === scope.branchId;
  return item.branchId == null;
}

/**
 * Overlay current unpublished field + structured drafts onto a public page model.
 * Used by authenticated preview surfaces so preview reads the current draft.
 */
async function applyCurrentDraftOverlaysToModel(db, model, scope) {
  if (!model) return model;
  const {
    loadDraftOverlayMap,
    applyDraftsToSections,
  } = require("../services/websiteInlineDraftService");
  const {
    listStructuredDrafts,
    applyStructuredDraftsToModel,
  } = require("../services/websiteStructuredDraftService");
  try {
    const overlayMap = await loadDraftOverlayMap(db, {
      churchId: scope.churchId,
      branchId: scope.branchId,
      pageKey: model.pageKey,
    });
    model.sections = applyDraftsToSections(model.sections, overlayMap);
    if (model.pageKey === "contact" && model.publicContact) {
      const email = overlayMap.get("details::email");
      const phone = overlayMap.get("details::phone");
      const address = overlayMap.get("details::address");
      if (email !== undefined || phone !== undefined || address !== undefined) {
        model.publicContact = {
          ...model.publicContact,
          email: email !== undefined ? email : model.publicContact.email,
          phone: phone !== undefined ? phone : model.publicContact.phone,
          addressText:
            address !== undefined ? address : model.publicContact.addressText,
          hasAny: true,
        };
      }
    }
    const structuredDrafts = await listStructuredDrafts(db, {
      churchId: scope.churchId,
      branchId: scope.branchId,
      status: "draft",
    });
    applyStructuredDraftsToModel(model, structuredDrafts);
  } catch {
    /* show CMS preview without overlays if draft load fails */
  }
  return model;
}

/**
 * @param {object} body
 */
function publishPatch(body) {
  return {
    confirmPublish: body.confirm_publish,
    expectedUpdatedAt: body.expected_updated_at,
    enforcePublishConfirm: true,
  };
}

function errorMessage(reason, conflict) {
  if (conflict || reason === "optimistic_conflict") {
    return "Someone else updated this record. Review the latest version and try again.";
  }
  if (reason === "confirm_publish") {
    return "You must check the box to confirm before publishing.";
  }
  if (reason === "name" || reason === "day" || reason === "start_time" || reason === "end_time") {
    return "Please check each service time entry and try again.";
  }
  if (reason === "end_time_order") {
    return "End time must be later than start time.";
  }
  if (reason === "duplicate") {
    return "Remove duplicate service times.";
  }
  if (reason === "entries_limit") {
    return "Too many service times. Remove some and try again.";
  }
  if (reason === "published_requires_draft") {
    return "This content is live. Save your change as a draft, then publish it from the website page.";
  }
  return "Please check the form and try again.";
}

/**
 * @param {{
 *   getPool: () => { query: Function },
 *   isApexHost: (req: import('express').Request) => boolean,
 *   env?: NodeJS.ProcessEnv,
 *   sendUnavailable?: Function,
 *   variant: 'hq' | 'branch',
 *   mediaService?: ReturnType<typeof createMediaUploadService>,
 * }} deps
 */
function createContentAdminRouter(deps) {
  const getPool = deps.getPool;
  const isApexHost = deps.isApexHost;
  const env = deps.env || process.env;
  void deps.sendUnavailable;
  const variant = deps.variant === "branch" ? "branch" : "hq";
  const mediaService = deps.mediaService || createMediaUploadService(env);
  const isProduction = String(env.NODE_ENV || "") === "production";
  const shellKind = variant === "hq" ? "hq" : "branch";
  const formClass = variant === "hq" ? "bb-hq-form" : "bb-ba-form";
  const loginNextDefault = variant === "hq" ? "/hq/content" : "/branch-admin/content";

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_ANY_BYTES, files: 1 },
  });

  const router = express.Router();
  // Final shell authorization is permission-based (website.view|edit|publish).
  // Legacy HQ/branch roles enter only via compatibility website.* grants.
  const requireWebsiteShell = createRequireAnyBlessBoardPermission(
    CONTENT_SHELL_VISIBLE_PERMISSIONS,
    {
      getPool,
      resolveResourceContext: (_req, tenant) => ({
        organizationId: tenant.organization.id,
        churchId: tenant.church.id,
        branchId:
          variant === "hq"
            ? null
            : tenant.primaryBranch && tenant.primaryBranch.id
              ? tenant.primaryBranch.id
              : null,
      }),
      denyMessage: "You do not have access to the website editor.",
    }
  );
  const requireWebsiteEdit = createRequireBlessBoardPermission("website.edit", null, {
    getPool,
    scopeMode: variant === "hq" ? "church" : undefined,
  });
  const requireWebsitePublish = createRequireBlessBoardPermission("website.publish", null, {
    getPool,
    scopeMode: variant === "hq" ? "church" : undefined,
  });
  const requireAccess = requireWebsiteShell;

  async function assertWebsitePermission(req, permissionKey, branchId) {
    const tenant = resolveTenantForAuthorization(req);
    const session = req.v5Session && req.v5Session.session;
    if (!tenant || !session || !session.userId) {
      return { ok: false, status: 401, error: "Sign-in is required." };
    }
    // Explicit null = church-wide (do not fall back to primary branch).
    const scopedBranchId =
      branchId != null && String(branchId).trim() !== ""
        ? String(branchId)
        : null;
    const authz = await authorize(getPool(), {
      actor: { userId: session.userId },
      permission: permissionKey,
      tenantContext: tenant,
      resourceContext: {
        organizationId: tenant.organization.id,
        churchId: tenant.church.id,
        branchId: scopedBranchId,
      },
    });
    if (!authz.allowed) {
      return { ok: false, status: 403, error: "Access denied." };
    }
    return { ok: true, tenant, session };
  }

  function legacyActorRoleLabel(req) {
    const authzCtx = req.blessBoardAuthorizationContext;
    const roleKeys = new Set(
      ((authzCtx && authzCtx.effectiveRoles) || []).map((r) => String(r.roleKey || ""))
    );
    if (roleKeys.has("platform_admin")) return "platform_admin";
    if (roleKeys.has("church_hq_admin")) return "church_hq_admin";
    if (roleKeys.has("branch_admin")) return "branch_admin";
    return variant === "hq" ? "church_hq_admin" : "branch_admin";
  }

  function sendMissingContentTenantContext(req, res) {
    const reason = req.blessBoardSessionTenantReason || "tenant_context_missing";
    console.info(
      JSON.stringify({
        event:
          variant === "hq"
            ? "hq_content_missing_tenant_context"
            : "branch_content_missing_tenant_context",
        reason,
        path: req.originalUrl || req.path || null,
        hasSession: Boolean(req.v5Session && req.v5Session.authenticated),
        hasOrganizationId: Boolean(
          req.v5Session &&
            req.v5Session.session &&
            req.v5Session.session.organizationId
        ),
      })
    );
    const message =
      variant === "hq"
        ? "Your account is signed in, but the church content editor could not be loaded. Confirm your HQ administrator assignment for an active organization, then sign in again."
        : "Your account is signed in, but the branch content editor could not be loaded. Confirm your branch administrator assignment, then sign in again.";
    const wantsHtml = String(req.get("accept") || "").includes("text/html");
    if (!wantsHtml) {
      return res.status(403).type("text").send(message);
    }
    return res.status(403).type("html").send(`<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Content unavailable · BlessBoard</title></head>
<body><main><h1>Workspace unavailable</h1><p>${message}</p>
<p><a href="/login">Sign in again</a></p></main></body></html>`);
  }

  const rejectApex = createRejectApex({
    isApexHost,
    mode: "unlessTenant",
    sendUnavailable: (req, res) => {
      if (!(req.v5Session && req.v5Session.authenticated)) {
        const wantsHtml = String(req.get("accept") || "").includes("text/html");
        if (wantsHtml) {
          const nextUrl = encodeURIComponent(req.originalUrl || loginNextDefault);
          return res.redirect(303, `/login?next=${nextUrl}`);
        }
        return res.status(401).type("text").send("Sign-in is required.");
      }
      return sendMissingContentTenantContext(req, res);
    },
  });

  function gateContent(req, res, next) {
    req.contentAdminVariant = variant;
    const sessionOk = Boolean(req.v5Session && req.v5Session.authenticated);
    if (!sessionOk) {
      const wantsHtml = String(req.get("accept") || "").includes("text/html");
      if (wantsHtml) {
        const nextUrl = encodeURIComponent(req.originalUrl || loginNextDefault);
        return res.redirect(303, `/login?next=${nextUrl}`);
      }
      return sendControlled(req, res, 401, "Sign-in is required.", shellKind);
    }
    const tenant = resolveTenantForAuthorization(req);
    if (!tenant || tenant.resolved !== true) {
      return sendMissingContentTenantContext(req, res);
    }

    function afterShell(err) {
      if (err) return next(err);
      const method = String(req.method || "GET").toUpperCase();
      if (method === "GET" || method === "HEAD") return next();
      const path = String(req.path || req.url || "");
      if (
        path.includes("/draft-changes/publish") ||
        path.includes("/api/inline-field/publish")
      ) {
        return requireWebsitePublish(req, res, next);
      }
      return requireWebsiteEdit(req, res, next);
    }

    // Branch Admin surfaces must authorize against the assigned website branch,
    // not the catalogue primaryBranch used by global middleware.
    if (variant === "branch") {
      return (async () => {
        try {
          const session = req.v5Session && req.v5Session.session;
          const websiteScope = await resolveWebsiteScope(getPool(), {
            tenant,
            authenticatedUser: session && session.userId,
            requestedBranchKey: null,
            organizationId: tenant.organization ? tenant.organization.id : null,
            churchId: tenant.church ? tenant.church.id : null,
          });
          let authzBranchId = null;
          if (
            websiteScope.ok &&
            websiteScope.scopeType === WEBSITE_SCOPE_TYPE.BRANCH &&
            websiteScope.branchId
          ) {
            authzBranchId = websiteScope.branchId;
          } else if (
            websiteScope.ok &&
            websiteScope.scopeType === WEBSITE_SCOPE_TYPE.CHURCH
          ) {
            authzBranchId =
              tenant.primaryBranch && tenant.primaryBranch.id
                ? tenant.primaryBranch.id
                : null;
          } else {
            return sendWebsiteScopeFailure(req, res, websiteScope);
          }
          const authz = await authorizeBlessBoardTenantAccess(getPool(), {
            userId: session && session.userId,
            tenant,
            branchId: authzBranchId,
          });
          if (authz.status === AUTHZ_STATUS.LOOKUP_ERROR) {
            return sendControlled(
              req,
              res,
              503,
              "Access check is temporarily unavailable.",
              shellKind
            );
          }
          req.blessBoardAuthorizationContext = {
            ...authz.context,
            reason: authz.status,
          };
          return requireAccess(req, res, afterShell);
        } catch {
          return sendControlled(
            req,
            res,
            503,
            "Access check is temporarily unavailable.",
            shellKind
          );
        }
      })();
    }

    return requireAccess(req, res, afterShell);
  }

  /**
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {object} [extra]
   */
  async function shellLocals(req, res, extra) {
    if (variant === "hq") {
      return buildHqAdminShellLocals(req, res, {
        env,
        isProduction,
      getPool,
        activeNav: "content",
        pageTitle: (extra && extra.pageTitle) || "Website content",
        extra: {
          shellKind: "hq",
          formClass,
          ...(extra || {}),
        },
      });
    }
    return buildBranchAdminShellLocals(req, res, {
      env,
      isProduction,
      getPool,
      activeNav: "content",
      pageTitle: (extra && extra.pageTitle) || "Website content",
      extra: {
        shellKind: "branch",
        formClass,
        ...(extra || {}),
      },
    });
  }

  function scopeInput(scope) {
    return { churchId: scope.churchId, branchId: scope.branchId };
  }

  /**
   * Map resolveWebsiteScope failure to an HTTP response. Returns null for callers.
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {object} resolved
   */
  function sendWebsiteScopeFailure(req, res, resolved) {
    const status = resolved && resolved.httpStatus ? resolved.httpStatus : 403;
    if (status === 401) {
      sendControlled(req, res, 401, "Sign-in is required.", shellKind);
      return null;
    }
    if (status === 503 || (resolved && resolved.status === WEBSITE_SCOPE_STATUS.LOOKUP_ERROR)) {
      sendControlled(req, res, 503, "Website scope is temporarily unavailable.", shellKind);
      return null;
    }
    if (status === 404 || (resolved && resolved.status === WEBSITE_SCOPE_STATUS.NOT_FOUND)) {
      sendControlled(req, res, 404, "This branch could not be found.", shellKind);
      return null;
    }
    sendControlled(req, res, 403, "You do not have access to this site.", shellKind);
    return null;
  }

  /**
   * @param {import('express').Request} req
   * @param {object} websiteScope
   * @param {string} basePath
   * @param {string} scopeLabel
   */
  function toContentAdminScope(websiteScope, basePath, scopeLabel) {
    return {
      organizationId: websiteScope.organizationId,
      churchId: websiteScope.churchId,
      branchId: websiteScope.branchId,
      branchKey: websiteScope.branchKey,
      branch: websiteScope.branch,
      scopeType: websiteScope.scopeType,
      basePath,
      scopeLabel,
    };
  }

  /**
   * HQ church-wide website editor (branchId = null).
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   */
  async function resolveChurchWideScope(req, res) {
    const tenant = resolveTenantForAuthorization(req);
    const session = req.v5Session && req.v5Session.session;
    const resolved = await resolveWebsiteScope(getPool(), {
      tenant,
      authenticatedUser: session && session.userId,
      requestedBranchKey: null,
      organizationId: tenant && tenant.organization ? tenant.organization.id : null,
      churchId: tenant && tenant.church ? tenant.church.id : null,
    });
    if (!resolved.ok || resolved.scopeType !== "church") {
      return sendWebsiteScopeFailure(req, res, resolved);
    }
    return toContentAdminScope(resolved, "/hq/content", "Church-wide");
  }

  /**
   * HQ branch mini-website editor / preview for an explicit branch key.
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   */
  async function resolveHqBranchScope(req, res) {
    const tenant = resolveTenantForAuthorization(req);
    const session = req.v5Session && req.v5Session.session;
    const resolved = await resolveWebsiteScope(getPool(), {
      tenant,
      authenticatedUser: session && session.userId,
      requestedBranchKey: req.params.branchKey,
      organizationId: tenant && tenant.organization ? tenant.organization.id : null,
      churchId: tenant && tenant.church ? tenant.church.id : null,
    });
    if (!resolved.ok || resolved.scopeType !== "branch") {
      return sendWebsiteScopeFailure(req, res, resolved);
    }

    // Single-site: no independent branch editor/preview — canonicalize to church-wide CMS.
    try {
      const mode = await resolveWebsiteMode(getPool(), {
        churchId: resolved.churchId,
        branchKey: resolved.branchKey,
      });
      if (
        mode.ok &&
        (mode.websiteMode === WEBSITE_MODE.SINGLE_SITE ||
          !mode.requestedBranchMayHaveIndependentPublicWebsite)
      ) {
        const target = canonicalChurchWideHqContentPath(req.path || req.url || "");
        if (target) {
          res.redirect(303, target);
          return null;
        }
        return sendControlled(
          req,
          res,
          404,
          "This branch could not be found.",
          shellKind
        );
      }
    } catch {
      return sendControlled(
        req,
        res,
        503,
        "Website scope is temporarily unavailable.",
        shellKind
      );
    }

    return toContentAdminScope(
      resolved,
      `/hq/content/b/${resolved.branchKey}`,
      (resolved.branch && resolved.branch.displayName) || resolved.branchKey || "Branch"
    );
  }

  /**
   * Branch Admin website editor — assigned branch only (never tenant.primaryBranch).
   * HQ/platform on this surface explicitly resolves the primary branch mini-site by key
   * (not used as Branch Admin identity).
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   */
  async function resolveBranchAdminScope(req, res) {
    const tenant = resolveTenantForAuthorization(req);
    const session = req.v5Session && req.v5Session.session;
    const userId = session && session.userId;
    const baseInput = {
      tenant,
      authenticatedUser: userId,
      organizationId: tenant && tenant.organization ? tenant.organization.id : null,
      churchId: tenant && tenant.church ? tenant.church.id : null,
    };

    const assignedOrChurch = await resolveWebsiteScope(getPool(), {
      ...baseInput,
      requestedBranchKey: null,
    });

    if (assignedOrChurch.ok && assignedOrChurch.scopeType === "branch" && assignedOrChurch.branchId) {
      return toContentAdminScope(
        assignedOrChurch,
        "/branch-admin/content",
        (assignedOrChurch.branch && assignedOrChurch.branch.displayName) ||
          assignedOrChurch.branchKey ||
          "Branch"
      );
    }

    if (assignedOrChurch.ok && assignedOrChurch.scopeType === "church") {
      const primaryKey =
        tenant && tenant.primaryBranch && tenant.primaryBranch.key
          ? tenant.primaryBranch.key
          : null;
      if (!primaryKey) {
        return sendControlled(req, res, 403, "You do not have access to this site.", shellKind);
      }
      const resolved = await resolveWebsiteScope(getPool(), {
        ...baseInput,
        requestedBranchKey: primaryKey,
      });
      if (!resolved.ok || resolved.scopeType !== "branch" || !resolved.branchId) {
        return sendWebsiteScopeFailure(req, res, resolved);
      }
      return toContentAdminScope(
        resolved,
        "/branch-admin/content",
        (resolved.branch && resolved.branch.displayName) || resolved.branchKey || "Branch"
      );
    }

    return sendWebsiteScopeFailure(req, res, assignedOrChurch);
  }

  /**
   * HQ branch mini-website editor under /hq/website/branches/:branchKey (Stage 5).
   */
  async function resolveHqWebsiteBranchScope(req, res) {
    const scope = await resolveHqBranchScope(req, res);
    if (!scope) return null;
    return {
      ...scope,
      basePath: `/hq/website/branches/${scope.branchKey}`,
    };
  }

  /**
   * Branch Admin website pages under /branch-admin/website (Stage 5).
   */
  async function resolveBranchAdminWebsitePagesScope(req, res) {
    const scope = await resolveBranchAdminScope(req, res);
    if (!scope) return null;
    return {
      ...scope,
      basePath: "/branch-admin/website",
    };
  }

  function validateCsrfPost(req, res) {
    const submitted = req.body && req.body[CSRF_FIELD];
    if (!validateCsrf(req, submitted, env)) {
      sendControlled(req, res, 403, "Invalid or missing CSRF token.", shellKind);
      return false;
    }
    return true;
  }

  /**
   * @param {string} mountPrefix e.g. `/hq/content` or `/hq/content/b/:branchKey`
   * @param {(req: import('express').Request, res: import('express').Response) => Promise<object|null>} resolveScope
   */
  function registerRoutes(mountPrefix, resolveScope) {
    const p = mountPrefix.replace(/\/$/, "");

    function multerSingle(req, res, next) {
      upload.single("file")(req, res, (err) => {
        if (!err) return next();
        if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
          return res.status(400).json({ ok: false, reason: "size_limit" });
        }
        return res.status(400).json({ ok: false, reason: "upload_error" });
      });
    }

    router.post(
      `${p}/media/upload`,
      rejectApex,
      gateContent,
      (req, res, next) => {
        if (!areMediaUploadsEnabled(env)) {
          return res.status(403).json({ ok: false, reason: "media_uploads_disabled" });
        }
        return next();
      },
      multerSingle,
      async (req, res) => {
      const scope = await resolveScope(req, res);
      if (!scope) return;
      const submitted =
        (req.body && req.body[CSRF_FIELD]) ||
        (req.headers["x-csrf-token"] != null ? String(req.headers["x-csrf-token"]) : "");
      if (!validateCsrf(req, submitted, env)) {
        return res.status(403).json({ ok: false, reason: "csrf" });
      }
      if (!req.file || !req.file.buffer) {
        return res.status(400).json({ ok: false, reason: "empty_file" });
      }
      const session = req.v5Session && req.v5Session.session;
      const visibility =
        String((req.body && req.body.visibility) || VISIBILITY.PUBLIC).toLowerCase() ===
        VISIBILITY.PRIVATE
          ? VISIBILITY.PRIVATE
          : VISIBILITY.PUBLIC;

      const result = await mediaService.uploadMediaAsset(getPool(), {
        churchId: scope.churchId,
        branchId: scope.branchId,
        uploadedByUserId: session && session.userId,
        buffer: req.file.buffer,
        originalFilename: req.file.originalname,
        claimedMime: req.file.mimetype,
        visibility,
      });

      if (!result.ok) {
        const status =
          result.status === MEDIA_STATUS.FORBIDDEN
            ? 403
            : result.status === MEDIA_STATUS.CONFLICT
              ? 409
              : result.status === MEDIA_STATUS.STORAGE_ERROR
                ? 503
                : 400;
        const cleanup =
          result.status === MEDIA_STATUS.STORAGE_ERROR || result.reason === "upload_failed";
        return res.status(status).json({
          ok: false,
          reason: result.reason || "upload_failed",
          cleanup: cleanup ? "removed" : null,
        });
      }

      return res.status(200).json({
        ok: true,
        assetId: result.asset.id,
        deliveryPath: result.deliveryPath,
        mimeType: result.asset.mimeType,
        sizeBytes: result.asset.sizeBytes,
        visibility: result.asset.visibility,
        originalFilename: result.asset.originalFilename,
        deduped: Boolean(result.deduped),
      });
      }
    );

    router.get(`${p}/media`, rejectApex, gateContent, async (req, res) => {
      const scope = await resolveScope(req, res);
      if (!scope) return;
      const visibilityRaw = String((req.query && req.query.visibility) || "")
        .trim()
        .toLowerCase();
      const visibility =
        visibilityRaw === VISIBILITY.PUBLIC || visibilityRaw === VISIBILITY.PRIVATE
          ? visibilityRaw
          : null;
      const listed = await mediaService.listMediaAssets(getPool(), {
        churchId: scope.churchId,
        visibility,
        limit: req.query && req.query.limit,
      });
      if (!listed.ok) {
        return res.status(503).json({ ok: false, reason: listed.reason || "lookup", assets: [] });
      }
      const assets = (listed.assets || []).map((a) => ({
        ...a,
        previewPath: `${String(scope.basePath || p).replace(/\/$/, "")}/media/${a.id}`,
      }));
      return res.status(200).json({ ok: true, assets });
    });

    router.post(`${p}/media/:assetId/archive`, rejectApex, gateContent, async (req, res) => {
      const scope = await resolveScope(req, res);
      if (!scope) return;
      const submitted =
        (req.body && req.body[CSRF_FIELD]) ||
        (req.headers["x-csrf-token"] != null ? String(req.headers["x-csrf-token"]) : "");
      if (!validateCsrf(req, submitted, env)) {
        return res.status(403).json({ ok: false, reason: "csrf" });
      }
      const result = await mediaService.archiveMediaAsset(getPool(), {
        assetId: req.params.assetId,
        churchId: scope.churchId,
      });
      if (!result.ok) {
        const status = result.status === MEDIA_STATUS.NOT_FOUND ? 404 : 400;
        return res.status(status).json({ ok: false, reason: result.reason || "archive_failed" });
      }
      return res.status(200).json({ ok: true, assetId: result.asset.id, status: result.asset.status });
    });

    router.get(`${p}/media/:assetId`, rejectApex, gateContent, async (req, res) => {
      const scope = await resolveScope(req, res);
      if (!scope) return;
      const loaded = await mediaService.loadMediaBytes(getPool(), {
        assetId: req.params.assetId,
        viewerChurchId: scope.churchId,
        allowPrivate: true,
      });
      if (!loaded.ok) {
        const code =
          loaded.status === MEDIA_STATUS.FORBIDDEN
            ? 403
            : loaded.status === MEDIA_STATUS.NOT_FOUND
              ? 404
              : 503;
        return sendControlled(
          req,
          res,
          code,
          code === 403 ? "You do not have access to this file." : "Media not found.",
          shellKind
        );
      }
      if (loaded.redirectUrl) {
        return res.redirect(302, loaded.redirectUrl);
      }
      res.setHeader("Content-Type", loaded.asset.mimeType);
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).send(loaded.buffer);
    });

    router.get(p, rejectApex, gateContent, async (req, res) => {
      const scope = await resolveScope(req, res);
      if (!scope) return;
      await provisionEmptyPublicPages(getPool(), scopeInput(scope));
      const listed = await listAdminPages(getPool(), scopeInput(scope));
      let branches = [];
      let websiteMode = null;
      let websiteModeNoticeCode = null;
      let websiteModeNoticeMessage = null;
      if (variant === "hq" && !scope.branchId) {
        const { resolveWebsiteMode, WEBSITE_MODE } = require("../services/resolveWebsiteMode");
        const {
          parseWebsiteModeNoticeCode,
          websiteModeNoticeMessage: noticeMessageFor,
        } = require("../services/websiteModeTransition");
        websiteMode = await resolveWebsiteMode(getPool(), { churchId: scope.churchId });
        websiteModeNoticeCode = parseWebsiteModeNoticeCode(
          req.query && req.query.website_mode_notice
        );
        websiteModeNoticeMessage = noticeMessageFor(websiteModeNoticeCode);
        if (
          websiteMode &&
          websiteMode.ok &&
          websiteMode.websiteMode === WEBSITE_MODE.MULTI_SITE
        ) {
          const listResult = await listBlessBoardBranches(getPool(), scope.churchId);
          branches = (listResult && listResult.branches) || [];
        }
      }
      const rawStatus = String((req.query && req.query.status) || "")
        .trim()
        .toLowerCase();
      const statusFilter =
        variant === "hq" && ["draft", "published", "archived"].includes(rawStatus)
          ? rawStatus
          : "";
      const q =
        variant === "hq"
          ? String((req.query && req.query.q) || "")
              .trim()
              .slice(0, 100)
          : "";
      const html = renderContentAdminView(
        "content-admin/index.ejs",
        await shellLocals(req, res, {
          scope,
          pages: (listed && listed.pages) || [],
          pageTitles: PAGE_KEY_TITLES,
          branches,
          websiteMode,
          websiteModeNoticeCode,
          websiteModeNoticeMessage,
          statusFilter,
          q,
          error: null,
          saved: String((req.query && req.query.saved) || "") === "1",
        })
      );
      return res.status(200).type("html").send(html);
    });

    router.get(`${p}/pages/:pageKey`, rejectApex, gateContent, async (req, res) => {
      const scope = await resolveScope(req, res);
      if (!scope) return;
      const pageKey = String(req.params.pageKey || "").trim();
      const isChurchWideHome = pageKey === "home" && !scope.branchId;
      if (isChurchWideHome) {
        await ensureCanonicalServiceTimesSection(getPool(), {
          churchId: scope.churchId,
          branchId: null,
        });
      }
      if (scope.branchId) {
        await provisionEmptyPublicPages(getPool(), scopeInput(scope));
      }
      const bundle = await getAdminPageBundle(getPool(), {
        ...scopeInput(scope),
        pageKey,
      });
      if (!bundle.ok || !bundle.page) {
        return sendControlled(req, res, 404, "Page not found.", shellKind);
      }
      if (!verifyPageScope(bundle.page, scope)) {
        return sendControlled(req, res, 403, "You do not have access to this page.", shellKind);
      }
      let inheritance = null;
      if (scope.branchId) {
        const inh = await getBranchPageInheritanceState(getPool(), {
          churchId: scope.churchId,
          branchId: scope.branchId,
          pageKey,
        });
        if (inh.ok) {
          inheritance = {
            mode: inh.mode,
            isOverride: inh.isOverride,
            churchPage: inh.churchPage
              ? {
                  title: inh.churchPage.title,
                  status: inh.churchPage.status,
                  pageKey: inh.churchPage.pageKey,
                }
              : null,
          };
        }
      }
      const serviceTimesSection = isChurchWideHome
        ? (bundle.sections || []).find((s) => s.sectionKey === SERVICE_TIMES_SECTION_KEY) || null
        : null;
      const serviceTimesEntries = serviceTimesSection
        ? entriesFromSection(serviceTimesSection)
        : [];
      const html = renderContentAdminView(
        "content-admin/page.ejs",
        await shellLocals(req, res, {
          scope,
          page: bundle.page,
          sections: bundle.sections || [],
          inheritance,
          CSRF_FIELD,
          error: null,
          conflict: false,
          submitted: null,
          saved: String((req.query && req.query.saved) || "") === "1",
          inheritanceNotice: String((req.query && req.query.inheritance) || ""),
          serviceTimesSaved: String((req.query && req.query.service_times) || "") === "1",
          showServiceTimesEditor: isChurchWideHome,
          serviceTimesSection,
          serviceTimesEntries,
          serviceTimeDays: SERVICE_TIME_DAYS,
          serviceTimesError: null,
        })
      );
      return res.status(200).type("html").send(html);
    });

    router.post(
      `${p}/pages/:pageKey/inheritance/override`,
      rejectApex,
      gateContent,
      async (req, res) => {
        const scope = await resolveScope(req, res);
        if (!scope) return;
        if (!validateCsrfPost(req, res)) return;
        if (!scope.branchId) {
          return sendControlled(
            req,
            res,
            400,
            "Church-wide pages are not inherited overrides.",
            shellKind
          );
        }
        const pageKey = String(req.params.pageKey || "").trim();
        const session = req.v5Session && req.v5Session.session;
        const created = await createBranchPageOverride(getPool(), {
          organizationId: scope.organizationId,
          churchId: scope.churchId,
          branchId: scope.branchId,
          pageKey,
          actorUserId: session && session.userId,
        });
        if (!created.ok) {
          const code =
            created.status === INHERITANCE_STATUS.INVALID_INPUT
              ? 400
              : created.status === INHERITANCE_STATUS.NOT_FOUND
                ? 404
                : 503;
          return sendControlled(
            req,
            res,
            code,
            "Could not create a branch override for this page.",
            shellKind
          );
        }
        return res.redirect(
          303,
          `${scope.basePath}/pages/${encodeURIComponent(pageKey)}?saved=1&inheritance=override`
        );
      }
    );

    router.post(
      `${p}/pages/:pageKey/inheritance/remove`,
      rejectApex,
      gateContent,
      async (req, res) => {
        const scope = await resolveScope(req, res);
        if (!scope) return;
        if (!validateCsrfPost(req, res)) return;
        if (!scope.branchId) {
          return sendControlled(
            req,
            res,
            400,
            "Church-wide pages cannot be removed as overrides.",
            shellKind
          );
        }
        const pageKey = String(req.params.pageKey || "").trim();
        const session = req.v5Session && req.v5Session.session;
        const removed = await removeBranchPageOverride(getPool(), {
          organizationId: scope.organizationId,
          churchId: scope.churchId,
          branchId: scope.branchId,
          pageKey,
          actorUserId: session && session.userId,
        });
        if (!removed.ok) {
          const code =
            removed.status === INHERITANCE_STATUS.NOT_FOUND
              ? 404
              : removed.status === INHERITANCE_STATUS.FORBIDDEN
                ? 403
                : removed.status === INHERITANCE_STATUS.INVALID_INPUT
                  ? 400
                  : 503;
          return sendControlled(
            req,
            res,
            code,
            removed.status === INHERITANCE_STATUS.FORBIDDEN
              ? "Church-wide content is protected."
              : "Could not remove the branch override.",
            shellKind
          );
        }
        return res.redirect(
          303,
          `${scope.basePath}/pages/${encodeURIComponent(pageKey)}?saved=1&inheritance=removed`
        );
      }
    );

    router.post(
      `${p}/pages/:pageKey/publish-branch`,
      rejectApex,
      gateContent,
      async (req, res) => {
        const scope = await resolveScope(req, res);
        if (!scope) return;
        if (!validateCsrfPost(req, res)) return;
        if (!scope.branchId) {
          return sendControlled(
            req,
            res,
            400,
            "Use church website publish for church-wide pages.",
            shellKind
          );
        }
        const pageKey = String(req.params.pageKey || "").trim();
        const session = req.v5Session && req.v5Session.session;
        const body = req.body || {};
        const published = await publishBranchScopedPage(getPool(), {
          organizationId: scope.organizationId,
          churchId: scope.churchId,
          branchId: scope.branchId,
          pageKey,
          actorUserId: session && session.userId,
          confirmPublish: body.confirm_publish,
        });
        if (!published.ok) {
          const code =
            published.reason === "confirm_publish" ||
            published.status === INHERITANCE_STATUS.INVALID_INPUT
              ? 400
              : published.status === INHERITANCE_STATUS.NOT_FOUND
                ? 404
                : 503;
          return sendControlled(
            req,
            res,
            code,
            published.reason === "confirm_publish"
              ? "Confirm publish to continue."
              : "Could not publish this branch page.",
            shellKind
          );
        }
        return res.redirect(
          303,
          `${scope.basePath}/pages/${encodeURIComponent(pageKey)}?saved=1&inheritance=published`
        );
      }
    );

    router.post(`${p}/pages/home/service-times`, rejectApex, gateContent, async (req, res) => {
      const scope = await resolveScope(req, res);
      if (!scope) return;
      if (!validateCsrfPost(req, res)) return;
      if (scope.branchId) {
        return sendControlled(
          req,
          res,
          403,
          "Service times are managed on the church-wide home page.",
          shellKind
        );
      }
      const body = req.body || {};
      const tenant = resolveTenantForAuthorization(req);
      const organizationId =
        tenant && tenant.organization && tenant.organization.id
          ? tenant.organization.id
          : null;
      const actorUserId =
        req.v5Session && req.v5Session.session && req.v5Session.session.userId
          ? req.v5Session.session.userId
          : null;
      const saved = await saveHomeServiceTimes(getPool(), {
        churchId: scope.churchId,
        branchId: null,
        organizationId,
        actorUserId,
        formBody: body,
        confirmPublish: body.confirm_publish,
      });
      if (!saved.ok) {
        const bundle = await getAdminPageBundle(getPool(), {
          churchId: scope.churchId,
          branchId: null,
          pageKey: "home",
        });
        const serviceTimesSection =
          (bundle.sections || []).find((s) => s.sectionKey === SERVICE_TIMES_SECTION_KEY) || null;
        const html = renderContentAdminView(
          "content-admin/page.ejs",
          await shellLocals(req, res, {
            scope,
            page: bundle.page || { pageKey: "home", title: "Home", status: "draft", updatedAt: new Date() },
            sections: (bundle && bundle.sections) || [],
            error: saved.message || errorMessage(saved.reason, false),
            conflict: false,
            submitted: null,
            saved: false,
            serviceTimesSaved: false,
            showServiceTimesEditor: true,
            serviceTimesSection,
            serviceTimesEntries: [],
            serviceTimeDays: SERVICE_TIME_DAYS,
            serviceTimesError: saved.message || errorMessage(saved.reason, false),
            serviceTimesDraft: body,
          })
        );
        const statusCode =
          saved.status === SERVICE_TIMES_STATUS.INVALID_INPUT
            ? 400
            : saved.status === SERVICE_TIMES_STATUS.NOT_FOUND
              ? 404
              : 503;
        return res.status(statusCode).type("html").send(html);
      }
      return res.redirect(303, `${scope.basePath}/pages/home?saved=1&service_times=1`);
    });

    router.post(`${p}/pages/home/repair-service-times`, rejectApex, gateContent, async (req, res) => {
      const scope = await resolveScope(req, res);
      if (!scope) return;
      if (!validateCsrfPost(req, res)) return;
      if (scope.branchId) {
        return sendControlled(
          req,
          res,
          403,
          "Service times are managed on the church-wide home page.",
          shellKind
        );
      }
      const tenant = resolveTenantForAuthorization(req);
      const repaired = await repairHomeContentFoundation(getPool(), {
        churchId: scope.churchId,
        organizationId:
          tenant && tenant.organization && tenant.organization.id
            ? tenant.organization.id
            : null,
        actorUserId:
          req.v5Session && req.v5Session.session && req.v5Session.session.userId
            ? req.v5Session.session.userId
            : null,
      });
      if (!repaired.ok) {
        return sendControlled(req, res, 503, "Could not repair home content foundation.", shellKind);
      }
      return res.redirect(303, `${scope.basePath}/pages/home?saved=1&service_times=1`);
    });

    router.post(`${p}/pages/:pageKey`, rejectApex, gateContent, async (req, res) => {
      const scope = await resolveScope(req, res);
      if (!scope) return;
      if (!validateCsrfPost(req, res)) return;
      const body = req.body || {};
      const bundle = await getAdminPageBundle(getPool(), {
        ...scopeInput(scope),
        pageKey: req.params.pageKey,
      });
      if (!bundle.ok || !bundle.page) {
        return sendControlled(req, res, 404, "Page not found.", shellKind);
      }
      if (!verifyPageScope(bundle.page, scope)) {
        return sendControlled(req, res, 403, "You do not have access to this page.", shellKind);
      }
      const updated = await updatePublicPage(getPool(), bundle.page.id, {
        title: body.title,
        status: body.status,
        ...publishPatch(body),
      });
      if (!updated.ok) {
        const isConflict = updated.status === ADMIN_STATUS.CONFLICT;
        const isConfirm = updated.reason === "confirm_publish";
        const statusCode = isConflict
          ? 409
          : isConfirm ||
              updated.status === ADMIN_STATUS.INVALID_INPUT ||
              updated.status === ADMIN_STATUS.PUBLISHED_LOCKED
            ? 400
            : 503;
        const html = renderContentAdminView(
          "content-admin/page.ejs",
          await shellLocals(req, res, {
            scope,
            page: isConflict ? updated.page || bundle.page : bundle.page,
            sections: bundle.sections || [],
            error: errorMessage(updated.reason, isConflict),
            conflict: isConflict,
            submitted: {
              title: body.title != null ? String(body.title) : bundle.page.title,
              status: body.status != null ? String(body.status) : bundle.page.status,
            },
          })
        );
        return res.status(statusCode).type("html").send(html);
      }
      return res.redirect(303, `${scope.basePath}/pages/${req.params.pageKey}?saved=1`);
    });

    router.get(`${p}/pages/:pageKey/sections/:sectionKey`, rejectApex, gateContent, async (req, res) => {
      const scope = await resolveScope(req, res);
      if (!scope) return;
      const bundle = await getAdminPageBundle(getPool(), {
        ...scopeInput(scope),
        pageKey: req.params.pageKey,
      });
      if (!bundle.ok || !bundle.page) {
        return sendControlled(req, res, 404, "Page not found.", shellKind);
      }
      if (!verifyPageScope(bundle.page, scope)) {
        return sendControlled(req, res, 403, "You do not have access to this page.", shellKind);
      }
      const section = (bundle.sections || []).find((s) => s.sectionKey === req.params.sectionKey);
      if (!section || section.pageId !== bundle.page.id) {
        return sendControlled(req, res, 404, "Section not found.", shellKind);
      }
      const html = renderContentAdminView(
        "content-admin/section.ejs",
        await shellLocals(req, res, {
          scope,
          page: bundle.page,
          section,
          error: null,
          conflict: false,
          submitted: null,
          saved: String((req.query && req.query.saved) || "") === "1",
        })
      );
      return res.status(200).type("html").send(html);
    });

    router.post(`${p}/pages/:pageKey/sections`, rejectApex, gateContent, async (req, res) => {
      const scope = await resolveScope(req, res);
      if (!scope) return;
      if (!validateCsrfPost(req, res)) return;
      const body = req.body || {};
      const bundle = await getAdminPageBundle(getPool(), {
        ...scopeInput(scope),
        pageKey: req.params.pageKey,
      });
      if (!bundle.ok || !bundle.page) {
        return sendControlled(req, res, 404, "Page not found.", shellKind);
      }
      if (!verifyPageScope(bundle.page, scope)) {
        return sendControlled(req, res, 403, "You do not have access to this page.", shellKind);
      }
      const created = await createPageSection(getPool(), {
        pageId: bundle.page.id,
        sectionKey: body.section_key,
        sectionType: body.section_type,
        heading: body.heading,
        bodyText: body.body_text,
        mediaUrl: body.media_url,
        sortOrder: body.sort_order,
        status: body.status,
        confirmPublish: body.confirm_publish,
        enforcePublishConfirm: true,
      });
      if (!created.ok) {
        const html = renderContentAdminView(
          "content-admin/page.ejs",
          await shellLocals(req, res, {
            scope,
            page: bundle.page,
            sections: bundle.sections || [],
            error: errorMessage(created.reason, false),
            conflict: false,
            submitted: null,
            sectionFormError: true,
            sectionDraft: body,
          })
        );
        const statusCode =
          created.reason === "confirm_publish" ||
          created.status === ADMIN_STATUS.INVALID_INPUT ||
          created.status === ADMIN_STATUS.PUBLISHED_LOCKED
            ? 400
            : 503;
        return res.status(statusCode).type("html").send(html);
      }
      return res.redirect(
        303,
        `${scope.basePath}/pages/${req.params.pageKey}/sections/${created.section.sectionKey}?saved=1`
      );
    });

    const SAME = (a, b) => String(a == null ? "" : a) === String(b == null ? "" : b);

    /**
     * Draft-first compatibility shim for the classic section form.
     *
     * A live (published) section is never mutated in place. Text edits are
     * rewritten into shared-engine field drafts; edits with no draft
     * representation yet are refused rather than applied to the public site.
     *
     * @returns {Promise<boolean>} true when the response has been sent
     */
    async function routePublishedSectionEditToDraft(req, res, ctx) {
      const { scope, page, sections, section, body, pageKey } = ctx;
      if (String(section.status || "").toLowerCase() !== "published") return false;

      const textChanges = [];
      if (body.heading !== undefined && !SAME(body.heading, section.heading)) {
        textChanges.push({ fieldKey: "heading", value: String(body.heading) });
      }
      if (body.body_text !== undefined && !SAME(body.body_text, section.bodyText)) {
        textChanges.push({ fieldKey: "bodyText", value: String(body.body_text) });
      }
      const unsupported = [];
      if (body.media_url !== undefined && !SAME(body.media_url, section.mediaUrl)) {
        unsupported.push("media");
      }
      if (body.section_type !== undefined && !SAME(body.section_type, section.sectionType)) {
        unsupported.push("layout");
      }
      if (body.sort_order !== undefined && !SAME(body.sort_order, section.sortOrder)) {
        unsupported.push("order");
      }
      if (!textChanges.length && !unsupported.length) return false;

      const renderSectionError = async (statusCode, message) => {
        const html = renderContentAdminView(
          "content-admin/section.ejs",
          await shellLocals(req, res, {
            scope,
            page,
            section,
            sections,
            error: message,
            conflict: false,
            submitted: {
              heading: body.heading != null ? String(body.heading) : section.heading,
              body_text: body.body_text != null ? String(body.body_text) : section.bodyText,
              media_url: body.media_url != null ? String(body.media_url) : section.mediaUrl || "",
              sort_order:
                body.sort_order != null ? String(body.sort_order) : String(section.sortOrder),
              status: body.status != null ? String(body.status) : section.status,
              section_type:
                body.section_type != null ? String(body.section_type) : section.sectionType,
            },
          })
        );
        res.status(statusCode).type("html").send(html);
        return true;
      };

      if (unsupported.length) {
        return renderSectionError(
          400,
          "This section is live. Image, layout and ordering changes must be made in the website editor so they can be previewed before publishing."
        );
      }

      const perm = await assertWebsitePermission(req, "website.edit", scope.branchId);
      if (!perm.ok) {
        return sendControlled(req, res, perm.status || 403, perm.error, shellKind);
      }

      const { saveInlineFieldDraft } = require("../services/websiteInlineDraftService");
      try {
        for (const change of textChanges) {
          await saveInlineFieldDraft(getPool(), {
            organizationId: perm.tenant.organization.id,
            churchId: scope.churchId,
            branchId: scope.branchId,
            editorUserId: perm.session.userId,
            actorRole: legacyActorRoleLabel(req),
            pageKey,
            sectionKey: section.sectionKey,
            fieldKey: change.fieldKey,
            newValue: change.value,
            grantedPermissions: ["website.edit"],
          });
        }
      } catch (err) {
        const message =
          err && err.status && err.status < 500 && err.message
            ? String(err.message)
            : "Could not save this change. Please try again.";
        return renderSectionError(err && err.status ? Number(err.status) : 500, message);
      }

      res.redirect(
        303,
        `${scope.basePath}/pages/${pageKey}/sections/${section.sectionKey}?saved=1&draft=1`
      );
      return true;
    }

    router.post(`${p}/pages/:pageKey/sections/:sectionKey`, rejectApex, gateContent, async (req, res) => {
      const scope = await resolveScope(req, res);
      if (!scope) return;
      if (!validateCsrfPost(req, res)) return;
      const body = req.body || {};
      const bundle = await getAdminPageBundle(getPool(), {
        ...scopeInput(scope),
        pageKey: req.params.pageKey,
      });
      if (!bundle.ok || !bundle.page) {
        return sendControlled(req, res, 404, "Page not found.", shellKind);
      }
      if (!verifyPageScope(bundle.page, scope)) {
        return sendControlled(req, res, 403, "You do not have access to this page.", shellKind);
      }
      const section = (bundle.sections || []).find((s) => s.sectionKey === req.params.sectionKey);
      if (!section || section.pageId !== bundle.page.id) {
        return sendControlled(req, res, 404, "Section not found.", shellKind);
      }
      // Draft-first: a live section is never edited in place by the classic form.
      const draftRouted = await routePublishedSectionEditToDraft(req, res, {
        scope,
        page: bundle.page,
        sections: bundle.sections || [],
        section,
        body,
        pageKey: req.params.pageKey,
      });
      if (draftRouted) return;
      const updated = await updatePageSection(getPool(), section.id, {
        heading: body.heading,
        bodyText: body.body_text,
        mediaUrl: body.media_url,
        sortOrder: body.sort_order,
        status: body.status,
        sectionType: body.section_type,
        expectedRevision:
          body.base_revision != null && body.base_revision !== ""
            ? Number(body.base_revision)
            : undefined,
        ...publishPatch(body),
      });
      if (!updated.ok) {
        const isConflict = updated.status === ADMIN_STATUS.CONFLICT;
        const isConfirm = updated.reason === "confirm_publish";
        const statusCode = isConflict
          ? 409
          : isConfirm ||
              updated.status === ADMIN_STATUS.INVALID_INPUT ||
              updated.status === ADMIN_STATUS.PUBLISHED_LOCKED
            ? 400
            : 503;
        const submitted = {
          heading: body.heading != null ? String(body.heading) : section.heading,
          body_text: body.body_text != null ? String(body.body_text) : section.bodyText,
          media_url: body.media_url != null ? String(body.media_url) : section.mediaUrl || "",
          sort_order: body.sort_order != null ? String(body.sort_order) : String(section.sortOrder),
          status: body.status != null ? String(body.status) : section.status,
          section_type: body.section_type != null ? String(body.section_type) : section.sectionType,
        };
        if (isConflict) {
          const tenant = resolveTenantForAuthorization(req);
          const orgId = tenant && tenant.organization && tenant.organization.id;
          const conflictActionBase = `${scope.basePath}/pages/${req.params.pageKey}/sections/${req.params.sectionKey}/conflict`;
          const html = renderContentAdminView(
            "content-admin/section.ejs",
            await shellLocals(req, res, {
              scope,
              page: bundle.page,
              section: updated.section || section,
              error: null,
              conflict: true,
              conflictPanel: true,
              submitted,
              conflictActionBase,
              cancelPath: `${scope.basePath}/pages/${req.params.pageKey}/sections/${req.params.sectionKey}`,
              canSaveAsDraft: Boolean(scope.churchId),
              organizationId: orgId,
            })
          );
          return res.status(statusCode).type("html").send(html);
        }
        const html = renderContentAdminView(
          "content-admin/section.ejs",
          await shellLocals(req, res, {
            scope,
            page: bundle.page,
            section,
            error: errorMessage(updated.reason, false),
            conflict: false,
            submitted,
          })
        );
        return res.status(statusCode).type("html").send(html);
      }

      // Audit successful draft saves (non-publish).
      try {
        const tenant = resolveTenantForAuthorization(req);
        if (tenant && tenant.organization && tenant.organization.id) {
          const auditSvc = require("../services/websiteAuditService");
          const session = req.v5Session && req.v5Session.session;
          await auditSvc.recordWebsiteAuditEvent(getPool(), {
            organizationId: tenant.organization.id,
            branchId: scope.branchId || null,
            actorUserId: session && session.userId ? session.userId : null,
            actorRole: variant === "hq" ? "church_hq_admin" : "branch_admin",
            actionType: "draft_saved",
            pageKey: req.params.pageKey,
            sectionKey: req.params.sectionKey,
            entityType: "page_section",
            entityId: section.id,
            result: "success",
            after: {
              heading: body.heading,
              status: body.status,
            },
          });
        }
      } catch {
        /* draft save already succeeded; audit failure is non-blocking for editor save */
      }

      return res.redirect(
        303,
        `${scope.basePath}/pages/${req.params.pageKey}/sections/${req.params.sectionKey}?saved=1`
      );
    });

    function actorUserIdFromReq(req) {
      const session = req.v5Session && req.v5Session.session;
      return session && session.userId ? String(session.userId) : null;
    }

    async function handleConflictResolution(req, res, resolution) {
      const scope = await resolveScope(req, res);
      if (!scope) return;
      if (!validateCsrfPost(req, res)) return;
      const tenant = resolveTenantForAuthorization(req);
      if (!tenant || !tenant.organization || !tenant.organization.id || !tenant.church) {
        return sendControlled(req, res, 403, "You do not have access to this site.", shellKind);
      }
      const userId = actorUserIdFromReq(req);
      if (!userId) return sendControlled(req, res, 401, "Sign-in is required.", shellKind);

      const conflictSvc = require("../services/websiteEditConflictService");
      const body = req.body || {};
      const branchId = scope.branchId || null;

      const result = await conflictSvc.resolveWebsiteEditConflict(getPool(), {
        organizationId: tenant.organization.id,
        churchId: scope.churchId,
        branchId,
        actorUserId: userId,
        actorRole: variant === "hq" ? "church_hq_admin" : "branch_admin",
        pageKey: req.params.pageKey,
        sectionKey: req.params.sectionKey,
        resolution,
        confirmForce:
          body.confirm_force === "1" &&
          (body.acknowledge_replace === "1" || body.acknowledge_replace === "on"),
        submitted: body,
      });

      if (!result.ok) {
        if (result.status === conflictSvc.STATUS.NOT_FOUND) {
          return sendControlled(req, res, 404, "Section not found.", shellKind);
        }
        if (result.status === conflictSvc.STATUS.FORBIDDEN) {
          return sendControlled(req, res, 403, "Not allowed.", shellKind);
        }
        return res.redirect(
          303,
          `${scope.basePath}/pages/${req.params.pageKey}/sections/${req.params.sectionKey}?conflict_error=1`
        );
      }

      if (resolution === "use_latest") {
        return res.redirect(
          303,
          `${scope.basePath}/pages/${req.params.pageKey}/sections/${req.params.sectionKey}?reloaded=1`
        );
      }
      if (resolution === "save_as_draft" && result.submission) {
        const dest =
          variant === "hq"
            ? `/hq/website/change-submissions/${result.submission.id}`
            : `/branch-admin/website/submissions/${result.submission.id}`;
        return res.redirect(303, dest);
      }
      return res.redirect(
        303,
        `${scope.basePath}/pages/${req.params.pageKey}/sections/${req.params.sectionKey}?saved=1`
      );
    }

    router.post(
      `${p}/pages/:pageKey/sections/:sectionKey/conflict/use-latest`,
      rejectApex,
      gateContent,
      (req, res) => handleConflictResolution(req, res, "use_latest")
    );
    router.post(
      `${p}/pages/:pageKey/sections/:sectionKey/conflict/save-as-draft`,
      rejectApex,
      gateContent,
      (req, res) => handleConflictResolution(req, res, "save_as_draft")
    );
    router.post(
      `${p}/pages/:pageKey/sections/:sectionKey/conflict/force-replace`,
      rejectApex,
      gateContent,
      (req, res) => handleConflictResolution(req, res, "force_replace")
    );

    const ENTITY_DRAFT_KINDS = Object.freeze({
      leadership: "leader",
      ministries: "ministry",
      events: "event",
      sermons: "sermon",
      giving: "giving_method",
      contact: "social_link",
    });

    /**
     * Draft-first compatibility shim for the classic entity forms.
     *
     * Editing a published leader/ministry/event/sermon/giving/contact item is
     * rewritten into a shared-engine structured draft so the public site only
     * changes at publish time.
     *
     * @returns {Promise<boolean>} true when the response has been sent
     */
    async function routePublishedEntityEditToDraft(req, res, ctx) {
      const { scope, routeKey, cfg, existing, body } = ctx;
      if (String(existing.status || "").toLowerCase() !== "published") return false;

      const draftKind = ENTITY_DRAFT_KINDS[routeKey];
      const patch = entityPatchFromBody(routeKey, body);
      const contentKeys = Object.keys(patch).filter(
        (key) =>
          !["status", "confirmPublish", "expectedUpdatedAt", "enforcePublishConfirm"].includes(key)
      );
      const changed = contentKeys.some(
        (key) => patch[key] !== undefined && !SAME(patch[key], existing[key])
      );
      if (!changed) return false;

      const renderEntityError = async (statusCode, message) => {
        const listed = await cfg.listFn(getPool(), scopeInput(scope));
        const html = renderContentAdminView(
          "content-admin/entities.ejs",
          await shellLocals(req, res, {
            scope,
            entityKind: routeKey,
            entityTitle: cfg.title,
            items: (listed && listed.items) || [],
            statusFilter: "",
            q: "",
            whenFilter: "",
            error: message,
            conflict: false,
            submitted: body,
            editItemId: String(body.item_id || ""),
            saved: false,
          })
        );
        res.status(statusCode).type("html").send(html);
        return true;
      };

      if (!draftKind) {
        return renderEntityError(
          400,
          "This item is live. Edit it in the website editor so the change can be previewed before publishing."
        );
      }

      const perm = await assertWebsitePermission(req, "website.edit", scope.branchId);
      if (!perm.ok) {
        return sendControlled(req, res, perm.status || 403, perm.error, shellKind);
      }

      const { saveStructuredDraft } = require("../services/websiteStructuredDraftService");
      try {
        await saveStructuredDraft(getPool(), {
          organizationId: perm.tenant.organization.id,
          churchId: scope.churchId,
          branchId: scope.branchId,
          editorUserId: perm.session.userId,
          actorRole: legacyActorRoleLabel(req),
          draftKind,
          pageKey: cfg.pageKey,
          sectionKey: null,
          entityKey: String(existing.id),
          op: "upsert",
          payload: { ...patch, status: existing.status },
        });
      } catch (err) {
        const message =
          err && err.status && err.status < 500 && err.message
            ? String(err.message)
            : "Could not save this change. Please try again.";
        return renderEntityError(err && err.status ? Number(err.status) : 500, message);
      }

      res.redirect(303, `${scope.basePath}/${routeKey}?saved=1&draft=1`);
      return true;
    }

    for (const [routeKey, cfg] of Object.entries(ENTITY_ROUTES)) {
      router.get(`${p}/${routeKey}`, rejectApex, gateContent, async (req, res) => {
        const scope = await resolveScope(req, res);
        if (!scope) return;
        const listed = await cfg.listFn(getPool(), scopeInput(scope));
        const rawStatus = String((req.query && req.query.status) || "")
          .trim()
          .toLowerCase();
        const allowedStatus =
          routeKey === "events"
            ? ["draft", "published", "cancelled", "archived"]
            : ["draft", "published", "archived"];
        const statusFilter = allowedStatus.includes(rawStatus) ? rawStatus : "";
        const q = String((req.query && req.query.q) || "")
          .trim()
          .slice(0, 100);
        const rawWhen = String((req.query && req.query.when) || "")
          .trim()
          .toLowerCase();
        const whenFilter =
          routeKey === "events" && (rawWhen === "upcoming" || rawWhen === "past") ? rawWhen : "";
        const html = renderContentAdminView(
          "content-admin/entities.ejs",
          await shellLocals(req, res, {
            scope,
            entityKind: routeKey,
            entityTitle: cfg.title,
            items: (listed && listed.items) || [],
            statusFilter,
            q,
            whenFilter,
            error: null,
            conflict: false,
            submitted: null,
            saved: String((req.query && req.query.saved) || "") === "1",
          })
        );
        return res.status(200).type("html").send(html);
      });

      router.post(`${p}/${routeKey}`, rejectApex, gateContent, async (req, res) => {
        const scope = await resolveScope(req, res);
        if (!scope) return;
        if (!validateCsrfPost(req, res)) return;
        const body = req.body || {};
        const action = String(body.action || "create").trim().toLowerCase();
        let result;
        if (action === "update") {
          const itemId = String(body.item_id || "").trim();
          if (!itemId) {
            return sendControlled(req, res, 400, "Item id is required for update.", shellKind);
          }
          const existing = await cfg.findFn(getPool(), itemId);
          if (!existing || !verifyEntityScope(existing, scope)) {
            return sendControlled(req, res, 404, "Item not found.", shellKind);
          }
          // Draft-first: a live item is never edited in place by the classic form.
          const entityDraftRouted = await routePublishedEntityEditToDraft(req, res, {
            scope,
            routeKey,
            cfg,
            existing,
            body,
          });
          if (entityDraftRouted) return;
          result = await cfg.updateFn(getPool(), itemId, entityPatchFromBody(routeKey, body));
        } else {
          result = await cfg.createFn(getPool(), {
            ...scopeInput(scope),
            ...entityPatchFromBody(routeKey, body),
          });
        }
        const listed = await cfg.listFn(getPool(), scopeInput(scope));
        if (!result.ok) {
          const isConflict = result.status === ADMIN_STATUS.CONFLICT;
          const isConfirm = result.reason === "confirm_publish";
          const statusCode = isConflict ? 409 : isConfirm || result.status === ADMIN_STATUS.INVALID_INPUT ? 400 : 503;
          const html = renderContentAdminView(
            "content-admin/entities.ejs",
            await shellLocals(req, res, {
              scope,
              entityKind: routeKey,
              entityTitle: cfg.title,
              items: (listed && listed.items) || [],
              statusFilter: "",
              q: "",
              whenFilter: "",
              error: errorMessage(result.reason, isConflict),
              conflict: isConflict,
              submitted: body,
              editItemId: action === "update" ? String(body.item_id || "") : null,
              saved: false,
            })
          );
          return res.status(statusCode).type("html").send(html);
        }
        return res.redirect(303, `${scope.basePath}/${routeKey}?saved=1`);
      });
    }

    /**
     * Phase 7 Stage 4 — save inline text field to draft (does not publish).
     */
    router.post(`${p}/api/inline-field`, rejectApex, gateContent, express.json({ limit: "32kb" }), async (req, res) => {
      const scope = await resolveScope(req, res);
      if (!scope) return;

      const submitted =
        (req.body && req.body[CSRF_FIELD]) ||
        (req.headers["x-csrf-token"] != null ? String(req.headers["x-csrf-token"]) : "");
      if (!validateCsrf(req, submitted, env)) {
        return res.status(403).json({
          ok: false,
          reason: "csrf_failed",
          code: "csrf_failed",
          error: "Invalid or missing CSRF token.",
          message: "Invalid or missing CSRF token.",
        });
      }

      const body = req.body && typeof req.body === "object" ? req.body : {};
      const pageKey = String(body.pageKey || "").trim();
      const sectionKey = String(body.sectionKey || "").trim();
      const fieldKey = String(body.fieldKey || "").trim();
      const newValue = body.value != null ? String(body.value) : "";

      // Never trust client-provided organization / church IDs.
      if (body.organizationId || body.churchId || body.organization_id || body.church_id) {
        return res.status(400).json({
          ok: false,
          reason: "invalid_scope",
          error: "Organization scope is determined by the signed-in session.",
        });
      }

      const perm = await assertWebsitePermission(req, "website.edit", scope.branchId);
      if (!perm.ok) {
        return res.status(perm.status).json({ ok: false, reason: "forbidden", error: perm.error });
      }
      const tenant = perm.tenant;
      const session = perm.session;

      const { saveInlineFieldDraft } = require("../services/websiteInlineDraftService");
      try {
        const result = await saveInlineFieldDraft(getPool(), {
          organizationId: tenant.organization.id,
          churchId: scope.churchId,
          branchId: scope.branchId,
          editorUserId: session.userId,
          actorRole: legacyActorRoleLabel(req),
          pageKey,
          sectionKey,
          fieldKey,
          newValue,
          grantedPermissions: ["website.edit"],
        });
        return res.status(200).json({
          ok: true,
          published: false,
          saved: true,
          status: "draft_saved",
          message: "Change saved as a draft.",
          fieldKey: `${pageKey}::${sectionKey}::${fieldKey}`,
          draftCleared: Boolean(result.draftCleared),
          value: result.value,
          previousValue: result.previousValue,
        });
      } catch (err) {
        const status = err && err.status ? Number(err.status) : 500;
        const rawCode = err && err.code != null ? String(err.code) : "SAVE_FAILED";
        const pgCode =
          err && err.pgCode != null
            ? String(err.pgCode)
            : rawCode.toUpperCase() === "42P01"
              ? "42P01"
              : null;
        const isClientError = status >= 400 && status < 500;
        let reason = rawCode.toLowerCase();
        if (pgCode === "42P01" || (!isClientError && !err.status)) reason = "save_failed";
        else if (reason === "csrf") reason = "csrf_failed";
        else if (reason === "validation") reason = "validation_failed";

        const message =
          isClientError && err && err.message
            ? String(err.message)
            : "Could not save this change. Please try again.";

        try {
          console.info(
            JSON.stringify({
              event: "website_inline_field_save_failed",
              requestId: req.requestId || null,
              reason,
              pgCode,
              pageKey,
              sectionKey,
              fieldKey,
              churchId: scope.churchId || null,
              branchId: scope.branchId || null,
              variant,
            })
          );
        } catch {
          /* ignore log failures */
        }

        return res.status(status >= 400 && status < 600 ? status : 500).json({
          ok: false,
          reason,
          code: reason,
          error: message,
          message,
          published: false,
        });
      }
    });

    /**
     * Phase 7 — save one inline field draft, then publish all drafts for this scope.
     */
    router.post(
      `${p}/api/inline-field/publish`,
      rejectApex,
      gateContent,
      express.json({ limit: "32kb" }),
      async (req, res) => {
        const scope = await resolveScope(req, res);
        if (!scope) return;

        const submitted =
          (req.body && req.body[CSRF_FIELD]) ||
          (req.headers["x-csrf-token"] != null ? String(req.headers["x-csrf-token"]) : "");
        if (!validateCsrf(req, submitted, env)) {
          return res.status(403).json({
            ok: false,
            reason: "csrf_failed",
            code: "csrf_failed",
            error: "Invalid or missing CSRF token.",
            message: "Invalid or missing CSRF token.",
            published: false,
          });
        }

        const body = req.body && typeof req.body === "object" ? req.body : {};
        const pageKey = String(body.pageKey || "").trim();
        const sectionKey = String(body.sectionKey || "").trim();
        const fieldKey = String(body.fieldKey || "").trim();
        const newValue = body.value != null ? String(body.value) : "";

        if (body.organizationId || body.churchId || body.organization_id || body.church_id) {
          return res.status(400).json({
            ok: false,
            reason: "invalid_scope",
            error: "Organization scope is determined by the signed-in session.",
            published: false,
          });
        }

        const tenant = resolveTenantForAuthorization(req);
        if (!tenant || !tenant.organization || !tenant.church) {
          return res.status(403).json({
            ok: false,
            reason: "forbidden",
            error: "Access denied.",
            published: false,
          });
        }

        const editPerm = await assertWebsitePermission(req, "website.edit", scope.branchId);
        if (!editPerm.ok) {
          return res.status(editPerm.status).json({
            ok: false,
            reason: "forbidden",
            error: editPerm.error,
            published: false,
          });
        }
        const publishPerm = await assertWebsitePermission(req, "website.publish", scope.branchId);
        if (!publishPerm.ok) {
          return res.status(publishPerm.status).json({
            ok: false,
            reason: "forbidden",
            error: "Publish permission required.",
            published: false,
          });
        }
        const session = publishPerm.session;
        const actorRole = legacyActorRoleLabel(req);

        const { saveInlineFieldDraft } = require("../services/websiteInlineDraftService");
        const { publishWebsiteDrafts } = require("../services/websiteDraftPublishService");

        let saveResult;
        try {
          saveResult = await saveInlineFieldDraft(getPool(), {
            organizationId: tenant.organization.id,
            churchId: scope.churchId,
            branchId: scope.branchId,
            editorUserId: session.userId,
            actorRole,
            pageKey,
            sectionKey,
            fieldKey,
            newValue,
            grantedPermissions: ["website.edit"],
          });
        } catch (err) {
          const status = err && err.status ? Number(err.status) : 500;
          const isClientError = status >= 400 && status < 500;
          const message =
            isClientError && err && err.message
              ? String(err.message)
              : "Could not save this change. Please try again.";
          const reason =
            err && err.code ? String(err.code).toLowerCase() : "save_failed";
          return res.status(status >= 400 && status < 600 ? status : 500).json({
            ok: false,
            reason: reason === "validation" ? "validation_failed" : reason,
            code: reason === "validation" ? "validation_failed" : reason,
            error: message,
            message,
            published: false,
          });
        }

        const publishResult = await publishWebsiteDrafts(getPool(), {
          organizationId: tenant.organization.id,
          churchId: scope.churchId,
          branchId: scope.branchId,
          actorUserId: session.userId,
          actorRole,
          tenant,
          confirmPublish: true,
          mobilePreviewConfirmed: true,
          deferServiceTimes: true,
          env,
        });

        if (!publishResult.ok) {
          const reason = String(publishResult.reason || "publish_failed");
          const statusCode =
            publishResult.status === "forbidden"
              ? 403
              : publishResult.status === "not_ready" || reason === "no_changes"
                ? 409
                : 500;
          const message =
            reason === "approval_required"
              ? "These changes require approval before publication."
              : reason === "no_changes"
                ? "There are no draft changes to publish."
                : reason === "not_ready" || publishResult.status === "not_ready"
                  ? "Website is not ready to publish. Review draft changes for blocking issues."
                  : "We could not publish these changes. Please try again.";
          const validationErrors =
            (publishResult.publishResult && publishResult.publishResult.validationErrors) ||
            (publishResult.publishResult &&
              publishResult.publishResult.validation &&
              publishResult.publishResult.validation.errors) ||
            [];
          const {
            buildBlockingIssues,
          } = require("../services/websitePublishReviewService");
          const blockingIssues = buildBlockingIssues({
            validation: (publishResult.publishResult && publishResult.publishResult.validation) || {
              publishable: false,
              errors: validationErrors,
            },
            readiness: {
              ready: false,
              gaps: publishResult.gaps || [],
            },
            branchKey: scope.branchKey || null,
            branchName:
              (scope.branch && scope.branch.displayName) || scope.branchKey || null,
          });
          const issueSummary = blockingIssues
            .slice(0, 3)
            .map((i) => i.title || i.message)
            .filter(Boolean)
            .join("; ");
          return res.status(statusCode).json({
            ok: false,
            reason,
            code: reason,
            error: issueSummary ? `${message} ${issueSummary}` : message,
            message: issueSummary ? `${message} ${issueSummary}` : message,
            saved: true,
            published: false,
            value: saveResult.value,
            previousValue: saveResult.previousValue,
            gaps: publishResult.gaps || null,
            validationErrors,
            blockingIssues,
            reviewPath: scope.branchKey
              ? `/hq/website/branches/${encodeURIComponent(scope.branchKey)}/publish/review`
              : `${scope.basePath}/draft-changes/publish-review`,
            fixDetailsPath:
              (blockingIssues[0] && blockingIssues[0].editUrl) ||
              (scope.branchKey
                ? `/hq/website/branches/${encodeURIComponent(scope.branchKey)}/details`
                : "/hq/settings"),
          });
        }

        return res.status(200).json({
          ok: true,
          saved: true,
          published: true,
          status: "published",
          message: "Changes published successfully.",
          fieldKey: `${pageKey}::${sectionKey}::${fieldKey}`,
          value: saveResult.value,
          previousValue: saveResult.previousValue,
        });
      }
    );

    /**
     * Phase 7 Stage 5 — save/cancel structured drafts (media + collections). Does not publish.
     */
    router.post(
      `${p}/api/structured-draft`,
      rejectApex,
      gateContent,
      express.json({ limit: "256kb" }),
      async (req, res) => {
        const scope = await resolveScope(req, res);
        if (!scope) return;

        const submitted =
          (req.body && req.body[CSRF_FIELD]) ||
          (req.headers["x-csrf-token"] != null ? String(req.headers["x-csrf-token"]) : "");
        if (!validateCsrf(req, submitted, env)) {
          return res
            .status(403)
            .json({ ok: false, reason: "csrf", error: "Invalid or missing CSRF token." });
        }

        const body = req.body && typeof req.body === "object" ? req.body : {};
        if (body.organizationId || body.churchId || body.organization_id || body.church_id) {
          return res.status(400).json({
            ok: false,
            reason: "invalid_scope",
            error: "Organization scope is determined by the signed-in session.",
          });
        }

        const tenant = resolveTenantForAuthorization(req);
        if (!tenant || !tenant.organization || !tenant.church) {
          return res.status(403).json({ ok: false, reason: "forbidden", error: "Access denied." });
        }
        if (String(tenant.church.id) !== String(scope.churchId)) {
          return res.status(403).json({ ok: false, reason: "forbidden", error: "Access denied." });
        }

        const perm = await assertWebsitePermission(req, "website.edit", scope.branchId);
        if (!perm.ok) {
          return res.status(perm.status).json({ ok: false, reason: "forbidden", error: perm.error });
        }
        const session = perm.session;

        const {
          saveStructuredDraft,
          cancelStructuredDraft,
        } = require("../services/websiteStructuredDraftService");
        const action = String(body.action || "save").trim().toLowerCase();
        const actorRole = legacyActorRoleLabel(req);

        try {
          if (action === "cancel") {
            const result = await cancelStructuredDraft(getPool(), {
              churchId: scope.churchId,
              branchId: scope.branchId,
              draftKind: body.draftKind,
              pageKey: body.pageKey,
              sectionKey: body.sectionKey,
              entityKey: body.entityKey,
            });
            return res.status(200).json({ ok: true, published: false, ...result });
          }

          const result = await saveStructuredDraft(getPool(), {
            organizationId: tenant.organization.id,
            churchId: scope.churchId,
            branchId: scope.branchId,
            editorUserId: session.userId,
            actorRole,
            draftKind: body.draftKind,
            pageKey: body.pageKey,
            sectionKey: body.sectionKey,
            entityKey: body.entityKey,
            op: body.op || "upsert",
            payload: body.payload || {},
            previousPayload: body.previousPayload != null ? body.previousPayload : null,
          });
          return res.status(200).json({ ok: true, published: false, ...result });
        } catch (err) {
          const status = err && err.status ? Number(err.status) : 500;
          const code = err && err.code ? String(err.code) : "SAVE_FAILED";
          const message =
            err && err.message && status < 500
              ? String(err.message)
              : "Could not save this change. Please try again.";
          return res.status(status >= 400 && status < 600 ? status : 500).json({
            ok: false,
            reason: code.toLowerCase(),
            error: message,
            published: false,
          });
        }
      }
    );

    /**
     * Phase 7 Stage 6 — draft changes, publish review, discard, publish/submit, draft preview.
     */
    function resolveActorRole(req) {
      const authzCtx = req.blessBoardAuthorizationContext;
      const roleKeys = new Set(
        ((authzCtx && authzCtx.effectiveRoles) || []).map((r) => String(r.roleKey || ""))
      );
      if (roleKeys.has("platform_admin")) return "platform_admin";
      if (roleKeys.has("church_hq_admin")) return "church_hq_admin";
      if (roleKeys.has("branch_admin")) return "branch_admin";
      return null;
    }

    async function buildDraftReviewOpts(req, scope) {
      const tenant = resolveTenantForAuthorization(req);
      const session = req.v5Session && req.v5Session.session;
      const orgKey = tenant && tenant.organization ? tenant.organization.key : null;
      const { publicChurchHomePath } = require("../urls/churchUrlHelper");
      const {
        PRODUCT_CODE,
        buildPublicWebsiteEditPath,
      } = require("../../platform/website/publicWebsiteUrl");
      const publicHome = publicChurchHomePath(orgKey) || "/";
      let canPublish = false;
      if (tenant && session && session.userId) {
        const pub = await authorize(getPool(), {
          actor: { userId: session.userId },
          permission: "website.publish",
          tenantContext: tenant,
          resourceContext: {
            organizationId: tenant.organization.id,
            churchId: tenant.church.id,
            branchId: scope.branchId || null,
          },
        });
        canPublish = pub.allowed === true;
      }
      return {
        organizationId: tenant && tenant.organization ? tenant.organization.id : null,
        churchId: scope.churchId,
        branchId: scope.branchId,
        actorRole: resolveActorRole(req),
        actorUserId: session && session.userId,
        tenant,
        canPublish,
        scopeLabel: scope.scopeLabel || (scope.branchId ? "Branch website" : "Organization website"),
        basePath: scope.basePath,
        publicHomePath: publicHome,
        editHomePath:
          buildPublicWebsiteEditPath({
            product: PRODUCT_CODE.BLESSBOARD,
            organizationKey: orgKey,
          }) || publicHome,
      };
    }

    router.get(`${p}/draft-changes`, rejectApex, gateContent, async (req, res) => {
      const scope = await resolveScope(req, res);
      if (!scope) return;
      const tenant = resolveTenantForAuthorization(req);
      if (!tenant || !tenant.organization || !tenant.church) {
        return sendControlled(req, res, 403, "Access denied.", shellKind);
      }
      const {
        loadWebsiteDraftChangesReview,
      } = require("../services/websiteDraftReviewService");
      const reviewOpts = await buildDraftReviewOpts(req, scope);
      const review = await loadWebsiteDraftChangesReview(getPool(), reviewOpts);
      if (!review.ok) {
        const html = renderContentAdminView(
          "content-admin/website-draft-changes.ejs",
          await shellLocals(req, res, {
            scope,
            review: null,
            loadError: true,
            error:
              "We could not load draft changes. Your drafts were preserved — try again.",
            notice: null,
          })
        );
        return res.status(503).type("html").send(html);
      }
      const notice = String((req.query && req.query.notice) || "");
      const errQ = String((req.query && req.query.error) || "");
      const html = renderContentAdminView(
        "content-admin/website-draft-changes.ejs",
        await shellLocals(req, res, {
          scope,
          review,
          loadError: false,
          error:
            errQ === "discard_failed"
              ? "Discard failed. Drafts were preserved — try again."
              : errQ === "publish_failed"
                ? "Publication failed. Drafts were preserved — try again."
                : errQ === "submit_failed"
                  ? "Approval submission failed. Drafts were preserved — try again."
                  : errQ === "csrf"
                    ? "Invalid or missing security token. Refresh and try again."
                    : errQ === "forbidden"
                      ? "You do not have permission for that action."
                      : null,
          notice:
            notice === "discarded"
              ? "Unpublished draft changes were discarded. The published website was not changed."
              : notice === "submitted"
                ? "Changes were submitted for approval."
                : notice === "published"
                  ? "Changes published successfully."
                  : null,
        })
      );
      return res.status(200).type("html").send(html);
    });

    router.get(`${p}/draft-changes/publish-review`, rejectApex, gateContent, async (req, res) => {
      const scope = await resolveScope(req, res);
      if (!scope) return;
      const tenant = resolveTenantForAuthorization(req);
      if (!tenant || !tenant.organization || !tenant.church) {
        return sendControlled(req, res, 403, "Access denied.", shellKind);
      }
      const {
        loadWebsiteDraftPublishReview,
      } = require("../services/websiteDraftReviewService");
      const reviewOpts = await buildDraftReviewOpts(req, scope);
      const review = await loadWebsiteDraftPublishReview(getPool(), reviewOpts);
      if (!review.ok) {
        return res.redirect(303, `${scope.basePath}/draft-changes?error=load`);
      }
      if (!review.hasChanges) {
        return res.redirect(303, `${scope.basePath}/draft-changes`);
      }
      const errQ = String((req.query && req.query.error) || "");
      const html = renderContentAdminView(
        "content-admin/website-publish-review.ejs",
        await shellLocals(req, res, {
          scope,
          review,
          error:
            errQ === "publish_failed"
              ? "We could not publish these changes. Please try again. Drafts were preserved and the public website was not changed."
              : errQ === "submit_failed"
                ? "Approval submission failed. Drafts were preserved — try again."
                : errQ === "csrf"
                  ? "Invalid or missing security token. Refresh and try again."
                  : errQ === "not_ready"
                    ? "Website is not ready to publish. Review the issues below, then try Save and Publish again."
                    : errQ === "confirm"
                      ? "Confirm publication before continuing."
                      : errQ === "forbidden"
                        ? "You do not have permission for that action."
                        : null,
        })
      );
      return res.status(200).type("html").send(html);
    });

    router.post(`${p}/draft-changes/discard`, rejectApex, gateContent, async (req, res) => {
      const scope = await resolveScope(req, res);
      if (!scope) return;
      if (!validateCsrfPost(req, res)) return;
      const tenant = resolveTenantForAuthorization(req);
      const session = req.v5Session && req.v5Session.session;
      if (!tenant || !tenant.organization || !session || !session.userId) {
        return sendControlled(req, res, 403, "Access denied.", shellKind);
      }
      if (req.body && (req.body.organizationId || req.body.churchId)) {
        return res.redirect(303, `${scope.basePath}/draft-changes?error=forbidden`);
      }
      const {
        discardWebsiteDrafts,
      } = require("../services/websiteDraftPublishService");
      const result = await discardWebsiteDrafts(getPool(), {
        organizationId: tenant.organization.id,
        churchId: scope.churchId,
        branchId: scope.branchId,
        actorUserId: session.userId,
        actorRole: resolveActorRole(req),
        confirmDiscard: req.body && req.body.confirm_discard,
      });
      if (!result.ok) {
        return res.redirect(303, `${scope.basePath}/draft-changes?error=discard_failed`);
      }
      return res.redirect(303, `${scope.basePath}/draft-changes?notice=discarded`);
    });

    router.post(`${p}/draft-changes/publish`, rejectApex, gateContent, async (req, res) => {
      const scope = await resolveScope(req, res);
      if (!scope) return;
      if (!validateCsrfPost(req, res)) return;
      const tenant = resolveTenantForAuthorization(req);
      const session = req.v5Session && req.v5Session.session;
      if (!tenant || !tenant.organization || !session || !session.userId) {
        return sendControlled(req, res, 403, "Access denied.", shellKind);
      }
      if (req.body && (req.body.organizationId || req.body.churchId)) {
        return res.redirect(303, `${scope.basePath}/draft-changes/publish-review?error=forbidden`);
      }
      const {
        publishWebsiteDrafts,
      } = require("../services/websiteDraftPublishService");
      const result = await publishWebsiteDrafts(getPool(), {
        organizationId: tenant.organization.id,
        churchId: scope.churchId,
        branchId: scope.branchId,
        actorUserId: session.userId,
        actorRole: resolveActorRole(req),
        tenant,
        confirmPublish: req.body && req.body.confirm_publish,
        // Phase 7 draft republish: incremental text/media changes must not re-block
        // on first-publish service-time gaps that the review UI only treats as warnings.
        deferServiceTimes: true,
        mobilePreviewConfirmed: Boolean(
          req.body &&
            (req.body.mobile_preview_confirmed === "1" ||
              req.body.mobile_preview_confirmed === "on" ||
              req.body.acknowledge_public === "1" ||
              req.body.acknowledge_public === "on")
        ),
        env,
      });
      if (!result.ok) {
        const code =
          result.reason === "cross_org" || result.status === "forbidden"
            ? "forbidden"
            : result.reason === "confirm_publish"
              ? "confirm"
              : result.reason === "no_changes" || result.status === "not_ready"
                ? "not_ready"
                : "publish_failed";
        return res.redirect(303, `${scope.basePath}/draft-changes/publish-review?error=${code}`);
      }
      return res.redirect(303, `${scope.basePath}/draft-changes?notice=published`);
    });

    router.post(`${p}/draft-changes/submit`, rejectApex, gateContent, async (req, res) => {
      const scope = await resolveScope(req, res);
      if (!scope) return;
      if (!validateCsrfPost(req, res)) return;
      const tenant = resolveTenantForAuthorization(req);
      const session = req.v5Session && req.v5Session.session;
      if (!tenant || !tenant.organization || !session || !session.userId) {
        return sendControlled(req, res, 403, "Access denied.", shellKind);
      }
      if (!scope.branchId) {
        return res.redirect(303, `${scope.basePath}/draft-changes/publish-review?error=forbidden`);
      }
      if (req.body && (req.body.organizationId || req.body.churchId)) {
        return res.redirect(303, `${scope.basePath}/draft-changes/publish-review?error=forbidden`);
      }
      const {
        submitWebsiteDraftsForApproval,
      } = require("../services/websiteDraftPublishService");
      const result = await submitWebsiteDraftsForApproval(getPool(), {
        organizationId: tenant.organization.id,
        churchId: scope.churchId,
        branchId: scope.branchId,
        actorUserId: session.userId,
        actorRole: resolveActorRole(req),
        tenant,
        reason: req.body && req.body.reason,
        submitterNote: req.body && req.body.submitter_note,
      });
      if (!result.ok) {
        return res.redirect(303, `${scope.basePath}/draft-changes/publish-review?error=submit_failed`);
      }
      return res.redirect(303, `${scope.basePath}/draft-changes?notice=submitted`);
    });

    router.get(`${p}/draft-preview/:pageKey`, rejectApex, gateContent, async (req, res) => {
      const scope = await resolveScope(req, res);
      if (!scope) return;
      const pageKey = String(req.params.pageKey || "home").trim();
      const tenant = resolveTenantForAuthorization(req);
      if (!tenant || !tenant.church || !tenant.primaryBranch) {
        return sendControlled(req, res, 403, "You do not have access to this site.", shellKind);
      }

      const { loadTenantPublicPageModel, KIND } = require("./loadTenantPublicPageModel");
      const { renderTenantPublicPage } = require("./renderTenantPublicPage");

      let previewBranchId = scope.branchId;
      let selectedBranch = scope.branch || null;
      let allowChurchContentFallback = true;
      try {
        const mode = await resolveWebsiteMode(getPool(), {
          churchId: scope.churchId,
          branchKey: scope.branchKey,
        });
        if (mode.ok && mode.websiteMode === WEBSITE_MODE.SINGLE_SITE) {
          // Shared church-wide website preview (no independent branch site).
          previewBranchId = null;
          selectedBranch = null;
          allowChurchContentFallback = true;
        } else if (mode.ok && scope.branchId) {
          // Multi-site branch preview: branch pages/lists only (contact/service-time fallbacks elsewhere).
          allowChurchContentFallback = false;
        }
      } catch {
        /* keep scope defaults */
      }

      const model = await loadTenantPublicPageModel(getPool(), {
        tenant,
        pageKey,
        hostname: String(req.hostname || ""),
        preview: true,
        previewBranchId,
        selectedBranch,
        allowChurchContentFallback,
        previewMeta: {
          backHref: `${scope.basePath}/draft-changes`,
          editHref: null,
          bannerLabel: "Draft preview",
          bannerDetail:
            "Authorization-protected draft preview. Public visitors cannot open this page.",
        },
      });
      if (model.kind !== KIND.OK) {
        return sendControlled(
          req,
          res,
          model.kind === KIND.UNAVAILABLE ? 503 : 404,
          "Draft preview is unavailable for this page. Your drafts were preserved.",
          shellKind
        );
      }

      try {
        await applyCurrentDraftOverlaysToModel(getPool(), model, scope);
      } catch {
        /* show CMS preview without overlays if draft load fails */
      }

      model.websiteAdmin = null;
      model.cssHref = "/blessboard/v5/tenant-public.css?v=52";
      const html = renderTenantPublicPage(model);
      return res.status(200).type("html").send(html);
    });

    router.get(`${p}/preview/:pageKey`, rejectApex, gateContent, async (req, res) => {
      const scope = await resolveScope(req, res);
      if (!scope) return;
      const pageKey = req.params.pageKey;
      const tenant = resolveTenantForAuthorization(req);
      if (!tenant || !tenant.church || !tenant.primaryBranch) {
        return sendControlled(req, res, 403, "You do not have access to this site.", shellKind);
      }

      let previewBranchId = scope.branchId;
      let selectedBranch = scope.branch || null;
      let allowChurchContentFallback = true;
      let pageScope = scope;
      try {
        const mode = await resolveWebsiteMode(getPool(), {
          churchId: scope.churchId,
          branchKey: scope.branchKey,
        });
        if (mode.ok && mode.websiteMode === WEBSITE_MODE.SINGLE_SITE) {
          previewBranchId = null;
          selectedBranch = null;
          pageScope = {
            ...scope,
            branchId: null,
            branchKey: null,
            branch: null,
            scopeType: "church",
          };
          allowChurchContentFallback = true;
        } else if (mode.ok && scope.branchId) {
          allowChurchContentFallback = false;
        }
      } catch {
        /* keep scope defaults */
      }

      const bundle = await getAdminPageBundle(getPool(), {
        ...scopeInput(pageScope),
        pageKey,
      });
      if (!bundle.ok || !bundle.page) {
        return sendControlled(req, res, 404, "Page not found.", shellKind);
      }
      if (!verifyPageScope(bundle.page, pageScope)) {
        return sendControlled(req, res, 403, "You do not have access to this page.", shellKind);
      }
      if (bundle.page.status === "archived") {
        return sendControlled(req, res, 404, "Page not found.", shellKind);
      }

      const { loadTenantPublicPageModel, KIND } = require("./loadTenantPublicPageModel");
      const { renderTenantPublicPage } = require("./renderTenantPublicPage");
      const model = await loadTenantPublicPageModel(getPool(), {
        tenant,
        pageKey,
        hostname: String(req.hostname || ""),
        preview: true,
        previewBranchId,
        selectedBranch,
        allowChurchContentFallback,
        previewMeta: {
          backHref: scope.basePath,
          editHref: `${scope.basePath}/pages/${pageKey}`,
        },
      });
      if (model.kind !== KIND.OK) {
        return sendControlled(
          req,
          res,
          model.kind === KIND.UNAVAILABLE ? 503 : 404,
          "Preview is unavailable for this page.",
          shellKind
        );
      }
      await applyCurrentDraftOverlaysToModel(getPool(), model, pageScope);
      const html = renderTenantPublicPage(model);
      return res.status(200).type("html").send(html);
    });
  }

  if (variant === "hq") {
    registerRoutes("/hq/content", resolveChurchWideScope);
    registerRoutes("/hq/content/b/:branchKey", resolveHqBranchScope);
    // Stage 5 canonical website branch page editors
    registerRoutes("/hq/website/branches/:branchKey", resolveHqWebsiteBranchScope);
  } else {
    registerRoutes("/branch-admin/content", resolveBranchAdminScope);
    registerRoutes("/branch-admin/website", resolveBranchAdminWebsitePagesScope);
  }

  return router;
}

/**
 * @param {string} routeKey
 * @param {object} body
 */
function entityPatchFromBody(routeKey, body) {
  const base = {
    status: body.status,
    confirmPublish: body.confirm_publish,
    expectedUpdatedAt: body.expected_updated_at,
    enforcePublishConfirm: true,
    sortOrder: body.sort_order,
  };
  switch (routeKey) {
    case "leadership":
      return {
        ...base,
        displayName: body.display_name,
        roleTitle: body.role_title,
        biography: body.biography,
        imageUrl: body.image_url,
      };
    case "ministries":
      return {
        ...base,
        name: body.name,
        summary: body.summary,
        description: body.description,
        meetingDay: body.meeting_day,
        contactEmail: body.contact_email,
        imageUrl: body.image_url,
      };
    case "events":
      return {
        ...base,
        title: body.title,
        summary: body.summary,
        startsAt: body.starts_at,
        endsAt: body.ends_at,
        timezone: body.timezone,
        location: body.location,
        registrationUrl: body.registration_url,
        imageUrl: body.image_url,
      };
    case "sermons":
      return {
        ...base,
        title: body.title,
        speakerName: body.speaker_name,
        preachedAt: body.preached_at,
        summary: body.summary,
        mediaUrl: body.media_url,
        resourceUrl: body.resource_url,
      };
    case "contact":
      return {
        ...base,
        channelType: body.channel_type,
        label: body.label,
        value: body.value,
      };
    case "giving":
      return {
        ...base,
        methodType: body.method_type,
        label: body.label,
        description: body.description,
        accountDetails: body.account_details,
        instructions: body.instructions,
        externalUrl: body.external_url,
        buttonLabel: body.button_label,
        qrImageUrl: body.qr_image_url,
      };
    default:
      return base;
  }
}

module.exports = {
  createContentAdminRouter,
  renderContentAdminView,
};
