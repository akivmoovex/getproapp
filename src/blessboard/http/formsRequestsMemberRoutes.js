"use strict";

/**
 * BlessBoard V5 member resources, forms, and requests.
 */

const fs = require("fs");
const path = require("path");
const ejs = require("ejs");
const express = require("express");

const { createRequireActiveMember } = require("./requireActiveMember");
const { resolveTenantForAuthorization } = require("./loadBlessBoardAuthorizationContext");
const { CSRF_FIELD, validateCsrf } = require("../../platform/http/v5Csrf");
const { buildMemberShellLocals } = require("./memberShellLocals");
const {
  STATUS,
  REQUEST_CATEGORIES,
  ALLOWED_FIELD_TYPES,
  listResources,
  getResource,
  listForms,
  getForm,
  submitForm,
  listFormSubmissions,
  getFormSubmission,
  createMemberRequest,
  listMemberRequests,
  getMemberRequest,
} = require("../services/formsRequestsService");
const { createMediaUploadService } = require("../media/mediaUploadService");

const VIEWS_ROOT = path.join(__dirname, "..", "..", "..", "views", "blessboard", "v5");
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function renderMemberView(relativePath, data) {
  const filename = path.join(VIEWS_ROOT, relativePath);
  const source = fs.readFileSync(filename, "utf8");
  return ejs.render(source, data, { filename });
}

/**
 * Safe member media download headers (private, nosniff, attachment disposition).
 * @param {import('express').Response} res
 * @param {{ asset?: object, buffer: Buffer }} delivered
 */
