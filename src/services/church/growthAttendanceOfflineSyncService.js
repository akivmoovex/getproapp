"use strict";

/**
 * Growth offline attendance queue ingest, reconciliation, and retry.
 * Trusted tenant/org/branch context is always taken from the authenticated server session.
 */

const attendanceCheckInRepo = require("../../db/pg/church/attendanceCheckInRepo");
const attendanceOfflineQueueRepo = require("../../db/pg/church/attendanceOfflineQueueRepo");
const attendanceRulesRepo = require("../../db/pg/church/attendanceRulesRepo");
const membersRepo = require("../../db/pg/church/membersRepo");
const { requireOpenSession } = require("./foundationAttendanceCheckInService");

const SYNC_ERRORS = Object.freeze({
  WRONG_BRANCH: "WRONG_BRANCH",
  DUPLICATE: "DUPLICATE",
  CONFLICT: "CONFLICT",
  NOT_FOUND: "NOT_FOUND",
  INVALID: "INVALID",
});

function makeSyncError(code, message) {
  return Object.assign(new Error(message), { code });
}

/**
 * @param {object} ctx - trusted server context
 * @param {object} item - validated offline item (client payload)
 */
function trustedPayload(ctx, item) {
  return {
    organization_id: ctx.organization_id,
    branch_id: ctx.branch_id,
    platform_tenant_id: ctx.platform_tenant_id,
    client_item_id: item.client_item_id,
    service_session_id: item.service_session_id,
    member_id: item.member_id,
    check_in_kind: item.check_in_kind,
    visitor_name: item.visitor_name || null,
    visitor_phone: item.visitor_phone || null,
    captured_at_client: item.captured_at_client,
    capture_source: item.capture_source,
    payload_json: item,
  };
}

/**
 * @param {import("pg").Pool | import("pg").PoolClient} db
 * @param {object} ctx
 * @param {object} item
 */
async function ingestOfflineItem(db, ctx, item) {
  const existing = await attendanceOfflineQueueRepo.findQueueItemByClientId(
    db,
    ctx.organization_id,
    ctx.branch_id,
    item.client_item_id
  );
  if (existing) {
    return { queueItem: existing, inserted: false };
  }

  const existingCheckIn = await attendanceCheckInRepo.findCheckInByClientItemId(
    db,
    ctx.organization_id,
    ctx.branch_id,
    item.client_item_id
  );
  if (existingCheckIn) {
    const queueItem = await attendanceOfflineQueueRepo.insertQueueItem(db, {
      ...trustedPayload(ctx, item),
      sync_status: "duplicate",
      synced_check_in_id: existingCheckIn.id,
    });
    if (queueItem) {
      await attendanceOfflineQueueRepo.updateQueueItemStatus(db, queueItem.id, {
        sync_status: "duplicate",
        synced_check_in_id: existingCheckIn.id,
      });
      return { queueItem: { ...queueItem, sync_status: "duplicate" }, inserted: false };
    }
    return {
      queueItem: await attendanceOfflineQueueRepo.findQueueItemByClientId(
        db,
        ctx.organization_id,
        ctx.branch_id,
        item.client_item_id
      ),
      inserted: false,
    };
  }

  const queueItem = await attendanceOfflineQueueRepo.insertQueueItem(db, {
    ...trustedPayload(ctx, item),
    sync_status: "pending",
  });
  if (!queueItem) {
    return {
      queueItem: await attendanceOfflineQueueRepo.findQueueItemByClientId(
        db,
        ctx.organization_id,
        ctx.branch_id,
        item.client_item_id
      ),
      inserted: false,
    };
  }
  return { queueItem, inserted: true };
}

/**
 * Reconcile one queue item into church_attendance_check_ins (idempotent).
 * @param {import("pg").Pool} pool
 * @param {object} ctx
 * @param {number} queueId
 */
