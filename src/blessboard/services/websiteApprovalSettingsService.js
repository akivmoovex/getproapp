"use strict";

/**
 * Phase3 website approval settings service.
 */

const repo = require("../repositories/websiteApprovalSettingsRepository");
const auditSvc = require("./websiteAuditService");

const STATUS = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  LOOKUP_ERROR: "lookup_error",
});

const BRANCH_EDIT_MODES = Object.freeze([
  "approval_required",
  "trusted_branch_publish",
  "draft_only",
]);

const BRANCH_EDIT_MODE_LABELS = Object.freeze({
  approval_required: "Approval required",
  trusted_branch_publish: "Trusted branch publish (stored; not silently activated)",
  draft_only: "Draft only",
});

const CONTENT_TYPE_LABELS = Object.freeze({
  branch_profile: "Branch profile",
  service_times: "Service times",
  events: "Events",
  sermons: "Sermons",
  ministries: "Ministries",
  contact_details: "Contact details",
  giving_information: "Giving information",
  leadership: "Leadership",
  homepage_content: "Homepage content",
  navigation: "Navigation",
});

function boolFromBody(value, fallback) {
  if (value === undefined || value === null || value === "") return Boolean(fallback);
  return value === true || value === "1" || value === "on" || value === "true";
}

/**
 * @param {import('pg').Pool} db
 * @param {string} organizationId
 */
async function loadEffectiveSettings(db, organizationId) {
  if (!repo.isUuid(organizationId)) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "tenant" };
  }
  try {
    const settings = await repo.getSettings(db, organizationId);
    return {
      ok: true,
      status: STATUS.OK,
      settings,
      branchEditModeLabels: BRANCH_EDIT_MODE_LABELS,
      contentTypeLabels: CONTENT_TYPE_LABELS,
      // Trusted direct publish is never silently granted in this batch.
      trustedBranchPublishActive: false,
    };
  } catch {
    return { ok: false, status: STATUS.LOOKUP_ERROR, reason: "load" };
  }
}

/**
 * @param {import('pg').Pool} db
 * @param {object} opts
 */
async function saveSettings(db, opts) {
  const organizationId = opts && opts.organizationId;
  const actorUserId = opts && opts.actorUserId;
  if (!repo.isUuid(organizationId) || !repo.isUuid(actorUserId)) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "ids" };
  }

  const mode = String(opts.branchEditMode || "approval_required");
  if (!BRANCH_EDIT_MODES.includes(mode)) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "branch_edit_mode" };
  }

  const allowedTypes = Object.keys(CONTENT_TYPE_LABELS);
  let contentTypes = Array.isArray(opts.approvalContentTypes)
    ? opts.approvalContentTypes.map((t) => String(t))
    : [];
  contentTypes = contentTypes.filter((t) => allowedTypes.includes(t));
  if (!contentTypes.length) contentTypes = repo.DEFAULTS.approvalContentTypes.slice();

  const prefs = {
    notifyBranchAdmins: boolFromBody(
      opts.notifyBranchAdmins,
      repo.DEFAULTS.reviewNotificationPreferences.notifyBranchAdmins
    ),
    notifyHqTeam: boolFromBody(
      opts.notifyHqTeam,
      repo.DEFAULTS.reviewNotificationPreferences.notifyHqTeam
    ),
    deliveryAvailable: false,
  };

  try {
    const before = await repo.getSettings(db, organizationId);
    const settings = await repo.upsertSettings(db, {
      organizationId,
      branchEditMode: mode,
      requirePreviewBeforePublish: boolFromBody(opts.requirePreviewBeforePublish, false),
      requireMobilePreviewConfirmation: boolFromBody(
        opts.requireMobilePreviewConfirmation,
        false
      ),
      preventSelfApproval: boolFromBody(opts.preventSelfApproval, false),
      requireRequestChangesComment: boolFromBody(opts.requireRequestChangesComment, false),
      requireRejectionReason: boolFromBody(opts.requireRejectionReason, false),
      reviewNotificationPreferences: prefs,
      approvalContentTypes: contentTypes,
      // Persist preference only; do not activate silent publish rights.
      trustedBranchPublishEnabled:
        mode === "trusted_branch_publish" && boolFromBody(opts.trustedBranchPublishEnabled, false),
      requireRestoreApproval: boolFromBody(opts.requireRestoreApproval, false),
      hqDirectPublishEnabled: boolFromBody(opts.hqDirectPublishEnabled, true),
      allowBranchGivingMethods: boolFromBody(opts.allowBranchGivingMethods, false),
      allowBranchUrgentUpdates: boolFromBody(opts.allowBranchUrgentUpdates, false),
      updatedBy: actorUserId,
    });

    await auditSvc.recordWebsiteAuditEvent(db, {
      organizationId,
      actorUserId,
      actorRole: "church_hq_admin",
      actionType: "approval_settings_updated",
      entityType: "website_approval_settings",
      entityId: organizationId,
      result: "success",
      before: {
        branchEditMode: before.branchEditMode,
        preventSelfApproval: before.preventSelfApproval,
      },
      after: {
        branchEditMode: settings.branchEditMode,
        preventSelfApproval: settings.preventSelfApproval,
      },
    });

    return {
      ok: true,
      status: STATUS.OK,
      settings,
      message:
        settings.branchEditMode === "trusted_branch_publish"
          ? "Settings saved. Trusted branch publish remains inactive until a safe role model is available."
          : "Approval settings saved.",
    };
  } catch {
    return { ok: false, status: STATUS.LOOKUP_ERROR, reason: "save" };
  }
}

