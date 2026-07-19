"use strict";

/**
 * BlessBoard V5 HQ / branch admin for resources, forms, and member requests.
 * Forms: submission review. Requests: workflow, private attachments, status updates.
 */

const fs = require("fs");
const path = require("path");
const ejs = require("ejs");
const express = require("express");

const {
  createRequireBlessBoardTenantRole,
} = require("./requireBlessBoardTenantRole");
const { resolveTenantForAuthorization } = require("./loadBlessBoardAuthorizationContext");
const { buildBranchAdminShellLocals } = require("./branchAdminShellLocals");
const { buildHqAdminShellLocals } = require("./hqAdminShellLocals");
const {
  CSRF_FIELD,
  validateCsrf,
} = require("../../platform/http/v5Csrf");
const {
  STATUS,
  REQUEST_CATEGORIES,
  REQUEST_STATUSES,
  REQUEST_TRANSITIONS,
  AUDIENCES,
  ALLOWED_FIELD_TYPES,
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
  listBlessBoardBranches,
  resolveBlessBoardBranchForChurch,
  STATUS: BRANCH_STATUS,
} = require("../services/listBlessBoardBranches");
const {
  authorizeBlessBoardTenantAccess,
  STATUS: AUTHZ_STATUS,
} = require("../services/authorizeBlessBoardTenantAccess");
const { createMediaUploadService } = require("../media/mediaUploadService");
const formsRepo = require("../repositories/formsRequestsRepository");

const VIEWS_ROOT = path.join(__dirname, "..", "..", "..", "views", "blessboard", "v5");
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LIST_LIMIT = 50;

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

/**
 * Safe private media download headers (nosniff, attachment disposition).
 * @param {import('express').Response} res
 * @param {{ asset?: object, buffer: Buffer }} delivered
 */
