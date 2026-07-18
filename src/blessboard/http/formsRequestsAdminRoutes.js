"use strict";

/**
 * BlessBoard V5 HQ / branch admin for resources, forms, and member requests.
 */

const fs = require("fs");
const path = require("path");
const ejs = require("ejs");
const express = require("express");

const {
  createRequireBlessBoardTenantRole,
} = require("./requireBlessBoardTenantRole");
const { resolveTenantForAuthorization } = require("./loadBlessBoardAuthorizationContext");
const { formatRoleLabel } = require("./renderTenantLandingPage");
const {
  CSRF_FIELD,
  issueCsrfToken,
  validateCsrf,
  setCsrfCookie,
} = require("../../platform/http/v5Csrf");
const {
  STATUS,
  REQUEST_CATEGORIES,
  REQUEST_STATUSES,
  AUDIENCES,
  createResource,
  publishResource,
  listResources,
  createForm,
  publishForm,
  listForms,
  getForm,
  listFormSubmissions,
  listMemberRequests,
  getMemberRequest,
  updateMemberRequestStatus,
} = require("../services/formsRequestsService");
const {
  resolveBlessBoardBranchForChurch,
} = require("../services/listBlessBoardBranches");

const VIEWS_ROOT = path.join(__dirname, "..", "..", "..", "views", "blessboard", "v5");
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function renderView(relativePath, data) {
  const filename = path.join(VIEWS_ROOT, relativePath);
  const source = fs.readFileSync(filename, "utf8");
  return ejs.render(source, data, { filename });
}

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sendControlled(req, res, status, message, shellKind) {
  const safe = escapeHtml(message);
  const wantsHtml = String(req.get("accept") || "").includes("text/html");
  if (!wantsHtml) {
    return res.status(status).type("text").send(String(message == null ? "" : message));
  }
  const css = shellKind === "hq" ? "hq-admin.css" : "branch-admin.css";
  const bodyClass = shellKind === "hq" ? "bb-hq-body" : "bb-ba-body";
  return res.status(status).type("html").send(`<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><title>Forms</title>
<link rel="stylesheet" href="/blessboard/v5/${css}"/></head>
<body class="${bodyClass}"><main><h1>Unavailable</h1><p>${safe}</p>
<p><a href="/">Church homepage</a></p></main></body></html>`);
}

