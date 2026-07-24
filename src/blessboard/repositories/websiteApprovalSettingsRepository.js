"use strict";

/**
 * Phase3 website approval settings persistence.
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value) {
  return typeof value === "string" && UUID_RE.test(value);
}

const DEFAULTS = Object.freeze({
  branchEditMode: "approval_required",
  requirePreviewBeforePublish: true,
  requireMobilePreviewConfirmation: false,
  preventSelfApproval: true,
  requireRequestChangesComment: true,
  requireRejectionReason: true,
  reviewNotificationPreferences: {
    notifyBranchAdmins: false,
    notifyHqTeam: false,
    deliveryAvailable: false,
  },
  approvalContentTypes: [
    "branch_profile",
    "service_times",
    "events",
    "sermons",
    "ministries",
    "contact_details",
    "giving_information",
    "leadership",
    "homepage_content",
    "navigation",
  ],
  trustedBranchPublishEnabled: false,
});

function mapSettings(row) {
  if (!row) return { ...DEFAULTS, organizationId: null, updatedAt: null, updatedBy: null };
  return {
    organizationId: row.organization_id,
    branchEditMode: row.branch_edit_mode || DEFAULTS.branchEditMode,
    requirePreviewBeforePublish: Boolean(row.require_preview_before_publish),
    requireMobilePreviewConfirmation: Boolean(row.require_mobile_preview_confirmation),
    preventSelfApproval: Boolean(row.prevent_self_approval),
    requireRequestChangesComment: Boolean(row.require_request_changes_comment),
    requireRejectionReason: Boolean(row.require_rejection_reason),
    reviewNotificationPreferences:
      row.review_notification_preferences_json || DEFAULTS.reviewNotificationPreferences,
    approvalContentTypes: Array.isArray(row.approval_content_types_json)
      ? row.approval_content_types_json
      : DEFAULTS.approvalContentTypes.slice(),
    trustedBranchPublishEnabled: Boolean(row.trusted_branch_publish_enabled),
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  };
}

/**
 * @param {import('pg').Pool|import('pg').PoolClient} db
 * @param {string} organizationId
 */
async function getSettings(db, organizationId) {
  if (!isUuid(organizationId)) return mapSettings(null);
  const res = await db.query(
    `SELECT * FROM blessboard.website_approval_settings WHERE organization_id = $1 LIMIT 1`,
    [organizationId]
  );
  if (!res.rows[0]) {
    return { ...DEFAULTS, organizationId, updatedAt: null, updatedBy: null };
  }
  return mapSettings(res.rows[0]);
}

/**
 * @param {import('pg').Pool|import('pg').PoolClient} db
 * @param {object} input
 */
async function upsertSettings(db, input) {
  const res = await db.query(
    `INSERT INTO blessboard.website_approval_settings (
       organization_id, branch_edit_mode,
       require_preview_before_publish, require_mobile_preview_confirmation,
       prevent_self_approval, require_request_changes_comment, require_rejection_reason,
       review_notification_preferences_json, approval_content_types_json,
       trusted_branch_publish_enabled, updated_by, updated_at
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10, $11, now()
     )
     ON CONFLICT (organization_id) DO UPDATE SET
       branch_edit_mode = EXCLUDED.branch_edit_mode,
       require_preview_before_publish = EXCLUDED.require_preview_before_publish,
       require_mobile_preview_confirmation = EXCLUDED.require_mobile_preview_confirmation,
       prevent_self_approval = EXCLUDED.prevent_self_approval,
       require_request_changes_comment = EXCLUDED.require_request_changes_comment,
       require_rejection_reason = EXCLUDED.require_rejection_reason,
       review_notification_preferences_json = EXCLUDED.review_notification_preferences_json,
       approval_content_types_json = EXCLUDED.approval_content_types_json,
       trusted_branch_publish_enabled = EXCLUDED.trusted_branch_publish_enabled,
       updated_by = EXCLUDED.updated_by,
       updated_at = now()
     RETURNING *`,
    [
      input.organizationId,
      input.branchEditMode,
      input.requirePreviewBeforePublish,
      input.requireMobilePreviewConfirmation,
      input.preventSelfApproval,
      input.requireRequestChangesComment,
      input.requireRejectionReason,
      JSON.stringify(input.reviewNotificationPreferences || {}),
      JSON.stringify(input.approvalContentTypes || []),
      Boolean(input.trustedBranchPublishEnabled),
      input.updatedBy || null,
    ]
  );
  return mapSettings(res.rows[0]);
}

module.exports = {
  isUuid,
  DEFAULTS,
  getSettings,
  upsertSettings,
};
