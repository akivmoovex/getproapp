"use strict";

/**
 * Platform-admin registration applications list/detail and follow-up actions.
 * Does not provision, retry, or change organization operational status.
 */

const repo = require("../repositories/platformChurchRegistrationRepository");
const {
  recordAuditEventSafe,
  listOrganizationAuditEvents,
} = require("../../platform/services/auditEventService");
const { getPlatformDeploymentCode } = require("../../platform/config/platformDeploymentCode");

const STATUS = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  NOT_FOUND: "not_found",
  FORBIDDEN: "forbidden",
  LOOKUP_ERROR: "lookup_error",
  NOT_PROVISIONED: "not_provisioned",
});

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;
const ALLOWED_LIMITS = Object.freeze([10, 25, 50, 100]);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function sanitizeProvisioningErrorDetail(raw) {
  const s = String(raw || "")
    .replace(/postgresql:\/\/\S+/gi, "[redacted]")
    .replace(/password[^\s]*/gi, "[redacted]")
    .replace(/connection\s+string[^\n]*/gi, "[redacted]")
    .replace(/stack\s*trace[^\n]*/gi, "[redacted]")
    .replace(/\b(SELECT|INSERT|UPDATE|DELETE|FROM|WHERE)\b[\s\S]{0,200}/gi, "[sql redacted]")
    .slice(0, 240);
  return s || null;
}

function needsAttention(row) {
  const app = String(row.application_status || "");
  const prov = String(row.provisioning_status || "");
  const follow = String(row.follow_up_status || "");
  if (app === "submitted" || app === "duplicate_review") return true;
  if (prov === "provisioning_failed") return true;
  if (follow === "new" || follow === "call_pending" || follow === "needs_help") return true;
  return false;
}

function mapListRow(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    churchName: String(row.church_name || ""),
    contactName: String(row.contact_name || ""),
    contactEmail: String(row.contact_email || ""),
    contactPhone: row.contact_phone != null ? String(row.contact_phone) : "",
    country: String(row.country || ""),
    city: String(row.city || ""),
    selectedPlan: row.selected_plan != null ? String(row.selected_plan) : null,
    createdAt: row.created_at,
    applicationStatus: String(row.application_status || ""),
    provisioningStatus: String(row.provisioning_status || ""),
    legacyStatus: row.legacy_status != null ? String(row.legacy_status) : null,
    organizationId: row.organization_id != null ? String(row.organization_id) : null,
    organizationKey: row.organization_key != null ? String(row.organization_key) : null,
    organizationDisplayName:
      row.organization_display_name != null ? String(row.organization_display_name) : null,
    organizationStatus: row.organization_status != null ? String(row.organization_status) : null,
    followUpStatus: row.follow_up_status != null ? String(row.follow_up_status) : null,
    assignedSupportDisplayName:
      row.support_display_name != null ? String(row.support_display_name) : null,
    assignedSupportEmail: row.support_email != null ? String(row.support_email) : null,
    lastContactedAt: row.last_contacted_at || null,
    attention: needsAttention(row),
  };
}

/**
 * @param {object} input
 */
