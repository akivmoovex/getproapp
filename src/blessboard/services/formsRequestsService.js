"use strict";

/**
 * BlessBoard V5 resources, forms, submissions, and member requests.
 * Controlled schemas only; private attachments; member submission privacy.
 */

const repo = require("../repositories/formsRequestsRepository");
const {
  validateFormSchema,
  validateFormAnswers,
  ALLOWED_FIELD_TYPES,
} = require("./formSchema");
const {
  authorizeBlessBoardTenantAccess,
  STATUS: AUTHZ_STATUS,
} = require("./authorizeBlessBoardTenantAccess");

const STATUS = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  NOT_FOUND: "not_found",
  FORBIDDEN: "forbidden",
  CONFLICT: "conflict",
  POLICY: "policy",
  LOOKUP_ERROR: "lookup_error",
});

const REQUEST_CATEGORIES = Object.freeze(["prayer", "pastoral", "practical", "other"]);
const REQUEST_STATUSES = Object.freeze(["submitted", "in_review", "resolved", "closed"]);
const AUDIENCES = Object.freeze(["members", "admins", "all"]);

const REQUEST_TRANSITIONS = Object.freeze({
  submitted: Object.freeze(["in_review", "closed"]),
  in_review: Object.freeze(["resolved", "closed", "submitted"]),
  resolved: Object.freeze(["closed", "in_review"]),
  closed: Object.freeze([]),
});

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HTML_HINT = /<\/?[a-z][\s\S]*>/i;

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
  if (/must belong|must match|must be|archived|published|private/i.test(msg)) {
    return { ok: false, status: STATUS.CONFLICT, reason: msg };
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
  if (s.length < 1 || s.length > max) return { ok: false, reason: `${field}_length` };
  return { ok: true, value: s };
}

async function authorizeActor(client, input) {
  const authz = await authorizeBlessBoardTenantAccess(
    { query: client.query.bind(client) },
    {
      userId: input.actorUserId,
      tenant: input.tenant,
      branchId: input.branchId,
    }
  );
  if (!authz.ok) {
    return {
      ok: false,
      reason: authz.status || AUTHZ_STATUS.UNAUTHORIZED,
      mode: null,
    };
  }
  const roles = authz.context.effectiveRoles || [];
  const hasHq = roles.some((r) => r.roleKey === "church_hq_admin");
  const hasBranch = roles.some((r) => r.roleKey === "branch_admin");
  const hasPlatform = roles.some((r) => r.roleKey === "platform_admin");
  if (hasHq || hasPlatform) return { ok: true, mode: "hq" };
  if (hasBranch && input.branchId) return { ok: true, mode: "branch" };
  return { ok: false, reason: "role", mode: null };
}

