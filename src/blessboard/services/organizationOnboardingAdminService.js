"use strict";

/**
 * Platform-admin onboarding/support actions scoped by organization_key.
 * Resolves organization id server-side; does not change org operational status.
 */

const repo = require("../repositories/platformChurchRegistrationRepository");
const { recordAuditEventSafe } = require("../../platform/services/auditEventService");
const {
  ONBOARDING_STATUSES,
} = require("./organizationOnboardingSummaryService");

const STATUS = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  NOT_FOUND: "not_found",
  FORBIDDEN: "forbidden",
  LOOKUP_ERROR: "lookup_error",
  NOT_BLESSBOARD: "not_blessboard",
});

const ORG_KEY_RE = /^[a-z][a-z0-9_-]{0,63}$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
 * @param {{ query: Function }} client
 * @param {string} organizationKey
 */
async function resolveBlessBoardOrganization(client, organizationKey) {
  const key = String(organizationKey || "")
    .trim()
    .toLowerCase();
  if (!ORG_KEY_RE.test(key)) {
    return { ok: false, status: STATUS.INVALID_INPUT, message: "invalid_organization_key" };
  }
  const organizationId = await repo.findOrganizationIdByKey(client, key);
  if (!organizationId) {
    return { ok: false, status: STATUS.NOT_FOUND, message: "not_found" };
  }
  const church = await client.query(
    `SELECT id FROM blessboard.churches WHERE organization_id = $1 LIMIT 1`,
    [organizationId]
  );
  if (!church.rows[0]) {
    return {
      ok: false,
      status: STATUS.NOT_BLESSBOARD,
      message: "not_blessboard",
      organizationId,
      organizationKey: key,
    };
  }
  const applicationId = await repo.findApplicationIdForOrganization(client, organizationId);
  return {
    ok: true,
    organizationId,
    organizationKey: key,
    applicationId,
  };
}

/**
 * @param {{ query: Function, connect?: Function }} db
 * @param {{
 *   organizationKey: string,
 *   supportRequested: boolean,
 *   actorUserId: string,
 *   deploymentCode?: string,
 * }} input
 */
