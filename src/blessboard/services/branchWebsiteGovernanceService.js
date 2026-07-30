"use strict";

/**
 * Branch website governance service (Prompt 7 Stage 1).
 * Effective local giving = org allow_branch_giving_methods AND branch allow_local_giving_methods.
 */

const governanceRepo = require("../repositories/branchWebsiteGovernanceRepository");
const approvalRepo = require("../repositories/websiteApprovalSettingsRepository");
const { recordBlessBoardAudit } = require("./recordBlessBoardAudit");

const STATUS = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  NOT_FOUND: "not_found",
  FORBIDDEN: "forbidden",
  LOOKUP_ERROR: "lookup_error",
});

/**
 * @param {{ query: Function }} db
 * @param {{ organizationId: string, churchId: string, branchId: string }} scope
 */
async function assertBranchBelongsToOrg(db, scope) {
  if (
    !governanceRepo.isUuid(scope.organizationId) ||
    !governanceRepo.isUuid(scope.churchId) ||
    !governanceRepo.isUuid(scope.branchId)
  ) {
    return { ok: false, status: STATUS.INVALID_INPUT };
  }
  const res = await db.query(
    `SELECT b.id, b.church_id, c.organization_id
       FROM blessboard.branches b
       INNER JOIN blessboard.churches c ON c.id = b.church_id
      WHERE b.id = $1
      LIMIT 1`,
    [scope.branchId]
  );
  const row = res.rows[0];
  if (!row) return { ok: false, status: STATUS.NOT_FOUND };
  if (String(row.church_id) !== String(scope.churchId)) {
    return { ok: false, status: STATUS.FORBIDDEN };
  }
  if (String(row.organization_id) !== String(scope.organizationId)) {
    return { ok: false, status: STATUS.FORBIDDEN };
  }
  return { ok: true, status: STATUS.OK };
}

/**
 * @param {{ query: Function }} db
 * @param {{ organizationId: string, churchId: string, branchId: string }} input
 */
async function getBranchWebsiteGovernance(db, input) {
  const check = await assertBranchBelongsToOrg(db, input);
  if (!check.ok) return { ...check, governance: null, orgPolicy: null, effective: null };

  try {
    let governance = await governanceRepo.findByBranchId(db, input.branchId);
    if (!governance) {
      governance = await governanceRepo.ensureDefaults(db, {
        branchId: input.branchId,
        organizationId: input.organizationId,
        churchId: input.churchId,
      });
    }
    const orgPolicy = await approvalRepo.getSettings(db, input.organizationId);
    const effective = {
      allowLocalGivingMethods: Boolean(
        orgPolicy.allowBranchGivingMethods && governance && governance.allowLocalGivingMethods
      ),
      branchPublishMode: governance ? governance.branchPublishMode : "hq_approval",
      allowUrgentContactUpdates: Boolean(
        orgPolicy.allowBranchUrgentUpdates && governance && governance.allowUrgentContactUpdates
      ),
      allowHideOptionalPages: Boolean(governance && governance.allowHideOptionalPages),
      hideablePageKeys: governance ? governance.hideablePageKeys.slice() : [],
      allowAccentTreatment: Boolean(governance && governance.allowAccentTreatment),
      collectionPolicies: governance ? { ...governance.collectionPolicies } : {},
      lockedSettingKeys: governance ? governance.lockedSettingKeys.slice() : [],
    };
    return {
      ok: true,
      status: STATUS.OK,
      governance,
      orgPolicy: {
        allowBranchGivingMethods: Boolean(orgPolicy.allowBranchGivingMethods),
        allowBranchUrgentUpdates: Boolean(orgPolicy.allowBranchUrgentUpdates),
        trustedBranchPublishEnabled: Boolean(orgPolicy.trustedBranchPublishEnabled),
        branchEditMode: orgPolicy.branchEditMode,
      },
      effective,
    };
  } catch {
    return {
      ok: false,
      status: STATUS.LOOKUP_ERROR,
      governance: null,
      orgPolicy: null,
      effective: null,
    };
  }
}

/**
 * HQ upsert of per-branch governance. Rejects cross-org/branch mismatch.
 * @param {{ query: Function }} db
 * @param {object} input
 */
async function upsertBranchWebsiteGovernance(db, input) {
  const check = await assertBranchBelongsToOrg(db, input);
  if (!check.ok) return { ...check, governance: null };

  try {
    const governance = await governanceRepo.upsert(db, input);
    if (input.actorUserId) {
      await recordBlessBoardAudit(db, {
        organizationId: input.organizationId,
        churchId: input.churchId,
        branchId: input.branchId,
        actorUserId: input.actorUserId,
        actionKey: "branch_website_governance.upsert",
        entityType: "branch_website_governance",
        entityId: input.branchId,
        metadata: {
          allowLocalGivingMethods: Boolean(input.allowLocalGivingMethods),
          branchPublishMode: input.branchPublishMode || "hq_approval",
        },
      });
    }
    return { ok: true, status: STATUS.OK, governance };
  } catch {
    return { ok: false, status: STATUS.LOOKUP_ERROR, governance: null };
  }
}

/**
 * Ensure defaults after branch create (idempotent).
 */
async function ensureBranchWebsiteGovernance(db, input) {
  const check = await assertBranchBelongsToOrg(db, input);
  if (!check.ok) return { ...check, governance: null };
  try {
    const governance = await governanceRepo.ensureDefaults(db, {
      branchId: input.branchId,
      organizationId: input.organizationId,
      churchId: input.churchId,
      updatedBy: input.updatedBy || null,
    });
    return { ok: true, status: STATUS.OK, governance };
  } catch {
    return { ok: false, status: STATUS.LOOKUP_ERROR, governance: null };
  }
}

module.exports = {
  STATUS,
  assertBranchBelongsToOrg,
  getBranchWebsiteGovernance,
  upsertBranchWebsiteGovernance,
  ensureBranchWebsiteGovernance,
};
