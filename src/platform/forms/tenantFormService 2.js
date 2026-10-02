"use strict";

/**
 * Shared tenant form builder service (SH01–SH07).
 * Tenant-scoped CRUD, publication, access control, schema versioning.
 */

const crypto = require("crypto");
const repo = require("./tenantFormRepository");
const {
  validateFormSchema,
  validateFormAnswers,
  validateFormCategory,
  ALLOWED_FIELD_TYPES,
} = require("./formSchema");
const { ACCESS_MODES, FORM_STATUSES, PRODUCT_CODES, REVIEW_STATUSES, REVIEW_TRANSITIONS } = require("./formAccess");

const STATUS = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  NOT_FOUND: "not_found",
  FORBIDDEN: "forbidden",
  CONFLICT: "conflict",
  POLICY: "policy",
  LOOKUP_ERROR: "lookup_error",
});

const FORM_KEY_RE = /^[a-z][a-z0-9_-]{0,63}$/;
const HTML_HINT = /<\/?[a-z][\s\S]*>/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

async function withClient(db, fn) {
  let client = null;
  let owned = false;
  try {
    if (db && typeof db.connect === "function") {
      client = await db.connect();
      owned = true;
    } else {
      client = db;
    }
    return await fn(client);
  } finally {
    if (owned && client && typeof client.release === "function") client.release();
  }
}

function mapDbError(err) {
  const msg = err && err.message ? String(err.message) : "";
  if (/unique|duplicate/i.test(msg)) {
    return { ok: false, status: STATUS.CONFLICT, reason: "duplicate" };
  }
  return { ok: false, status: STATUS.LOOKUP_ERROR, reason: msg || "error" };
}

function plainText(value, field, { required, max }) {
  if (value == null || value === "") {
    if (required) return { ok: false, reason: field };
    return { ok: true, value: null };
  }
  const s = String(value).trim();
  if (HTML_HINT.test(s)) return { ok: false, reason: `${field}_html_not_allowed` };
  if (!s) {
    if (required) return { ok: false, reason: field };
    return { ok: true, value: null };
  }
  if (s.length > max) return { ok: false, reason: `${field}_too_long` };
  return { ok: true, value: s };
}

function assertProductCode(productCode) {
  const code = String(productCode || "").trim().toLowerCase();
  if (code !== PRODUCT_CODES.BLESSBOARD && code !== PRODUCT_CODES.ACTIVECLINIC) {
    return { ok: false, reason: "product_code" };
  }
  return { ok: true, productCode: code };
}

function assertOrgId(organizationId) {
  const id = String(organizationId || "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, reason: "organization_id" };
  return { ok: true, organizationId: id };
}

function newPublicToken() {
  return crypto.randomBytes(18).toString("base64url").slice(0, 24);
}

function hashToken(raw) {
  return crypto.createHash("sha256").update(String(raw), "utf8").digest("hex");
}

function normalizeEmail(email) {
  const s = String(email || "").trim().toLowerCase();
  if (!EMAIL_RE.test(s) || s.length > 320) return null;
  return s;
}

function authorizeOrDeny(authz) {
  if (!authz || typeof authz !== "function") {
    return { ok: false, status: STATUS.FORBIDDEN, reason: "authz_required" };
  }
  return null;
}

async function runAuthz(authz, action) {
  const denied = authorizeOrDeny(authz);
  if (denied) return denied;
  const result = await authz(action);
  if (!result || result.ok !== true) {
    return {
      ok: false,
      status: STATUS.FORBIDDEN,
      reason: (result && result.reason) || "forbidden",
    };
  }
  return { ok: true };
}

/**
 * @param {object} input
 * @param {Function} input.authz - async (action) => { ok }
 */
async function createForm(db, input) {
  const org = assertOrgId(input && input.organizationId);
  if (!org.ok) return { ok: false, status: STATUS.INVALID_INPUT, reason: org.reason };
  const product = assertProductCode(input && input.productCode);
  if (!product.ok) return { ok: false, status: STATUS.INVALID_INPUT, reason: product.reason };

  const gate = await runAuthz(input.authz, "manage");
  if (!gate.ok) return gate;

  const title = plainText(input.title, "title", { required: true, max: 200 });
  if (!title.ok) return { ok: false, status: STATUS.INVALID_INPUT, reason: title.reason };
  const description = plainText(input.description, "description", { required: false, max: 5000 });
  if (!description.ok) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: description.reason };
  }

  let formKey = String(input.formKey || "").trim().toLowerCase();
  if (!formKey) {
    formKey = `form_${crypto.randomBytes(4).toString("hex")}`;
  }
  if (!FORM_KEY_RE.test(formKey)) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "form_key" };
  }

  const category = validateFormCategory(input.category);
  if (!category.ok) {
    return { ok: false, status: STATUS.POLICY, reason: category.reason };
  }

  let schemaJson = { version: 1, fields: [] };
  if (input.schemaJson != null) {
    const schema = validateFormSchema(input.schemaJson);
    if (!schema.ok) {
      return { ok: false, status: STATUS.INVALID_INPUT, reason: schema.reason };
    }
    schemaJson = schema.schema;
  }

  const accessMode =
    String(input.accessMode || ACCESS_MODES.OPEN_PUBLIC).trim() === ACCESS_MODES.EMAIL_TOKEN
      ? ACCESS_MODES.EMAIL_TOKEN
      : ACCESS_MODES.OPEN_PUBLIC;

  try {
    const form = await withClient(db, (client) =>
      repo.insertForm(client, {
        organizationId: org.organizationId,
        productCode: product.productCode,
        formKey,
        title: title.value,
        description: description.value,
        category: category.category,
        schemaJson,
        schemaVersion: 1,
        status: FORM_STATUSES.DRAFT,
        accessMode,
        discoverable: false,
        publicToken: newPublicToken(),
        createdByIdentityId: input.actorIdentityId || null,
        branchId: input.branchId || null,
        facilityId: input.facilityId || null,
        requireConsent: input.requireConsent !== false,
        linkedResourceType: input.linkedResourceType || null,
        linkedResourceId: input.linkedResourceId || null,
        registrationClosed: input.registrationClosed === true,
        maxSubmissions:
          input.maxSubmissions != null && Number(input.maxSubmissions) > 0
            ? Number(input.maxSubmissions)
            : null,
      })
    );
    return { ok: true, status: STATUS.OK, form };
  } catch (err) {
    return mapDbError(err);
  }
}