function normalizeListFilters(input) {
  const raw = input && typeof input === "object" ? input : {};
  let page = Number.parseInt(String(raw.page != null ? raw.page : "1"), 10);
  if (!Number.isFinite(page) || page < 1) page = 1;
  if (page > 10000) page = 10000;

  let limit = Number.parseInt(String(raw.limit != null ? raw.limit : String(DEFAULT_LIMIT)), 10);
  if (!Number.isFinite(limit) || limit < 1) limit = DEFAULT_LIMIT;
  if (limit > MAX_LIMIT) {
    limit = MAX_LIMIT;
  } else if (!ALLOWED_LIMITS.includes(limit)) {
    let best = ALLOWED_LIMITS[0];
    let bestDist = Math.abs(limit - best);
    for (const allowed of ALLOWED_LIMITS) {
      const dist = Math.abs(limit - allowed);
      if (dist < bestDist) {
        best = allowed;
        bestDist = dist;
      }
    }
    limit = best;
  }

  const applicationStatus = String(raw.application_status || raw.applicationStatus || "")
    .trim()
    .toLowerCase();
  const provisioningStatus = String(raw.provisioning_status || raw.provisioningStatus || "")
    .trim()
    .toLowerCase();
  const followUpStatus = String(raw.follow_up_status || raw.followUpStatus || "")
    .trim()
    .toLowerCase();
  let linked = String(raw.linked || "all")
    .trim()
    .toLowerCase();
  if (!repo.LINKED_FILTERS.includes(linked)) linked = "all";

  let search = null;
  if (raw.q != null && String(raw.q).trim() !== "") {
    search = String(raw.q).trim().slice(0, 120).toLowerCase();
  }

  let createdFrom = null;
  let createdToExclusive = null;
  const fromRaw = String(raw.from || raw.created_from || "").trim();
  const toRaw = String(raw.to || raw.created_to || "").trim();
  if (fromRaw) {
    if (!DATE_RE.test(fromRaw)) {
      return { ok: false, reason: "from" };
    }
    createdFrom = `${fromRaw}T00:00:00.000Z`;
  }
  if (toRaw) {
    if (!DATE_RE.test(toRaw)) {
      return { ok: false, reason: "to" };
    }
    const d = new Date(`${toRaw}T00:00:00.000Z`);
    if (Number.isNaN(d.getTime())) return { ok: false, reason: "to" };
    d.setUTCDate(d.getUTCDate() + 1);
    createdToExclusive = d.toISOString();
  }

  return {
    ok: true,
    value: {
      page,
      limit,
      offset: (page - 1) * limit,
      applicationStatus: repo.APPLICATION_STATUSES.includes(applicationStatus)
        ? applicationStatus
        : null,
      provisioningStatus: repo.PROVISIONING_STATUSES.includes(provisioningStatus)
        ? provisioningStatus
        : null,
      followUpStatus: repo.FOLLOW_UP_STATUSES.includes(followUpStatus) ? followUpStatus : null,
      linked,
      search,
      createdFrom,
      createdToExclusive,
      sort: "created_desc",
    },
  };
}

/**
 * @param {{ query: Function }} db
 * @param {object} input
 */
async function listRegistrationApplicationsAdmin(db, input) {
  const normalized = normalizeListFilters(input);
  if (!normalized.ok) {
    return {
      ok: false,
      status: STATUS.INVALID_INPUT,
      message: `invalid_input:${normalized.reason}`,
      applications: [],
      page: 1,
      limit: DEFAULT_LIMIT,
      total: 0,
      totalPages: 0,
      filters: {},
    };
  }
  if (!db || typeof db.query !== "function") {
    return {
      ok: false,
      status: STATUS.LOOKUP_ERROR,
      message: "database required",
      applications: [],
      page: 1,
      limit: DEFAULT_LIMIT,
      total: 0,
      totalPages: 0,
      filters: {},
    };
  }

  try {
    const filters = normalized.value;
    const [rows, total] = await Promise.all([
      repo.listRegistrationApplications(db, filters),
      repo.countRegistrationApplications(db, filters),
    ]);
    const totalPages = total === 0 ? 0 : Math.ceil(total / filters.limit);
    return {
      ok: true,
      status: STATUS.OK,
      applications: (rows || []).map(mapListRow).filter(Boolean),
      page: filters.page,
      limit: filters.limit,
      total,
      totalPages,
      filters: {
        applicationStatus: filters.applicationStatus || "",
        provisioningStatus: filters.provisioningStatus || "",
        followUpStatus: filters.followUpStatus || "",
        linked: filters.linked,
        q: filters.search || "",
        from: input && (input.from || input.created_from) ? String(input.from || input.created_from) : "",
        to: input && (input.to || input.created_to) ? String(input.to || input.created_to) : "",
      },
    };
  } catch {
    return {
      ok: false,
      status: STATUS.LOOKUP_ERROR,
      message: "lookup_error",
      applications: [],
      page: 1,
      limit: DEFAULT_LIMIT,
      total: 0,
      totalPages: 0,
      filters: {},
    };
  }
}

