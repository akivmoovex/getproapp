"use strict";

/**
 * BlessBoard V8 activity registration routes (BB08–BB10).
 * Admin publish + public visitor/event/ministry registration.
 */

const express = require("express");
const crypto = require("crypto");
const {
  createRequireBlessBoardPermission,
} = require("./requireBlessBoardPermission");
const { resolveTenantForAuthorization } = require("./loadBlessBoardAuthorizationContext");
const { createRejectApex } = require("./rejectApex");
const {
  createRequireV5AuthenticatedSession,
} = require("../../platform/http/v5SessionAuthGate");
const {
  CSRF_FIELD,
  validateCsrf,
  issueCsrfToken,
  setCsrfCookie,
} = require("../../platform/http/v5Csrf");
const { renderFormView } = require("../../platform/forms/renderFormView");
const {
  publishActivityRegistrationForm,
  closeActivityRegistration,
  getPublishedActivityForm,
  submitActivityRegistration,
  reviewActivityRegistration,
  stitchForKind,
  STATUS,
} = require("../services/activityRegistrationService");

function createActivityRegistrationAdminRouter(deps) {
  const getPool = deps.getPool;
  const isApexHost = deps.isApexHost;
  const env = deps.env || process.env;
  const isProduction = String(env.NODE_ENV || "") === "production";
  const variant = deps.variant === "branch" ? "branch" : "hq";
  const basePath = variant === "hq" ? "/hq/activity-forms" : "/branch-admin/activity-forms";

  const router = express.Router();
  const requireView = createRequireBlessBoardPermission("requests.view", null, {
    getPool,
    scopeMode: variant === "hq" ? "church" : undefined,
  });
  const requireManage = createRequireBlessBoardPermission("requests.manage", null, {
    getPool,
    scopeMode: variant === "hq" ? "church" : undefined,
  });
  const requireSession = createRequireV5AuthenticatedSession({ loginNext: basePath });
  const rejectApex = createRejectApex({
    isApexHost,
    sendUnavailable: deps.sendUnavailable,
    mode: "unlessTenant",
  });

  function gateView(req, res, next) {
    if (!requireSession(req, res, { loginNext: req.originalUrl || basePath })) return;
    return requireView(req, res, next);
  }

  function gateManage(req, res, next) {
    if (!requireSession(req, res, { loginNext: req.originalUrl || basePath })) return;
    return requireManage(req, res, next);
  }

  function tenantCtx(req) {
    const tenant = resolveTenantForAuthorization(req);
    if (!tenant || !tenant.organization || !tenant.organization.id) return null;
    const session = req.v5Session && req.v5Session.session;
    return {
      organizationId: tenant.organization.id,
      churchId: tenant.church && tenant.church.id,
      branchId:
        variant === "branch"
          ? (tenant.primaryBranch && tenant.primaryBranch.id) || null
          : null,
      actorIdentityId: (session && session.platformIdentityId) || null,
      actorUserId: session && session.userId,
      tenant,
    };
  }

  router.get(basePath, rejectApex, gateView, async (req, res) => {
    const ctx = tenantCtx(req);
    if (!ctx) return res.status(403).send("Forbidden");
    const csrfToken = issueCsrfToken(env);
    setCsrfCookie(res, csrfToken, { secure: isProduction, env, req });
    return res
      .status(200)
      .type("html")
      .send(
        renderFormView("bb-activity-forms", {
          brand: { productName: "BlessBoard", productClass: "mx-forms--blessboard" },
          basePath,
          csrfField: CSRF_FIELD,
          csrfToken,
          stitchScreen: "BB08",
          pageTitle: "Activity registration forms",
        })
      );
  });

  router.post(basePath, rejectApex, gateManage, async (req, res) => {
    const ctx = tenantCtx(req);
    if (!ctx) return res.status(403).send("Forbidden");
    if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
      return res.status(403).send("CSRF");
    }
    const kind = String(req.body.kind || "").trim().toLowerCase();
    const published = await publishActivityRegistrationForm(getPool(), {
      kind,
      organizationId: ctx.organizationId,
      churchId: ctx.churchId,
      branchId: ctx.branchId,
      eventId: req.body.event_id,
      ministryId: req.body.ministry_id,
      title: req.body.title,
      formKey: req.body.form_key,
      maxSubmissions: req.body.max_submissions,
      actorIdentityId: ctx.actorIdentityId,
      authz: async (action) =>
        action === "manage" || action === "view" ? { ok: true } : { ok: false },
    });
    if (!published.ok) {
      return res.status(400).send(published.reason || "Unable to publish");
    }
    return res.redirect(303, `${basePath}?published=${published.form.id}`);
  });

  router.post(basePath + "/:formId/close", rejectApex, gateManage, async (req, res) => {
    const ctx = tenantCtx(req);
    if (!ctx) return res.status(403).send("Forbidden");
    if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
      return res.status(403).send("CSRF");
    }
    await closeActivityRegistration(getPool(), {
      organizationId: ctx.organizationId,
      formId: req.params.formId,
      actorIdentityId: ctx.actorIdentityId,
    });
    return res.redirect(303, basePath);
  });

  router.post(
    basePath + "/submissions/:submissionId/review",
    rejectApex,
    gateManage,
    async (req, res) => {
      const ctx = tenantCtx(req);
      if (!ctx) return res.status(403).send("Forbidden");
      if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
        return res.status(403).send("CSRF");
      }
      const result = await reviewActivityRegistration(getPool(), {
        organizationId: ctx.organizationId,
        formId: req.body.form_id,
        submissionId: req.params.submissionId,
        reviewStatus: req.body.review_status,
        internalNotes: req.body.internal_notes,
        actorIdentityId: ctx.actorIdentityId,
        authz: async (action) =>
          action === "manage" ? { ok: true } : { ok: false },
      });
      if (!result.ok) return res.status(400).send(result.reason || "Unable to review");
      // Explicit: never grant roles
      if (result.ministryRoleGranted) {
        return res.status(500).send("Invariant violated");
      }
      return res.redirect(303, basePath);
    }
  );

  return router;
}