async function updateFormMeta(db, input) {
  const org = assertOrgId(input && input.organizationId);
  if (!org.ok) return { ok: false, status: STATUS.INVALID_INPUT, reason: org.reason };
  const product = assertProductCode(input && input.productCode);
  if (!product.ok) return { ok: false, status: STATUS.INVALID_INPUT, reason: product.reason };
  const gate = await runAuthz(input.authz, "manage");
  if (!gate.ok) return gate;

  const patch = {
    id: input.formId,
    organizationId: org.organizationId,
    productCode: product.productCode,
    updatedByIdentityId: input.actorIdentityId || null,
  };

  if (input.title !== undefined) {
    const title = plainText(input.title, "title", { required: true, max: 200 });
    if (!title.ok) return { ok: false, status: STATUS.INVALID_INPUT, reason: title.reason };
    patch.title = title.value;
  }
  if (input.description !== undefined) {
    const description = plainText(input.description, "description", {
      required: false,
      max: 5000,
    });
    if (!description.ok) {
      return { ok: false, status: STATUS.INVALID_INPUT, reason: description.reason };
    }
    patch.description = description.value;
  }
  if (input.category !== undefined) {
    const category = validateFormCategory(input.category);
    if (!category.ok) return { ok: false, status: STATUS.POLICY, reason: category.reason };
    patch.category = category.category;
  }

  try {
    const form = await withClient(db, async (client) => {
      const existing = await repo.getFormById(client, {
        id: input.formId,
        organizationId: org.organizationId,
        productCode: product.productCode,
      });
      if (!existing) return null;
      if (existing.status === FORM_STATUSES.ARCHIVED) {
        const err = new Error("archived");
        err.code = "archived";
        throw err;
      }
      return repo.updateForm(client, patch);
    });
    if (!form) return { ok: false, status: STATUS.NOT_FOUND, reason: "not_found" };
    return { ok: true, status: STATUS.OK, form };
  } catch (err) {
    if (err && err.code === "archived") {
      return { ok: false, status: STATUS.CONFLICT, reason: "archived" };
    }
    return mapDbError(err);
  }
}

async function replaceSchema(db, input) {
  const org = assertOrgId(input && input.organizationId);
  if (!org.ok) return { ok: false, status: STATUS.INVALID_INPUT, reason: org.reason };
  const product = assertProductCode(input && input.productCode);
  if (!product.ok) return { ok: false, status: STATUS.INVALID_INPUT, reason: product.reason };
  const gate = await runAuthz(input.authz, "manage");
  if (!gate.ok) return gate;

  const schema = validateFormSchema(input.schemaJson);
  if (!schema.ok) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: schema.reason };
  }

  try {
    const form = await withClient(db, async (client) => {
      const existing = await repo.getFormById(client, {
        id: input.formId,
        organizationId: org.organizationId,
        productCode: product.productCode,
      });
      if (!existing) return null;
      if (existing.status === FORM_STATUSES.ARCHIVED) {
        const err = new Error("archived");
        err.code = "archived";
        throw err;
      }
      const nextVersion =
        existing.status === FORM_STATUSES.PUBLISHED
          ? existing.schemaVersion + 1
          : existing.schemaVersion;
      return repo.updateForm(client, {
        id: existing.id,
        organizationId: org.organizationId,
        productCode: product.productCode,
        schemaJson: schema.schema,
        schemaVersion: nextVersion,
        // Editing a published form returns it to draft until re-publish
        status:
          existing.status === FORM_STATUSES.PUBLISHED
            ? FORM_STATUSES.DRAFT
            : existing.status,
        setUnpublishedAt: existing.status === FORM_STATUSES.PUBLISHED,
        unpublishedAt: existing.status === FORM_STATUSES.PUBLISHED ? new Date() : null,
        updatedByIdentityId: input.actorIdentityId || null,
      });
    });
    if (!form) return { ok: false, status: STATUS.NOT_FOUND, reason: "not_found" };
    return { ok: true, status: STATUS.OK, form };
  } catch (err) {
    if (err && err.code === "archived") {
      return { ok: false, status: STATUS.CONFLICT, reason: "archived" };
    }
    return mapDbError(err);
  }
}