/**
 * @param {{ query: Function }} db
 * @param {string} applicationId
 * @param {NodeJS.ProcessEnv} [env]
 */
async function getRegistrationApplicationDetail(db, applicationId, env) {
  const id = String(applicationId || "").trim();
  if (!UUID_RE.test(id)) {
    return { ok: false, status: STATUS.INVALID_INPUT, message: "invalid_input" };
  }
  if (!db || typeof db.query !== "function") {
    return { ok: false, status: STATUS.LOOKUP_ERROR, message: "database required" };
  }

  try {
    const row = await repo.getRegistrationApplicationById(db, id);
    if (!row) {
      return { ok: false, status: STATUS.NOT_FOUND, message: "not_found" };
    }

    const listMapped = mapListRow(row);
    const organizationId = row.organization_id ? String(row.organization_id) : null;
    let planKey = null;
    let publication = { draftPages: 0, publishedPages: 0 };
    let contacts = [];
    let auditEvents = [];
    let platformAdmins = [];

    if (organizationId) {
      const [plan, pub, contactRows, admins] = await Promise.all([
        repo.getOrganizationCurrentPlanKey(db, organizationId),
        repo.getOrganizationPublicationSummary(db, organizationId),
        repo.listOrganizationSupportContacts(db, organizationId, { limit: 50 }),
        repo.listActivePlatformAdministrators(db),
      ]);
      planKey = plan;
      publication = pub;
      contacts = (contactRows || []).map((c) => ({
        id: String(c.id),
        contactMethod: String(c.contact_method),
        outcome: String(c.outcome),
        note: String(c.note || ""),
        contactedAt: c.contacted_at,
        nextFollowUpAt: c.next_follow_up_at,
        createdAt: c.created_at,
        createdByDisplayName: c.created_by_display_name != null ? String(c.created_by_display_name) : "",
        createdByEmail: c.created_by_email != null ? String(c.created_by_email) : "",
      }));
      platformAdmins = (admins || []).map((u) => ({
        id: String(u.id),
        displayName: String(u.display_name || ""),
        email: String(u.email_normalized || ""),
      }));

      const audit = await listOrganizationAuditEvents(db, {
        organizationId,
        actionCategory: "registration",
        limit: 20,
      });
      if (audit.ok) {
        auditEvents = (audit.events || []).map((e) => ({
          actionKey: e.actionKey,
          outcome: e.outcome,
          createdAt: e.createdAt,
          entityType: e.entityType,
          metadata: e.metadataJson || {},
        }));
      }
    } else {
      platformAdmins = [];
    }

    const errorCode = row.provisioning_error_code
      ? String(row.provisioning_error_code).slice(0, 120)
      : null;
    const errorSummary = sanitizeProvisioningErrorDetail(row.provisioning_error_detail);

    return {
      ok: true,
      status: STATUS.OK,
      application: {
        ...listMapped,
        roleInChurch: row.role_in_church != null ? String(row.role_in_church) : null,
        branchName: row.branch_name != null ? String(row.branch_name) : null,
        branchCount: row.branch_count != null ? String(row.branch_count) : null,
        message: row.registration_message != null ? String(row.registration_message) : null,
        consentTerms: Boolean(row.consent_terms),
        provisioningStartedAt: row.provisioning_started_at,
        provisionedAt: row.provisioned_at,
        provisioningFailedAt: row.provisioning_failed_at,
        provisioningErrorCode: errorCode,
        provisioningErrorSummary: errorSummary,
        retryAllowedNote:
          String(row.provisioning_status) === "provisioning_failed"
            ? "Automatic retry is not available from this screen yet."
            : null,
        onboardingStatus: row.onboarding_status != null ? String(row.onboarding_status) : null,
        supportRequested: Boolean(row.support_requested),
        firstContactedAt: row.first_contacted_at,
        nextFollowUpAt: row.next_follow_up_at,
        onboardingCompletedAt: row.onboarding_completed_at,
        lastActivityAt: row.last_activity_at,
        organizationCreatedAt: row.organization_created_at,
        assignedSupportUserId: row.assigned_support_user_id
          ? String(row.assigned_support_user_id)
          : null,
        planKey,
        publication,
        followUpAvailable: Boolean(organizationId),
        supportAssignmentAvailable: Boolean(organizationId),
        contactHistoryAvailable: Boolean(organizationId),
      },
      contacts,
      auditEvents,
      platformAdmins,
      followUpStatuses: repo.FOLLOW_UP_STATUSES,
      contactMethods: repo.CONTACT_METHODS,
      contactOutcomes: repo.CONTACT_OUTCOMES,
      deploymentCode: (() => {
        const d = getPlatformDeploymentCode(env || process.env);
        return d && d.ok ? d.code : "blessboard-org-v5";
      })(),
    };
  } catch {
    return { ok: false, status: STATUS.LOOKUP_ERROR, message: "lookup_error" };
  }
}

