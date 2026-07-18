"use strict";

/**
 * Public tenant member registration (authoritative host → church + primary branch).
 * Never accepts church/branch IDs from the client.
 */

const fs = require("fs");
const path = require("path");
const ejs = require("ejs");
const express = require("express");

const {
  MODE_AUTHORITATIVE,
  MODE_OFF,
  MODE_SHADOW,
} = require("../config/tenantRoutingMode");
const { OUTCOME } = require("./evaluateTenantRoute");
const { NAV_ITEMS } = require("./tenantPublicPaths");
const { renderControlledErrorPage, renderFoundationHome } = require("./renderTenantLandingPage");
const {
  CSRF_FIELD,
  issueCsrfToken,
  validateCsrf,
  setCsrfCookie,
} = require("../../platform/http/v5Csrf");
const {
  submitMemberRegistration,
  STATUS,
} = require("../services/memberRegistrationService");

const VIEWS_ROOT = path.join(__dirname, "..", "..", "..", "views", "blessboard", "v5");

const GENERIC_DUPLICATE_MESSAGE =
  "We could not accept this registration. If you already applied, please wait for a response.";
const GENERIC_ERROR_MESSAGE = "Please check the form and try again.";

/**
 * @param {string} relativePath
 * @param {object} data
 */
function renderRegistrationView(relativePath, data) {
  const filename = path.join(VIEWS_ROOT, relativePath);
  const source = fs.readFileSync(filename, "utf8");
  return ejs.render(source, data, { filename });
}

/**
 * Safe structured log — no PII.
 * @param {object} fields
 */
function logRegistrationEvent(fields) {
  try {
    // eslint-disable-next-line no-console
    console.info(
      JSON.stringify({
        scope: "blessboard.member_registration",
        ...fields,
      })
    );
  } catch {
    /* ignore */
  }
}

/**
 * @param {{
 *   getPool: () => { query: Function },
 *   isApexHost: (req: import('express').Request) => boolean,
 *   getTenantRoutingMode: () => string,
 *   env?: NodeJS.ProcessEnv,
 *   registrationLimiter?: import('express').RequestHandler,
 * }} deps
 */
