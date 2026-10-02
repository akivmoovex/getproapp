"use strict";

/**
 * Safe repair for provisional websites whose starter seed left draft_value set
 * and published_value null (false "unpublished changes" after provisioning).
 *
 * Does NOT run against production automatically. Callers must pass confirm: true
 * to apply. dryRun (default) reports candidates only.
 *
 * Never overwrites a non-null published_value (real published content / edits).
 */

const instanceRepo = require("./instanceRepository");
const versionService = require("./versionService");
const changeManager = require("./websiteChangeManagerService");

const RESULT = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  NOT_FOUND: "website_instance_not_found",
  NOT_ELIGIBLE: "not_eligible",
  CONFIRM_REQUIRED: "confirm_required",
});

/**
 * Eligible when:
 * - instance exists for the org
 * - no published website_versions row (never truly published)
 * - at least one row with published_value IS NULL and draft_value IS NOT NULL
 * - no row where both published and draft are non-null and differ
 *   (that would be a real user edit after a baseline existed)
 *
 * @param {{ query: Function }} db
 * @param {{
 *   organizationId: string,
 *   instanceId: string,
 *   dryRun?: boolean,
 *   confirm?: boolean,
 * }} input
 */
async function repairProvisionalPublishedBaseline(db, input) {
  const organizationId = String((input && input.organizationId) || "").trim();
  const instanceId = String((input && input.instanceId) || "").trim();
  if (!organizationId || !instanceId) {
    return { ok: false, code: RESULT.INVALID_INPUT, repaired: 0, pendingChangeCount: 0 };
  }

  const instance = await instanceRepo.findWebsiteInstanceById(db, instanceId, organizationId);
  if (!instance) {
    return { ok: false, code: RESULT.NOT_FOUND, repaired: 0, pendingChangeCount: 0 };
  }

  const listed = await versionService.listWebsiteVersions(db, {
    instanceId: instance.id,
    organizationId,
  });
  const hasPublishedVersion = (listed.versions || []).some(
    (version) => String(version.status || "") === "published"
  );
  if (hasPublishedVersion) {
    return {
      ok: false,
      code: RESULT.NOT_ELIGIBLE,
      reason: "has_published_version",
      repaired: 0,
      pendingChangeCount: 0,
      instance,
    };
  }

  const dirty = await db.query(
    `SELECT
        COUNT(*) FILTER (
          WHERE published_value IS NULL AND draft_value IS NOT NULL
        )::int AS null_published_with_draft,
        COUNT(*) FILTER (
          WHERE published_value IS NOT NULL
            AND draft_value IS NOT NULL
            AND draft_value IS DISTINCT FROM published_value
        )::int AS real_diverged,
        COUNT(*) FILTER (
          WHERE published_value IS NOT NULL
        )::int AS any_published
       FROM platform.website_content
      WHERE instance_id = $1 AND organization_id = $2`,
    [instance.id, organizationId]
  );
  const stats = dirty.rows[0] || {};
  const nullPublishedWithDraft = Number(stats.null_published_with_draft) || 0;
  const realDiverged = Number(stats.real_diverged) || 0;
  const anyPublished = Number(stats.any_published) || 0;

  // If some keys already have a published baseline and others diverge as real edits,
  // refuse — operator must use normal discard/publish flows.
  if (realDiverged > 0) {
    return {
      ok: false,
      code: RESULT.NOT_ELIGIBLE,
      reason: "real_draft_divergence",
      repaired: 0,
      candidateRows: nullPublishedWithDraft,
      realDiverged,
      instance,
    };
  }

  if (nullPublishedWithDraft === 0) {
    const pending = await changeManager.compareDraftToPublished(db, {
      organizationId,
      instanceId: instance.id,
    });
    return {
      ok: true,
      code: RESULT.OK,
      repaired: 0,
      skipped: true,
      reason: "already_aligned",
      pendingChangeCount: pending.ok ? pending.pendingChangeCount : 0,
      instance,
    };
  }

  // Prefer instances that never established any published_value (classic false-dirty seed).
  // If any_published > 0 but only null-published-with-draft remain and no real divergence,
  // still safe to fill null published from draft (completing a partial baseline).
  const dryRun = input.dryRun !== false && input.confirm !== true;
  if (dryRun) {
    return {
      ok: true,
      code: RESULT.OK,
      dryRun: true,
      repaired: 0,
      candidateRows: nullPublishedWithDraft,
      anyPublished,
      instance,
      message: "Pass confirm: true to apply. Does not mass-update without explicit approval.",
    };
  }

  if (input.confirm !== true) {
    return {
      ok: false,
      code: RESULT.CONFIRM_REQUIRED,
      repaired: 0,
      candidateRows: nullPublishedWithDraft,
      instance,
    };
  }

  const updated = await db.query(
    `UPDATE platform.website_content
        SET published_value = draft_value,
            updated_at = now()
      WHERE instance_id = $1
        AND organization_id = $2
        AND published_value IS NULL
        AND draft_value IS NOT NULL`,
    [instance.id, organizationId]
  );

  const pending = await changeManager.compareDraftToPublished(db, {
    organizationId,
    instanceId: instance.id,
  });

  return {
    ok: true,
    code: RESULT.OK,
    dryRun: false,
    repaired: updated.rowCount || 0,
    candidateRows: nullPublishedWithDraft,
    pendingChangeCount: pending.ok ? pending.pendingChangeCount : 0,
    instance,
  };
}

/**
 * List provisional false-dirty candidates for an organization (dry-run style).
 * @param {{ query: Function }} db
 * @param {{ organizationId: string, productCode?: string }} input
 */
async function listProvisionalBaselineRepairCandidates(db, input) {
  const organizationId = String((input && input.organizationId) || "").trim();
  if (!organizationId) return { ok: false, code: RESULT.INVALID_INPUT, candidates: [] };
  const productCode = input.productCode ? String(input.productCode).trim() : null;
  const list = await instanceRepo.listWebsiteInstancesForOrganization(
    db,
    organizationId,
    productCode || undefined
  );

  const candidates = [];
  for (const instance of list || []) {
    if (!instance) continue;
    const preview = await repairProvisionalPublishedBaseline(db, {
      organizationId,
      instanceId: instance.id,
      dryRun: true,
    });
    if (preview.ok && preview.candidateRows > 0) {
      candidates.push({
        instanceId: instance.id,
        productCode: instance.productCode,
        status: instance.status,
        candidateRows: preview.candidateRows,
      });
    }
  }
  return { ok: true, code: RESULT.OK, candidates };
}

module.exports = {
  RESULT,
  repairProvisionalPublishedBaseline,
  listProvisionalBaselineRepairCandidates,
};
