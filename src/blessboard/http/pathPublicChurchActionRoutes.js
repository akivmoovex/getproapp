"use strict";

/**
 * Path-public church action surfaces under the existing /c/:organizationKey prefix.
 * Completes membership / visitor / announcement detail without inventing a new
 * tenancy prefix or requiring a dedicated hostname (Hostinger has no wildcard DNS).
 */

const fs = require("fs");
const path = require("path");
const ejs = require("ejs");
const crypto = require("crypto");
const express = require("express");

const { NAV_ITEMS } = require("./tenantPublicPaths");
const { loadTenantPublicPageModel, KIND } = require("./loadTenantPublicPageModel");
const {
  formatWhen,
  formatDate,
  formatEventParts,
  sermonMediaKind,
  sermonResourceKind,
  initials,
} = require("./renderTenantPublicPage");
const { renderControlledErrorPage } = require("./renderTenantLandingPage");
const { renderWebsiteSetupPage } = require("./renderWebsiteSetupPage");
const { resolveHostname } = require("../../platform/host");
const { presentRuntimeImageSrc, cdnMarketingAsset } = require("../../platform/media/cdnMediaPresentation");
const {
  CSRF_FIELD,
  issueCsrfToken,
  validateCsrf,
  setCsrfCookie,
} = require("../../platform/http/v5Csrf");
const { STATUS } = require("../services/memberRegistrationService");
const {
  submitMembershipApplication,
} = require("../services/membershipWorkflowService");
const {
  resolveBlessBoardFormPhone,
  blessBoardPhoneFieldLocals,
} = require("../services/resolveBlessBoardFormPhone");
const memberIdentityRepo = require("../repositories/memberIdentityRepository");
const {
  getPublishedActivityForm,
  submitActivityRegistration,
  STATUS: ACTIVITY_STATUS,
} = require("../services/activityRegistrationService");
const { getPublicWebsiteAnnouncement } = require("../services/announcementsService");
const { renderFormView } = require("../../platform/forms/renderFormView");

const VIEWS_ROOT = path.join(__dirname, "..", "..", "..", "views", "blessboard", "v5");
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const GENERIC_DUPLICATE_MESSAGE =
  "We could not accept this registration. If you already applied, please wait for a response.";
const GENERIC_ERROR_MESSAGE = "Please check the form and try again.";

function renderRegistrationView(relativePath, data) {
  const filename = path.join(VIEWS_ROOT, relativePath);
  return ejs.render(fs.readFileSync(filename, "utf8"), data, { filename });
}

function applicationFromBody(body) {
  const out = {};
  for (const [key, value] of Object.entries(body || {})) {
    if (key.startsWith("application_")) {
      out[key.slice("application_".length)] = value;
    }
  }
  return out;
}

function submittedFromBody(body) {
  return {
    first_name: body.first_name,
    last_name: body.last_name,
    preferred_name: body.preferred_name,
    email: body.email,
    phone: body.phone,
    phone_country: body.phone_country,
    phone_national: body.phone_national,
  };
}

/**
 * @param {{
 *   getPool: () => { query: Function },
 *   resolvePathTenant: Function,
 *   env?: NodeJS.ProcessEnv,
 *   registrationLimiter?: Function,
 * }} deps
 */
