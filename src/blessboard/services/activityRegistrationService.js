"use strict";

/**
 * BlessBoard V8 activity registration (BB08–BB10).
 * Visitor / event / ministry public registration via shared tenant forms.
 * Never grants privileged ministry roles automatically.
 */

const crypto = require("crypto");
const tenantFormService = require("../../platform/forms/tenantFormService");
const formRepo = require("../../platform/forms/tenantFormRepository");

const STATUS = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  NOT_FOUND: "not_found",
  FORBIDDEN: "forbidden",
  CONFLICT: "conflict",
  POLICY: "policy",
  CAPACITY_FULL: "capacity_full",
  LOOKUP_ERROR: "lookup_error",
});

const ACTIVITY_KINDS = Object.freeze(["visitor", "event", "ministry"]);

const DEFAULT_SCHEMAS = Object.freeze({
  visitor: {
    version: 1,
    fields: [
      { key: "full_name", type: "text", label: "Full name", required: true, maxLength: 120 },
      { key: "email", type: "email", label: "Email", required: true },
      { key: "phone", type: "phone", label: "Phone", required: false },
      { key: "visit_date", type: "date", label: "Planned visit date", required: false },
      {
        key: "message",
        type: "textarea",
        label: "Anything we should know?",
        required: false,
        maxLength: 1000,
      },
    ],
  },
  event: {
    version: 1,
    fields: [
      { key: "full_name", type: "text", label: "Full name", required: true, maxLength: 120 },
      { key: "email", type: "email", label: "Email", required: true },
      { key: "phone", type: "phone", label: "Phone", required: false },
      {
        key: "guests",
        type: "number",
        label: "Number of guests (including you)",
        required: false,
      },
      {
        key: "notes",
        type: "textarea",
        label: "Notes",
        required: false,
        maxLength: 500,
      },
    ],
  },
  ministry: {
    version: 1,
    fields: [
      { key: "full_name", type: "text", label: "Full name", required: true, maxLength: 120 },
      { key: "email", type: "email", label: "Email", required: true },
      { key: "phone", type: "phone", label: "Phone", required: false },
      {
        key: "interest",
        type: "textarea",
        label: "Why do you want to serve?",
        required: false,
        maxLength: 1000,
      },
      {
        key: "availability",
        type: "text",
        label: "Availability",
        required: false,
        maxLength: 200,
      },
    ],
  },
});

function stitchForKind(kind) {
  if (kind === "visitor") return "BB08";
  if (kind === "event") return "BB09";
  if (kind === "ministry") return "BB10";
  return "BB08";
}

async function withClient(db, fn) {
  if (db && typeof db.connect === "function") {
    const client = await db.connect();
    try {
      return await fn(client);
    } finally {
      client.release();
    }
  }
  return fn(db);
}

function allowManage(authz) {
  return async (action) => {
    if (typeof authz === "function") return authz(action);
    if (authz === true) return { ok: true };
    return { ok: false, reason: "forbidden" };
  };
}

/**
 * Publish (or create+publish) an activity registration form linked to a resource.
 */