/**
 * Resolve effective branch edit mode (never silently grants publish).
 * @param {object} settings
 */
function resolveBranchEditMode(settings) {
  const mode = (settings && settings.branchEditMode) || "approval_required";
  if (mode === "trusted_branch_publish") {
    return {
      mode: "approval_required",
      configuredMode: mode,
      trustedActive: false,
      note: "Trusted branch publish is configured but not activated in this release.",
    };
  }
  return { mode, configuredMode: mode, trustedActive: false, note: null };
}

/**
 * Branch administrators for display only (trusted publish is not activated).
 * @param {import('pg').Pool} db
 * @param {string} organizationId
 */
async function listBranchAdministrators(db, organizationId) {
  if (!repo.isUuid(organizationId)) return [];
  try {
    const res = await db.query(
      `SELECT u.id AS user_id,
              u.display_name,
              u.email_display AS email,
              b.id AS branch_id,
              b.display_name AS branch_name,
              ur.role_key,
              ur.status AS role_status
         FROM blessboard.user_roles ur
         INNER JOIN blessboard.users u ON u.id = ur.user_id
         LEFT JOIN blessboard.branches b ON b.id = ur.branch_id
        WHERE ur.organization_id = $1
          AND ur.role_key = 'branch_admin'
          AND ur.status = 'active'
        ORDER BY b.display_name ASC NULLS LAST, u.display_name ASC`,
      [organizationId]
    );
    return (res.rows || []).map((r) => ({
      userId: r.user_id,
      displayName: r.display_name,
      email: r.email,
      branchId: r.branch_id,
      branchName: r.branch_name,
      permission: "branch_admin",
      status: r.role_status || "active",
      trustedPublishActive: false,
      note: "Direct branch publish is not activated in this release.",
    }));
  } catch {
    return [];
  }
}

module.exports = {
  STATUS,
  BRANCH_EDIT_MODES,
  BRANCH_EDIT_MODE_LABELS,
  CONTENT_TYPE_LABELS,
  loadEffectiveSettings,
  getApprovalSettings: loadEffectiveSettings,
  saveSettings,
  resolveBranchEditMode,
  listBranchAdministrators,
};