/**
 * Reorder fields by key list; preserves field definitions.
 */
async function reorderFields(db, input) {
  const org = assertOrgId(input && input.organizationId);
  if (!org.ok) return { ok: false, status: STATUS.INVALID_INPUT, reason: org.reason };
  const product = assertProductCode(input && input.productCode);
  if (!product.ok) return { ok: false, status: STATUS.INVALID_INPUT, reason: product.reason };
  const gate = await runAuthz(input.authz, "manage");
  if (!gate.ok) return gate;

  if (!Array.isArray(input.fieldKeys) || !input.fieldKeys.length) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "field_keys" };
  }

  try {
    const form = await withClient(db, async (client) => {
      const existing = await repo.getFormById(client, {
        id: input.formId,
        organizationId: org.organizationId,
        productCode: product.productCode,
      });
      if (!existing) return null;
      const fields = (existing.schemaJson && existing.schemaJson.fields) || [];
      const byKey = new Map(fields.map((f) => [f.key, f]));
      if (input.fieldKeys.length !== fields.length) {
        const err = new Error("field_keys_mismatch");
        err.code = "field_keys_mismatch";
        throw err;
      }
      const ordered = [];
      for (const key of input.fieldKeys) {
        const k = String(key || "").trim().toLowerCase();
        if (!byKey.has(k)) {
          const err = new Error("field_key_unknown");
          err.code = "field_key_unknown";
          throw err;
        }
        ordered.push(byKey.get(k));
        byKey.delete(k);
      }
      if (byKey.size) {
        const err = new Error("field_keys_mismatch");
        err.code = "field_keys_mismatch";
        throw err;
      }
      return repo.updateForm(client, {
        id: existing.id,
        organizationId: org.organizationId,
        productCode: product.productCode,
        schemaJson: { version: 1, fields: ordered },
        updatedByIdentityId: input.actorIdentityId || null,
      });
    });
    if (!form) return { ok: false, status: STATUS.NOT_FOUND, reason: "not_found" };
    return { ok: true, status: STATUS.OK, form };
  } catch (err) {
    if (err && (err.code === "field_keys_mismatch" || err.code === "field_key_unknown")) {
      return { ok: false, status: STATUS.INVALID_INPUT, reason: err.code };
    }
    return mapDbError(err);
  }
}

async function getForm(db, input) {
  const org = assertOrgId(input && input.organizationId);
  if (!org.ok) return { ok: false, status: STATUS.INVALID_INPUT, reason: org.reason };
  const product = assertProductCode(input && input.productCode);
  if (!product.ok) return { ok: false, status: STATUS.INVALID_INPUT, reason: product.reason };
  const gate = await runAuthz(input.authz, "view");
  if (!gate.ok) return gate;

  try {
    const form = await withClient(db, (client) =>
      repo.getFormById(client, {
        id: input.formId,
        organizationId: org.organizationId,
        productCode: product.productCode,
      })
    );
    if (!form) return { ok: false, status: STATUS.NOT_FOUND, reason: "not_found" };
    return { ok: true, status: STATUS.OK, form };
  } catch (err) {
    return mapDbError(err);
  }
}

async function listForms(db, input) {
  const org = assertOrgId(input && input.organizationId);
  if (!org.ok) return { ok: false, status: STATUS.INVALID_INPUT, reason: org.reason };
  const product = assertProductCode(input && input.productCode);
  if (!product.ok) return { ok: false, status: STATUS.INVALID_INPUT, reason: product.reason };
  const gate = await runAuthz(input.authz, "view");
  if (!gate.ok) return gate;

  try {
    const forms = await withClient(db, (client) =>
      repo.listForms(client, {
        organizationId: org.organizationId,
        productCode: product.productCode,
        status: input.status || null,
      })
    );
    return { ok: true, status: STATUS.OK, forms };
  } catch (err) {
    return mapDbError(err);
  }
}

