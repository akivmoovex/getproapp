"use strict";

/**
 * Shared form builder HTTP routes (SH01–SH07).
 * Product shells inject branding, auth, and permission gates.
 */

const express = require("express");
const path = require("path");
const crypto = require("crypto");
const rateLimit = require("express-rate-limit");
const {
  validateCsrf,
  CSRF_FIELD,
  issueCsrfToken,
  setCsrfCookie,
} = require("./v5Csrf");
const tenantFormService = require("../forms/tenantFormService");
const {
  buildPublicFormPath,
  buildPublicFormUrl,
  buildPublicFormQrDataUrl,
} = require("../forms/formShareService");
const {
  ALLOWED_FIELD_TYPES,
  ALLOWED_FORM_CATEGORIES,
} = require("../forms/formSchema");
const { ACCESS_MODES, REVIEW_STATUSES, REVIEW_TRANSITIONS } = require("../forms/formAccess");

const VIEWS = path.join(__dirname, "../../../views/platform/forms");

function parseSchemaFromBody(body) {
  if (!body) return { version: 1, fields: [] };
  if (body.schema_json) {
    try {
      return typeof body.schema_json === "string"
        ? JSON.parse(body.schema_json)
        : body.schema_json;
    } catch {
      return null;
    }
  }
  const fields = [];
  const keys = Array.isArray(body.field_key)
    ? body.field_key
    : body.field_key
      ? [body.field_key]
      : [];
  const types = Array.isArray(body.field_type)
    ? body.field_type
    : body.field_type
      ? [body.field_type]
      : [];
  const labels = Array.isArray(body.field_label)
    ? body.field_label
    : body.field_label
      ? [body.field_label]
      : [];
  const requiredFlags = Array.isArray(body.field_required)
    ? body.field_required
    : body.field_required
      ? [body.field_required]
      : [];
  const optionsRaw = Array.isArray(body.field_options)
    ? body.field_options
    : body.field_options
      ? [body.field_options]
      : [];

  for (let i = 0; i < keys.length; i += 1) {
    const key = String(keys[i] || "").trim().toLowerCase();
    if (!key) continue;
    const type = String(types[i] || "text").trim().toLowerCase();
    const label = String(labels[i] || key).trim();
    const required = String(requiredFlags[i] || "") === "1" || requiredFlags[i] === true;
    const field = { key, type, label, required };
    if (type === "select") {
      field.options = String(optionsRaw[i] || "")
        .split(/\n|,/)
        .map((s) => s.trim())
        .filter(Boolean);
    }
    fields.push(field);
  }
  return { version: 1, fields };
}

function answersFromBody(body, schema) {
  const answers = {};
  for (const field of (schema && schema.fields) || []) {
    if (Object.prototype.hasOwnProperty.call(body || {}, field.key)) {
      answers[field.key] = body[field.key];
    }
  }
  return answers;
}

function clientIpHash(req) {
  const ip = String(
    (req.headers && (req.headers["x-forwarded-for"] || req.headers["x-real-ip"])) ||
      req.ip ||
      "unknown"
  )
    .split(",")[0]
    .trim();
  return crypto.createHash("sha256").update(ip).digest("hex").slice(0, 32);
}

function safePublicError(reason) {
  if (reason === "consent_required") return "Please confirm consent before submitting.";
  if (reason === "rate_limited") {
    return "Too many submissions. Please wait a few minutes and try again.";
  }
  if (
    reason === "access_required" ||
    reason === "access_token_invalid" ||
    reason === "access_email_mismatch" ||
    reason === "access_token_expired"
  ) {
    return "You need a valid email access link to submit this form.";
  }
  if (reason && String(reason).startsWith("required_")) {
    return "Please complete all required fields.";
  }
  if (reason && /^(email_|phone_|date_|number_|min_|max_|length_|select_|html_)/.test(reason)) {
    return "Please check the highlighted fields and try again.";
  }
  return "Please check your answers and try again.";
}

function fieldErrorFromReason(reason) {
  const r = String(reason || "");
  const m = r.match(
    /^(required|email|phone|date|number|min|max|length|select|html_not_allowed)_(.+)$/
  );
  if (!m) return {};
  return { [m[2]]: true };
}