function createTenantRegistrationRouter(deps) {
  const router = express.Router();
  const getPool = deps.getPool;
  const isApexHost = deps.isApexHost;
  const getTenantRoutingMode = deps.getTenantRoutingMode;
  const env = deps.env || process.env;
  const isProduction = String(env.NODE_ENV || "") === "production";
  const registrationLimiter =
    typeof deps.registrationLimiter === "function"
      ? deps.registrationLimiter
      : (_req, _res, next) => next();

  /**
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @returns {{ churchId: string, branchId: string, publicName: string, branchName: string }|null}
   */
  function resolveHostScope(req, res) {
    if (isApexHost(req)) {
      return null;
    }
    const mode = getTenantRoutingMode();
    const route = req.blessBoardTenantRoute || {};
    const ctx = req.blessBoardTenantContext;

    if (mode === MODE_OFF || mode === MODE_SHADOW) {
      res.status(200).type("html").send(
        renderFoundationHome({
          authenticated: false,
          csrfToken: null,
        })
      );
      return null;
    }
    if (mode !== MODE_AUTHORITATIVE) {
      res.status(200).type("html").send(
        renderFoundationHome({
          authenticated: false,
          csrfToken: null,
        })
      );
      return null;
    }
    if (route.outcome === OUTCOME.NOT_FOUND || route.httpStatus === 404) {
      res
        .status(404)
        .type("html")
        .send(renderControlledErrorPage(404, "This BlessBoard site could not be found."));
      return null;
    }
    if (
      route.outcome !== OUTCOME.RENDER_TENANT ||
      !ctx ||
      !ctx.resolved ||
      !ctx.church ||
      !ctx.church.id ||
      !ctx.primaryBranch ||
      !ctx.primaryBranch.id
    ) {
      res
        .status(503)
        .type("html")
        .send(
          renderControlledErrorPage(503, "This BlessBoard site is temporarily unavailable.")
        );
      return null;
    }
    return {
      churchId: ctx.church.id,
      branchId: ctx.primaryBranch.id,
      publicName: ctx.church.displayName || "Church",
      branchName: ctx.primaryBranch.displayName || "",
    };
  }

  function formLocals(req, res, scope, extra) {
    const csrfToken = issueCsrfToken(env);
    setCsrfCookie(res, csrfToken, { secure: isProduction });
    return {
      publicName: scope.publicName,
      branchName: scope.branchName,
      navItems: NAV_ITEMS,
      csrfToken,
      csrfField: CSRF_FIELD,
      error: null,
      submitted: null,
      ...(extra || {}),
    };
  }

  router.get("/register", (req, res, next) => {
    Promise.resolve()
      .then(() => {
        const scope = resolveHostScope(req, res);
        if (!scope) return;
        const html = renderRegistrationView(
          "public/register.ejs",
          formLocals(req, res, scope, { error: null, submitted: null })
        );
        return res.status(200).type("html").send(html);
      })
      .catch(next);
  });

  router.get("/register/submitted", (req, res, next) => {
    Promise.resolve()
      .then(() => {
        const scope = resolveHostScope(req, res);
        if (!scope) return;
        const html = renderRegistrationView(
          "public/register-submitted.ejs",
          formLocals(req, res, scope, {})
        );
        return res.status(200).type("html").send(html);
      })
      .catch(next);
  });

  router.post("/register", registrationLimiter, (req, res, next) => {
    Promise.resolve()
      .then(async () => {
        const scope = resolveHostScope(req, res);
        if (!scope) return;

        const body = req.body || {};
        const submittedToken = body[CSRF_FIELD];
        if (!validateCsrf(req, submittedToken, env)) {
          logRegistrationEvent({
            op: "submit",
            outcome: "csrf_fail",
            churchId: scope.churchId,
            branchId: scope.branchId,
          });
          const html = renderRegistrationView(
            "public/register.ejs",
            formLocals(req, res, scope, {
              error: GENERIC_ERROR_MESSAGE,
              submitted: {
                firstName: "",
                lastName: "",
                preferredName: "",
                email: "",
                phone: "",
              },
            })
          );
          return res.status(403).type("html").send(html);
        }

        // Ignore any client-supplied church/branch identifiers.
        const result = await submitMemberRegistration(getPool(), {
          churchId: scope.churchId,
          branchId: scope.branchId,
          firstName: body.first_name,
          lastName: body.last_name,
          preferredName: body.preferred_name,
          email: body.email,
          phone: body.phone,
        });

        if (result.ok) {
          logRegistrationEvent({
            op: "submit",
            outcome: "ok",
            churchId: scope.churchId,
            branchId: scope.branchId,
            registrationId: result.registration && result.registration.id,
            existingMember: Boolean(result.existingMemberId),
          });
          return res.redirect(303, "/register/submitted");
        }

        const duplicate =
          result.status === STATUS.DUPLICATE_REGISTRATION ||
          result.status === STATUS.DUPLICATE_MEMBER ||
          result.status === STATUS.IDENTITY_CONFLICT ||
          result.reason === "duplicate_constraint";

        logRegistrationEvent({
          op: "submit",
          outcome: duplicate ? "duplicate" : "rejected",
          churchId: scope.churchId,
          branchId: scope.branchId,
          reason: result.reason || result.status,
        });

        const html = renderRegistrationView(
          "public/register.ejs",
          formLocals(req, res, scope, {
            error: duplicate ? GENERIC_DUPLICATE_MESSAGE : GENERIC_ERROR_MESSAGE,
            submitted: {
              firstName: String(body.first_name || ""),
              lastName: String(body.last_name || ""),
              preferredName: String(body.preferred_name || ""),
              email: String(body.email || ""),
              phone: String(body.phone || ""),
            },
          })
        );
        return res.status(duplicate ? 409 : 400).type("html").send(html);
      })
      .catch(next);
  });

  return router;
}

module.exports = {
  createTenantRegistrationRouter,
  GENERIC_DUPLICATE_MESSAGE,
  GENERIC_ERROR_MESSAGE,
};