async function withOwnedClient(db, fn) {
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

/**
 * @param {{ query: Function, connect?: Function }} db
 * @param {{
 *   applicationId: string,
 *   followUpStatus: string,
 *   actorUserId: string,
 *   deploymentCode?: string,
 * }} input
 */
async function updateRegistrationFollowUpStatus(db, input) {
  const applicationId = String((input && input.applicationId) || "").trim();
  const followUpStatus = String((input && input.followUpStatus) || "")
    .trim()
    .toLowerCase();
  const actorUserId = String((input && input.actorUserId) || "").trim();
  if (!UUID_RE.test(applicationId) || !UUID_RE.test(actorUserId)) {
    return { ok: false, status: STATUS.INVALID_INPUT, message: "invalid_input" };
  }
  if (!repo.FOLLOW_UP_STATUSES.includes(followUpStatus)) {
    return { ok: false, status: STATUS.INVALID_INPUT, message: "invalid_follow_up_status" };
  }

  try {
    return await withOwnedClient(db, async (client) => {
      await client.query("BEGIN");
      try {
        const app = await repo.lockApplicationById(client, applicationId);
        if (!app) {
          await client.query("ROLLBACK");
          return { ok: false, status: STATUS.NOT_FOUND, message: "not_found" };
        }
        if (!app.organization_id || String(app.provisioning_status) !== "provisioned") {
          await client.query("ROLLBACK");
          return {
            ok: false,
            status: STATUS.NOT_PROVISIONED,
            message: "follow_up_requires_provisioned_organization",
          };
        }
        const organizationId = String(app.organization_id);
        let onboarding = await repo.ensureOrganizationOnboardingRow(client, {
          organizationId,
          applicationId,
        });
        const fromStatus = onboarding ? String(onboarding.follow_up_status || "") : null;
        onboarding = await repo.updateOrganizationOnboarding(client, organizationId, {
          followUpStatus,
          lastActivityAt: new Date().toISOString(),
        });
        await recordAuditEventSafe(client, {
          deploymentCode: input.deploymentCode || "blessboard-org-v5",
          organizationId,
          actorUserId,
          outcome: "success",
          actionKey: "registration.follow_up_status_updated",
          entityType: "organization_onboarding",
          entityId: organizationId,
          metadata: {
            category: "registration",
            from_status: fromStatus || undefined,
            to_status: followUpStatus,
            actor_type: "platform_admin",
            source: "admin_registration_applications",
          },
        });
        await client.query("COMMIT");
        return { ok: true, status: STATUS.OK, followUpStatus, fromStatus };
      } catch (err) {
        try {
          await client.query("ROLLBACK");
        } catch {
          /* ignore */
        }
        throw err;
      }
    });
  } catch {
    return { ok: false, status: STATUS.LOOKUP_ERROR, message: "lookup_error" };
  }
}

/**
 * @param {{ query: Function, connect?: Function }} db
 * @param {{
 *   applicationId: string,
 *   supportUserId: string|null,
 *   actorUserId: string,
 *   deploymentCode?: string,
 * }} input
 */
async function assignRegistrationSupport(db, input) {
  const applicationId = String((input && input.applicationId) || "").trim();
  const actorUserId = String((input && input.actorUserId) || "").trim();
  const rawSupport =
    input && input.supportUserId != null && String(input.supportUserId).trim() !== ""
      ? String(input.supportUserId).trim()
      : null;
  if (!UUID_RE.test(applicationId) || !UUID_RE.test(actorUserId)) {
    return { ok: false, status: STATUS.INVALID_INPUT, message: "invalid_input" };
  }
  if (rawSupport && !UUID_RE.test(rawSupport)) {
    return { ok: false, status: STATUS.INVALID_INPUT, message: "invalid_support_user" };
  }

  try {
    return await withOwnedClient(db, async (client) => {
      await client.query("BEGIN");
      try {
        const app = await repo.lockApplicationById(client, applicationId);
        if (!app) {
          await client.query("ROLLBACK");
          return { ok: false, status: STATUS.NOT_FOUND, message: "not_found" };
        }
        if (!app.organization_id || String(app.provisioning_status) !== "provisioned") {
          await client.query("ROLLBACK");
          return {
            ok: false,
            status: STATUS.NOT_PROVISIONED,
            message: "assignment_requires_provisioned_organization",
          };
        }
        const organizationId = String(app.organization_id);
        await repo.ensureOrganizationOnboardingRow(client, {
          organizationId,
          applicationId,
        });

        if (rawSupport) {
          const admins = await repo.listActivePlatformAdministrators(client);
          const allowed = admins.some((u) => String(u.id) === rawSupport);
          if (!allowed) {
            await client.query("ROLLBACK");
            return { ok: false, status: STATUS.FORBIDDEN, message: "not_platform_admin" };
          }
        }

        await repo.updateOrganizationOnboarding(client, organizationId, {
          assignedSupportUserId: rawSupport,
          clearAssignedSupport: !rawSupport,
          lastActivityAt: new Date().toISOString(),
        });

        await recordAuditEventSafe(client, {
          deploymentCode: input.deploymentCode || "blessboard-org-v5",
          organizationId,
          actorUserId,
          outcome: "success",
          actionKey: "registration.support_assigned",
          entityType: "organization_onboarding",
          entityId: organizationId,
          metadata: {
            category: "registration",
            status: rawSupport ? "assigned" : "unassigned",
            actor_type: "platform_admin",
            source: "admin_registration_applications",
          },
        });
        await client.query("COMMIT");
        return { ok: true, status: STATUS.OK, supportUserId: rawSupport };
      } catch (err) {
        try {
          await client.query("ROLLBACK");
        } catch {
          /* ignore */
        }
        throw err;
      }
    });
  } catch {
    return { ok: false, status: STATUS.LOOKUP_ERROR, message: "lookup_error" };
  }
}

/**
 * @param {{ query: Function, connect?: Function }} db
 * @param {{
 *   applicationId: string,
 *   actorUserId: string,
 *   contactMethod: string,
 *   outcome: string,
 *   note: string,
 *   followUpStatus?: string|null,
 *   nextFollowUpAt?: string|null,
 *   deploymentCode?: string,
 * }} input
 */
async function addRegistrationSupportContact(db, input) {
  const applicationId = String((input && input.applicationId) || "").trim();
  const actorUserId = String((input && input.actorUserId) || "").trim();
  const contactMethod = String((input && input.contactMethod) || "")
    .trim()
    .toLowerCase();
  const outcome = String((input && input.outcome) || "")
    .trim()
    .toLowerCase();
  const note = String((input && input.note) || "").trim();
  if (!UUID_RE.test(applicationId) || !UUID_RE.test(actorUserId)) {
    return { ok: false, status: STATUS.INVALID_INPUT, message: "invalid_input" };
  }
  if (!repo.CONTACT_METHODS.includes(contactMethod)) {
    return { ok: false, status: STATUS.INVALID_INPUT, message: "invalid_contact_method" };
  }
  if (!repo.CONTACT_OUTCOMES.includes(outcome)) {
    return { ok: false, status: STATUS.INVALID_INPUT, message: "invalid_outcome" };
  }
  if (note.length < 1 || note.length > 2000) {
    return { ok: false, status: STATUS.INVALID_INPUT, message: "invalid_note" };
  }

  let nextFollowUpAt = null;
  if (input.nextFollowUpAt != null && String(input.nextFollowUpAt).trim() !== "") {
    const raw = String(input.nextFollowUpAt).trim();
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) {
      return { ok: false, status: STATUS.INVALID_INPUT, message: "invalid_next_follow_up" };
    }
    nextFollowUpAt = d.toISOString();
  }

  let followUpStatus = null;
  if (input.followUpStatus != null && String(input.followUpStatus).trim() !== "") {
    followUpStatus = String(input.followUpStatus).trim().toLowerCase();
    if (!repo.FOLLOW_UP_STATUSES.includes(followUpStatus)) {
      return { ok: false, status: STATUS.INVALID_INPUT, message: "invalid_follow_up_status" };
    }
  }

  try {
    return await withOwnedClient(db, async (client) => {
      await client.query("BEGIN");
      try {
        const app = await repo.lockApplicationById(client, applicationId);
        if (!app) {
          await client.query("ROLLBACK");
          return { ok: false, status: STATUS.NOT_FOUND, message: "not_found" };
        }
        if (!app.organization_id) {
          await client.query("ROLLBACK");
          return {
            ok: false,
            status: STATUS.NOT_PROVISIONED,
            message: "contact_requires_linked_organization",
          };
        }
        const organizationId = String(app.organization_id);
        const onboarding = await repo.ensureOrganizationOnboardingRow(client, {
          organizationId,
          applicationId,
        });
        const nowIso = new Date().toISOString();
        const contact = await repo.createOrganizationSupportContact(client, {
          organizationId,
          registrationApplicationId: applicationId,
          createdByUserId: actorUserId,
          contactMethod,
          outcome,
          note,
          contactedAt: null,
          nextFollowUpAt,
        });

        const firstContactedAt =
          onboarding && onboarding.first_contacted_at ? null : nowIso;
        await repo.updateOrganizationOnboarding(client, organizationId, {
          followUpStatus: followUpStatus || undefined,
          firstContactedAt,
          lastContactedAt: nowIso,
          nextFollowUpAt,
          lastActivityAt: nowIso,
        });

        await recordAuditEventSafe(client, {
          deploymentCode: input.deploymentCode || "blessboard-org-v5",
          organizationId,
          actorUserId,
          outcome: "success",
          actionKey: "registration.support_contact_added",
          entityType: "organization_support_contact",
          entityId: contact.id,
          metadata: {
            category: "registration",
            reason_code: contactMethod,
            status: outcome,
            actor_type: "platform_admin",
            source: "admin_registration_applications",
            // note intentionally omitted
          },
        });
        await client.query("COMMIT");
        return { ok: true, status: STATUS.OK, contactId: String(contact.id) };
      } catch (err) {
        try {
          await client.query("ROLLBACK");
        } catch {
          /* ignore */
        }
        throw err;
      }
    });
  } catch {
    return { ok: false, status: STATUS.LOOKUP_ERROR, message: "lookup_error" };
  }
}

module.exports = {
  STATUS,
  DEFAULT_LIMIT,
  MAX_LIMIT,
  ALLOWED_LIMITS,
  normalizeListFilters,
  listRegistrationApplicationsAdmin,
  getRegistrationApplicationDetail,
  updateRegistrationFollowUpStatus,
  assignRegistrationSupport,
  addRegistrationSupportContact,
  sanitizeProvisioningErrorDetail,
  needsAttention,
};