async function publishActivityRegistrationForm(db, input) {
  const kind = String((input && input.kind) || "").trim().toLowerCase();
  if (!ACTIVITY_KINDS.includes(kind)) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "kind" };
  }
  const organizationId = String((input && input.organizationId) || "").trim();
  const productCode = "blessboard";
  if (!organizationId) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "organization_id" };
  }

  let linkedResourceType = kind === "visitor" ? "visitor" : kind;
  let linkedResourceId = null;
  let maxSubmissions =
    input.maxSubmissions != null && Number(input.maxSubmissions) > 0
      ? Number(input.maxSubmissions)
      : null;
  let title = String(input.title || "").trim();
  let branchId = input.branchId || null;

  try {
    return await withClient(db, async (client) => {
      if (kind === "event") {
        const eventId = String(input.eventId || "").trim();
        if (!eventId) return { ok: false, status: STATUS.INVALID_INPUT, reason: "event_id" };
        const { rows } = await client.query(
          `SELECT e.id, e.title, e.status, e.capacity, e.church_id, e.branch_id,
                  c.organization_id
             FROM blessboard.events e
             INNER JOIN blessboard.churches c ON c.id = e.church_id
            WHERE e.id = $1
            LIMIT 1`,
          [eventId]
        );
        const event = rows[0];
        if (!event) return { ok: false, status: STATUS.NOT_FOUND, reason: "event_not_found" };
        if (String(event.organization_id) !== organizationId) {
          return { ok: false, status: STATUS.FORBIDDEN, reason: "church_isolation" };
        }
        if (event.status !== "published") {
          return { ok: false, status: STATUS.POLICY, reason: "event_not_published" };
        }
        linkedResourceId = event.id;
        if (!title) title = `Register · ${event.title}`;
        if (maxSubmissions == null && event.capacity != null) {
          maxSubmissions = Number(event.capacity);
        }
        branchId = branchId || event.branch_id || null;
      } else if (kind === "ministry") {
        const ministryId = String(input.ministryId || "").trim();
        if (!ministryId) return { ok: false, status: STATUS.INVALID_INPUT, reason: "ministry_id" };
        const { rows } = await client.query(
          `SELECT m.id, m.name, m.status, m.church_id, m.branch_id, c.organization_id
             FROM blessboard.ministries m
             INNER JOIN blessboard.churches c ON c.id = m.church_id
            WHERE m.id = $1
            LIMIT 1`,
          [ministryId]
        );
        const ministry = rows[0];
        if (!ministry) return { ok: false, status: STATUS.NOT_FOUND, reason: "ministry_not_found" };
        if (String(ministry.organization_id) !== organizationId) {
          return { ok: false, status: STATUS.FORBIDDEN, reason: "church_isolation" };
        }
        if (ministry.status !== "published") {
          return { ok: false, status: STATUS.POLICY, reason: "ministry_not_published" };
        }
        linkedResourceId = ministry.id;
        if (!title) title = `Serve · ${ministry.name}`;
        branchId = branchId || ministry.branch_id || null;
      } else {
        const churchId = String(input.churchId || "").trim();
        if (!churchId) return { ok: false, status: STATUS.INVALID_INPUT, reason: "church_id" };
        const { rows } = await client.query(
          `SELECT id, organization_id, display_name FROM blessboard.churches WHERE id = $1`,
          [churchId]
        );
        const church = rows[0];
        if (!church) return { ok: false, status: STATUS.NOT_FOUND, reason: "church_not_found" };
        if (String(church.organization_id) !== organizationId) {
          return { ok: false, status: STATUS.FORBIDDEN, reason: "church_isolation" };
        }
        linkedResourceId = church.id;
        if (!title) title = `Plan a visit · ${church.display_name || "Church"}`;
      }

      const formKey =
        String(input.formKey || "").trim().toLowerCase() ||
        `${kind}_${crypto.randomBytes(3).toString("hex")}`;

      const created = await tenantFormService.createForm(db, {
        organizationId,
        productCode,
        formKey,
        title,
        description: input.description || null,
        category: kind,
        schemaJson: input.schemaJson || DEFAULT_SCHEMAS[kind],
        accessMode: "open_public",
        actorIdentityId: input.actorIdentityId || null,
        authz: allowManage(input.authz),
        branchId,
        requireConsent: true,
        linkedResourceType,
        linkedResourceId,
        maxSubmissions,
      });
      if (!created.ok) return created;

      const published = await tenantFormService.publishForm(db, {
        organizationId,
        productCode,
        formId: created.form.id,
        actorIdentityId: input.actorIdentityId || null,
        authz: allowManage(input.authz),
      });
      if (!published.ok) return published;

      return {
        ok: true,
        status: STATUS.OK,
        form: published.form,
        stitchScreen: stitchForKind(kind),
      };
    });
  } catch (err) {
    return {
      ok: false,
      status: STATUS.LOOKUP_ERROR,
      reason: err && err.message ? String(err.message).slice(0, 120) : "error",
    };
  }
}

async function closeActivityRegistration(db, input) {
  const organizationId = String((input && input.organizationId) || "").trim();
  const formId = String((input && input.formId) || "").trim();
  if (!organizationId || !formId) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "ids" };
  }
  try {
    return await withClient(db, async (client) => {
      const form = await formRepo.updateForm(client, {
        id: formId,
        organizationId,
        productCode: "blessboard",
        registrationClosed: true,
        updatedByIdentityId: input.actorIdentityId || null,
      });
      if (!form) return { ok: false, status: STATUS.NOT_FOUND, reason: "not_found" };
      return { ok: true, status: STATUS.OK, form };
    });
  } catch {
    return { ok: false, status: STATUS.LOOKUP_ERROR, reason: "lookup" };
  }
}