async function publishForm(db, input) {
  const org = assertOrgId(input && input.organizationId);
  if (!org.ok) return { ok: false, status: STATUS.INVALID_INPUT, reason: org.reason };
  const product = assertProductCode(input && input.productCode);
  if (!product.ok) return { ok: false, status: STATUS.INVALID_INPUT, reason: product.reason };
  const gate = await runAuthz(input.authz, "manage");
  if (!gate.ok) return gate;

  try {
    const form = await withClient(db, async (client) => {
      await client.query("BEGIN");
      try {
        const existing = await repo.getFormById(client, {
          id: input.formId,
          organizationId: org.organizationId,
          productCode: product.productCode,
        });
        if (!existing) {
          await client.query("ROLLBACK");
          return null;
        }
        if (existing.status === FORM_STATUSES.ARCHIVED) {
          const err = new Error("archived");
          err.code = "archived";
          throw err;
        }
        const fields = (existing.schemaJson && existing.schemaJson.fields) || [];
        if (!fields.length) {
          const err = new Error("empty_schema");
          err.code = "empty_schema";
          throw err;
        }
        const schemaCheck = validateFormSchema(existing.schemaJson);
        if (!schemaCheck.ok) {
          const err = new Error(schemaCheck.reason);
          err.code = "invalid_schema";
          throw err;
        }
        const nextVersion =
          existing.status === FORM_STATUSES.PUBLISHED
            ? existing.schemaVersion
            : existing.schemaVersion;
        const updated = await repo.updateForm(client, {
          id: existing.id,
          organizationId: org.organizationId,
          productCode: product.productCode,
          status: FORM_STATUSES.PUBLISHED,
          setPublishedAt: true,
          publishedAt: new Date(),
          setUnpublishedAt: true,
          unpublishedAt: null,
          schemaVersion: nextVersion,
          updatedByIdentityId: input.actorIdentityId || null,
        });
        await repo.insertVersion(client, {
          formId: updated.id,
          organizationId: org.organizationId,
          schemaVersion: updated.schemaVersion,
          schemaJson: updated.schemaJson,
          accessMode: updated.accessMode,
          title: updated.title,
          publishedByIdentityId: input.actorIdentityId || null,
        });
        await client.query("COMMIT");
        return updated;
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      }
    });
    if (!form) return { ok: false, status: STATUS.NOT_FOUND, reason: "not_found" };
    return { ok: true, status: STATUS.OK, form };
  } catch (err) {
    if (err && err.code === "archived") {
      return { ok: false, status: STATUS.CONFLICT, reason: "archived" };
    }
    if (err && err.code === "empty_schema") {
      return { ok: false, status: STATUS.INVALID_INPUT, reason: "empty_schema" };
    }
    if (err && err.code === "invalid_schema") {
      return { ok: false, status: STATUS.INVALID_INPUT, reason: err.message };
    }
    // Unique version on re-publish of same version: update in place by bumping
    if (/unique|duplicate/i.test(String(err && err.message))) {
      try {
        const form = await withClient(db, async (client) => {
          const existing = await repo.getFormById(client, {
            id: input.formId,
            organizationId: org.organizationId,
            productCode: product.productCode,
          });
          if (!existing) return null;
          const bumped = existing.schemaVersion + 1;
          const updated = await repo.updateForm(client, {
            id: existing.id,
            organizationId: org.organizationId,
            productCode: product.productCode,
            status: FORM_STATUSES.PUBLISHED,
            schemaVersion: bumped,
            setPublishedAt: true,
            publishedAt: new Date(),
            setUnpublishedAt: true,
            unpublishedAt: null,
            updatedByIdentityId: input.actorIdentityId || null,
          });
          await repo.insertVersion(client, {
            formId: updated.id,
            organizationId: org.organizationId,
            schemaVersion: updated.schemaVersion,
            schemaJson: updated.schemaJson,
            accessMode: updated.accessMode,
            title: updated.title,
            publishedByIdentityId: input.actorIdentityId || null,
          });
          return updated;
        });
        if (!form) return { ok: false, status: STATUS.NOT_FOUND, reason: "not_found" };
        return { ok: true, status: STATUS.OK, form };
      } catch (err2) {
        return mapDbError(err2);
      }
    }
    return mapDbError(err);
  }
}

async function unpublishForm(db, input) {
  const org = assertOrgId(input && input.organizationId);
  if (!org.ok) return { ok: false, status: STATUS.INVALID_INPUT, reason: org.reason };
  const product = assertProductCode(input && input.productCode);
  if (!product.ok) return { ok: false, status: STATUS.INVALID_INPUT, reason: product.reason };
  const gate = await runAuthz(input.authz, "manage");
  if (!gate.ok) return gate;

  try {
    const form = await withClient(db, async (client) => {
      const existing = await repo.getFormById(client, {
        id: input.formId,
        organizationId: org.organizationId,
        productCode: product.productCode,
      });
      if (!existing) return null;
      if (existing.status !== FORM_STATUSES.PUBLISHED) {
        const err = new Error("not_published");
        err.code = "not_published";
        throw err;
      }
      return repo.updateForm(client, {
        id: existing.id,
        organizationId: org.organizationId,
        productCode: product.productCode,
        status: FORM_STATUSES.DRAFT,
        setUnpublishedAt: true,
        unpublishedAt: new Date(),
        updatedByIdentityId: input.actorIdentityId || null,
      });
    });
    if (!form) return { ok: false, status: STATUS.NOT_FOUND, reason: "not_found" };
    return { ok: true, status: STATUS.OK, form };
  } catch (err) {
    if (err && err.code === "not_published") {
      return { ok: false, status: STATUS.CONFLICT, reason: "not_published" };
    }
    return mapDbError(err);
  }
}