async function setOrganizationSupportRequested(db, input) {
  const actorUserId = String((input && input.actorUserId) || "").trim();
  if (!UUID_RE.test(actorUserId)) {
    return { ok: false, status: STATUS.INVALID_INPUT, message: "invalid_input" };
  }
  const requested = Boolean(input && input.supportRequested);

  try {
    return await withOwnedClient(db, async (client) => {
      await client.query("BEGIN");
      try {
        const resolved = await resolveBlessBoardOrganization(client, input.organizationKey);
        if (!resolved.ok) {
          await client.query("ROLLBACK");
          return resolved;
        }
        await repo.ensureOrganizationOnboardingRow(client, {
          organizationId: resolved.organizationId,
          applicationId: resolved.applicationId,
        });
        const before = await client.query(
          `SELECT support_requested FROM blessboard.organization_onboarding WHERE organization_id = $1`,
          [resolved.organizationId]
        );
        const fromValue = Boolean(before.rows[0] && before.rows[0].support_requested);
        await repo.updateOrganizationOnboarding(client, resolved.organizationId, {
          supportRequested: requested,
          lastActivityAt: new Date().toISOString(),
        });
        await recordAuditEventSafe(client, {
          deploymentCode: input.deploymentCode || "blessboard-org-v5",
          organizationId: resolved.organizationId,
          actorUserId,
          outcome: "success",
          actionKey: "onboarding.support_requested_updated",
          entityType: "organization_onboarding",
          entityId: resolved.organizationId,
          metadata: {
            category: "onboarding",
            from_status: fromValue ? "true" : "false",
            to_status: requested ? "true" : "false",
            actor_type: "platform_admin",
            source: "admin_organizations",
          },
        });
        await client.query("COMMIT");
        return { ok: true, status: STATUS.OK, supportRequested: requested };
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
 *   organizationKey: string,
 *   nextFollowUpAt: string|null,
 *   clear?: boolean,
 *   actorUserId: string,
 *   deploymentCode?: string,
 * }} input
 */
async function setOrganizationNextFollowUp(db, input) {
  const actorUserId = String((input && input.actorUserId) || "").trim();
  if (!UUID_RE.test(actorUserId)) {
    return { ok: false, status: STATUS.INVALID_INPUT, message: "invalid_input" };
  }

  const clear = Boolean(input && input.clear);
  let nextFollowUpAt = null;
  if (!clear) {
    const raw =
      input && input.nextFollowUpAt != null ? String(input.nextFollowUpAt).trim() : "";
    if (!raw) {
      return { ok: false, status: STATUS.INVALID_INPUT, message: "invalid_next_follow_up" };
    }
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) {
      return { ok: false, status: STATUS.INVALID_INPUT, message: "invalid_next_follow_up" };
    }
    if (d.getTime() <= Date.now()) {
      return { ok: false, status: STATUS.INVALID_INPUT, message: "next_follow_up_must_be_future" };
    }
    nextFollowUpAt = d.toISOString();
  }

  try {
    return await withOwnedClient(db, async (client) => {
      await client.query("BEGIN");
      try {
        const resolved = await resolveBlessBoardOrganization(client, input.organizationKey);
        if (!resolved.ok) {
          await client.query("ROLLBACK");
          return resolved;
        }
        await repo.ensureOrganizationOnboardingRow(client, {
          organizationId: resolved.organizationId,
          applicationId: resolved.applicationId,
        });
        const before = await client.query(
          `SELECT next_follow_up_at FROM blessboard.organization_onboarding WHERE organization_id = $1`,
          [resolved.organizationId]
        );
        const fromValue =
          before.rows[0] && before.rows[0].next_follow_up_at
            ? new Date(before.rows[0].next_follow_up_at).toISOString()
            : null;
        await repo.updateOrganizationOnboarding(client, resolved.organizationId, {
          nextFollowUpAt: clear ? null : nextFollowUpAt,
          lastActivityAt: new Date().toISOString(),
        });
        await recordAuditEventSafe(client, {
          deploymentCode: input.deploymentCode || "blessboard-org-v5",
          organizationId: resolved.organizationId,
          actorUserId,
          outcome: "success",
          actionKey: "onboarding.next_follow_up_updated",
          entityType: "organization_onboarding",
          entityId: resolved.organizationId,
          metadata: {
            category: "onboarding",
            from_status: fromValue || undefined,
            to_status: clear ? "cleared" : nextFollowUpAt,
            actor_type: "platform_admin",
            source: "admin_organizations",
          },
        });
        await client.query("COMMIT");
        return {
          ok: true,
          status: STATUS.OK,
          nextFollowUpAt: clear ? null : nextFollowUpAt,
        };
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
 * Explicit onboarding status override (complete / reopen / skip).
 * Does not change organization.status or follow_up_status.
 * @param {{ query: Function, connect?: Function }} db
 * @param {{
 *   organizationKey: string,
 *   onboardingStatus: string,
 *   reason?: string,
 *   actorUserId: string,
 *   deploymentCode?: string,
 * }} input
 */
async function overrideOrganizationOnboardingStatus(db, input) {
  const actorUserId = String((input && input.actorUserId) || "").trim();
  const onboardingStatus = String((input && input.onboardingStatus) || "")
    .trim()
    .toLowerCase();
  const reason = String((input && input.reason) || "")
    .trim()
    .slice(0, 500);
  if (!UUID_RE.test(actorUserId)) {
    return { ok: false, status: STATUS.INVALID_INPUT, message: "invalid_input" };
  }
  if (!ONBOARDING_STATUSES.includes(onboardingStatus)) {
    return { ok: false, status: STATUS.INVALID_INPUT, message: "invalid_onboarding_status" };
  }
  if (
    (onboardingStatus === "completed" || onboardingStatus === "skipped") &&
    reason.length < 3
  ) {
    return { ok: false, status: STATUS.INVALID_INPUT, message: "reason_required" };
  }

  try {
    return await withOwnedClient(db, async (client) => {
      await client.query("BEGIN");
      try {
        const resolved = await resolveBlessBoardOrganization(client, input.organizationKey);
        if (!resolved.ok) {
          await client.query("ROLLBACK");
          return resolved;
        }
        await repo.ensureOrganizationOnboardingRow(client, {
          organizationId: resolved.organizationId,
          applicationId: resolved.applicationId,
        });
        const before = await client.query(
          `SELECT onboarding_status, onboarding_completed_at, onboarding_started_at
             FROM blessboard.organization_onboarding WHERE organization_id = $1`,
          [resolved.organizationId]
        );
        const fromStatus =
          before.rows[0] && before.rows[0].onboarding_status
            ? String(before.rows[0].onboarding_status)
            : null;
        const nowIso = new Date().toISOString();
        const patch = {
          onboardingStatus,
          lastActivityAt: nowIso,
        };
        if (onboardingStatus === "in_progress" || onboardingStatus === "completed") {
          patch.onboardingStartedAt = nowIso;
        }
        if (onboardingStatus === "completed" || onboardingStatus === "skipped") {
          patch.onboardingCompletedAt = nowIso;
        }
        if (onboardingStatus === "not_started" || onboardingStatus === "in_progress") {
          patch.clearOnboardingCompletedAt = true;
        }
        await repo.updateOrganizationOnboarding(client, resolved.organizationId, patch);
        await recordAuditEventSafe(client, {
          deploymentCode: input.deploymentCode || "blessboard-org-v5",
          organizationId: resolved.organizationId,
          actorUserId,
          outcome: "success",
          actionKey: "onboarding.status_overridden",
          entityType: "organization_onboarding",
          entityId: resolved.organizationId,
          metadata: {
            category: "onboarding",
            from_status: fromStatus || undefined,
            to_status: onboardingStatus,
            reason_code: reason ? reason.slice(0, 120) : undefined,
            actor_type: "platform_admin",
            source: "admin_organizations",
          },
        });
        await client.query("COMMIT");
        return { ok: true, status: STATUS.OK, onboardingStatus, fromStatus };
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
 *   organizationKey: string,
 *   followUpStatus: string,
 *   actorUserId: string,
 *   deploymentCode?: string,
 * }} input
 */
async function updateOrganizationFollowUpStatus(db, input) {
  const actorUserId = String((input && input.actorUserId) || "").trim();
  const followUpStatus = String((input && input.followUpStatus) || "")
    .trim()
    .toLowerCase();
  if (!UUID_RE.test(actorUserId)) {
    return { ok: false, status: STATUS.INVALID_INPUT, message: "invalid_input" };
  }
  if (!repo.FOLLOW_UP_STATUSES.includes(followUpStatus)) {
    return { ok: false, status: STATUS.INVALID_INPUT, message: "invalid_follow_up_status" };
  }

  try {
    return await withOwnedClient(db, async (client) => {
      await client.query("BEGIN");
      try {
        const resolved = await resolveBlessBoardOrganization(client, input.organizationKey);
        if (!resolved.ok) {
          await client.query("ROLLBACK");
          return resolved;
        }
        let onboarding = await repo.ensureOrganizationOnboardingRow(client, {
          organizationId: resolved.organizationId,
          applicationId: resolved.applicationId,
        });
        const fromStatus = onboarding ? String(onboarding.follow_up_status || "") : null;
        await repo.updateOrganizationOnboarding(client, resolved.organizationId, {
          followUpStatus,
          lastActivityAt: new Date().toISOString(),
        });
        await recordAuditEventSafe(client, {
          deploymentCode: input.deploymentCode || "blessboard-org-v5",
          organizationId: resolved.organizationId,
          actorUserId,
          outcome: "success",
          actionKey: "onboarding.follow_up_status_updated",
          entityType: "organization_onboarding",
          entityId: resolved.organizationId,
          metadata: {
            category: "onboarding",
            from_status: fromStatus || undefined,
            to_status: followUpStatus,
            actor_type: "platform_admin",
            source: "admin_organizations",
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
 *   organizationKey: string,
 *   supportUserId: string|null,
 *   actorUserId: string,
 *   deploymentCode?: string,
 * }} input
 */
async function assignOrganizationSupport(db, input) {
  const actorUserId = String((input && input.actorUserId) || "").trim();
  const rawSupport =
    input && input.supportUserId != null && String(input.supportUserId).trim() !== ""
      ? String(input.supportUserId).trim()
      : null;
  if (!UUID_RE.test(actorUserId)) {
    return { ok: false, status: STATUS.INVALID_INPUT, message: "invalid_input" };
  }
  if (rawSupport && !UUID_RE.test(rawSupport)) {
    return { ok: false, status: STATUS.INVALID_INPUT, message: "invalid_support_user" };
  }

  try {
    return await withOwnedClient(db, async (client) => {
      await client.query("BEGIN");
      try {
        const resolved = await resolveBlessBoardOrganization(client, input.organizationKey);
        if (!resolved.ok) {
          await client.query("ROLLBACK");
          return resolved;
        }
        await repo.ensureOrganizationOnboardingRow(client, {
          organizationId: resolved.organizationId,
          applicationId: resolved.applicationId,
        });
        if (rawSupport) {
          const admins = await repo.listActivePlatformAdministrators(client);
          const allowed = admins.some((u) => String(u.id) === rawSupport);
          if (!allowed) {
            await client.query("ROLLBACK");
            return { ok: false, status: STATUS.FORBIDDEN, message: "not_platform_admin" };
          }
        }
        await repo.updateOrganizationOnboarding(client, resolved.organizationId, {
          assignedSupportUserId: rawSupport,
          clearAssignedSupport: !rawSupport,
          lastActivityAt: new Date().toISOString(),
        });
        await recordAuditEventSafe(client, {
          deploymentCode: input.deploymentCode || "blessboard-org-v5",
          organizationId: resolved.organizationId,
          actorUserId,
          outcome: "success",
          actionKey: "onboarding.support_assigned",
          entityType: "organization_onboarding",
          entityId: resolved.organizationId,
          metadata: {
            category: "onboarding",
            status: rawSupport ? "assigned" : "unassigned",
            actor_type: "platform_admin",
            source: "admin_organizations",
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

module.exports = {
  STATUS,
  resolveBlessBoardOrganization,
  setOrganizationSupportRequested,
  setOrganizationNextFollowUp,
  overrideOrganizationOnboardingStatus,
  updateOrganizationFollowUpStatus,
  assignOrganizationSupport,
};