async function reconcileQueueItem(pool, ctx, queueId) {
  const queueItem = await attendanceOfflineQueueRepo.findQueueItemByIdForBranch(
    pool,
    queueId,
    ctx.branch_id
  );
  if (!queueItem) {
    throw makeSyncError(SYNC_ERRORS.NOT_FOUND, "Queue item not found.");
  }
  if (Number(queueItem.organization_id) !== Number(ctx.organization_id)) {
    throw makeSyncError(SYNC_ERRORS.INVALID, "Queue item organization mismatch.");
  }
  if (Number(queueItem.platform_tenant_id) !== Number(ctx.platform_tenant_id)) {
    throw makeSyncError(SYNC_ERRORS.INVALID, "Queue item tenant mismatch.");
  }
  if (queueItem.sync_status === "synced" || queueItem.sync_status === "duplicate") {
    return { queueItem, checkIn: queueItem.synced_check_in_id ? { id: queueItem.synced_check_in_id } : null, skipped: true };
  }

  try {
    await requireOpenSession(pool, queueItem.service_session_id, ctx.branch_id);
  } catch (err) {
    await attendanceOfflineQueueRepo.updateQueueItemStatus(pool, queueItem.id, {
      sync_status: "failed",
      last_error: err.message,
      retry_count: queueItem.retry_count + 1,
    });
    throw err;
  }

  if (queueItem.check_in_kind === "member") {
    const member = await membersRepo.findMemberByIdForOrganization(
      pool,
      queueItem.member_id,
      ctx.organization_id
    );
    if (!member) {
      await attendanceOfflineQueueRepo.updateQueueItemStatus(pool, queueItem.id, {
        sync_status: "failed",
        last_error: "Member not found in organisation.",
        retry_count: queueItem.retry_count + 1,
      });
      throw makeSyncError(SYNC_ERRORS.NOT_FOUND, "Member not found in organisation.");
    }
    if (member.status !== "verified") {
      await attendanceOfflineQueueRepo.updateQueueItemStatus(pool, queueItem.id, {
        sync_status: "failed",
        last_error: "Member not verified.",
        retry_count: queueItem.retry_count + 1,
      });
      throw makeSyncError(SYNC_ERRORS.INVALID, "Member not verified.");
    }

    const rules = await attendanceRulesRepo.getBranchRulesWithDefaults(pool, ctx.branch_id);
    let guestAuthorized = false;
    let homeBranchId = member.branch_id;

    if (Number(member.branch_id) !== Number(ctx.branch_id)) {
      const auth = await attendanceRulesRepo.findActiveCrossBranchAuth(
        pool,
        member.id,
        ctx.branch_id
      );
      if (!auth || !rules.cross_branch_guest_enabled) {
        await attendanceOfflineQueueRepo.updateQueueItemStatus(pool, queueItem.id, {
          sync_status: "conflict",
          conflict_reason: "Member belongs to another branch without authorization.",
          last_error: "WRONG_BRANCH",
        });
        throw makeSyncError(SYNC_ERRORS.WRONG_BRANCH, "Member belongs to another branch without authorization.");
      }
      guestAuthorized = true;
      homeBranchId = member.branch_id;
    }

    const duplicate = await attendanceCheckInRepo.findActiveMemberCheckInForSession(
      pool,
      queueItem.service_session_id,
      member.id
    );
    if (duplicate) {
      if (duplicate.client_item_id === queueItem.client_item_id) {
        await attendanceOfflineQueueRepo.updateQueueItemStatus(pool, queueItem.id, {
          sync_status: "duplicate",
          synced_check_in_id: duplicate.id,
        });
        return { queueItem, checkIn: duplicate, skipped: true, duplicate: true };
      }
      await attendanceOfflineQueueRepo.updateQueueItemStatus(pool, queueItem.id, {
        sync_status: "review_required",
        conflict_reason: "Active check-in already exists for this member and session.",
        synced_check_in_id: duplicate.id,
      });
      await attendanceCheckInRepo.updateCheckInReviewFlag(pool, duplicate.id, { needs_review: true });
      throw makeSyncError(SYNC_ERRORS.CONFLICT, "Conflicting server record requires review.");
    }

    const session = await attendanceCheckInRepo.findServiceSessionByIdForBranch(
      pool,
      queueItem.service_session_id,
      ctx.branch_id
    );
    if (session && !rules.allow_multiple_services_per_day) {
      const sameDay = await attendanceRulesRepo.findMemberCheckInOnDateForBranch(
        pool,
        member.id,
        ctx.branch_id,
        session.session_date
      );
      if (sameDay.length > 0) {
        await attendanceOfflineQueueRepo.updateQueueItemStatus(pool, queueItem.id, {
          sync_status: "review_required",
          conflict_reason: "Multiple services per day disabled by branch rules.",
        });
        throw makeSyncError(SYNC_ERRORS.CONFLICT, "Branch rules disallow multiple service check-ins per day.");
      }
    }

    const checkIn = await attendanceCheckInRepo.createCheckIn(pool, {
      organization_id: ctx.organization_id,
      branch_id: ctx.branch_id,
      service_session_id: queueItem.service_session_id,
      member_id: member.id,
      check_in_kind: "member",
      method: "offline",
      checked_in_by_admin_id: ctx.admin_id,
      client_item_id: queueItem.client_item_id,
      captured_at_client: queueItem.captured_at_client,
      capture_source: queueItem.capture_source,
      offline_queue_id: queueItem.id,
      checked_in_at: queueItem.captured_at_client,
      home_branch_id: guestAuthorized ? homeBranchId : null,
      guest_authorized: guestAuthorized,
    });

    const updated = await attendanceOfflineQueueRepo.updateQueueItemStatus(pool, queueItem.id, {
      sync_status: "synced",
      synced_check_in_id: checkIn.id,
    });
    return { queueItem: updated, checkIn, skipped: false };
  }

  const checkIn = await attendanceCheckInRepo.createCheckIn(pool, {
    organization_id: ctx.organization_id,
    branch_id: ctx.branch_id,
    service_session_id: queueItem.service_session_id,
    check_in_kind: "visitor",
    method: "offline",
    visitor_name: queueItem.visitor_name,
    visitor_phone: queueItem.visitor_phone,
    checked_in_by_admin_id: ctx.admin_id,
    client_item_id: queueItem.client_item_id,
    captured_at_client: queueItem.captured_at_client,
    capture_source: queueItem.capture_source,
    offline_queue_id: queueItem.id,
    checked_in_at: queueItem.captured_at_client,
  });
  const updated = await attendanceOfflineQueueRepo.updateQueueItemStatus(pool, queueItem.id, {
    sync_status: "synced",
    synced_check_in_id: checkIn.id,
  });
  return { queueItem: updated, checkIn, skipped: false };
}