async function updateSharing(db, input) {
  const org = assertOrgId(input && input.organizationId);
  if (!org.ok) return { ok: false, status: STATUS.INVALID_INPUT, reason: org.reason };
  const product = assertProductCode(input && input.productCode);
  if (!product.ok) return { ok: false, status: STATUS.INVALID_INPUT, reason: product.reason };
  const gate = await runAuthz(input.authz, "manage");
  if (!gate.ok) return gate;

  let accessMode;
  if (input.accessMode !== undefined) {
    const mode = String(input.accessMode || "").trim();
    if (mode !== ACCESS_MODES.OPEN_PUBLIC && mode !== ACCESS_MODES.EMAIL_TOKEN) {
      return { ok: false, status: STATUS.INVALID_INPUT, reason: "access_mode" };
    }
    accessMode = mode;
  }

  try {
    const form = await withClient(db, async (client) => {
      const existing = await repo.getFormById(client, {
        id: input.formId,
        organizationId: org.organizationId,
        productCode: product.productCode,
      });
      if (!existing) return null;
      return repo.updateForm(client, {
        id: existing.id,
        organizationId: org.organizationId,
        productCode: product.productCode,
        accessMode,
        discoverable:
          input.discoverable !== undefined ? input.discoverable === true : undefined,
        updatedByIdentityId: input.actorIdentityId || null,
      });
    });
    if (!form) return { ok: false, status: STATUS.NOT_FOUND, reason: "not_found" };
    return { ok: true, status: STATUS.OK, form };
  } catch (err) {
    return mapDbError(err);
  }
}

/**
 * Issue an email-scoped access token for email_token access mode.
 * Returns the raw token once (caller shares it); only the hash is stored.
 */
async function issueEmailAccessToken(db, input) {
  const org = assertOrgId(input && input.organizationId);
  if (!org.ok) return { ok: false, status: STATUS.INVALID_INPUT, reason: org.reason };
  const product = assertProductCode(input && input.productCode);
  if (!product.ok) return { ok: false, status: STATUS.INVALID_INPUT, reason: product.reason };
  const gate = await runAuthz(input.authz, "manage");
  if (!gate.ok) return gate;

  const email = normalizeEmail(input.email);
  if (!email) return { ok: false, status: STATUS.INVALID_INPUT, reason: "email" };

  const rawToken = crypto.randomBytes(24).toString("base64url");
  const tokenHash = hashToken(rawToken);

  try {
    const issued = await withClient(db, async (client) => {
      const existing = await repo.getFormById(client, {
        id: input.formId,
        organizationId: org.organizationId,
        productCode: product.productCode,
      });
      if (!existing) return null;
      if (existing.accessMode !== ACCESS_MODES.EMAIL_TOKEN) {
        const err = new Error("access_mode");
        err.code = "access_mode";
        throw err;
      }
      const row = await repo.insertAccessToken(client, {
        formId: existing.id,
        organizationId: org.organizationId,
        emailNormalized: email,
        tokenHash,
        expiresAt: input.expiresAt || null,
        createdByIdentityId: input.actorIdentityId || null,
      });
      return { row, form: existing };
    });
    if (!issued) return { ok: false, status: STATUS.NOT_FOUND, reason: "not_found" };
    return {
      ok: true,
      status: STATUS.OK,
      accessToken: {
        id: issued.row.id,
        email: issued.row.emailNormalized,
        token: rawToken,
        expiresAt: issued.row.expiresAt,
      },
      form: issued.form,
    };
  } catch (err) {
    if (err && err.code === "access_mode") {
      return { ok: false, status: STATUS.CONFLICT, reason: "access_mode" };
    }
    return mapDbError(err);
  }
}

async function getPublicForm(db, input) {
  const product = assertProductCode(input && input.productCode);
  if (!product.ok) return { ok: false, status: STATUS.INVALID_INPUT, reason: product.reason };
  const token = String(input.publicToken || "").trim();
  if (token.length < 16) {
    return { ok: false, status: STATUS.NOT_FOUND, reason: "not_found" };
  }

  try {
    const form = await withClient(db, (client) =>
      repo.getFormByPublicToken(client, {
        publicToken: token,
        productCode: product.productCode,
      })
    );
    if (!form || form.status !== FORM_STATUSES.PUBLISHED) {
      return { ok: false, status: STATUS.NOT_FOUND, reason: "not_found" };
    }
    return {
      ok: true,
      status: STATUS.OK,
      form: {
        id: form.id,
        title: form.title,
        description: form.description,
        schemaJson: form.schemaJson,
        schemaVersion: form.schemaVersion,
        accessMode: form.accessMode,
        publicToken: form.publicToken,
        productCode: form.productCode,
        organizationId: form.organizationId,
        requireConsent: form.requireConsent !== false,
        branchId: form.branchId || null,
        facilityId: form.facilityId || null,
      },
    };
  } catch (err) {
    return mapDbError(err);
  }
}