function createFormsRequestsAdminRouter(deps) {
  const getPool = deps.getPool;
  const isApexHost = deps.isApexHost;
  const env = deps.env || process.env;
  const sendUnavailable = deps.sendUnavailable;
  const variant = deps.variant === "branch" ? "branch" : "hq";
  const isProduction = String(env.NODE_ENV || "") === "production";
  const shellKind = variant === "hq" ? "hq" : "branch";

  const allowedRoles =
    variant === "hq"
      ? ["church_hq_admin", "platform_admin"]
      : ["platform_admin", "church_hq_admin", "branch_admin"];

  const router = express.Router();
  const requireAccess = createRequireBlessBoardTenantRole({ getPool, allowedRoles });

  function rejectApex(req, res, next) {
    if (isApexHost(req)) {
      if (typeof sendUnavailable === "function") return sendUnavailable(req, res);
      return res.status(503).type("text").send("Unavailable");
    }
    return next();
  }

  function gate(req, res, next) {
    const sessionOk = Boolean(req.v5Session && req.v5Session.authenticated);
    if (!sessionOk) {
      const wantsHtml = String(req.get("accept") || "").includes("text/html");
      const loginNext = variant === "hq" ? "/hq/forms" : "/branch-admin/forms";
      if (wantsHtml) {
        return res.redirect(303, `/login?next=${encodeURIComponent(req.originalUrl || loginNext)}`);
      }
      return sendControlled(req, res, 401, "Sign-in is required.", shellKind);
    }
    return requireAccess(req, res, next);
  }

  function primaryRoleLabel(req) {
    const roles =
      req.blessBoardAuthorizationContext && req.blessBoardAuthorizationContext.effectiveRoles
        ? req.blessBoardAuthorizationContext.effectiveRoles
        : [];
    const order =
      variant === "hq"
        ? ["church_hq_admin", "platform_admin", "branch_admin"]
        : ["branch_admin", "church_hq_admin", "platform_admin"];
    for (const key of order) {
      const hit = roles.find((r) => r.roleKey === key);
      if (hit) return formatRoleLabel(hit.roleKey);
    }
    return roles[0] ? formatRoleLabel(roles[0].roleKey) : variant === "hq" ? "HQ admin" : "Branch admin";
  }

  function shellLocals(req, res, activeNav, extra) {
    const tenant = resolveTenantForAuthorization(req);
    const csrfToken = issueCsrfToken(env);
    setCsrfCookie(res, csrfToken, { secure: isProduction });
    const base = {
      pageTitle: activeNav === "requests" ? "Requests" : activeNav === "resources" ? "Resources" : "Forms",
      activeNav,
      shellKind,
      csrfToken,
      churchDisplayName: tenant && tenant.church ? tenant.church.displayName : "",
      roleLabel: primaryRoleLabel(req),
      displayName:
        req.v5Session && req.v5Session.session && req.v5Session.session.user
          ? req.v5Session.session.user.displayName
          : "",
      audiences: AUDIENCES,
      requestCategories: REQUEST_CATEGORIES,
      requestStatuses: REQUEST_STATUSES,
      ...(extra || {}),
    };
    if (variant === "hq") {
      base.hqBranchDisplayName = tenant && tenant.hqBranch ? tenant.hqBranch.displayName : "";
    } else {
      base.branchDisplayName =
        tenant && tenant.primaryBranch ? tenant.primaryBranch.displayName : "";
    }
    return base;
  }

  function validateCsrfPost(req, res) {
    const submitted = req.body && req.body[CSRF_FIELD];
    if (!validateCsrf(req, submitted, env)) {
      sendControlled(req, res, 403, "Invalid or missing CSRF token.", shellKind);
      return false;
    }
    return true;
  }

  async function resolveScope(req, res, section) {
    const tenant = resolveTenantForAuthorization(req);
    if (!tenant || !tenant.church || !tenant.church.id) {
      sendControlled(req, res, 403, "You do not have access to this site.", shellKind);
      return null;
    }
    const session = req.v5Session && req.v5Session.session;
    if (!session || !session.userId) {
      sendControlled(req, res, 401, "Sign-in is required.", shellKind);
      return null;
    }
    const baseRoot =
      variant === "hq"
        ? section === "resources"
          ? "/hq/resources"
          : section === "requests"
            ? "/hq/requests"
            : "/hq/forms"
        : section === "resources"
          ? "/branch-admin/resources"
          : section === "requests"
            ? "/branch-admin/requests"
            : "/branch-admin/forms";

    if (variant === "branch") {
      if (!tenant.primaryBranch || !tenant.primaryBranch.id) {
        sendControlled(req, res, 403, "You do not have access to this site.", shellKind);
        return null;
      }
      return {
        churchId: tenant.church.id,
        branchId: tenant.primaryBranch.id,
        basePath: baseRoot,
        tenant,
        actorUserId: session.userId,
      };
    }
    const branchKey = req.params && req.params.branchKey ? String(req.params.branchKey) : "";
    if (branchKey) {
      const resolved = await resolveBlessBoardBranchForChurch(getPool(), {
        churchId: tenant.church.id,
        branchKey,
      });
      if (!resolved.ok || !resolved.branch) {
        sendControlled(req, res, 404, "Branch not found.", shellKind);
        return null;
      }
      return {
        churchId: tenant.church.id,
        branchId: resolved.branch.id,
        basePath: `${baseRoot}/b/${resolved.branch.key}`,
        tenant,
        actorUserId: session.userId,
      };
    }
    return {
      churchId: tenant.church.id,
      branchId: null,
      basePath: baseRoot,
      tenant,
      actorUserId: session.userId,
    };
  }

  function registerSection(section, mountPrefix) {
    router.get(mountPrefix, rejectApex, gate, async (req, res) => {
      const scope = await resolveScope(req, res, section);
      if (!scope) return;
      if (section === "resources") {
        const listed = await listResources(getPool(), {
          churchId: scope.churchId,
          branchId: scope.branchId,
          actorUserId: scope.actorUserId,
          tenant: scope.tenant,
          scopeBranchId: scope.branchId,
        });
        if (!listed.ok) {
          return sendControlled(req, res, 503, "Resources unavailable.", shellKind);
        }
        return res
          .status(200)
          .type("html")
          .send(
            renderView(
              "forms-requests/admin-resources.ejs",
              shellLocals(req, res, "resources", {
                basePath: scope.basePath,
                resources: listed.resources,
                canCreate: Boolean(scope.branchId) || variant === "hq",
                saved: String((req.query && req.query.saved) || ""),
              })
            )
          );
      }
      if (section === "requests") {
        const listed = await listMemberRequests(getPool(), {
          churchId: scope.churchId,
          branchId: scope.branchId,
          actorUserId: scope.actorUserId,
          tenant: scope.tenant,
          scopeBranchId: scope.branchId,
        });
        if (!listed.ok) {
          return sendControlled(req, res, listed.status === STATUS.FORBIDDEN ? 403 : 503, "Requests unavailable.", shellKind);
        }
        return res
          .status(200)
          .type("html")
          .send(
            renderView(
              "forms-requests/admin-requests.ejs",
              shellLocals(req, res, "requests", {
                basePath: scope.basePath,
                requests: listed.requests,
                saved: String((req.query && req.query.saved) || ""),
              })
            )
          );
      }
      const listed = await listForms(getPool(), {
        churchId: scope.churchId,
        branchId: scope.branchId,
        actorUserId: scope.actorUserId,
        tenant: scope.tenant,
        scopeBranchId: scope.branchId,
      });
      if (!listed.ok) {
        return sendControlled(req, res, 503, "Forms unavailable.", shellKind);
      }
      return res
        .status(200)
        .type("html")
        .send(
          renderView(
            "forms-requests/admin-forms.ejs",
            shellLocals(req, res, "forms", {
              basePath: scope.basePath,
              forms: listed.forms,
              canCreate: Boolean(scope.branchId) || variant === "hq",
              saved: String((req.query && req.query.saved) || ""),
            })
          )
        );
    });

    if (section === "resources") {
      router.post(mountPrefix, rejectApex, gate, async (req, res) => {
        if (!validateCsrfPost(req, res)) return;
        const scope = await resolveScope(req, res, section);
        if (!scope) return;
        const body = req.body || {};
        const created = await createResource(getPool(), {
          churchId: scope.churchId,
          branchId: scope.branchId,
          scopeBranchId: scope.branchId,
          actorUserId: scope.actorUserId,
          tenant: scope.tenant,
          title: body.title,
          description: body.description,
          audience: body.audience || "members",
          mediaAssetId: body.media_asset_id || null,
        });
        if (!created.ok) {
          return sendControlled(req, res, 400, "Could not create resource.", shellKind);
        }
        return res.redirect(303, `${scope.basePath}?saved=1`);
      });

      router.post(`${mountPrefix}/:id/publish`, rejectApex, gate, async (req, res) => {
        if (!validateCsrfPost(req, res)) return;
        const scope = await resolveScope(req, res, section);
        if (!scope) return;
        const id = String(req.params.id || "");
        if (!UUID_RE.test(id)) return sendControlled(req, res, 404, "Not found.", shellKind);
        const published = await publishResource(getPool(), {
          id,
          churchId: scope.churchId,
          actorUserId: scope.actorUserId,
          tenant: scope.tenant,
          scopeBranchId: scope.branchId,
        });
        if (!published.ok) return sendControlled(req, res, 400, "Could not publish.", shellKind);
        return res.redirect(303, `${scope.basePath}?saved=published`);
      });
    }

    if (section === "forms") {
      router.post(mountPrefix, rejectApex, gate, async (req, res) => {
        if (!validateCsrfPost(req, res)) return;
        const scope = await resolveScope(req, res, section);
        if (!scope) return;
        const body = req.body || {};
        let schema = body.schema_json;
        try {
          if (typeof schema === "string") schema = JSON.parse(schema);
        } catch {
          return sendControlled(req, res, 400, "Invalid form schema.", shellKind);
        }
        const created = await createForm(getPool(), {
          churchId: scope.churchId,
          branchId: scope.branchId,
          scopeBranchId: scope.branchId,
          actorUserId: scope.actorUserId,
          tenant: scope.tenant,
          title: body.title,
          description: body.description,
          schema,
        });
        if (!created.ok) {
          return sendControlled(req, res, 400, "Could not create form.", shellKind);
        }
        return res.redirect(303, `${scope.basePath}/${created.form.id}?saved=1`);
      });

      router.get(`${mountPrefix}/:id`, rejectApex, gate, async (req, res) => {
        const scope = await resolveScope(req, res, section);
        if (!scope) return;
        const id = String(req.params.id || "");
        if (!UUID_RE.test(id)) return sendControlled(req, res, 404, "Not found.", shellKind);
        const loaded = await getForm(getPool(), {
          id,
          churchId: scope.churchId,
          actorUserId: scope.actorUserId,
          tenant: scope.tenant,
          scopeBranchId: scope.branchId,
        });
        if (!loaded.ok) {
          return sendControlled(req, res, loaded.status === STATUS.FORBIDDEN ? 403 : 404, "Not found.", shellKind);
        }
        const submissions = await listFormSubmissions(getPool(), {
          churchId: scope.churchId,
          formId: id,
          branchId: scope.branchId,
          actorUserId: scope.actorUserId,
          tenant: scope.tenant,
          scopeBranchId: scope.branchId,
        });
        return res
          .status(200)
          .type("html")
          .send(
            renderView(
              "forms-requests/admin-form-detail.ejs",
              shellLocals(req, res, "forms", {
                basePath: scope.basePath,
                form: loaded.form,
                submissions: submissions.ok ? submissions.submissions : [],
                saved: String((req.query && req.query.saved) || ""),
              })
            )
          );
      });

      router.post(`${mountPrefix}/:id/publish`, rejectApex, gate, async (req, res) => {
        if (!validateCsrfPost(req, res)) return;
        const scope = await resolveScope(req, res, section);
        if (!scope) return;
        const id = String(req.params.id || "");
        if (!UUID_RE.test(id)) return sendControlled(req, res, 404, "Not found.", shellKind);
        const published = await publishForm(getPool(), {
          id,
          churchId: scope.churchId,
          actorUserId: scope.actorUserId,
          tenant: scope.tenant,
          scopeBranchId: scope.branchId,
        });
        if (!published.ok) return sendControlled(req, res, 400, "Could not publish.", shellKind);
        return res.redirect(303, `${scope.basePath}/${id}?saved=published`);
      });
    }

    if (section === "requests") {
      router.get(`${mountPrefix}/:id`, rejectApex, gate, async (req, res) => {
        const scope = await resolveScope(req, res, section);
        if (!scope) return;
        const id = String(req.params.id || "");
        if (!UUID_RE.test(id)) return sendControlled(req, res, 404, "Not found.", shellKind);
        const loaded = await getMemberRequest(getPool(), {
          id,
          churchId: scope.churchId,
          actorUserId: scope.actorUserId,
          tenant: scope.tenant,
          scopeBranchId: scope.branchId,
        });
        if (!loaded.ok) {
          return sendControlled(req, res, loaded.status === STATUS.FORBIDDEN ? 403 : 404, "Not found.", shellKind);
        }
        return res
          .status(200)
          .type("html")
          .send(
            renderView(
              "forms-requests/admin-request-detail.ejs",
              shellLocals(req, res, "requests", {
                basePath: scope.basePath,
                request: loaded.request,
                saved: String((req.query && req.query.saved) || ""),
              })
            )
          );
      });

      router.post(`${mountPrefix}/:id/status`, rejectApex, gate, async (req, res) => {
        if (!validateCsrfPost(req, res)) return;
        const scope = await resolveScope(req, res, section);
        if (!scope) return;
        const id = String(req.params.id || "");
        if (!UUID_RE.test(id)) return sendControlled(req, res, 404, "Not found.", shellKind);
        const body = req.body || {};
        const updated = await updateMemberRequestStatus(getPool(), {
          id,
          churchId: scope.churchId,
          actorUserId: scope.actorUserId,
          tenant: scope.tenant,
          scopeBranchId: scope.branchId,
          status: body.status,
          note: body.note,
        });
        if (!updated.ok) {
          return sendControlled(req, res, 400, "Could not update status.", shellKind);
        }
        return res.redirect(303, `${scope.basePath}/${id}?saved=status`);
      });
    }
  }

  if (variant === "hq") {
    registerSection("forms", "/hq/forms");
    registerSection("forms", "/hq/forms/b/:branchKey");
    registerSection("resources", "/hq/resources");
    registerSection("resources", "/hq/resources/b/:branchKey");
    registerSection("requests", "/hq/requests");
    registerSection("requests", "/hq/requests/b/:branchKey");
  } else {
    registerSection("forms", "/branch-admin/forms");
    registerSection("resources", "/branch-admin/resources");
    registerSection("requests", "/branch-admin/requests");
  }

  return router;
}

module.exports = {
  createFormsRequestsAdminRouter,
};