function assertAdminScope(authz, input, entityBranchId) {
  if (!authz.ok) return { ok: false, status: STATUS.FORBIDDEN, reason: authz.reason };
  if (authz.mode === "branch") {
    if (input.scopeBranchId && entityBranchId && String(input.scopeBranchId) !== String(entityBranchId)) {
      return { ok: false, status: STATUS.FORBIDDEN, reason: "branch_scope" };
    }
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Resources
// ---------------------------------------------------------------------------

async function createResource(db, input) {
  const churchId = String((input && input.churchId) || "").trim();
  const actorUserId = String((input && input.actorUserId) || "").trim();
  if (!churchId || !actorUserId) {
    return { ok: false, status: STATUS.INVALID_INPUT, resource: null, reason: "scope" };
  }
  const title = plainText(input.title, "title", { required: true, max: 200 });
  if (!title.ok) return { ok: false, status: STATUS.INVALID_INPUT, resource: null, reason: title.reason };
  const description = plainText(input.description, "description", { required: false, max: 5000 });
  if (!description.ok) {
    return { ok: false, status: STATUS.INVALID_INPUT, resource: null, reason: description.reason };
  }
  const audience = String(input.audience || "members").trim().toLowerCase();
  if (!AUDIENCES.includes(audience)) {
    return { ok: false, status: STATUS.INVALID_INPUT, resource: null, reason: "audience" };
  }
  let branchId = input.branchId == null || input.branchId === "" ? null : String(input.branchId);
  let mediaAssetId =
    input.mediaAssetId == null || input.mediaAssetId === "" ? null : String(input.mediaAssetId);
  if (mediaAssetId && !UUID_RE.test(mediaAssetId)) {
    return { ok: false, status: STATUS.INVALID_INPUT, resource: null, reason: "media_asset_id" };
  }

  try {
    return await withClient(db, async (client) => {
      if (input.tenant) {
        const authz = await authorizeActor(client, {
          actorUserId,
          tenant: input.tenant,
          branchId: branchId || input.scopeBranchId || null,
        });
        if (!authz.ok) {
          return { ok: false, status: STATUS.FORBIDDEN, resource: null, reason: authz.reason };
        }
        if (authz.mode === "branch") {
          branchId = String(input.scopeBranchId || branchId || "");
          if (!branchId) {
            return { ok: false, status: STATUS.FORBIDDEN, resource: null, reason: "branch_required" };
          }
        }
      }
      if (branchId) {
        const branch = await repo.findBranchScope(client, branchId);
        if (!branch || String(branch.church_id) !== churchId || branch.status !== "active") {
          return { ok: false, status: STATUS.INVALID_INPUT, resource: null, reason: "branch" };
        }
      }
      if (mediaAssetId) {
        const media = await repo.findMediaMeta(client, mediaAssetId);
        if (!media || String(media.church_id) !== churchId || media.status !== "active") {
          return { ok: false, status: STATUS.INVALID_INPUT, resource: null, reason: "media" };
        }
      }
      const resource = await repo.insertResource(client, {
        churchId,
        branchId,
        title: title.value,
        description: description.value,
        mediaAssetId,
        audience,
        createdByUserId: actorUserId,
      });
      return { ok: true, status: STATUS.OK, resource };
    });
  } catch (err) {
    return { ...mapDbError(err), resource: null };
  }
}

async function publishResource(db, input) {
  return changeContentStatus(db, "resource", input, "published");
}

async function archiveResource(db, input) {
  return changeContentStatus(db, "resource", input, "archived");
}

async function changeContentStatus(db, kind, input, nextStatus) {
  const churchId = String((input && input.churchId) || "").trim();
  const id = String((input && input.id) || "").trim();
  const actorUserId = String((input && input.actorUserId) || "").trim();
  if (!churchId || !UUID_RE.test(id) || !actorUserId) {
    return { ok: false, status: STATUS.INVALID_INPUT, [kind]: null, reason: "scope" };
  }
  try {
    return await withClient(db, async (client) => {
      const entity =
        kind === "resource"
          ? await repo.findResourceById(client, id)
          : await repo.findFormById(client, id);
      if (!entity || String(entity.churchId) !== churchId) {
        return { ok: false, status: STATUS.NOT_FOUND, [kind]: null };
      }
      if (input.tenant) {
        const authz = await authorizeActor(client, {
          actorUserId,
          tenant: input.tenant,
          branchId: entity.branchId || input.scopeBranchId || null,
        });
        const scope = assertAdminScope(authz, input, entity.branchId);
        if (!scope.ok) return { ...scope, [kind]: null };
      }
      if (nextStatus === "published" && entity.status !== "draft") {
        return { ok: false, status: STATUS.CONFLICT, [kind]: entity, reason: "not_draft" };
      }
      if (nextStatus === "archived" && entity.status === "draft") {
        return { ok: false, status: STATUS.CONFLICT, [kind]: entity, reason: "draft_cannot_archive" };
      }
      const patch = {
        status: nextStatus,
        publishedAt: nextStatus === "published" ? new Date().toISOString() : null,
      };
      const updated =
        kind === "resource"
          ? await repo.updateResourceStatus(client, id, patch)
          : await repo.updateFormStatus(client, id, patch);
      return { ok: true, status: STATUS.OK, [kind]: updated };
    });
  } catch (err) {
    return { ...mapDbError(err), [kind]: null };
  }
}

async function getResource(db, input) {
  const churchId = String((input && input.churchId) || "").trim();
  const id = String((input && input.id) || "").trim();
  if (!churchId || !UUID_RE.test(id)) {
    return { ok: false, status: STATUS.INVALID_INPUT, resource: null, reason: "scope" };
  }
  try {
    return await withClient(db, async (client) => {
      const resource = await repo.findResourceById(client, id);
      if (!resource || String(resource.churchId) !== churchId) {
        return { ok: false, status: STATUS.NOT_FOUND, resource: null };
      }
      if (input.forMember) {
        if (resource.status !== "published") {
          return { ok: false, status: STATUS.NOT_FOUND, resource: null };
        }
        if (resource.audience === "admins") {
          return { ok: false, status: STATUS.FORBIDDEN, resource: null, reason: "audience" };
        }
        if (resource.branchId && input.branchId && String(resource.branchId) !== String(input.branchId)) {
          return { ok: false, status: STATUS.FORBIDDEN, resource: null, reason: "branch_scope" };
        }
      } else if (input.tenant && input.actorUserId) {
        const authz = await authorizeActor(client, {
          actorUserId: input.actorUserId,
          tenant: input.tenant,
          branchId: resource.branchId || input.scopeBranchId || null,
        });
        const scope = assertAdminScope(authz, input, resource.branchId);
        if (!scope.ok) return { ...scope, resource: null };
      }
      return { ok: true, status: STATUS.OK, resource };
    });
  } catch (err) {
    return { ...mapDbError(err), resource: null };
  }
}

async function listResources(db, input) {
  const churchId = String((input && input.churchId) || "").trim();
  if (!churchId) {
    return { ok: false, status: STATUS.INVALID_INPUT, resources: [], reason: "church_id" };
  }
  try {
    return await withClient(db, async (client) => {
      if (input.forMember) {
        const resources = await repo.listResources(client, {
          churchId,
          branchId: input.branchId || null,
          status: "published",
          audience: "members",
          limit: input.limit,
        });
        return { ok: true, status: STATUS.OK, resources };
      }
      if (input.tenant && input.actorUserId) {
        const authz = await authorizeActor(client, {
          actorUserId: input.actorUserId,
          tenant: input.tenant,
          branchId: input.branchId || input.scopeBranchId || null,
        });
        if (!authz.ok) {
          return { ok: false, status: STATUS.FORBIDDEN, resources: [], reason: authz.reason };
        }
        if (authz.mode === "branch" && !input.branchId && !input.scopeBranchId) {
          return { ok: false, status: STATUS.FORBIDDEN, resources: [], reason: "branch_required" };
        }
      }
      const resources = await repo.listResources(client, {
        churchId,
        branchOnly: input.branchId || undefined,
        branchId: input.includeChurchWide ? input.branchId : undefined,
        status: input.status || null,
        limit: input.limit,
      });
      return { ok: true, status: STATUS.OK, resources };
    });
  } catch (err) {
    return { ...mapDbError(err), resources: [] };
  }
}

// ---------------------------------------------------------------------------
// Forms
// ---------------------------------------------------------------------------

async function createForm(db, input) {
  const churchId = String((input && input.churchId) || "").trim();
  const actorUserId = String((input && input.actorUserId) || "").trim();
  if (!churchId || !actorUserId) {
    return { ok: false, status: STATUS.INVALID_INPUT, form: null, reason: "scope" };
  }
  const title = plainText(input.title, "title", { required: true, max: 200 });
  if (!title.ok) return { ok: false, status: STATUS.INVALID_INPUT, form: null, reason: title.reason };
  const description = plainText(input.description, "description", { required: false, max: 5000 });
  if (!description.ok) {
    return { ok: false, status: STATUS.INVALID_INPUT, form: null, reason: description.reason };
  }
  const schema = validateFormSchema(input.schema != null ? input.schema : input.schemaJson);
  if (!schema.ok) {
    return { ok: false, status: STATUS.INVALID_INPUT, form: null, reason: schema.reason };
  }
  let branchId = input.branchId == null || input.branchId === "" ? null : String(input.branchId);

  try {
    return await withClient(db, async (client) => {
      if (input.tenant) {
        const authz = await authorizeActor(client, {
          actorUserId,
          tenant: input.tenant,
          branchId: branchId || input.scopeBranchId || null,
        });
        if (!authz.ok) {
          return { ok: false, status: STATUS.FORBIDDEN, form: null, reason: authz.reason };
        }
        if (authz.mode === "branch") {
          branchId = String(input.scopeBranchId || branchId || "");
          if (!branchId) {
            return { ok: false, status: STATUS.FORBIDDEN, form: null, reason: "branch_required" };
          }
        }
      }
      if (branchId) {
        const branch = await repo.findBranchScope(client, branchId);
        if (!branch || String(branch.church_id) !== churchId || branch.status !== "active") {
          return { ok: false, status: STATUS.INVALID_INPUT, form: null, reason: "branch" };
        }
      }
      const form = await repo.insertForm(client, {
        churchId,
        branchId,
        title: title.value,
        description: description.value,
        schema: schema.schema,
        createdByUserId: actorUserId,
      });
      return { ok: true, status: STATUS.OK, form };
    });
  } catch (err) {
    return { ...mapDbError(err), form: null };
  }
}

async function updateFormDraft(db, input) {
  const churchId = String((input && input.churchId) || "").trim();
  const id = String((input && input.id) || "").trim();
  const actorUserId = String((input && input.actorUserId) || "").trim();
  if (!churchId || !UUID_RE.test(id) || !actorUserId) {
    return { ok: false, status: STATUS.INVALID_INPUT, form: null, reason: "scope" };
  }
  let schema = null;
  if (input.schema != null || input.schemaJson != null) {
    schema = validateFormSchema(input.schema != null ? input.schema : input.schemaJson);
    if (!schema.ok) {
      return { ok: false, status: STATUS.INVALID_INPUT, form: null, reason: schema.reason };
    }
  }
  const title =
    input.title === undefined ? null : plainText(input.title, "title", { required: true, max: 200 });
  if (title && !title.ok) {
    return { ok: false, status: STATUS.INVALID_INPUT, form: null, reason: title.reason };
  }
  const description =
    input.description === undefined
      ? null
      : plainText(input.description, "description", { required: false, max: 5000 });
  if (description && !description.ok) {
    return { ok: false, status: STATUS.INVALID_INPUT, form: null, reason: description.reason };
  }

  try {
    return await withClient(db, async (client) => {
      const form = await repo.findFormById(client, id);
      if (!form || String(form.churchId) !== churchId) {
        return { ok: false, status: STATUS.NOT_FOUND, form: null };
      }
      if (input.tenant) {
        const authz = await authorizeActor(client, {
          actorUserId,
          tenant: input.tenant,
          branchId: form.branchId || input.scopeBranchId || null,
        });
        const scope = assertAdminScope(authz, input, form.branchId);
        if (!scope.ok) return { ...scope, form: null };
      }
      if (form.status !== "draft") {
        return { ok: false, status: STATUS.POLICY, form, reason: "status_locked" };
      }
      const updated = await repo.updateForm(client, id, {
        title: title ? title.value : null,
        clearDescription: description && description.value == null && input.description === "",
        description: description ? description.value : undefined,
        schema: schema ? schema.schema : null,
      });
      return { ok: true, status: STATUS.OK, form: updated };
    });
  } catch (err) {
    return { ...mapDbError(err), form: null };
  }
}

async function publishForm(db, input) {
  return changeContentStatus(db, "form", input, "published");
}

async function archiveForm(db, input) {
  return changeContentStatus(db, "form", input, "archived");
}

async function getForm(db, input) {
  const churchId = String((input && input.churchId) || "").trim();
  const id = String((input && input.id) || "").trim();
  if (!churchId || !UUID_RE.test(id)) {
    return { ok: false, status: STATUS.INVALID_INPUT, form: null, reason: "scope" };
  }
  try {
    return await withClient(db, async (client) => {
      const form = await repo.findFormById(client, id);
      if (!form || String(form.churchId) !== churchId) {
        return { ok: false, status: STATUS.NOT_FOUND, form: null };
      }
      if (input.forMember) {
        if (form.status !== "published") {
          return { ok: false, status: STATUS.NOT_FOUND, form: null };
        }
        if (form.branchId && input.branchId && String(form.branchId) !== String(input.branchId)) {
          return { ok: false, status: STATUS.FORBIDDEN, form: null, reason: "branch_scope" };
        }
      } else if (input.tenant && input.actorUserId) {
        const authz = await authorizeActor(client, {
          actorUserId: input.actorUserId,
          tenant: input.tenant,
          branchId: form.branchId || input.scopeBranchId || null,
        });
        const scope = assertAdminScope(authz, input, form.branchId);
        if (!scope.ok) return { ...scope, form: null };
      }
      return { ok: true, status: STATUS.OK, form };
    });
  } catch (err) {
    return { ...mapDbError(err), form: null };
  }
}

async function listForms(db, input) {
  const churchId = String((input && input.churchId) || "").trim();
  if (!churchId) {
    return { ok: false, status: STATUS.INVALID_INPUT, forms: [], reason: "church_id" };
  }
  try {
    return await withClient(db, async (client) => {
      if (input.forMember) {
        const forms = await repo.listForms(client, {
          churchId,
          branchId: input.branchId || null,
          status: "published",
          limit: input.limit,
        });
        return { ok: true, status: STATUS.OK, forms };
      }
      if (input.tenant && input.actorUserId) {
        const authz = await authorizeActor(client, {
          actorUserId: input.actorUserId,
          tenant: input.tenant,
          branchId: input.branchId || input.scopeBranchId || null,
        });
        if (!authz.ok) {
          return { ok: false, status: STATUS.FORBIDDEN, forms: [], reason: authz.reason };
        }
      }
      const forms = await repo.listForms(client, {
        churchId,
        branchOnly: input.branchId || undefined,
        status: input.status || null,
        limit: input.limit,
      });
      return { ok: true, status: STATUS.OK, forms };
    });
  } catch (err) {
    return { ...mapDbError(err), forms: [] };
  }
}

async function submitForm(db, input) {
  const churchId = String((input && input.churchId) || "").trim();
  const formId = String((input && input.formId) || "").trim();
  const memberId = String((input && input.memberId) || "").trim();
  const branchId = String((input && input.branchId) || "").trim();
  if (!churchId || !UUID_RE.test(formId) || !UUID_RE.test(memberId) || !UUID_RE.test(branchId)) {
    return { ok: false, status: STATUS.INVALID_INPUT, submission: null, reason: "scope" };
  }
  try {
    return await withClient(db, async (client) => {
      const form = await repo.findFormById(client, formId);
      if (!form || String(form.churchId) !== churchId || form.status !== "published") {
        return { ok: false, status: STATUS.NOT_FOUND, submission: null };
      }
      if (form.branchId && String(form.branchId) !== branchId) {
        return { ok: false, status: STATUS.FORBIDDEN, submission: null, reason: "branch_scope" };
      }
      const answers = validateFormAnswers(form.schema, input.answers);
      if (!answers.ok) {
        return { ok: false, status: STATUS.INVALID_INPUT, submission: null, reason: answers.reason };
      }
      const submission = await repo.insertSubmission(client, {
        churchId,
        formId,
        memberId,
        branchId,
        answers: answers.answers,
      });
      const { recordBlessBoardAudit } = require("./recordBlessBoardAudit");
      await recordBlessBoardAudit(client, {
        churchId,
        branchId,
        actionKey: "form.submission.create",
        entityType: "form_submission",
        entityId: submission.id,
        outcome: "success",
        metadata: {
          field_keys: Object.keys(answers.answers),
          schema_field_count: (form.schema.fields || []).length,
        },
      });
      return { ok: true, status: STATUS.OK, submission };
    });
  } catch (err) {
    return { ...mapDbError(err), submission: null };
  }
}

async function getFormSubmission(db, input) {
  const churchId = String((input && input.churchId) || "").trim();
  const id = String((input && input.id) || "").trim();
  if (!churchId || !UUID_RE.test(id)) {
    return { ok: false, status: STATUS.INVALID_INPUT, submission: null, reason: "scope" };
  }
  try {
    return await withClient(db, async (client) => {
      const submission = await repo.findSubmissionById(client, id);
      if (!submission || String(submission.churchId) !== churchId) {
        return { ok: false, status: STATUS.NOT_FOUND, submission: null };
      }
      if (input.forMember) {
        if (String(submission.memberId) !== String(input.memberId)) {
          return { ok: false, status: STATUS.FORBIDDEN, submission: null, reason: "not_owner" };
        }
      } else if (input.tenant && input.actorUserId) {
        const authz = await authorizeActor(client, {
          actorUserId: input.actorUserId,
          tenant: input.tenant,
          branchId: submission.branchId,
        });
        const scope = assertAdminScope(authz, input, submission.branchId);
        if (!scope.ok) return { ...scope, submission: null };
        if (authz.mode === "branch" && input.scopeBranchId) {
          if (String(input.scopeBranchId) !== String(submission.branchId)) {
            return { ok: false, status: STATUS.FORBIDDEN, submission: null, reason: "branch_scope" };
          }
        }
      }
      return { ok: true, status: STATUS.OK, submission };
    });
  } catch (err) {
    return { ...mapDbError(err), submission: null };
  }
}

async function listFormSubmissions(db, input) {
  const churchId = String((input && input.churchId) || "").trim();
  if (!churchId) {
    return { ok: false, status: STATUS.INVALID_INPUT, submissions: [], reason: "church_id" };
  }
  try {
    return await withClient(db, async (client) => {
      if (input.forMember) {
        if (!input.memberId) {
          return { ok: false, status: STATUS.FORBIDDEN, submissions: [], reason: "member_required" };
        }
        const submissions = await repo.listSubmissions(client, {
          churchId,
          memberId: input.memberId,
          formId: input.formId || null,
          limit: input.limit,
        });
        return { ok: true, status: STATUS.OK, submissions };
      }
      if (input.tenant && input.actorUserId) {
        const authz = await authorizeActor(client, {
          actorUserId: input.actorUserId,
          tenant: input.tenant,
          branchId: input.branchId || input.scopeBranchId || null,
        });
        if (!authz.ok) {
          return { ok: false, status: STATUS.FORBIDDEN, submissions: [], reason: authz.reason };
        }
        if (authz.mode === "branch" && !input.branchId && !input.scopeBranchId) {
          return { ok: false, status: STATUS.FORBIDDEN, submissions: [], reason: "branch_required" };
        }
      }
      const submissions = await repo.listSubmissions(client, {
        churchId,
        formId: input.formId || null,
        branchId: input.branchId || input.scopeBranchId || null,
        limit: input.limit,
      });
      return { ok: true, status: STATUS.OK, submissions };
    });
  } catch (err) {
    return { ...mapDbError(err), submissions: [] };
  }
}

// ---------------------------------------------------------------------------
// Member requests
// ---------------------------------------------------------------------------

async function createMemberRequest(db, input) {
  const churchId = String((input && input.churchId) || "").trim();
  const branchId = String((input && input.branchId) || "").trim();
  const memberId = String((input && input.memberId) || "").trim();
  if (!churchId || !UUID_RE.test(branchId) || !UUID_RE.test(memberId)) {
    return { ok: false, status: STATUS.INVALID_INPUT, request: null, reason: "scope" };
  }
  const category = String(input.category || "").trim().toLowerCase();
  if (!REQUEST_CATEGORIES.includes(category)) {
    return { ok: false, status: STATUS.INVALID_INPUT, request: null, reason: "category" };
  }
  const subject = plainText(input.subject, "subject", { required: true, max: 200 });
  if (!subject.ok) {
    return { ok: false, status: STATUS.INVALID_INPUT, request: null, reason: subject.reason };
  }
  const message = plainText(input.message, "message", { required: true, max: 5000 });
  if (!message.ok) {
    return { ok: false, status: STATUS.INVALID_INPUT, request: null, reason: message.reason };
  }
  let mediaAssetId =
    input.mediaAssetId == null || input.mediaAssetId === "" ? null : String(input.mediaAssetId);
  if (mediaAssetId && !UUID_RE.test(mediaAssetId)) {
    return { ok: false, status: STATUS.INVALID_INPUT, request: null, reason: "media_asset_id" };
  }

  try {
    return await withClient(db, async (client) => {
      if (mediaAssetId) {
        const media = await repo.findMediaMeta(client, mediaAssetId);
        if (
          !media ||
          String(media.church_id) !== churchId ||
          media.status !== "active" ||
          media.visibility !== "private"
        ) {
          return { ok: false, status: STATUS.INVALID_INPUT, request: null, reason: "private_media_required" };
        }
      }
      const request = await repo.insertRequest(client, {
        churchId,
        branchId,
        memberId,
        category,
        subject: subject.value,
        message: message.value,
        mediaAssetId,
      });
      await repo.insertRequestHistory(client, {
        churchId,
        requestId: request.id,
        fromStatus: null,
        toStatus: "submitted",
        note: null,
        memberVisible: true,
        changedByUserId: input.actorUserId || null,
      });
      const history = await repo.listRequestHistory(client, request.id, { memberVisibleOnly: true });
      return { ok: true, status: STATUS.OK, request: { ...request, history } };
    });
  } catch (err) {
    return { ...mapDbError(err), request: null };
  }
}

async function updateMemberRequestStatus(db, input) {
  const churchId = String((input && input.churchId) || "").trim();
  const id = String((input && input.id) || "").trim();
  const actorUserId = String((input && input.actorUserId) || "").trim();
  const toStatus = String((input && input.status) || "").trim().toLowerCase();
  if (!churchId || !UUID_RE.test(id) || !actorUserId) {
    return { ok: false, status: STATUS.INVALID_INPUT, request: null, reason: "scope" };
  }
  if (!REQUEST_STATUSES.includes(toStatus)) {
    return { ok: false, status: STATUS.INVALID_INPUT, request: null, reason: "status" };
  }
  const note = plainText(input.note, "note", { required: false, max: 1000 });
  if (!note.ok) {
    return { ok: false, status: STATUS.INVALID_INPUT, request: null, reason: note.reason };
  }

  try {
    return await withClient(db, async (client) => {
      const request = await repo.findRequestById(client, id);
      if (!request || String(request.churchId) !== churchId) {
        return { ok: false, status: STATUS.NOT_FOUND, request: null };
      }
      if (input.tenant) {
        const authz = await authorizeActor(client, {
          actorUserId,
          tenant: input.tenant,
          branchId: request.branchId,
        });
        const scope = assertAdminScope(authz, input, request.branchId);
        if (!scope.ok) return { ...scope, request: null };
        if (authz.mode === "branch" && input.scopeBranchId) {
          if (String(input.scopeBranchId) !== String(request.branchId)) {
            return { ok: false, status: STATUS.FORBIDDEN, request: null, reason: "branch_scope" };
          }
        }
      }
      const allowed = REQUEST_TRANSITIONS[request.status] || [];
      if (!allowed.includes(toStatus)) {
        return { ok: false, status: STATUS.POLICY, request, reason: "invalid_transition" };
      }
      const updated = await repo.updateRequestStatus(client, id, toStatus);
      await repo.insertRequestHistory(client, {
        churchId,
        requestId: id,
        fromStatus: request.status,
        toStatus,
        note: note.value,
        // Internal staff notes: pass memberVisible: false; default remains member-visible.
        memberVisible: input.memberVisible === false ? false : true,
        changedByUserId: actorUserId,
      });
      const history = await repo.listRequestHistory(client, id, { memberVisibleOnly: false });
      const { recordBlessBoardAudit } = require("./recordBlessBoardAudit");
      await recordBlessBoardAudit(client, {
        churchId,
        branchId: updated.branchId,
        actorUserId,
        actionKey: "request.status.update",
        entityType: "member_request",
        entityId: id,
        outcome: "success",
        metadata: {
          from_status: request.status,
          to_status: toStatus,
          category: updated.category,
        },
      });
      return { ok: true, status: STATUS.OK, request: { ...updated, history } };
    });
  } catch (err) {
    return { ...mapDbError(err), request: null };
  }
}

async function getMemberRequest(db, input) {
  const churchId = String((input && input.churchId) || "").trim();
  const id = String((input && input.id) || "").trim();
  if (!churchId || !UUID_RE.test(id)) {
    return { ok: false, status: STATUS.INVALID_INPUT, request: null, reason: "scope" };
  }
  try {
    return await withClient(db, async (client) => {
      const request = await repo.findRequestById(client, id);
      if (!request || String(request.churchId) !== churchId) {
        return { ok: false, status: STATUS.NOT_FOUND, request: null };
      }
      if (input.forMember) {
        if (String(request.memberId) !== String(input.memberId)) {
          return { ok: false, status: STATUS.FORBIDDEN, request: null, reason: "not_owner" };
        }
      } else if (input.tenant && input.actorUserId) {
        const authz = await authorizeActor(client, {
          actorUserId: input.actorUserId,
          tenant: input.tenant,
          branchId: request.branchId,
        });
        const scope = assertAdminScope(authz, input, request.branchId);
        if (!scope.ok) return { ...scope, request: null };
        if (authz.mode === "branch" && input.scopeBranchId) {
          if (String(input.scopeBranchId) !== String(request.branchId)) {
            return { ok: false, status: STATUS.FORBIDDEN, request: null, reason: "branch_scope" };
          }
        }
      }
      const history = await repo.listRequestHistory(client, id, {
        memberVisibleOnly: Boolean(input.forMember),
      });
      return { ok: true, status: STATUS.OK, request: { ...request, history } };
    });
  } catch (err) {
    return { ...mapDbError(err), request: null };
  }
}

async function listMemberRequests(db, input) {
  const churchId = String((input && input.churchId) || "").trim();
  if (!churchId) {
    return { ok: false, status: STATUS.INVALID_INPUT, requests: [], reason: "church_id" };
  }
  try {
    return await withClient(db, async (client) => {
      if (input.forMember) {
        if (!input.memberId) {
          return { ok: false, status: STATUS.FORBIDDEN, requests: [], reason: "member_required" };
        }
        const requests = await repo.listRequests(client, {
          churchId,
          memberId: input.memberId,
          limit: input.limit,
        });
        return { ok: true, status: STATUS.OK, requests };
      }
      if (input.tenant && input.actorUserId) {
        const authz = await authorizeActor(client, {
          actorUserId: input.actorUserId,
          tenant: input.tenant,
          branchId: input.branchId || input.scopeBranchId || null,
        });
        if (!authz.ok) {
          return { ok: false, status: STATUS.FORBIDDEN, requests: [], reason: authz.reason };
        }
        if (authz.mode === "branch" && !input.branchId && !input.scopeBranchId) {
          return { ok: false, status: STATUS.FORBIDDEN, requests: [], reason: "branch_required" };
        }
      }
      const requests = await repo.listRequests(client, {
        churchId,
        branchId: input.branchId || input.scopeBranchId || null,
        status: input.status || null,
        limit: input.limit,
      });
      return { ok: true, status: STATUS.OK, requests };
    });
  } catch (err) {
    return { ...mapDbError(err), requests: [] };
  }
}

module.exports = {
  STATUS,
  ALLOWED_FIELD_TYPES,
  REQUEST_CATEGORIES,
  REQUEST_STATUSES,
  REQUEST_TRANSITIONS,
  AUDIENCES,
  validateFormSchema,
  validateFormAnswers,
  createResource,
  publishResource,
  archiveResource,
  getResource,
  listResources,
  createForm,
  updateFormDraft,
  publishForm,
  archiveForm,
  getForm,
  listForms,
  submitForm,
  getFormSubmission,
  listFormSubmissions,
  createMemberRequest,
  updateMemberRequestStatus,
  getMemberRequest,
  listMemberRequests,
};