function createActivityRegistrationPublicRouter(deps) {
  const getPool = deps.getPool;
  const env = deps.env || process.env;
  const isProduction = String(env.NODE_ENV || "") === "production";
  const router = express.Router();

  function resolveOrgChurch(req) {
    const ctx = req.blessBoardTenantContext;
    if (
      !ctx ||
      !ctx.resolved ||
      !ctx.church ||
      !ctx.church.id ||
      !ctx.organization ||
      !ctx.organization.id
    ) {
      return null;
    }
    return {
      churchId: ctx.church.id,
      organizationId: ctx.organization.id,
      branchId: (ctx.primaryBranch && ctx.primaryBranch.id) || null,
    };
  }

  async function renderActivity(req, res, kind, resource) {
    const scope = resolveOrgChurch(req);
    if (!scope) {
      return res.status(404).type("html").send(renderFormView("public-unavailable", {
        brand: { productName: "BlessBoard", productClass: "mx-forms--blessboard" },
        error: "This church site could not be found.",
      }));
    }
    const loaded = await getPublishedActivityForm(getPool(), {
      kind,
      organizationId: scope.organizationId,
      churchId: scope.churchId,
      eventId: resource.eventId,
      ministryId: resource.ministryId,
    });
    const csrfToken = issueCsrfToken(env);
    setCsrfCookie(res, csrfToken, { secure: isProduction, env, req });
    const view =
      kind === "event"
        ? "bb-activity-event"
        : kind === "ministry"
          ? "bb-activity-ministry"
          : "bb-activity-visitor";
    if (!loaded.ok || !loaded.form) {
      return res.status(loaded.status === STATUS.POLICY ? 409 : 404).type("html").send(
        renderFormView(view, {
          brand: { productName: "BlessBoard", productClass: "mx-forms--blessboard" },
          form: null,
          error:
            loaded.reason === "registration_closed" || loaded.reason === "event_closed"
              ? "Registration is closed."
              : "This registration form is not available.",
          stitchScreen: stitchForKind(kind),
          csrfField: CSRF_FIELD,
          csrfToken,
          spotsRemaining: null,
        })
      );
    }
    return res.status(200).type("html").send(
      renderFormView(view, {
        brand: { productName: "BlessBoard", productClass: "mx-forms--blessboard" },
        form: loaded.form,
        error: null,
        stitchScreen: loaded.stitchScreen || stitchForKind(kind),
        csrfField: CSRF_FIELD,
        csrfToken,
        spotsRemaining: loaded.spotsRemaining,
        answers: {},
        fieldErrors: {},
        idempotencyKey: crypto.randomBytes(12).toString("hex"),
        kind,
        eventId: resource.eventId || null,
        ministryId: resource.ministryId || null,
      })
    );
  }

  router.get("/visit", (req, res, next) => {
    Promise.resolve(renderActivity(req, res, "visitor", {})).catch(next);
  });
  router.get("/visitor/register", (req, res, next) => {
    Promise.resolve(renderActivity(req, res, "visitor", {})).catch(next);
  });
  router.get("/events/:eventId/register", (req, res, next) => {
    Promise.resolve(
      renderActivity(req, res, "event", { eventId: req.params.eventId })
    ).catch(next);
  });
  router.get("/ministries/:ministryId/register", (req, res, next) => {
    Promise.resolve(
      renderActivity(req, res, "ministry", { ministryId: req.params.ministryId })
    ).catch(next);
  });

  async function postActivity(req, res, kind, resource) {
    const scope = resolveOrgChurch(req);
    if (!scope) return res.status(404).send("Not found");
    if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
      return res.status(403).send("CSRF");
    }
    const loaded = await getPublishedActivityForm(getPool(), {
      kind,
      organizationId: scope.organizationId,
      churchId: scope.churchId,
      eventId: resource.eventId,
      ministryId: resource.ministryId,
    });
    if (!loaded.ok || !loaded.form) {
      return res.status(404).send("Unavailable");
    }
    const body = req.body || {};
    const answers = {};
    const fields = (loaded.form.schemaJson && loaded.form.schemaJson.fields) || [];
    for (const field of fields) {
      if (field.type === "checkbox") {
        answers[field.key] = body[field.key] === "true" || body[field.key] === "on" || body[field.key] === "1";
      } else if (body[field.key] != null && body[field.key] !== "") {
        answers[field.key] = body[field.key];
      }
    }
    const email = body.email || answers.email;
    const submitted = await submitActivityRegistration(getPool(), {
      kind,
      organizationId: scope.organizationId,
      eventId: resource.eventId,
      publicToken: loaded.form.publicToken,
      email,
      answers,
      consentAccepted: body.consent,
      idempotencyKey: body.idempotency_key,
      branchId: scope.branchId,
    });

    const view =
      kind === "event"
        ? "bb-activity-event"
        : kind === "ministry"
          ? "bb-activity-ministry"
          : "bb-activity-visitor";
    const csrfToken = issueCsrfToken(env);
    setCsrfCookie(res, csrfToken, { secure: isProduction, env, req });

    if (!submitted.ok) {
      const msg =
        submitted.reason === "consent_required"
          ? "Consent is required."
          : submitted.reason === "duplicate_submission"
            ? "You have already registered with this email."
            : submitted.reason === "capacity_full" || submitted.reason === "registration_closed"
              ? "Registration is full or closed."
              : "Please check the form and try again.";
      return res.status(submitted.status === STATUS.CONFLICT ? 409 : 400).type("html").send(
        renderFormView(view, {
          brand: { productName: "BlessBoard", productClass: "mx-forms--blessboard" },
          form: loaded.form,
          error: msg,
          stitchScreen: stitchForKind(kind),
          csrfField: CSRF_FIELD,
          csrfToken,
          spotsRemaining: loaded.spotsRemaining,
          answers,
          fieldErrors: {},
          idempotencyKey: body.idempotency_key || crypto.randomBytes(12).toString("hex"),
          kind,
          eventId: resource.eventId || null,
          ministryId: resource.ministryId || null,
        })
      );
    }

    return res.status(200).type("html").send(
      renderFormView("bb-activity-thanks", {
        brand: { productName: "BlessBoard", productClass: "mx-forms--blessboard" },
        stitchScreen: stitchForKind(kind),
        kind,
        submission: submitted.submission,
        loginCreated: false,
        ministryRoleGranted: false,
      })
    );
  }

  router.post("/visit", (req, res, next) => {
    Promise.resolve(postActivity(req, res, "visitor", {})).catch(next);
  });
  router.post("/visitor/register", (req, res, next) => {
    Promise.resolve(postActivity(req, res, "visitor", {})).catch(next);
  });
  router.post("/events/:eventId/register", (req, res, next) => {
    Promise.resolve(
      postActivity(req, res, "event", { eventId: req.params.eventId })
    ).catch(next);
  });
  router.post("/ministries/:ministryId/register", (req, res, next) => {
    Promise.resolve(
      postActivity(req, res, "ministry", { ministryId: req.params.ministryId })
    ).catch(next);
  });

  return router;
}

module.exports = {
  createActivityRegistrationAdminRouter,
  createActivityRegistrationPublicRouter,
};