async function submitPublicForm(db, input) {
  const product = assertProductCode(input && input.productCode);
  if (!product.ok) return { ok: false, status: STATUS.INVALID_INPUT, reason: product.reason };
  const token = String(input.publicToken || "").trim();
  if (token.length < 16) {
    return { ok: false, status: STATUS.NOT_FOUND, reason: "not_found" };
  }

  let idempotencyKey = String(input.idempotencyKey || "").trim();
  if (idempotencyKey) {
    if (idempotencyKey.length < 8 || idempotencyKey.length > 128) {
      return { ok: false, status: STATUS.INVALID_INPUT, reason: "idempotency_key" };
    }
  } else {
    idempotencyKey = null;
  }

  try {
    return await withClient(db, async (client) => {
      const form = await repo.getFormByPublicToken(client, {
        publicToken: token,
        productCode: product.productCode,
      });
      if (!form || form.status !== FORM_STATUSES.PUBLISHED) {
        return { ok: false, status: STATUS.NOT_FOUND, reason: "not_found" };
      }

      // Isolation: optional branch/facility must match form scope when provided
      if (input.branchId && form.branchId && String(input.branchId) !== String(form.branchId)) {
        return { ok: false, status: STATUS.FORBIDDEN, reason: "branch_mismatch" };
      }
      if (
        input.facilityId &&
        form.facilityId &&
        String(input.facilityId) !== String(form.facilityId)
      ) {
        return { ok: false, status: STATUS.FORBIDDEN, reason: "facility_mismatch" };
      }

      const rateBucket = String(input.rateBucket || input.clientIpHash || "anon").slice(0, 200);
      const rate = await repo.hitSubmissionRateLimit(client, {
        formId: form.id,
        bucketKey: rateBucket,
        maxHits: Number(input.rateLimitMax) > 0 ? Number(input.rateLimitMax) : 20,
        windowMs: Number(input.rateLimitWindowMs) > 0 ? Number(input.rateLimitWindowMs) : 10 * 60 * 1000,
      });
      if (rate.limited) {
        return { ok: false, status: STATUS.POLICY, reason: "rate_limited" };
      }

      if (form.requireConsent !== false) {
        if (input.consentAccepted !== true && input.consentAccepted !== "1" && input.consentAccepted !== "on") {
          return { ok: false, status: STATUS.INVALID_INPUT, reason: "consent_required" };
        }
      }

      if (form.registrationClosed === true) {
        return { ok: false, status: STATUS.POLICY, reason: "registration_closed" };
      }

      if (idempotencyKey) {
        const existing = await repo.findSubmissionByIdempotency(client, {
          formId: form.id,
          idempotencyKey,
        });
        if (existing) {
          return {
            ok: true,
            status: STATUS.OK,
            submission: existing,
            idempotentReplay: true,
          };
        }
      }

      let accessTokenId = null;
      let submitterEmail = null;

      if (form.accessMode === ACCESS_MODES.OPEN_PUBLIC) {
        submitterEmail = normalizeEmail(input.email) || null;
      } else if (form.accessMode === ACCESS_MODES.EMAIL_TOKEN) {
        const accessToken = String(input.accessToken || "").trim();
        const email = normalizeEmail(input.email);
        if (!accessToken || !email) {
          return { ok: false, status: STATUS.FORBIDDEN, reason: "access_required" };
        }
        const row = await repo.findAccessTokenByHash(client, {
          formId: form.id,
          tokenHash: hashToken(accessToken),
        });
        if (!row) {
          return { ok: false, status: STATUS.FORBIDDEN, reason: "access_token_invalid" };
        }
        if (row.emailNormalized !== email) {
          return { ok: false, status: STATUS.FORBIDDEN, reason: "access_email_mismatch" };
        }
        if (row.expiresAt && new Date(row.expiresAt).getTime() < Date.now()) {
          return { ok: false, status: STATUS.FORBIDDEN, reason: "access_token_expired" };
        }
        accessTokenId = row.id;
        submitterEmail = email;
        await repo.markAccessTokenUsed(client, {
          id: row.id,
          organizationId: form.organizationId,
        });
      } else {
        return { ok: false, status: STATUS.FORBIDDEN, reason: "access_mode" };
      }

      // Activity forms (visitor/event/ministry) require email for consent follow-up + duplicate prevention.
      const activityCategory = ["visitor", "event", "ministry", "registration"].includes(
        String(form.category || "")
      );
      if (activityCategory && !submitterEmail) {
        // Prefer answers.email when top-level email omitted
        const answerEmail =
          input.answers && (input.answers.email || input.answers.Email)
            ? normalizeEmail(input.answers.email || input.answers.Email)
            : null;
        submitterEmail = answerEmail;
      }
      if (activityCategory && !submitterEmail) {
        return { ok: false, status: STATUS.INVALID_INPUT, reason: "email_required" };
      }

      if (submitterEmail) {
        const dup = await repo.findOpenSubmissionByEmail(client, {
          formId: form.id,
          email: submitterEmail,
        });
        if (dup) {
          return {
            ok: false,
            status: STATUS.CONFLICT,
            reason: "duplicate_submission",
            submission: dup,
          };
        }
      }

      if (form.maxSubmissions != null) {
        const openCount = await repo.countOpenSubmissions(client, { formId: form.id });
        if (openCount >= form.maxSubmissions) {
          return { ok: false, status: STATUS.POLICY, reason: "capacity_full" };
        }
      }

      const answers = validateFormAnswers(form.schemaJson, input.answers);
      if (!answers.ok) {
        return { ok: false, status: STATUS.INVALID_INPUT, reason: answers.reason };
      }

      try {
        const submission = await repo.insertSubmission(client, {
          formId: form.id,
          organizationId: form.organizationId,
          productCode: form.productCode,
          schemaVersion: form.schemaVersion,
          answersJson: answers.answers,
          submitterEmail,
          accessTokenId,
          idempotencyKey,
          consentAcceptedAt:
            form.requireConsent !== false ? new Date() : input.consentAccepted ? new Date() : null,
          branchId: form.branchId || input.branchId || null,
          facilityId: form.facilityId || input.facilityId || null,
        });
        return { ok: true, status: STATUS.OK, submission, idempotentReplay: false };
      } catch (err) {
        if (/unique|duplicate/i.test(String(err && err.message)) && idempotencyKey) {
          const existing = await repo.findSubmissionByIdempotency(client, {
            formId: form.id,
            idempotencyKey,
          });
          if (existing) {
            return {
              ok: true,
              status: STATUS.OK,
              submission: existing,
              idempotentReplay: true,
            };
          }
        }
        throw err;
      }
    });
  } catch (err) {
    return mapDbError(err);
  }
}