function sendPrivateMediaDownload(res, delivered) {
  const asset = delivered.asset || {};
  const mime = asset.mimeType || asset.contentType || "application/octet-stream";
  const rawName = String(asset.originalFilename || "download")
    .replace(/[\r\n"]/g, "")
    .slice(0, 180);
  const filename = rawName || "download";
  res.setHeader("Content-Type", mime);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  return res.status(200).send(delivered.buffer);
}

function fieldLabelsFromForm(form) {
  const labels = {};
  const fields =
    form && form.schema && Array.isArray(form.schema.fields) ? form.schema.fields : [];
  for (const field of fields) {
    if (!field || !field.key) continue;
    if (!ALLOWED_FIELD_TYPES.includes(field.type)) continue;
    labels[field.key] = field.label || field.key;
  }
  return labels;
}

function presentAdminSubmissions(submissions, form) {
  const labels = fieldLabelsFromForm(form);
  return (submissions || []).map((s) => {
    const answers = s.answers && typeof s.answers === "object" ? s.answers : {};
    const answerRows = Object.keys(answers).map((key) => ({
      key,
      label: labels[key] || key,
      value: answers[key] == null ? "" : String(answers[key]),
    }));
    return {
      id: s.id,
      status: s.status,
      submittedAt: s.submittedAt,
      answerRows,
      memberRef: s.memberId ? String(s.memberId).slice(-8) : null,
    };
  });
}

function presentAdminRequest(request, attachmentMeta) {
  if (!request) return null;
  const history = Array.isArray(request.history)
    ? request.history.map((h) => ({
        fromStatus: h.fromStatus || null,
        toStatus: h.toStatus,
        note: h.note || null,
        memberVisible: h.memberVisible !== false,
        createdAt: h.createdAt || null,
      }))
    : [];
  return {
    id: request.id,
    category: request.category,
    subject: request.subject,
    message: request.message,
    status: request.status,
    mediaAssetId: request.mediaAssetId || null,
    createdAt: request.createdAt || null,
    updatedAt: request.updatedAt || null,
    memberRef: request.memberId ? String(request.memberId).slice(-8) : null,
    attachment: attachmentMeta,
    history,
    nextStatuses: REQUEST_TRANSITIONS[request.status] || [],
  };
}

async function loadAttachmentMeta(pool, mediaAssetId, churchId) {
  if (!mediaAssetId || !UUID_RE.test(mediaAssetId)) return null;
  const client = await pool.connect();
  try {
    const media = await formsRepo.findMediaMeta(client, mediaAssetId);
    if (
      !media ||
      String(media.church_id) !== String(churchId) ||
      media.status !== "active" ||
      media.visibility !== "private"
    ) {
      return null;
    }
    return {
      filename: media.original_filename || "Private attachment",
      mimeType: media.mime_type || null,
    };
  } finally {
    client.release();
  }
}

function createFormsRequestsAdminRouter(deps) {
  const getPool = deps.getPool;
  const isApexHost = deps.isApexHost;
  const env = deps.env || process.env;
  const sendUnavailable = deps.sendUnavailable;
  const variant = deps.variant === "branch" ? "branch" : "hq";
  const isProduction = String(env.NODE_ENV || "") === "production";
  const shellKind = variant === "hq" ? "hq" : "branch";
  const mediaService = deps.mediaService || createMediaUploadService(env);

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

  async function shellLocals(req, res, activeNav, extra) {
    const pageTitle =
      (extra && extra.pageTitle) ||
      (activeNav === "requests" ? "Requests" : activeNav === "resources" ? "Resources" : "Forms");
    const sharedExtra = {
      audiences: AUDIENCES,
      requestCategories: REQUEST_CATEGORIES,
      requestStatuses: REQUEST_STATUSES,
      ...(extra || {}),
    };
    if (variant === "branch") {
      return buildBranchAdminShellLocals(req, res, {
        env,
        isProduction,
        activeNav,
        pageTitle,
        extra: {
          shellKind: "branch",
          ...sharedExtra,
        },
      });
    }
    return buildHqAdminShellLocals(req, res, {
      env,
      isProduction,
      getPool,
      activeNav,
      pageTitle,
      extra: {
        shellKind: "hq",
        ...sharedExtra,
      },
    });
  }

  function validateCsrfPost(req, res) {
    const submitted = req.body && req.body[CSRF_FIELD];
    if (!validateCsrf(req, submitted, env)) {
      sendControlled(req, res, 403, "Invalid or missing CSRF token.", shellKind);
      return false;
    }
    return true;
  }

  function mediaUploadUrlForScope(scope) {
    if (variant === "branch") return "/branch-admin/content/media/upload";
    if (scope && scope.branchKey) return `/hq/content/b/${scope.branchKey}/media/upload`;
    return "/hq/content/media/upload";
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
        branchKey: tenant.primaryBranch.key || null,
        branchDisplayName: tenant.primaryBranch.displayName || null,
        basePath: baseRoot,
        tenant,
        actorUserId: session.userId,
      };
    }
    const branchKey = req.params && req.params.branchKey ? String(req.params.branchKey) : "";
    if (branchKey) {
      const resolved = await resolveBlessBoardBranchForChurch(
        getPool(),
        tenant.church.id,
        branchKey
      );
      if (!resolved.ok || !resolved.branch) {
        const code = resolved.status === BRANCH_STATUS.LOOKUP_ERROR ? 503 : 404;
        sendControlled(
          req,
          res,
          code,
          code === 503 ? "Branch lookup is temporarily unavailable." : "Branch not found.",
          shellKind
        );
        return null;
      }
      const authz = await authorizeBlessBoardTenantAccess(getPool(), {
        userId: session.userId,
        tenant,
        branchId: resolved.branch.id,
      });
      if (authz.status === AUTHZ_STATUS.LOOKUP_ERROR) {
        sendControlled(req, res, 503, "Access check is temporarily unavailable.", shellKind);
        return null;
      }
      if (!authz.ok) {
        sendControlled(req, res, 403, "You do not have access to this branch.", shellKind);
        return null;
      }
      return {
        churchId: tenant.church.id,
        branchId: resolved.branch.id,
        branchKey: resolved.branch.key,
        branchDisplayName: resolved.branch.displayName,
        basePath: `${baseRoot}/b/${resolved.branch.key}`,
        tenant,
        actorUserId: session.userId,
      };
    }
    return {
      churchId: tenant.church.id,
      branchId: null,
      branchKey: null,
      branchDisplayName: null,
      basePath: baseRoot,
      tenant,
      actorUserId: session.userId,
    };
  }

  async function hqBranchListLocals(scope) {
    let branches = [];
    if (variant === "hq" && !scope.branchId) {
      const listResult = await listBlessBoardBranches(getPool(), scope.churchId);
      branches = listResult.ok ? listResult.branches : [];
    }
    return {
      branchDisplayName: scope.branchDisplayName || null,
      branchKey: scope.branchKey || null,
      branches,
      isHqChurchWide: variant === "hq" && !scope.branchId,
      isHqBranchScoped: variant === "hq" && Boolean(scope.branchId),
    };
  }

  function registerSection(section, mountPrefix) {
    router.get(mountPrefix, rejectApex, gate, async (req, res) => {
      const scope = await resolveScope(req, res, section);
      if (!scope) return;
      const searchQ = String((req.query && req.query.q) || "")
        .trim()
        .slice(0, 100);
      if (section === "resources") {
        const resourceStatusRaw = String((req.query && req.query.status) || "")
          .trim()
          .toLowerCase();
        const resourceStatuses = ["draft", "published", "archived"];
        const statusFilter = resourceStatuses.includes(resourceStatusRaw)
          ? resourceStatusRaw
          : "";
        const listed = await listResources(getPool(), {
          churchId: scope.churchId,
          branchId: scope.branchId,
          actorUserId: scope.actorUserId,
          tenant: scope.tenant,
          scopeBranchId: scope.branchId,
          status: statusFilter || null,
          limit: LIST_LIMIT,
        });
        if (!listed.ok) {
          return sendControlled(req, res, 503, "Resources unavailable.", shellKind);
        }
        let resources = listed.resources || [];
        if (searchQ) {
          const needle = searchQ.toLowerCase();
          resources = resources.filter((r) => {
            const title = String((r && r.title) || "").toLowerCase();
            const description = String((r && r.description) || "").toLowerCase();
            return title.includes(needle) || description.includes(needle);
          });
        }
        const branchLocals = await hqBranchListLocals(scope);
        return res
          .status(200)
          .type("html")
          .send(
            renderView(
              "forms-requests/admin-resources.ejs",
              await shellLocals(req, res, "resources", {
                basePath: scope.basePath,
                resources,
                statusFilter,
                q: searchQ,
                canCreate: Boolean(scope.branchId) || variant === "hq",
                saved: String((req.query && req.query.saved) || ""),
                mediaUploadUrl: mediaUploadUrlForScope(scope),
                ...branchLocals,
              })
            )
          );
      }
      if (section === "requests") {
        const statusRaw = String((req.query && req.query.status) || "")
          .trim()
          .toLowerCase();
        const statusFilter = REQUEST_STATUSES.includes(statusRaw) ? statusRaw : "";
        const listed = await listMemberRequests(getPool(), {
          churchId: scope.churchId,
          branchId: scope.branchId,
          actorUserId: scope.actorUserId,
          tenant: scope.tenant,
          scopeBranchId: scope.branchId,
          status: statusFilter || null,
          limit: LIST_LIMIT,
        });
        if (!listed.ok) {
          return sendControlled(
            req,
            res,
            listed.status === STATUS.FORBIDDEN ? 403 : 503,
            "Requests unavailable.",
            shellKind
          );
        }
        let requests = (listed.requests || []).map((r) => ({
          id: r.id,
          category: r.category,
          subject: r.subject,
          status: r.status,
          createdAt: r.createdAt,
          hasAttachment: Boolean(r.mediaAssetId),
          memberRef: r.memberId ? String(r.memberId).slice(-8) : null,
        }));
        if (searchQ) {
          const needle = searchQ.toLowerCase();
          requests = requests.filter((r) => {
            const subject = String((r && r.subject) || "").toLowerCase();
            const category = String((r && r.category) || "").toLowerCase();
            return subject.includes(needle) || category.includes(needle);
          });
        }
        const branchLocals = await hqBranchListLocals(scope);
        return res
          .status(200)
          .type("html")
          .send(
            renderView(
              "forms-requests/admin-requests.ejs",
              await shellLocals(req, res, "requests", {
                basePath: scope.basePath,
                requests,
                statusFilter,
                q: searchQ,
                saved: String((req.query && req.query.saved) || ""),
                ...branchLocals,
              })
            )
          );
      }
      const formStatusRaw = String((req.query && req.query.status) || "")
        .trim()
        .toLowerCase();
      const formStatuses = ["draft", "published", "archived"];
      const statusFilter = formStatuses.includes(formStatusRaw) ? formStatusRaw : "";
      const listed = await listForms(getPool(), {
        churchId: scope.churchId,
        branchId: scope.branchId,
        actorUserId: scope.actorUserId,
        tenant: scope.tenant,
        scopeBranchId: scope.branchId,
        status: statusFilter || null,
        limit: LIST_LIMIT,
      });
      if (!listed.ok) {
        return sendControlled(req, res, 503, "Forms unavailable.", shellKind);
      }
      let forms = listed.forms || [];
      if (searchQ) {
        const needle = searchQ.toLowerCase();
        forms = forms.filter((f) => {
          const title = String((f && f.title) || "").toLowerCase();
          const description = String((f && f.description) || "").toLowerCase();
          return title.includes(needle) || description.includes(needle);
        });
      }
      const branchLocals = await hqBranchListLocals(scope);
      return res
        .status(200)
        .type("html")
        .send(
          renderView(
            "forms-requests/admin-forms.ejs",
            await shellLocals(req, res, "forms", {
              basePath: scope.basePath,
              forms,
              statusFilter,
              q: searchQ,
              canCreate: Boolean(scope.branchId) || variant === "hq",
              saved: String((req.query && req.query.saved) || ""),
              ...branchLocals,
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
          return sendControlled(
            req,
            res,
            loaded.status === STATUS.FORBIDDEN ? 403 : 404,
            "Not found.",
            shellKind
          );
        }
        const submissions = await listFormSubmissions(getPool(), {
          churchId: scope.churchId,
          formId: id,
          branchId: scope.branchId,
          actorUserId: scope.actorUserId,
          tenant: scope.tenant,
          scopeBranchId: scope.branchId,
          limit: LIST_LIMIT,
        });
        const branchLocals = await hqBranchListLocals(scope);
        return res
          .status(200)
          .type("html")
          .send(
            renderView(
              "forms-requests/admin-form-detail.ejs",
              await shellLocals(req, res, "forms", {
                pageTitle: loaded.form.title || "Form",
                basePath: scope.basePath,
                form: loaded.form,
                submissions: presentAdminSubmissions(
                  submissions.ok ? submissions.submissions : [],
                  loaded.form
                ),
                fieldLabels: fieldLabelsFromForm(loaded.form),
                saved: String((req.query && req.query.saved) || ""),
                ...branchLocals,
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
          return sendControlled(
            req,
            res,
            loaded.status === STATUS.FORBIDDEN ? 403 : 404,
            "Not found.",
            shellKind
          );
        }
        const attachmentMeta = await loadAttachmentMeta(
          getPool(),
          loaded.request.mediaAssetId,
          scope.churchId
        );
        const branchLocals = await hqBranchListLocals(scope);
        return res
          .status(200)
          .type("html")
          .send(
            renderView(
              "forms-requests/admin-request-detail.ejs",
              await shellLocals(req, res, "requests", {
                pageTitle: loaded.request.subject || "Request",
                basePath: scope.basePath,
                request: presentAdminRequest(loaded.request, attachmentMeta),
                saved: String((req.query && req.query.saved) || ""),
                error: String((req.query && req.query.error) || ""),
                ...branchLocals,
              })
            )
          );
      });

      router.get(`${mountPrefix}/:id/file`, rejectApex, gate, async (req, res) => {
        const scope = await resolveScope(req, res, section);
        if (!scope) return;
        const id = String(req.params.id || "");
        if (!UUID_RE.test(id)) return res.status(404).type("text").send("Not found");
        const loaded = await getMemberRequest(getPool(), {
          id,
          churchId: scope.churchId,
          actorUserId: scope.actorUserId,
          tenant: scope.tenant,
          scopeBranchId: scope.branchId,
        });
        if (!loaded.ok || !loaded.request.mediaAssetId) {
          return res.status(404).type("text").send("Not found");
        }
        const delivered = await mediaService.loadMediaBytes(getPool(), {
          assetId: loaded.request.mediaAssetId,
          churchId: scope.churchId,
          allowPrivate: true,
          viewerChurchId: scope.churchId,
        });
        if (!delivered.ok) {
          return res.status(404).type("text").send("Not found");
        }
        if (delivered.redirectUrl) {
          res.setHeader("Cache-Control", "private, no-store");
          return res.redirect(302, delivered.redirectUrl);
        }
        if (!delivered.buffer) {
          return res.status(404).type("text").send("Not found");
        }
        return sendPrivateMediaDownload(res, delivered);
      });

      router.post(`${mountPrefix}/:id/status`, rejectApex, gate, async (req, res) => {
        if (!validateCsrfPost(req, res)) return;
        const scope = await resolveScope(req, res, section);
        if (!scope) return;
        const id = String(req.params.id || "");
        if (!UUID_RE.test(id)) return sendControlled(req, res, 404, "Not found.", shellKind);
        const body = req.body || {};
        const internalOnly =
          body.internal_only === "1" ||
          body.internal_only === "on" ||
          body.internal_only === "true";
        const updated = await updateMemberRequestStatus(getPool(), {
          id,
          churchId: scope.churchId,
          actorUserId: scope.actorUserId,
          tenant: scope.tenant,
          scopeBranchId: scope.branchId,
          status: body.status,
          note: body.note,
          memberVisible: internalOnly ? false : true,
        });
        if (!updated.ok) {
          const reason =
            updated.reason === "invalid_transition"
              ? "invalid_transition"
              : updated.reason === "status"
                ? "status"
                : "update";
          return res.redirect(303, `${scope.basePath}/${id}?error=${encodeURIComponent(reason)}`);
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