/**
 * @param {{
 *   productCode: 'blessboard'|'activeclinic',
 *   adminBasePath: string,
 *   getPool: Function,
 *   env: object,
 *   isProduction?: boolean,
 *   requireAdmin: Function,
 *   canManage: (req) => boolean,
 *   canView: (req) => boolean,
 *   resolveTenant: (req) => { organizationId: string, actorIdentityId?: string|null, branchId?: string|null, facilityId?: string|null } | null,
 *   renderAdmin: (req, res, viewName, locals) => void|Promise<void>,
 *   renderPublic: (req, res, viewName, locals) => void|Promise<void>,
 *   brand: { productName: string, productClass: string },
 * }} deps
 */
function createSharedFormBuilderRouter(deps) {
  const getPool = deps.getPool;
  const env = deps.env || process.env;
  const isProduction = deps.isProduction === true;
  const productCode = deps.productCode;
  const adminBasePath = String(deps.adminBasePath || "/forms").replace(/\/$/, "");
  const brand = deps.brand || {
    productName: productCode === "blessboard" ? "BlessBoard" : "ActiveClinic",
    productClass:
      productCode === "blessboard" ? "mx-forms--blessboard" : "mx-forms--activeclinic",
  };

  const router = express.Router();

  const publicSubmitLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 40,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => `${productCode}:${clientIpHash(req)}:${req.params.publicToken || ""}`,
    handler: (req, res) => {
      const csrfToken = issueCsrfToken(env);
      setCsrfCookie(res, csrfToken, { secure: isProduction, env, req });
      return deps.renderPublic(req, res, "public-form", {
        brand,
        csrfToken,
        csrfField: CSRF_FIELD,
        form: null,
        error: safePublicError("rate_limited"),
        mobile: true,
        stitchScreen: "SH09",
      });
    },
  });

  function authzFor(req, needManage) {
    return async (action) => {
      if (action === "platform_admin") {
        return { ok: typeof deps.isPlatformAdmin === "function" && deps.isPlatformAdmin(req) === true };
      }
      if (action === "manage") {
        return { ok: deps.canManage(req) === true };
      }
      if (needManage) return { ok: deps.canManage(req) === true };
      return { ok: deps.canView(req) === true || deps.canManage(req) === true };
    };
  }

  function issueCsrf(res, req) {
    const token = issueCsrfToken(env);
    setCsrfCookie(res, token, { secure: isProduction, env, req });
    return token;
  }

  function baseUrl(req) {
    const proto = req.protocol || "https";
    const host = req.get("host") || "";
    return `${proto}://${host}`;
  }

  function scopeFromTenant(tenant) {
    return {
      branchId: (tenant && tenant.branchId) || null,
      facilityId: (tenant && tenant.facilityId) || null,
    };
  }

  // —— Public submission (no admin auth) ——
  router.get("/f/:publicToken", async (req, res) => {
    const pool = getPool();
    const csrfToken = issueCsrf(res, req);
    const result = await tenantFormService.getPublicForm(pool, {
      productCode,
      publicToken: req.params.publicToken,
    });
    if (!result.ok) {
      return deps.renderPublic(req, res, "public-unavailable", {
        brand,
        csrfToken,
        csrfField: CSRF_FIELD,
        message: "This form is not available.",
        mobile: true,
      });
    }
    const idempotencyKey = crypto.randomBytes(16).toString("hex");
    return deps.renderPublic(req, res, "public-form", {
      brand,
      csrfToken,
      csrfField: CSRF_FIELD,
      form: result.form,
      accessToken: String(req.query.t || ""),
      email: "",
      answers: {},
      fieldErrors: {},
      error: null,
      idempotencyKey,
      mobile: true,
      stitchScreen: "SH08",
    });
  });

  router.post("/f/:publicToken", publicSubmitLimiter, async (req, res) => {
    const pool = getPool();
    const csrfToken = issueCsrf(res, req);
    if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
      return deps.renderPublic(req, res, "public-form", {
        brand,
        csrfToken,
        csrfField: CSRF_FIELD,
        form: null,
        error: "Session expired. Reload and try again.",
        mobile: true,
        stitchScreen: "SH09",
      });
    }
    const published = await tenantFormService.getPublicForm(pool, {
      productCode,
      publicToken: req.params.publicToken,
    });
    if (!published.ok) {
      return deps.renderPublic(req, res, "public-unavailable", {
        brand,
        csrfToken,
        csrfField: CSRF_FIELD,
        message: "This form is not available.",
        mobile: true,
      });
    }
    const answers = answersFromBody(req.body, published.form.schemaJson);
    const idempotencyKey =
      String((req.body && req.body.idempotency_key) || req.get("idempotency-key") || "").trim() ||
      null;
    const submit = await tenantFormService.submitPublicForm(pool, {
      productCode,
      publicToken: req.params.publicToken,
      answers,
      email: req.body && req.body.email,
      accessToken: (req.body && req.body.access_token) || req.query.t,
      consentAccepted: req.body && (req.body.consent === "1" || req.body.consent === "on"),
      idempotencyKey,
      rateBucket: clientIpHash(req),
    });
    if (!submit.ok) {
      return deps.renderPublic(req, res, "public-form", {
        brand,
        csrfToken,
        csrfField: CSRF_FIELD,
        form: published.form,
        accessToken: String((req.body && req.body.access_token) || req.query.t || ""),
        email: String((req.body && req.body.email) || ""),
        answers,
        fieldErrors: fieldErrorFromReason(submit.reason),
        error: safePublicError(submit.reason),
        reason: submit.reason,
        idempotencyKey: idempotencyKey || crypto.randomBytes(16).toString("hex"),
        mobile: true,
        stitchScreen: "SH09",
      });
    }
    return deps.renderPublic(req, res, "public-thanks", {
      brand,
      form: published.form,
      submission: submit.submission,
      idempotentReplay: submit.idempotentReplay === true,
      mobile: true,
      stitchScreen: "SH10",
    });
  });

  // —— Admin ——
  router.use(adminBasePath, deps.requireAdmin);

  router.get(adminBasePath, async (req, res) => {
    const tenant = deps.resolveTenant(req);
    if (!tenant) return res.status(403).send("Forbidden");
    const pool = getPool();
    const csrfToken = issueCsrf(res, req);
    const listed = await tenantFormService.listForms(pool, {
      organizationId: tenant.organizationId,
      productCode,
      authz: authzFor(req, false),
    });
    if (!listed.ok) {
      return deps.renderAdmin(req, res, "access-denied", {
        brand,
        adminBasePath,
        csrfToken,
        csrfField: CSRF_FIELD,
        stitchScreen: "SH15",
        mobile: true,
      });
    }
    const forms = listed.forms || [];
    return deps.renderAdmin(req, res, forms.length ? "dashboard" : "dashboard-empty", {
      brand,
      adminBasePath,
      csrfToken,
      csrfField: CSRF_FIELD,
      forms,
      canManage: deps.canManage(req) === true,
      stitchScreen: forms.length ? "SH01" : "SH02",
      mobile: true,
    });
  });

  router.get(`${adminBasePath}/new`, async (req, res) => {
    if (!deps.canManage(req)) {
      return deps.renderAdmin(req, res, "access-denied", {
        brand,
        adminBasePath,
        csrfToken: issueCsrf(res, req),
        csrfField: CSRF_FIELD,
        stitchScreen: "SH15",
        mobile: true,
      });
    }
    return deps.renderAdmin(req, res, "studio", {
      brand,
      adminBasePath,
      csrfToken: issueCsrf(res, req),
      csrfField: CSRF_FIELD,
      form: null,
      allowedFieldTypes: ALLOWED_FIELD_TYPES,
      allowedCategories: ALLOWED_FORM_CATEGORIES,
      canManage: true,
      stitchScreen: "SH03",
      mobile: true,
    });
  });

  router.post(`${adminBasePath}/new`, async (req, res) => {
    const tenant = deps.resolveTenant(req);
    if (!tenant || !deps.canManage(req)) return res.status(403).send("Forbidden");
    if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) return res.status(403).send("CSRF");
    const pool = getPool();
    const schemaJson = parseSchemaFromBody(req.body);
    if (!schemaJson) {
      return deps.renderAdmin(req, res, "studio", {
        brand,
        adminBasePath,
        csrfToken: issueCsrf(res, req),
        csrfField: CSRF_FIELD,
        form: null,
        error: "Invalid schema.",
        allowedFieldTypes: ALLOWED_FIELD_TYPES,
        allowedCategories: ALLOWED_FORM_CATEGORIES,
        canManage: true,
        stitchScreen: "SH03",
        mobile: true,
      });
    }
    const created = await tenantFormService.createForm(pool, {
      organizationId: tenant.organizationId,
      productCode,
      title: req.body.title,
      description: req.body.description,
      formKey: req.body.form_key,
      category: req.body.category,
      schemaJson,
      actorIdentityId: tenant.actorIdentityId,
      authz: authzFor(req, true),
    });
    if (!created.ok) {
      return deps.renderAdmin(req, res, "studio", {
        brand,
        adminBasePath,
        csrfToken: issueCsrf(res, req),
        csrfField: CSRF_FIELD,
        form: null,
        error: created.reason || "Unable to create form.",
        allowedFieldTypes: ALLOWED_FIELD_TYPES,
        allowedCategories: ALLOWED_FORM_CATEGORIES,
        canManage: true,
        stitchScreen: "SH03",
        mobile: true,
      });
    }
    return res.redirect(303, `${adminBasePath}/${created.form.id}/studio`);
  });

  router.get(`${adminBasePath}/:formId/studio`, async (req, res) => {
    const tenant = deps.resolveTenant(req);
    if (!tenant) return res.status(403).send("Forbidden");
    const pool = getPool();
    const result = await tenantFormService.getForm(pool, {
      organizationId: tenant.organizationId,
      productCode,
      formId: req.params.formId,
      authz: authzFor(req, false),
    });
    if (!result.ok) {
      return deps.renderAdmin(req, res, "access-denied", {
        brand,
        adminBasePath,
        csrfToken: issueCsrf(res, req),
        csrfField: CSRF_FIELD,
        stitchScreen: "SH15",
        mobile: true,
      });
    }
    return deps.renderAdmin(req, res, "studio", {
      brand,
      adminBasePath,
      csrfToken: issueCsrf(res, req),
      csrfField: CSRF_FIELD,
      form: result.form,
      allowedFieldTypes: ALLOWED_FIELD_TYPES,
      allowedCategories: ALLOWED_FORM_CATEGORIES,
      canManage: deps.canManage(req) === true,
      stitchScreen: "SH03",
      mobile: true,
    });
  });

  router.post(`${adminBasePath}/:formId/studio`, async (req, res) => {
    const tenant = deps.resolveTenant(req);
    if (!tenant || !deps.canManage(req)) return res.status(403).send("Forbidden");
    if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) return res.status(403).send("CSRF");
    const pool = getPool();
    const schemaJson = parseSchemaFromBody(req.body);
    if (!schemaJson) return res.status(400).send("Invalid schema");

    await tenantFormService.updateFormMeta(pool, {
      organizationId: tenant.organizationId,
      productCode,
      formId: req.params.formId,
      title: req.body.title,
      description: req.body.description,
      category: req.body.category,
      actorIdentityId: tenant.actorIdentityId,
      authz: authzFor(req, true),
    });
    const replaced = await tenantFormService.replaceSchema(pool, {
      organizationId: tenant.organizationId,
      productCode,
      formId: req.params.formId,
      schemaJson,
      actorIdentityId: tenant.actorIdentityId,
      authz: authzFor(req, true),
    });
    if (!replaced.ok) {
      return deps.renderAdmin(req, res, "studio", {
        brand,
        adminBasePath,
        csrfToken: issueCsrf(res, req),
        csrfField: CSRF_FIELD,
        form: replaced.form || null,
        error: replaced.reason || "Unable to save.",
        allowedFieldTypes: ALLOWED_FIELD_TYPES,
        allowedCategories: ALLOWED_FORM_CATEGORIES,
        canManage: true,
        stitchScreen: "SH04",
        mobile: true,
      });
    }
    return res.redirect(303, `${adminBasePath}/${req.params.formId}/studio`);
  });

  router.post(`${adminBasePath}/:formId/reorder`, async (req, res) => {
    const tenant = deps.resolveTenant(req);
    if (!tenant || !deps.canManage(req)) return res.status(403).send("Forbidden");
    if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) return res.status(403).send("CSRF");
    const keys = Array.isArray(req.body.field_order)
      ? req.body.field_order
      : String(req.body.field_order || "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
    await tenantFormService.reorderFields(getPool(), {
      organizationId: tenant.organizationId,
      productCode,
      formId: req.params.formId,
      fieldKeys: keys,
      actorIdentityId: tenant.actorIdentityId,
      authz: authzFor(req, true),
    });
    return res.redirect(303, `${adminBasePath}/${req.params.formId}/studio`);
  });

  router.get(`${adminBasePath}/:formId/preview`, async (req, res) => {
    const tenant = deps.resolveTenant(req);
    if (!tenant) return res.status(403).send("Forbidden");
    const result = await tenantFormService.getForm(getPool(), {
      organizationId: tenant.organizationId,
      productCode,
      formId: req.params.formId,
      authz: authzFor(req, false),
    });
    if (!result.ok) return res.status(404).send("Not found");
    return deps.renderAdmin(req, res, "preview", {
      brand,
      adminBasePath,
      csrfToken: issueCsrf(res, req),
      csrfField: CSRF_FIELD,
      form: result.form,
      canManage: deps.canManage(req) === true,
      stitchScreen: "SH05",
      mobile: true,
    });
  });

  router.get(`${adminBasePath}/:formId/publication`, async (req, res) => {
    const tenant = deps.resolveTenant(req);
    if (!tenant) return res.status(403).send("Forbidden");
    const result = await tenantFormService.getForm(getPool(), {
      organizationId: tenant.organizationId,
      productCode,
      formId: req.params.formId,
      authz: authzFor(req, false),
    });
    if (!result.ok) return res.status(404).send("Not found");
    const versions = await tenantFormService.listVersions(getPool(), {
      organizationId: tenant.organizationId,
      productCode,
      formId: req.params.formId,
      authz: authzFor(req, false),
    });
    return deps.renderAdmin(req, res, "publication", {
      brand,
      adminBasePath,
      csrfToken: issueCsrf(res, req),
      csrfField: CSRF_FIELD,
      form: result.form,
      versions: (versions.ok && versions.versions) || [],
      canManage: deps.canManage(req) === true,
      stitchScreen: "SH06",
      mobile: true,
    });
  });

  router.post(`${adminBasePath}/:formId/publish`, async (req, res) => {
    const tenant = deps.resolveTenant(req);
    if (!tenant || !deps.canManage(req)) return res.status(403).send("Forbidden");
    if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) return res.status(403).send("CSRF");
    await tenantFormService.publishForm(getPool(), {
      organizationId: tenant.organizationId,
      productCode,
      formId: req.params.formId,
      actorIdentityId: tenant.actorIdentityId,
      authz: authzFor(req, true),
    });
    return res.redirect(303, `${adminBasePath}/${req.params.formId}/publication`);
  });

  router.post(`${adminBasePath}/:formId/unpublish`, async (req, res) => {
    const tenant = deps.resolveTenant(req);
    if (!tenant || !deps.canManage(req)) return res.status(403).send("Forbidden");
    if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) return res.status(403).send("CSRF");
    await tenantFormService.unpublishForm(getPool(), {
      organizationId: tenant.organizationId,
      productCode,
      formId: req.params.formId,
      actorIdentityId: tenant.actorIdentityId,
      authz: authzFor(req, true),
    });
    return res.redirect(303, `${adminBasePath}/${req.params.formId}/publication`);
  });

  router.get(`${adminBasePath}/:formId/sharing`, async (req, res) => {
    const tenant = deps.resolveTenant(req);
    if (!tenant) return res.status(403).send("Forbidden");
    const result = await tenantFormService.getForm(getPool(), {
      organizationId: tenant.organizationId,
      productCode,
      formId: req.params.formId,
      authz: authzFor(req, false),
    });
    if (!result.ok) return res.status(404).send("Not found");
    const publicPath = buildPublicFormPath({
      productCode,
      publicToken: result.form.publicToken,
    });
    const publicUrl = buildPublicFormUrl({
      productCode,
      publicToken: result.form.publicToken,
      baseUrl: baseUrl(req),
    });
    const qr = await buildPublicFormQrDataUrl({
      productCode,
      publicToken: result.form.publicToken,
      baseUrl: baseUrl(req),
    });
    return deps.renderAdmin(req, res, "sharing", {
      brand,
      adminBasePath,
      csrfToken: issueCsrf(res, req),
      csrfField: CSRF_FIELD,
      form: result.form,
      publicPath,
      publicUrl,
      qrDataUrl: qr.ok ? qr.dataUrl : null,
      accessModes: ACCESS_MODES,
      canManage: deps.canManage(req) === true,
      issuedToken: null,
      stitchScreen: "SH07",
      mobile: true,
    });
  });

  router.post(`${adminBasePath}/:formId/sharing`, async (req, res) => {
    const tenant = deps.resolveTenant(req);
    if (!tenant || !deps.canManage(req)) return res.status(403).send("Forbidden");
    if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) return res.status(403).send("CSRF");
    const pool = getPool();
    await tenantFormService.updateSharing(pool, {
      organizationId: tenant.organizationId,
      productCode,
      formId: req.params.formId,
      accessMode: req.body.access_mode,
      discoverable: req.body.discoverable === "1" || req.body.discoverable === "on",
      actorIdentityId: tenant.actorIdentityId,
      authz: authzFor(req, true),
    });

    let issuedToken = null;
    if (req.body.issue_email && req.body.invite_email) {
      const issued = await tenantFormService.issueEmailAccessToken(pool, {
        organizationId: tenant.organizationId,
        productCode,
        formId: req.params.formId,
        email: req.body.invite_email,
        actorIdentityId: tenant.actorIdentityId,
        authz: authzFor(req, true),
      });
      if (issued.ok) issuedToken = issued.accessToken;
    }

    const result = await tenantFormService.getForm(pool, {
      organizationId: tenant.organizationId,
      productCode,
      formId: req.params.formId,
      authz: authzFor(req, false),
    });
    const publicPath = buildPublicFormPath({
      productCode,
      publicToken: result.form.publicToken,
      accessToken: issuedToken && issuedToken.token,
    });
    const publicUrl = buildPublicFormUrl({
      productCode,
      publicToken: result.form.publicToken,
      baseUrl: baseUrl(req),
      accessToken: issuedToken && issuedToken.token,
    });
    const qr = await buildPublicFormQrDataUrl({
      productCode,
      publicToken: result.form.publicToken,
      baseUrl: baseUrl(req),
    });
    return deps.renderAdmin(req, res, "sharing", {
      brand,
      adminBasePath,
      csrfToken: issueCsrf(res, req),
      csrfField: CSRF_FIELD,
      form: result.form,
      publicPath,
      publicUrl,
      qrDataUrl: qr.ok ? qr.dataUrl : null,
      accessModes: ACCESS_MODES,
      canManage: true,
      issuedToken,
      stitchScreen: "SH07",
      mobile: true,
    });
  });

  // —— Submissions review (SH11–SH13) ——
  router.get(`${adminBasePath}/:formId/submissions`, async (req, res) => {
    const tenant = deps.resolveTenant(req);
    if (!tenant) return res.status(403).send("Forbidden");
    const scope = scopeFromTenant(tenant);
    const listed = await tenantFormService.listFormSubmissions(getPool(), {
      organizationId: tenant.organizationId,
      productCode,
      formId: req.params.formId,
      reviewStatus: req.query.status || null,
      searchQuery: req.query.q || null,
      branchId: scope.branchId,
      facilityId: scope.facilityId,
      includeInternalNotes: false,
      authz: authzFor(req, false),
    });
    if (!listed.ok) {
      return deps.renderAdmin(req, res, "access-denied", {
        brand,
        adminBasePath,
        csrfToken: issueCsrf(res, req),
        csrfField: CSRF_FIELD,
        stitchScreen: "SH15",
        mobile: true,
      });
    }
    return deps.renderAdmin(req, res, "submissions", {
      brand,
      adminBasePath,
      csrfToken: issueCsrf(res, req),
      csrfField: CSRF_FIELD,
      form: listed.form,
      submissions: listed.submissions,
      reviewStatuses: REVIEW_STATUSES,
      filterStatus: req.query.status || "",
      searchQuery: String(req.query.q || "").trim(),
      canManage: deps.canManage(req) === true,
      stitchScreen: "SH11",
      mobile: true,
    });
  });

  router.get(`${adminBasePath}/:formId/submissions/:submissionId`, async (req, res) => {
    const tenant = deps.resolveTenant(req);
    if (!tenant) return res.status(403).send("Forbidden");
    const scope = scopeFromTenant(tenant);
    const result = await tenantFormService.getFormSubmission(getPool(), {
      organizationId: tenant.organizationId,
      productCode,
      formId: req.params.formId,
      submissionId: req.params.submissionId,
      branchId: scope.branchId,
      facilityId: scope.facilityId,
      authz: authzFor(req, false),
    });
    if (!result.ok) {
      return deps.renderAdmin(req, res, "access-denied", {
        brand,
        adminBasePath,
        csrfToken: issueCsrf(res, req),
        csrfField: CSRF_FIELD,
        stitchScreen: "SH15",
        mobile: true,
      });
    }
    const allowedNext =
      REVIEW_TRANSITIONS[result.submission.reviewStatus] || [];
    return deps.renderAdmin(req, res, "submission-detail", {
      brand,
      adminBasePath,
      csrfToken: issueCsrf(res, req),
      csrfField: CSRF_FIELD,
      form: result.form,
      submission: result.submission,
      canEditNotes: result.canEditNotes === true,
      canManage: deps.canManage(req) === true,
      allowedNext,
      reviewStatuses: REVIEW_STATUSES,
      stitchScreen: deps.canManage(req) ? "SH13" : "SH12",
      mobile: true,
      error: null,
    });
  });

  router.post(`${adminBasePath}/:formId/submissions/:submissionId/review`, async (req, res) => {
    const tenant = deps.resolveTenant(req);
    if (!tenant || !deps.canManage(req)) return res.status(403).send("Forbidden");
    if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) return res.status(403).send("CSRF");
    const scope = scopeFromTenant(tenant);

    async function renderReviewError(message) {
      const current = await tenantFormService.getFormSubmission(getPool(), {
        organizationId: tenant.organizationId,
        productCode,
        formId: req.params.formId,
        submissionId: req.params.submissionId,
        branchId: scope.branchId,
        facilityId: scope.facilityId,
        authz: authzFor(req, false),
      });
      return deps.renderAdmin(req, res, "submission-detail", {
        brand,
        adminBasePath,
        csrfToken: issueCsrf(res, req),
        csrfField: CSRF_FIELD,
        form: current.form || null,
        submission: current.submission || null,
        canEditNotes: true,
        canManage: true,
        allowedNext:
          (current.submission && REVIEW_TRANSITIONS[current.submission.reviewStatus]) || [],
        reviewStatuses: REVIEW_STATUSES,
        error: message,
        stitchScreen: "SH13",
        mobile: true,
      });
    }

    const currentForConfirm = await tenantFormService.getFormSubmission(getPool(), {
      organizationId: tenant.organizationId,
      productCode,
      formId: req.params.formId,
      submissionId: req.params.submissionId,
      branchId: scope.branchId,
      facilityId: scope.facilityId,
      authz: authzFor(req, false),
    });
    if (
      currentForConfirm.ok &&
      currentForConfirm.submission &&
      String(req.body.review_status || "") !== String(currentForConfirm.submission.reviewStatus) &&
      !(req.body.confirm_status_change === "1" || req.body.confirm_status_change === "on")
    ) {
      return renderReviewError("Confirm the status change before saving.");
    }

    const reviewed = await tenantFormService.reviewFormSubmission(getPool(), {
      organizationId: tenant.organizationId,
      productCode,
      formId: req.params.formId,
      submissionId: req.params.submissionId,
      reviewStatus: req.body.review_status,
      internalNotes: req.body.internal_notes,
      actorIdentityId: tenant.actorIdentityId,
      branchId: scope.branchId,
      facilityId: scope.facilityId,
      authz: authzFor(req, true),
    });
    if (!reviewed.ok) {
      return renderReviewError("Unable to update status. Check the transition and try again.");
    }
    return res.redirect(
      303,
      `${adminBasePath}/${req.params.formId}/submissions/${req.params.submissionId}`
    );
  });

  return router;
}

module.exports = {
  createSharedFormBuilderRouter,
  VIEWS,
};
