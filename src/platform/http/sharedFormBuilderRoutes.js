"use strict";

/**
 * Shared form builder HTTP routes (SH01–SH07).
 * Product shells inject branding, auth, and permission gates.
 */

const express = require("express");
const path = require("path");
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
const { ACCESS_MODES } = require("../forms/formAccess");

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
 *   resolveTenant: (req) => { organizationId: string, actorIdentityId?: string|null } | null,
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

  function authzFor(req, needManage) {
    return async (action) => {
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
    return deps.renderPublic(req, res, "public-form", {
      brand,
      csrfToken,
      csrfField: CSRF_FIELD,
      form: result.form,
      accessToken: String(req.query.t || ""),
      email: "",
      error: null,
      mobile: true,
      stitchScreen: "SH08",
    });
  });

  router.post("/f/:publicToken", async (req, res) => {
    const pool = getPool();
    const csrfToken = issueCsrf(res, req);
    if (!validateCsrf(req, env)) {
      return deps.renderPublic(req, res, "public-form", {
        brand,
        csrfToken,
        csrfField: CSRF_FIELD,
        form: null,
        error: "Session expired. Reload and try again.",
        mobile: true,
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
    const submit = await tenantFormService.submitPublicForm(pool, {
      productCode,
      publicToken: req.params.publicToken,
      answers: answersFromBody(req.body, published.form.schemaJson),
      email: req.body && req.body.email,
      accessToken: (req.body && req.body.access_token) || req.query.t,
    });
    if (!submit.ok) {
      return deps.renderPublic(req, res, "public-form", {
        brand,
        csrfToken,
        csrfField: CSRF_FIELD,
        form: published.form,
        accessToken: String((req.body && req.body.access_token) || req.query.t || ""),
        email: String((req.body && req.body.email) || ""),
        error:
          submit.reason === "access_required" ||
          submit.reason === "access_token_invalid" ||
          submit.reason === "access_email_mismatch" ||
          submit.reason === "access_token_expired"
            ? "You need a valid email access link to submit this form."
            : "Please check the highlighted fields and try again.",
        reason: submit.reason,
        mobile: true,
        stitchScreen: "SH09",
      });
    }
    return deps.renderPublic(req, res, "public-thanks", {
      brand,
      form: published.form,
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
    if (!validateCsrf(req, env)) return res.status(403).send("CSRF");
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
    if (!validateCsrf(req, env)) return res.status(403).send("CSRF");
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
    if (!validateCsrf(req, env)) return res.status(403).send("CSRF");
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
    if (!validateCsrf(req, env)) return res.status(403).send("CSRF");
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
    if (!validateCsrf(req, env)) return res.status(403).send("CSRF");
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
    if (!validateCsrf(req, env)) return res.status(403).send("CSRF");
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

  return router;
}

module.exports = {
  createSharedFormBuilderRouter,
  VIEWS,
};