function sendMemberMediaDownload(res, delivered) {
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

/**
 * @param {object|null|undefined} form
 * @returns {Record<string, string>}
 */
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

/**
 * Member-safe request history — status + member-visible note only.
 * Omits changedByUserId, memberVisible flags, and other internal fields.
 * @param {object|null|undefined} request
 * @returns {object|null}
 */
function presentMemberRequest(request) {
  if (!request) return null;
  const history = Array.isArray(request.history)
    ? request.history.map((h) => ({
        fromStatus: h.fromStatus || null,
        toStatus: h.toStatus,
        note: h.note || null,
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
    history,
  };
}

function createFormsRequestsMemberRouter(deps) {
  const getPool = deps.getPool;
  const isApexHost = deps.isApexHost;
  const env = deps.env || process.env;
  const sendUnavailable = deps.sendUnavailable;
  const isProduction = String(env.NODE_ENV || "") === "production";
  const mediaService = deps.mediaService || createMediaUploadService(env);

  const router = express.Router();
  const requireMember = createRequireActiveMember({ getPool });

  function rejectApex(req, res, next) {
    if (isApexHost(req)) {
      if (typeof sendUnavailable === "function") return sendUnavailable(req, res);
      return res.status(503).type("text").send("Unavailable");
    }
    return next();
  }

  function shellLocals(req, res, activeNav, extra) {
    return buildMemberShellLocals(req, res, {
      env,
      isProduction,
      activeNav,
      extra: {
        requestCategories: REQUEST_CATEGORIES,
        ...(extra || {}),
      },
    });
  }

  function memberScope(req) {
    const tenant = resolveTenantForAuthorization(req);
    const access = req.blessBoardMemberAccess;
    if (!tenant || !tenant.church || !tenant.primaryBranch || !access || !access.member) {
      return null;
    }
    return {
      churchId: tenant.church.id,
      branchId: tenant.primaryBranch.id,
      memberId: access.member.id,
      actorUserId: req.v5Session && req.v5Session.session ? req.v5Session.session.userId : null,
    };
  }

  function validateCsrfPost(req, res) {
    const submitted = req.body && req.body[CSRF_FIELD];
    if (!validateCsrf(req, submitted, env)) {
      res.status(403).type("text").send("Invalid or missing CSRF token.");
      return false;
    }
    return true;
  }

  // --- resources ---
  router.get("/member/resources", rejectApex, requireMember, async (req, res) => {
    const scope = memberScope(req);
    if (!scope) return res.status(403).type("text").send("Forbidden");
    const listed = await listResources(getPool(), {
      churchId: scope.churchId,
      branchId: scope.branchId,
      forMember: true,
    });
    if (!listed.ok) return res.status(503).type("text").send("Unavailable");
    return res
      .status(200)
      .type("html")
      .send(
        renderMemberView(
          "forms-requests/member-resources.ejs",
          shellLocals(req, res, "resources", { resources: listed.resources })
        )
      );
  });

  router.get("/member/resources/:id", rejectApex, requireMember, async (req, res) => {
    const scope = memberScope(req);
    if (!scope) return res.status(403).type("text").send("Forbidden");
    const id = String(req.params.id || "");
    if (!UUID_RE.test(id)) return res.status(404).type("text").send("Not found");
    const loaded = await getResource(getPool(), {
      id,
      churchId: scope.churchId,
      branchId: scope.branchId,
      forMember: true,
    });
    if (!loaded.ok) {
      return res.status(loaded.status === STATUS.FORBIDDEN ? 403 : 404).type("text").send("Not found");
    }
    return res
      .status(200)
      .type("html")
      .send(
        renderMemberView(
          "forms-requests/member-resource-detail.ejs",
          shellLocals(req, res, "resources", { resource: loaded.resource })
        )
      );
  });

  router.get("/member/resources/:id/file", rejectApex, requireMember, async (req, res) => {
    const scope = memberScope(req);
    if (!scope) return res.status(403).type("text").send("Forbidden");
    const id = String(req.params.id || "");
    if (!UUID_RE.test(id)) return res.status(404).type("text").send("Not found");
    const loaded = await getResource(getPool(), {
      id,
      churchId: scope.churchId,
      branchId: scope.branchId,
      forMember: true,
    });
    if (!loaded.ok || !loaded.resource.mediaAssetId) {
      return res.status(404).type("text").send("Not found");
    }
    const delivered = await mediaService.loadMediaBytes(getPool(), {
      assetId: loaded.resource.mediaAssetId,
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
    return sendMemberMediaDownload(res, delivered);
  });

  // --- forms ---
  router.get("/member/forms", rejectApex, requireMember, async (req, res) => {
    const scope = memberScope(req);
    if (!scope) return res.status(403).type("text").send("Forbidden");
    const listed = await listForms(getPool(), {
      churchId: scope.churchId,
      branchId: scope.branchId,
      forMember: true,
    });
    const mine = await listFormSubmissions(getPool(), {
      churchId: scope.churchId,
      memberId: scope.memberId,
      forMember: true,
    });
    return res
      .status(200)
      .type("html")
      .send(
        renderMemberView(
          "forms-requests/member-forms.ejs",
          shellLocals(req, res, "forms", {
            forms: listed.ok ? listed.forms : [],
            submissions: mine.ok ? mine.submissions : [],
            saved: String((req.query && req.query.saved) || ""),
          })
        )
      );
  });

  router.get("/member/forms/submissions/:id", rejectApex, requireMember, async (req, res) => {
    const scope = memberScope(req);
    if (!scope) return res.status(403).type("text").send("Forbidden");
    const id = String(req.params.id || "");
    if (!UUID_RE.test(id)) return res.status(404).type("text").send("Not found");
    const loaded = await getFormSubmission(getPool(), {
      id,
      churchId: scope.churchId,
      memberId: scope.memberId,
      forMember: true,
    });
    if (!loaded.ok) {
      return res.status(loaded.status === STATUS.FORBIDDEN ? 403 : 404).type("text").send("Not found");
    }
    let form = null;
    if (loaded.submission && loaded.submission.formId) {
      const formLoaded = await getForm(getPool(), {
        id: loaded.submission.formId,
        churchId: scope.churchId,
        branchId: scope.branchId,
        forMember: true,
      });
      if (formLoaded.ok) form = formLoaded.form;
    }
    return res
      .status(200)
      .type("html")
      .send(
        renderMemberView(
          "forms-requests/member-submission.ejs",
          shellLocals(req, res, "forms", {
            submission: loaded.submission,
            form,
            fieldLabels: fieldLabelsFromForm(form),
            saved: String((req.query && req.query.saved) || ""),
          })
        )
      );
  });

  router.get("/member/forms/:id", rejectApex, requireMember, async (req, res) => {
    const scope = memberScope(req);
    if (!scope) return res.status(403).type("text").send("Forbidden");
    const id = String(req.params.id || "");
    if (!UUID_RE.test(id)) return res.status(404).type("text").send("Not found");
    const loaded = await getForm(getPool(), {
      id,
      churchId: scope.churchId,
      branchId: scope.branchId,
      forMember: true,
    });
    if (!loaded.ok) return res.status(404).type("text").send("Not found");
    return res
      .status(200)
      .type("html")
      .send(
        renderMemberView(
          "forms-requests/member-form-detail.ejs",
          shellLocals(req, res, "forms", {
            form: loaded.form,
            error: null,
            submittedAnswers: {},
            allowedFieldTypes: ALLOWED_FIELD_TYPES,
          })
        )
      );
  });

  router.post("/member/forms/:id/submit", rejectApex, requireMember, async (req, res) => {
    if (!validateCsrfPost(req, res)) return;
    const scope = memberScope(req);
    if (!scope) return res.status(403).type("text").send("Forbidden");
    const id = String(req.params.id || "");
    if (!UUID_RE.test(id)) return res.status(404).type("text").send("Not found");
    const body = req.body || {};
    const answers = {};
    for (const [key, value] of Object.entries(body)) {
      if (key === CSRF_FIELD || key.startsWith("_")) continue;
      answers[key] = value;
    }
    const submitted = await submitForm(getPool(), {
      churchId: scope.churchId,
      formId: id,
      memberId: scope.memberId,
      branchId: scope.branchId,
      answers,
    });
    if (!submitted.ok) {
      const loaded = await getForm(getPool(), {
        id,
        churchId: scope.churchId,
        branchId: scope.branchId,
        forMember: true,
      });
      return res
        .status(400)
        .type("html")
        .send(
          renderMemberView(
            "forms-requests/member-form-detail.ejs",
            shellLocals(req, res, "forms", {
              form: loaded.ok ? loaded.form : { id, title: "Form", schema: { fields: [] } },
              error: "Please check your answers and try again.",
              submittedAnswers: answers,
              allowedFieldTypes: ALLOWED_FIELD_TYPES,
            })
          )
        );
    }
    return res.redirect(303, `/member/forms/submissions/${submitted.submission.id}?saved=1`);
  });

  // --- requests ---
  router.get("/member/requests", rejectApex, requireMember, async (req, res) => {
    const scope = memberScope(req);
    if (!scope) return res.status(403).type("text").send("Forbidden");
    const listed = await listMemberRequests(getPool(), {
      churchId: scope.churchId,
      memberId: scope.memberId,
      forMember: true,
    });
    return res
      .status(200)
      .type("html")
      .send(
        renderMemberView(
          "forms-requests/member-requests.ejs",
          shellLocals(req, res, "requests", {
            pageTitle: "Request status",
            requests: listed.ok ? listed.requests : [],
            saved: String((req.query && req.query.saved) || ""),
          })
        )
      );
  });

  router.get("/member/requests/new", rejectApex, requireMember, async (req, res) => {
    const scope = memberScope(req);
    if (!scope) return res.status(403).type("text").send("Forbidden");
    return res
      .status(200)
      .type("html")
      .send(
        renderMemberView(
          "forms-requests/member-request-new.ejs",
          shellLocals(req, res, "requests", {
            pageTitle: "Submit a request",
            error: null,
            submittedValues: {},
          })
        )
      );
  });

  router.post("/member/requests", rejectApex, requireMember, async (req, res) => {
    if (!validateCsrfPost(req, res)) return;
    const scope = memberScope(req);
    if (!scope) return res.status(403).type("text").send("Forbidden");
    const body = req.body || {};
    const created = await createMemberRequest(getPool(), {
      churchId: scope.churchId,
      branchId: scope.branchId,
      memberId: scope.memberId,
      actorUserId: scope.actorUserId,
      category: body.category,
      subject: body.subject,
      message: body.message,
      mediaAssetId: body.media_asset_id || null,
    });
    if (!created.ok) {
      return res
        .status(400)
        .type("html")
        .send(
          renderMemberView(
            "forms-requests/member-request-new.ejs",
            shellLocals(req, res, "requests", {
              pageTitle: "Submit a request",
              error: "Please check the form and try again.",
              submittedValues: {
                category: String(body.category || ""),
                subject: String(body.subject || ""),
                message: String(body.message || ""),
              },
            })
          )
        );
    }
    return res.redirect(303, `/member/requests/${created.request.id}?saved=1`);
  });

  router.get("/member/requests/:id", rejectApex, requireMember, async (req, res) => {
    const scope = memberScope(req);
    if (!scope) return res.status(403).type("text").send("Forbidden");
    const id = String(req.params.id || "");
    if (!UUID_RE.test(id)) return res.status(404).type("text").send("Not found");
    const loaded = await getMemberRequest(getPool(), {
      id,
      churchId: scope.churchId,
      memberId: scope.memberId,
      forMember: true,
    });
    if (!loaded.ok) {
      return res.status(loaded.status === STATUS.FORBIDDEN ? 403 : 404).type("text").send("Not found");
    }
    return res
      .status(200)
      .type("html")
      .send(
        renderMemberView(
          "forms-requests/member-request-detail.ejs",
          shellLocals(req, res, "requests", {
            pageTitle: loaded.request.subject || "Request",
            request: presentMemberRequest(loaded.request),
            saved: String((req.query && req.query.saved) || ""),
          })
        )
      );
  });

  router.get("/member/requests/:id/file", rejectApex, requireMember, async (req, res) => {
    const scope = memberScope(req);
    if (!scope) return res.status(403).type("text").send("Forbidden");
    const id = String(req.params.id || "");
    if (!UUID_RE.test(id)) return res.status(404).type("text").send("Not found");
    const loaded = await getMemberRequest(getPool(), {
      id,
      churchId: scope.churchId,
      memberId: scope.memberId,
      forMember: true,
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
    return sendMemberMediaDownload(res, delivered);
  });

  return router;
}

module.exports = {
  createFormsRequestsMemberRouter,
};
