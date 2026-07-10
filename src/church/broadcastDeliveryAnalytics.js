"use strict";

/**
 * In-app HQ broadcast delivery analytics (targeting + reading only).
 * Does not claim external push/email/SMS delivery.
 */

const hqBroadcastsRepo = require("../db/pg/church/hqBroadcastsRepo");
const feedItemReadsRepo = require("../db/pg/church/feedItemReadsRepo");
const broadcastAttachmentsRepo = require("../db/pg/church/broadcastAttachmentsRepo");

function isPersonBasedAudience(audience) {
  return String(audience || "") !== "public";
}

function readPercentage(readCount, estimated) {
  if (!estimated || estimated <= 0) return null;
  return Math.min(100, Math.round((Number(readCount) / Number(estimated)) * 100));
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} organizationId
 * @param {object} broadcast
 * @param {{ accessibleBranches?: Array<{ id: number, name: string, status?: string }> }} [opts]
 */
async function loadBroadcastDeliveryAnalytics(pool, organizationId, broadcast, opts = {}) {
  if (!broadcast) return null;

  const accessible = Array.isArray(opts.accessibleBranches) ? opts.accessibleBranches : [];
  const accessibleIds = new Set(accessible.map((b) => Number(b.id)).filter((id) => id > 0));
  const targetIds = await hqBroadcastsRepo.resolveBroadcastTargetBranchIds(pool, organizationId, broadcast);
  const branchIds = targetIds.filter((id) => !accessibleIds.size || accessibleIds.has(id));

  const audience = String(broadcast.audience || "members");
  const personBased = isPersonBasedAudience(audience);

  const [estimate, receiptSummary, receiptByBranch, estimateByBranch, attachmentDownloads, branchRows] =
    await Promise.all([
      hqBroadcastsRepo.estimateBroadcastAudience(pool, organizationId, broadcast, { branchIds }),
      broadcast.status === "published"
        ? feedItemReadsRepo.summarizeReceiptsForSource(pool, organizationId, "hq_broadcast", broadcast.id)
        : Promise.resolve({ seen_count: 0, read_count: 0 }),
      broadcast.status === "published"
        ? feedItemReadsRepo.summarizeReceiptsByBranchForSource(
            pool,
            organizationId,
            "hq_broadcast",
            broadcast.id,
            branchIds
          )
        : Promise.resolve([]),
      hqBroadcastsRepo.estimateBroadcastAudienceByBranch(pool, organizationId, broadcast, branchIds),
      broadcastAttachmentsRepo.sumDownloadCountsForBroadcast(pool, broadcast.id, organizationId),
      branchIds.length
        ? pool.query(
            `SELECT id, name, status
             FROM public.church_branches
             WHERE organization_id = $1 AND id = ANY($2::bigint[])
             ORDER BY name ASC, id ASC`,
            [organizationId, branchIds]
          )
        : Promise.resolve({ rows: [] }),
    ]);

  const seenCount = receiptSummary.seen_count || 0;
  const readCount = receiptSummary.read_count || 0;
  const estimated = estimate.estimated_recipients || 0;
  const unreadEstimated = personBased ? Math.max(0, estimated - readCount) : null;

  const receiptMap = new Map(receiptByBranch.map((row) => [Number(row.branch_id), row]));
  const estimateMap = new Map(
    estimateByBranch.map((row) => [Number(row.branch_id), row.estimated_recipients || 0])
  );

  const byBranch = (branchRows.rows || []).map((branch) => {
    const branchId = Number(branch.id);
    const branchEstimated = estimateMap.get(branchId) || 0;
    const receipts = receiptMap.get(branchId) || { seen_count: 0, read_count: 0 };
    const branchRead = receipts.read_count || 0;
    return {
      branch_id: branchId,
      branch_name: branch.name,
      branch_status: branch.status,
      current_estimated_audience: branchEstimated,
      seen_count: receipts.seen_count || 0,
      read_count: branchRead,
      unread_estimated: personBased ? Math.max(0, branchEstimated - branchRead) : null,
      read_percentage: personBased ? readPercentage(branchRead, branchEstimated) : null,
    };
  });

  return {
    // Prefer explicit "current estimated" wording — membership/roles can change.
    current_estimated_audience: estimated,
    estimated_recipients: estimated, // backward-compatible alias
    recipient_label: estimate.recipient_label,
    is_estimate: true,
    audience_is_person_based: personBased,
    branch_count: branchIds.length,
    seen_count: seenCount,
    read_count: readCount,
    unread_estimated: unreadEstimated,
    read_percentage: personBased ? readPercentage(readCount, estimated) : null,
    read_rate: personBased ? readPercentage(readCount, estimated) : null, // alias used by older view
    attachment_download_count: attachmentDownloads,
    tracks_attachment_downloads: true,
    tracks_action_link_clicks: false,
    by_branch: byBranch,
    in_app_only: true,
  };
}

module.exports = {
  loadBroadcastDeliveryAnalytics,
  isPersonBasedAudience,
  readPercentage,
};