function createPathPublicChurchActionRouter(deps) {
  const getPool = deps.getPool;
  const resolvePathTenant = deps.resolvePathTenant;
  const env = deps.env || process.env;
  const isProduction = String(env.NODE_ENV || "") === "production";
  const registrationLimiter =
    typeof deps.registrationLimiter === "function"
      ? deps.registrationLimiter
      : (_req, _res, next) => next();

  const router = express.Router();

  function actionBase(organizationKey) {
    return `/c/${encodeURIComponent(organizationKey)}`;
  }

  function scopeFromTenant(tenant, organizationKey) {
    if (
      !tenant ||
      !tenant.church ||
      !tenant.church.id ||
      !tenant.primaryBranch ||
      !tenant.primaryBranch.id ||
      !tenant.organization ||
      !tenant.organization.id
    ) {
      return null;
    }
    return {
      organizationKey,
      organizationId: tenant.organization.id,
      churchId: tenant.church.id,
      branchId: tenant.primaryBranch.id,
      publicName: tenant.church.displayName || "Church",
      branchName: tenant.primaryBranch.displayName || "",
      tenant,
    };
  }

  function formLocals(req, res, scope, extra) {
    const csrfToken = issueCsrfToken(env);
    setCsrfCookie(res, csrfToken, { secure: isProduction, env, req });
    const submitted = (extra && extra.submitted) || null;
    const phoneLocals = blessBoardPhoneFieldLocals({
      env,
      selectedCountry: submitted && submitted.phone_country,
      nationalValue: submitted && submitted.phone_national,
      e164Value:
        submitted && submitted.phone_national
          ? null
          : submitted && submitted.phone
            ? submitted.phone
            : null,
    });
    const base = actionBase(scope.organizationKey);
    return {
      publicName: scope.publicName,
      branchName: scope.branchName,
      navItems: NAV_ITEMS,
      csrfToken,
      csrfField: CSRF_FIELD,
      formAction: `${base}/register`,
      pathPrefix: base,
      error: null,
      fieldErrors: {},
      errorSummaryItems: [],
      submitted: null,
      loadPhoneField: true,
      ...phoneLocals,
      ...(extra || {}),
    };
  }

  async function resolveScope(req, res) {
    const resolved = await resolvePathTenant(req, res, req.params.organizationKey);
    if (!resolved) return null;
    const scope = scopeFromTenant(resolved.tenant, resolved.organizationKey);
    if (!scope) {
      res
        .status(503)
        .type("html")
        .send(renderControlledErrorPage(503, "This BlessBoard site is temporarily unavailable."));
      return null;
    }
    req.blessBoardTenantContext = resolved.tenant;
    return scope;
  }

  router.get("/c/:organizationKey/register", (req, res, next) => {
    Promise.resolve()
      .then(async () => {
        const scope = await resolveScope(req, res);
        if (!scope) return;
        let intakeForm = null;
        try {
          intakeForm = await memberIdentityRepo.getPublishedIntakeFormForChurch(getPool(), {
            churchId: scope.churchId,
            branchId: scope.branchId,
          });
        } catch {
          intakeForm = null;
        }
        const html = renderRegistrationView(
          "public/register.ejs",
          formLocals(req, res, scope, {
            intakeForm,
            enableSpiritualBackground: !intakeForm || intakeForm.enableSpiritualBackground,
            enableParticipationInterests:
              !intakeForm || intakeForm.enableParticipationInterests,
          })
        );
        return res.status(200).type("html").send(html);
      })
      .catch(next);
  });

  router.get("/c/:organizationKey/register/submitted", (req, res, next) => {
    Promise.resolve()
      .then(async () => {
        const scope = await resolveScope(req, res);
        if (!scope) return;
        const rawRef = String((req.query && req.query.ref) || "").trim();
        const registrationReference = UUID_RE.test(rawRef) ? rawRef : null;
        const html = renderRegistrationView(
          "public/register-submitted.ejs",
          formLocals(req, res, scope, { registrationReference })
        );
        return res.status(200).type("html").send(html);
      })
      .catch(next);
  });

  router.post("/c/:organizationKey/register", registrationLimiter, (req, res, next) => {
    Promise.resolve()
      .then(async () => {
        const scope = await resolveScope(req, res);
        if (!scope) return;
        const body = req.body || {};
        const base = actionBase(scope.organizationKey);
        if (!validateCsrf(req, body[CSRF_FIELD], env)) {
          const html = renderRegistrationView(
            "public/register.ejs",
            formLocals(req, res, scope, {
              error: GENERIC_ERROR_MESSAGE,
              errorSummaryItems: [GENERIC_ERROR_MESSAGE],
              submitted: submittedFromBody(body),
            })
          );
          return res.status(403).type("html").send(html);
        }
        const phoneResolved = resolveBlessBoardFormPhone(body, {
          required: true,
          env,
          allowLegacyPhone: false,
        });
        let intakeForm = null;
        try {
          intakeForm = await memberIdentityRepo.getPublishedIntakeFormForChurch(getPool(), {
            churchId: scope.churchId,
            branchId: scope.branchId,
          });
        } catch {
          intakeForm = null;
        }
        const result = await submitMembershipApplication(getPool(), {
          churchId: scope.churchId,
          branchId: scope.branchId,
          firstName: body.first_name,
          lastName: body.last_name,
          preferredName: body.preferred_name,
          email: body.email,
          phone: phoneResolved.e164 || "",
          phoneCountry: phoneResolved.fields.phoneCountry,
          phoneNational: phoneResolved.fields.phoneNational,
          country: phoneResolved.fields.phoneCountry || "ZM",
          intakeFormId: intakeForm ? intakeForm.id : null,
          application: applicationFromBody(body),
        });
        if (result.ok) {
          return res.redirect(
            303,
            `${base}/register/submitted?ref=${encodeURIComponent(
              (result.registration && result.registration.id) || ""
            )}`
          );
        }
        const duplicate =
          result.status === STATUS.DUPLICATE_REGISTRATION ||
          result.status === STATUS.DUPLICATE_MEMBER ||
          result.status === STATUS.IDENTITY_CONFLICT ||
          result.reason === "duplicate_constraint";
        const errorMessage = duplicate ? GENERIC_DUPLICATE_MESSAGE : GENERIC_ERROR_MESSAGE;
        const html = renderRegistrationView(
          "public/register.ejs",
          formLocals(req, res, scope, {
            error: errorMessage,
            errorSummaryItems: [errorMessage],
            submitted: submittedFromBody(body),
            intakeForm,
            enableSpiritualBackground: !intakeForm || intakeForm.enableSpiritualBackground,
            enableParticipationInterests:
              !intakeForm || intakeForm.enableParticipationInterests,
          })
        );
        return res.status(duplicate ? 409 : 400).type("html").send(html);
      })
      .catch(next);
  });

  async function renderVisit(req, res) {
    const scope = await resolveScope(req, res);
    if (!scope) return;
    const base = actionBase(scope.organizationKey);
    const loaded = await getPublishedActivityForm(getPool(), {
      kind: "visitor",
      organizationId: scope.organizationId,
      churchId: scope.churchId,
    });
    const csrfToken = issueCsrfToken(env);
    setCsrfCookie(res, csrfToken, { secure: isProduction, env, req });
    const status =
      !loaded.ok || !loaded.form
        ? loaded.status === ACTIVITY_STATUS.POLICY
          ? 409
          : 404
        : 200;
    return res.status(status).type("html").send(
      renderFormView("bb-activity-visitor", {
        brand: { productName: "BlessBoard", productClass: "mx-forms--blessboard" },
        form: loaded.form || null,
        error:
          !loaded.ok || !loaded.form
            ? loaded.reason === "registration_closed"
              ? "Registration is closed."
              : "This registration form is not available."
            : null,
        stitchScreen: "BB08",
        csrfField: CSRF_FIELD,
        csrfToken,
        formAction: `${base}/visit`,
        spotsRemaining: loaded.spotsRemaining || null,
        answers: {},
        fieldErrors: {},
        idempotencyKey: crypto.randomBytes(12).toString("hex"),
        kind: "visitor",
      })
    );
  }

  router.get("/c/:organizationKey/visit", (req, res, next) => {
    Promise.resolve(renderVisit(req, res)).catch(next);
  });
  router.get("/c/:organizationKey/visitor/register", (req, res, next) => {
    Promise.resolve(renderVisit(req, res)).catch(next);
  });

  router.post("/c/:organizationKey/visit", (req, res, next) => {
    Promise.resolve()
      .then(async () => {
        const scope = await resolveScope(req, res);
        if (!scope) return;
        const base = actionBase(scope.organizationKey);
        if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
          return res.status(403).send("CSRF");
        }
        const loaded = await getPublishedActivityForm(getPool(), {
          kind: "visitor",
          organizationId: scope.organizationId,
          churchId: scope.churchId,
        });
        if (!loaded.ok || !loaded.form) {
          return res.status(404).send("Unavailable");
        }
        const body = req.body || {};
        const answers = {};
        const fields = (loaded.form.schemaJson && loaded.form.schemaJson.fields) || [];
        for (const field of fields) {
          if (field.type === "checkbox") {
            answers[field.key] =
              body[field.key] === "true" || body[field.key] === "on" || body[field.key] === "1";
          } else if (body[field.key] != null && body[field.key] !== "") {
            answers[field.key] = body[field.key];
          }
        }
        const submitted = await submitActivityRegistration(getPool(), {
          kind: "visitor",
          organizationId: scope.organizationId,
          publicToken: loaded.form.publicToken,
          email: body.email || answers.email,
          answers,
          consentAccepted: body.consent,
          idempotencyKey: body.idempotency_key,
          branchId: scope.branchId,
        });
        const csrfToken = issueCsrfToken(env);
        setCsrfCookie(res, csrfToken, { secure: isProduction, env, req });
        if (!submitted.ok) {
          const msg =
            submitted.reason === "consent_required"
              ? "Consent is required."
              : submitted.reason === "duplicate_submission"
                ? "You have already registered with this email."
                : "Please check the form and try again.";
          return res.status(submitted.status === ACTIVITY_STATUS.CONFLICT ? 409 : 400).type("html").send(
            renderFormView("bb-activity-visitor", {
              brand: { productName: "BlessBoard", productClass: "mx-forms--blessboard" },
              form: loaded.form,
              error: msg,
              stitchScreen: "BB08",
              csrfField: CSRF_FIELD,
              csrfToken,
              formAction: `${base}/visit`,
              spotsRemaining: loaded.spotsRemaining,
              answers,
              fieldErrors: {},
              idempotencyKey: body.idempotency_key || crypto.randomBytes(12).toString("hex"),
              kind: "visitor",
            })
          );
        }
        return res.status(200).type("html").send(
          renderFormView("bb-activity-visitor", {
            brand: { productName: "BlessBoard", productClass: "mx-forms--blessboard" },
            form: loaded.form,
            error: null,
            success: "Thanks — your visit request was received. This does not create a login.",
            stitchScreen: "BB08",
            csrfField: CSRF_FIELD,
            csrfToken,
            formAction: `${base}/visit`,
            spotsRemaining: loaded.spotsRemaining,
            answers: {},
            fieldErrors: {},
            idempotencyKey: crypto.randomBytes(12).toString("hex"),
            kind: "visitor",
          })
        );
      })
      .catch(next);
  });

  router.get("/c/:organizationKey/announcements/:id", (req, res, next) => {
    Promise.resolve()
      .then(async () => {
        const scope = await resolveScope(req, res);
        if (!scope) return;
        const id = String(req.params.id || "");
        if (!UUID_RE.test(id)) {
          return res
            .status(404)
            .type("html")
            .send(renderControlledErrorPage(404, "Announcement not found."));
        }
        const hostname = resolveHostname(req) || String(req.hostname || "");
        const pathPrefix = actionBase(scope.organizationKey);
        const model = await loadTenantPublicPageModel(getPool(), {
          tenant: scope.tenant,
          pageKey: "announcements",
          hostname,
          selectedBranch: scope.tenant.primaryBranch
            ? {
                id: scope.tenant.primaryBranch.id,
                key: scope.tenant.primaryBranch.key,
                displayName: scope.tenant.primaryBranch.displayName,
                isPrimary: true,
              }
            : null,
          routingMode: "path",
          pathPrefix,
        });
        if (model.kind !== KIND.OK) {
          if (model.kind === KIND.SETUP) {
            return res.status(200).type("html").send(renderWebsiteSetupPage(model));
          }
          return res
            .status(503)
            .type("html")
            .send(renderControlledErrorPage(503, "This BlessBoard site is temporarily unavailable."));
        }
        const loaded = await getPublicWebsiteAnnouncement(getPool(), {
          churchId: scope.churchId,
          branchId: scope.branchId,
          id,
        });
        if (!loaded.ok || !loaded.item) {
          return res
            .status(404)
            .type("html")
            .send(renderControlledErrorPage(404, "Announcement not found."));
        }
        const filename = path.join(VIEWS_ROOT, "public/announcement-detail.ejs");
        const hrefFor = (pagePath) => {
          const raw = String(pagePath || "/");
          if (raw === "/") return pathPrefix;
          return `${pathPrefix}${raw.startsWith("/") ? raw : `/${raw}`}`;
        };
        const html = ejs.render(fs.readFileSync(filename, "utf8"), {
          ...model,
          pageKey: "announcements",
          pageTitle: (loaded.item && loaded.item.title) || "Announcement",
          item: loaded.item,
          pathPrefix,
          homeHref: pathPrefix || "/",
          hrefFor,
          formatWhen,
          formatDate,
          formatEventParts,
          sermonMediaKind,
          sermonResourceKind,
          initials,
          presentImageSrc: (src) => presentRuntimeImageSrc(src, env) || "",
          cdnAsset: (publicPath) => cdnMarketingAsset(publicPath, env) || "",
        }, { filename });
        return res.status(200).type("html").send(html);
      })
      .catch(next);
  });

  return router;
}

module.exports = {
  createPathPublicChurchActionRouter,
};
