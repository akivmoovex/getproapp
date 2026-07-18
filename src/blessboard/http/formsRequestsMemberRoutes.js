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
const {
  CSRF_FIELD,
  issueCsrfToken,
  validateCsrf,
  setCsrfCookie,
} = require("../../platform/http/v5Csrf");
const {
  STATUS,
  REQUEST_CATEGORIES,
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

function createFormsRequestsMemberRouter(deps) {
  const getPool = deps.getPool;
  const isApexHost = deps.isApexHost;
  const env = deps.env || process.env;
  const sendUnavailable = deps.sendUnavailable;
  const isProduction = String(env.NODE_ENV || "") === "production";
  const mediaService = createMediaUploadService({ getPool, env });

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
    const tenant = resolveTenantForAuthorization(req);
    const csrfToken = issueCsrfToken(env);
    setCsrfCookie(res, csrfToken, { secure: isProduction });
    const session = req.v5Session && req.v5Session.session ? req.v5Session.session : null;
    const access = req.blessBoardMemberAccess || null;
    const preferred =
      access && access.member && access.member.preferredName
        ? access.member.preferredName
        : session && session.user
          ? session.user.displayName
          : "";
    return {
      pageTitle:
        activeNav === "resources"
          ? "Resources"
          : activeNav === "forms"
            ? "Forms"
            : activeNav === "requests"
              ? "Requests"
              : "Member",
      activeNav,
      csrfToken,
      churchDisplayName: tenant && tenant.church ? tenant.church.displayName : "",
      branchDisplayName:
        tenant && tenant.primaryBranch ? tenant.primaryBranch.displayName : "",
      displayName: preferred || "",
      requestCategories: REQUEST_CATEGORIES,
      ...(extra || {}),
    };
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
      return res.redirect(302, delivered.redirectUrl);
    }
    if (!delivered.buffer) {
      return res.status(404).type("text").send("Not found");
    }
    if (delivered.asset && delivered.asset.contentType) res.type(delivered.asset.contentType);
    return res.status(200).send(delivered.buffer);
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
    return res
      .status(200)
      .type("html")
      .send(
        renderMemberView(
          "forms-requests/member-submission.ejs",
          shellLocals(req, res, "forms", {
            submission: loaded.submission,
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
            requests: listed.ok ? listed.requests : [],
            saved: String((req.query && req.query.saved) || ""),
            error: null,
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
      const listed = await listMemberRequests(getPool(), {
        churchId: scope.churchId,
        memberId: scope.memberId,
        forMember: true,
      });
      return res
        .status(400)
        .type("html")
        .send(
          renderMemberView(
            "forms-requests/member-requests.ejs",
            shellLocals(req, res, "requests", {
              requests: listed.ok ? listed.requests : [],
              saved: "",
              error: "Please check the form and try again.",
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
            request: loaded.request,
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
      return res.redirect(302, delivered.redirectUrl);
    }
    if (!delivered.buffer) {
      return res.status(404).type("text").send("Not found");
    }
    if (delivered.asset && delivered.asset.contentType) res.type(delivered.asset.contentType);
    return res.status(200).send(delivered.buffer);
  });

  return router;
}

module.exports = {
  createFormsRequestsMemberRouter,
};