async function listFormSubmissions(db, input) {
  const org = assertOrgId(input && input.organizationId);
  if (!org.ok) return { ok: false, status: STATUS.INVALID_INPUT, reason: org.reason };
  const product = assertProductCode(input && input.productCode);
  if (!product.ok) return { ok: false, status: STATUS.INVALID_INPUT, reason: product.reason };
  const gate = await runAuthz(input.authz, "view");
  if (!gate.ok) return gate;

  const includeNotes = input.includeInternalNotes === true;
  if (includeNotes) {
    const manageGate = await runAuthz(input.authz, "manage");
    if (!manageGate.ok) {
      return { ok: false, status: STATUS.FORBIDDEN, reason: "notes_restricted" };
    }
  }

  try {
    const result = await withClient(db, async (client) => {
      const form = await repo.getFormById(client, {
        id: input.formId,
        organizationId: org.organizationId,
        productCode: product.productCode,
      });
      if (!form) return null;
      if (input.branchId && form.branchId && String(input.branchId) !== String(form.branchId)) {
        return { forbidden: "branch_mismatch" };
      }
      if (
        input.facilityId &&
        form.facilityId &&
        String(input.facilityId) !== String(form.facilityId)
      ) {
        return { forbidden: "facility_mismatch" };
      }
      const submissions = await repo.listSubmissions(client, {
        formId: form.id,
        organizationId: org.organizationId,
        limit: input.limit,
        reviewStatus: input.reviewStatus || null,
        branchId: input.branchId || null,
        facilityId: input.facilityId || null,
        includeInternalNotes: includeNotes,
        searchQuery: input.searchQuery || null,
      });
      return { form, submissions };
    });
    if (!result) return { ok: false, status: STATUS.NOT_FOUND, reason: "not_found" };
    if (result.forbidden) {
      return { ok: false, status: STATUS.FORBIDDEN, reason: result.forbidden };
    }
    return {
      ok: true,
      status: STATUS.OK,
      form: result.form,
      submissions: result.submissions,
    };
  } catch (err) {
    return mapDbError(err);
  }
}

async function getFormSubmission(db, input) {
  const org = assertOrgId(input && input.organizationId);
  if (!org.ok) return { ok: false, status: STATUS.INVALID_INPUT, reason: org.reason };
  const product = assertProductCode(input && input.productCode);
  if (!product.ok) return { ok: false, status: STATUS.INVALID_INPUT, reason: product.reason };
  const gate = await runAuthz(input.authz, "view");
  if (!gate.ok) return gate;

  const canManage = (await runAuthz(input.authz, "manage")).ok === true;

  try {
    const result = await withClient(db, async (client) => {
      const form = await repo.getFormById(client, {
        id: input.formId,
        organizationId: org.organizationId,
        productCode: product.productCode,
      });
      if (!form) return null;
      const submission = await repo.getSubmissionById(client, {
        id: input.submissionId,
        organizationId: org.organizationId,
        formId: form.id,
        includeInternalNotes: canManage,
        branchId: input.branchId || null,
        facilityId: input.facilityId || null,
      });
      if (!submission) return { form, submission: null };
      return { form, submission };
    });
    if (!result) return { ok: false, status: STATUS.NOT_FOUND, reason: "not_found" };
    if (!result.submission) {
      return { ok: false, status: STATUS.NOT_FOUND, reason: "submission_not_found" };
    }
    return {
      ok: true,
      status: STATUS.OK,
      form: result.form,
      submission: result.submission,
      canEditNotes: canManage,
    };
  } catch (err) {
    return mapDbError(err);
  }
}