/**
 * @param {import("pg").Pool} pool
 * @param {object} ctx
 * @param {object[]} items
 */
async function submitOfflineBatch(pool, ctx, items) {
  const ingested = [];
  for (const item of items) {
    ingested.push(await ingestOfflineItem(pool, ctx, item));
  }
  const results = [];
  for (const row of ingested) {
    if (!row.queueItem) continue;
    if (row.queueItem.sync_status === "pending" || row.queueItem.sync_status === "failed") {
      try {
        results.push(await reconcileQueueItem(pool, ctx, row.queueItem.id));
      } catch (err) {
        results.push({
          queueItem: row.queueItem,
          error: err.message,
          code: err.code || "SYNC_FAILED",
        });
      }
    } else {
      results.push({ queueItem: row.queueItem, skipped: true });
    }
  }
  return results;
}

/**
 * Process all pending/failed queue items (reconnect).
 * @param {import("pg").Pool} pool
 * @param {object} ctx
 */
async function syncPendingQueue(pool, ctx) {
  const pending = await attendanceOfflineQueueRepo.listQueueItemsForBranch(pool, ctx.branch_id, {
    statuses: ["pending", "failed"],
  });
  const results = [];
  for (const row of pending) {
    try {
      results.push(await reconcileQueueItem(pool, ctx, row.id));
    } catch (err) {
      results.push({ queueItem: row, error: err.message, code: err.code || "SYNC_FAILED" });
    }
  }
  return results;
}

/**
 * @param {import("pg").Pool} pool
 * @param {object} ctx
 */
async function retryFailedQueueItems(pool, ctx) {
  const failed = await attendanceOfflineQueueRepo.listQueueItemsForBranch(pool, ctx.branch_id, {
    statuses: ["failed"],
  });
  const results = [];
  for (const row of failed) {
    await attendanceOfflineQueueRepo.updateQueueItemStatus(pool, row.id, {
      sync_status: "pending",
      last_error: null,
    });
    try {
      results.push(await reconcileQueueItem(pool, ctx, row.id));
    } catch (err) {
      results.push({ queueItem: row, error: err.message, code: err.code || "SYNC_FAILED" });
    }
  }
  return results;
}

/**
 * Mark offline-linked check-ins for review after void/correction (Growth).
 * @param {import("pg").Pool} pool
 * @param {number} checkInId
 */
async function flagReviewAfterVoid(pool, checkInId) {
  const r = await pool.query(
    `SELECT * FROM public.church_attendance_check_ins WHERE id = $1 LIMIT 1`,
    [checkInId]
  );
  const row = r.rows[0];
  if (!row || row.method !== "offline") return null;

  await attendanceCheckInRepo.updateCheckInReviewFlag(pool, checkInId, { needs_review: true });
  if (row.offline_queue_id) {
    await attendanceOfflineQueueRepo.updateQueueItemStatus(pool, row.offline_queue_id, {
      sync_status: "review_required",
      conflict_reason: "Source check-in voided; absence recalculation may be required.",
    });
  }
  return row;
}

module.exports = {
  SYNC_ERRORS,
  ingestOfflineItem,
  reconcileQueueItem,
  submitOfflineBatch,
  syncPendingQueue,
  retryFailedQueueItems,
  flagReviewAfterVoid,
};