async function getPublishedActivityForm(db, input) {
  const organizationId = String((input && input.organizationId) || "").trim();
  const kind = String((input && input.kind) || "").trim().toLowerCase();
  if (!organizationId || !ACTIVITY_KINDS.includes(kind)) {
    return { ok: false, status: STATUS.INVALID_INPUT, form: null };
  }
  let linkedResourceId = null;
  if (kind === "visitor") linkedResourceId = String(input.churchId || "").trim();
  if (kind === "event") linkedResourceId = String(input.eventId || "").trim();
  if (kind === "ministry") linkedResourceId = String(input.ministryId || "").trim();
  if (!linkedResourceId) {
    return { ok: false, status: STATUS.INVALID_INPUT, form: null };
  }

  try {
    return await withClient(db, async (client) => {
      if (kind === "event") {
        const { rows } = await client.query(
          `SELECT e.id, e.status, e.capacity, e.title, e.branch_id, c.organization_id
             FROM blessboard.events e
             INNER JOIN blessboard.churches c ON c.id = e.church_id
            WHERE e.id = $1 LIMIT 1`,
          [linkedResourceId]
        );
        const event = rows[0];
        if (!event || String(event.organization_id) !== organizationId) {
          return { ok: false, status: STATUS.NOT_FOUND, form: null };
        }
        if (event.status !== "published") {
          return { ok: false, status: STATUS.POLICY, form: null, reason: "event_closed" };
        }
      }
      if (kind === "ministry") {
        const { rows } = await client.query(
          `SELECT m.id, m.status, m.name, c.organization_id
             FROM blessboard.ministries m
             INNER JOIN blessboard.churches c ON c.id = m.church_id
            WHERE m.id = $1 LIMIT 1`,
          [linkedResourceId]
        );
        const ministry = rows[0];
        if (!ministry || String(ministry.organization_id) !== organizationId) {
          return { ok: false, status: STATUS.NOT_FOUND, form: null };
        }
        if (ministry.status !== "published") {
          return { ok: false, status: STATUS.POLICY, form: null, reason: "ministry_closed" };
        }
      }

      const form = await formRepo.getPublishedFormByLinkedResource(client, {
        organizationId,
        productCode: "blessboard",
        linkedResourceType: kind === "visitor" ? "visitor" : kind,
        linkedResourceId,
      });
      if (!form) return { ok: false, status: STATUS.NOT_FOUND, form: null };
      if (form.registrationClosed) {
        return { ok: false, status: STATUS.POLICY, form, reason: "registration_closed" };
      }

      let spotsRemaining = null;
      if (form.maxSubmissions != null) {
        const open = await formRepo.countOpenSubmissions(client, { formId: form.id });
        spotsRemaining = Math.max(0, form.maxSubmissions - open);
      }

      return {
        ok: true,
        status: STATUS.OK,
        form,
        spotsRemaining,
        stitchScreen: stitchForKind(kind),
      };
    });
  } catch {
    return { ok: false, status: STATUS.LOOKUP_ERROR, form: null };
  }
}

async function submitActivityRegistration(db, input) {
  const kind = String((input && input.kind) || "").trim().toLowerCase();
  const organizationId = String((input && input.organizationId) || "").trim();

  try {
    if (kind === "event" && input.eventId) {
      const gate = await withClient(db, async (client) => {
        const { rows } = await client.query(
          `SELECT e.id, e.status, e.capacity, c.organization_id
             FROM blessboard.events e
             INNER JOIN blessboard.churches c ON c.id = e.church_id
            WHERE e.id = $1 LIMIT 1`,
          [input.eventId]
        );
        const event = rows[0];
        if (!event) return { ok: false, status: STATUS.NOT_FOUND, reason: "event_not_found" };
        if (organizationId && String(event.organization_id) !== organizationId) {
          return { ok: false, status: STATUS.FORBIDDEN, reason: "church_isolation" };
        }
        if (event.status !== "published") {
          return { ok: false, status: STATUS.POLICY, reason: "event_closed" };
        }
        if (event.capacity != null) {
          const form = await formRepo.getPublishedFormByLinkedResource(client, {
            organizationId: event.organization_id,
            productCode: "blessboard",
            linkedResourceType: "event",
            linkedResourceId: event.id,
          });
          if (form) {
            const open = await formRepo.countOpenSubmissions(client, { formId: form.id });
            if (open >= Number(event.capacity)) {
              return { ok: false, status: STATUS.CAPACITY_FULL, reason: "capacity_full" };
            }
          }
        }
        return { ok: true };
      });
      if (!gate.ok) return gate;
    }
  } catch {
    return { ok: false, status: STATUS.LOOKUP_ERROR, reason: "lookup" };
  }

  const result = await tenantFormService.submitPublicForm(db, {
    productCode: "blessboard",
    publicToken: input.publicToken,
    email: input.email,
    answers: input.answers,
    consentAccepted: input.consentAccepted,
    idempotencyKey: input.idempotencyKey,
    clientIpHash: input.clientIpHash,
    branchId: input.branchId || null,
  });

  if (!result.ok) {
    if (result.reason === "capacity_full") {
      return { ...result, status: STATUS.CAPACITY_FULL };
    }
    return result;
  }

  return {
    ok: true,
    status: STATUS.OK,
    submission: result.submission,
    idempotentReplay: Boolean(result.idempotentReplay),
    loginCreated: false,
    ministryRoleGranted: false,
    stitchScreen: stitchForKind(kind || "visitor"),
  };
}

async function reviewActivityRegistration(db, input) {
  const reviewed = await tenantFormService.reviewFormSubmission(db, {
    organizationId: input.organizationId,
    productCode: "blessboard",
    formId: input.formId,
    submissionId: input.submissionId,
    reviewStatus: input.reviewStatus,
    internalNotes: input.internalNotes,
    actorIdentityId: input.actorIdentityId || null,
    authz: allowManage(input.authz),
  });
  if (!reviewed.ok) return reviewed;

  return {
    ok: true,
    status: STATUS.OK,
    submission: reviewed.submission,
    ministryRoleGranted: false,
    loginCreated: false,
  };
}

module.exports = {
  STATUS,
  ACTIVITY_KINDS,
  DEFAULT_SCHEMAS,
  stitchForKind,
  publishActivityRegistrationForm,
  closeActivityRegistration,
  getPublishedActivityForm,
  submitActivityRegistration,
  reviewActivityRegistration,
};