async function reviewFormSubmission(db, input) {
  const org = assertOrgId(input && input.organizationId);
  if (!org.ok) return { ok: false, status: STATUS.INVALID_INPUT, reason: org.reason };
  const product = assertProductCode(input && input.productCode);
  if (!product.ok) return { ok: false, status: STATUS.INVALID_INPUT, reason: product.reason };
  const gate = await runAuthz(input.authz, "manage");
  if (!gate.ok) return gate;

  const nextStatus = String(input.reviewStatus || "").trim();
  if (!Object.values(REVIEW_STATUSES).includes(nextStatus)) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "review_status" };
  }

  let notes = undefined;
  let setNotes = false;
  if (input.internalNotes !== undefined) {
    setNotes = true;
    const plain = plainText(input.internalNotes, "internal_notes", {
      required: false,
      max: 5000,
    });
    if (!plain.ok) {
      return { ok: false, status: STATUS.INVALID_INPUT, reason: plain.reason };
    }
    notes = plain.value;
  }

  try {
    const result = await withClient(db, async (client) => {
      const form = await repo.getFormById(client, {
        id: input.formId,
        organizationId: org.organizationId,
        productCode: product.productCode,
      });
      if (!form) return null;
      const existing = await repo.getSubmissionById(client, {
        id: input.submissionId,
        organizationId: org.organizationId,
        formId: form.id,
        includeInternalNotes: true,
        branchId: input.branchId || null,
        facilityId: input.facilityId || null,
      });
      if (!existing) return { missing: true };
      const allowed = REVIEW_TRANSITIONS[existing.reviewStatus] || [];
      if (nextStatus !== existing.reviewStatus && !allowed.includes(nextStatus)) {
        return { badTransition: true, from: existing.reviewStatus };
      }
      const updated = await repo.updateSubmissionReview(client, {
        id: existing.id,
        organizationId: org.organizationId,
        formId: form.id,
        reviewStatus: nextStatus,
        setInternalNotes: setNotes,
        internalNotes: notes,
        reviewedByIdentityId: input.actorIdentityId || null,
        historyEntry: {
          at: new Date().toISOString(),
          from: existing.reviewStatus,
          to: nextStatus,
          by: input.actorIdentityId || null,
        },
      });
      return { form, submission: updated };
    });
    if (!result) return { ok: false, status: STATUS.NOT_FOUND, reason: "not_found" };
    if (result.missing) {
      return { ok: false, status: STATUS.NOT_FOUND, reason: "submission_not_found" };
    }
    if (result.badTransition) {
      return {
        ok: false,
        status: STATUS.CONFLICT,
        reason: "invalid_transition",
        from: result.from,
      };
    }
    return {
      ok: true,
      status: STATUS.OK,
      form: result.form,
      submission: result.submission,
    };
  } catch (err) {
    return mapDbError(err);
  }
}

/**
 * Platform-admin-only cross-tenant forms overview (SH14).
 */
async function listPlatformFormsOverview(db, input) {
  const gate = await runAuthz(input.authz, "platform_admin");
  if (!gate.ok) return gate;
  try {
    const forms = await withClient(db, (client) =>
      repo.listFormsCrossTenant(client, {
        productCode: input.productCode || null,
        limit: input.limit,
      })
    );
    return { ok: true, status: STATUS.OK, forms };
  } catch (err) {
    return mapDbError(err);
  }
}

async function listVersions(db, input) {
  const org = assertOrgId(input && input.organizationId);
  if (!org.ok) return { ok: false, status: STATUS.INVALID_INPUT, reason: org.reason };
  const product = assertProductCode(input && input.productCode);
  if (!product.ok) return { ok: false, status: STATUS.INVALID_INPUT, reason: product.reason };
  const gate = await runAuthz(input.authz, "view");
  if (!gate.ok) return gate;

  try {
    const result = await withClient(db, async (client) => {
      const form = await repo.getFormById(client, {
        id: input.formId,
        organizationId: org.organizationId,
        productCode: product.productCode,
      });
      if (!form) return null;
      const versions = await repo.listVersions(client, {
        formId: form.id,
        organizationId: org.organizationId,
      });
      return { form, versions };
    });
    if (!result) return { ok: false, status: STATUS.NOT_FOUND, reason: "not_found" };
    return { ok: true, status: STATUS.OK, form: result.form, versions: result.versions };
  } catch (err) {
    return mapDbError(err);
  }
}

module.exports = {
  STATUS,
  ACCESS_MODES,
  FORM_STATUSES,
  PRODUCT_CODES,
  REVIEW_STATUSES,
  REVIEW_TRANSITIONS,
  ALLOWED_FIELD_TYPES,
  createForm,
  updateFormMeta,
  replaceSchema,
  reorderFields,
  getForm,
  listForms,
  publishForm,
  unpublishForm,
  updateSharing,
  issueEmailAccessToken,
  getPublicForm,
  submitPublicForm,
  listFormSubmissions,
  getFormSubmission,
  reviewFormSubmission,
  listPlatformFormsOverview,
  listVersions,
};
