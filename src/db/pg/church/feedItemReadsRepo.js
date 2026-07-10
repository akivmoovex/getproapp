"use strict";

/**
 * List may mark items as seen (first_seen_at) without marking fully read.
 * Detail view should call markFeedItemRead.
 */

/**
 * @param {import("pg").Pool | import("pg").PoolClient} pool
 * @param {{
 *   organization_id: number,
 *   branch_id: number,
 *   member_id: number,
 *   source_type: "hq_broadcast" | "announcement",
 *   source_id: number,
 * }} entry
 */
async function markFeedItemSeen(pool, entry) {
  await pool.query(
    `INSERT INTO public.church_feed_item_reads (
       organization_id, branch_id, member_id, source_type, source_id,
       first_seen_at, created_at, updated_at
     ) VALUES ($1, $2, $3, $4, $5, now(), now(), now())
     ON CONFLICT (member_id, source_type, source_id) DO UPDATE
       SET updated_at = now()`,
    [
      entry.organization_id,
      entry.branch_id,
      entry.member_id,
      entry.source_type,
      entry.source_id,
    ]
  );
}

/**
 * @param {import("pg").Pool | import("pg").PoolClient} pool
 * @param {{
 *   organization_id: number,
 *   branch_id: number,
 *   member_id: number,
 *   items: Array<{ source_type: "hq_broadcast" | "announcement", source_id: number }>,
 * }} batch
 */
async function markFeedItemsSeen(pool, batch) {
  const items = Array.isArray(batch.items) ? batch.items : [];
  for (const item of items) {
    if (!item || !item.source_type || !item.source_id) continue;
    await markFeedItemSeen(pool, {
      organization_id: batch.organization_id,
      branch_id: batch.branch_id,
      member_id: batch.member_id,
      source_type: item.source_type,
      source_id: item.source_id,
    });
  }
}

/**
 * Marks fully read (sets read_at). Also ensures first_seen_at exists.
 * @param {import("pg").Pool | import("pg").PoolClient} pool
 * @param {{
 *   organization_id: number,
 *   branch_id: number,
 *   member_id: number,
 *   source_type: "hq_broadcast" | "announcement",
 *   source_id: number,
 * }} entry
 */
async function markFeedItemRead(pool, entry) {
  await pool.query(
    `INSERT INTO public.church_feed_item_reads (
       organization_id, branch_id, member_id, source_type, source_id,
       first_seen_at, read_at, created_at, updated_at
     ) VALUES ($1, $2, $3, $4, $5, now(), now(), now(), now())
     ON CONFLICT (member_id, source_type, source_id) DO UPDATE
       SET read_at = COALESCE(public.church_feed_item_reads.read_at, now()),
           updated_at = now()`,
    [
      entry.organization_id,
      entry.branch_id,
      entry.member_id,
      entry.source_type,
      entry.source_id,
    ]
  );
}

/**
 * @param {import("pg").Pool | import("pg").PoolClient} pool
 * @param {{
 *   organization_id: number,
 *   branch_id: number,
 *   member_id: number,
 *   items: Array<{ source_type: "hq_broadcast" | "announcement", source_id: number }>,
 * }} batch
 */
async function markFeedItemsRead(pool, batch) {
  const items = Array.isArray(batch.items) ? batch.items : [];
  for (const item of items) {
    if (!item || !item.source_type || !item.source_id) continue;
    await markFeedItemRead(pool, {
      organization_id: batch.organization_id,
      branch_id: batch.branch_id,
      member_id: batch.member_id,
      source_type: item.source_type,
      source_id: item.source_id,
    });
  }
}

/**
 * @param {import("pg").Pool | import("pg").PoolClient} pool
 * @param {number} memberId
 * @param {Array<{ source_type: string, source_id: number }>} items
 * @returns {Promise<Map<string, { first_seen_at: Date|null, read_at: Date|null }>>}
 */
async function listReceiptsForMember(pool, memberId, items) {
  const list = Array.isArray(items) ? items.filter((i) => i && i.source_type && i.source_id) : [];
  const out = new Map();
  if (!list.length) return out;
  const types = list.map((i) => i.source_type);
  const ids = list.map((i) => Number(i.source_id));
  const r = await pool.query(
    `SELECT source_type, source_id, first_seen_at, read_at
     FROM public.church_feed_item_reads
     WHERE member_id = $1
       AND (source_type, source_id) IN (
         SELECT * FROM UNNEST($2::text[], $3::bigint[])
       )`,
    [memberId, types, ids]
  );
  for (const row of r.rows) {
    out.set(`${row.source_type}:${row.source_id}`, {
      first_seen_at: row.first_seen_at || null,
      read_at: row.read_at || null,
    });
  }
  return out;
}

/**
 * Keys that have been fully read (read_at set).
 * @returns {Promise<Set<string>>}
 */
async function listReadKeysForMember(pool, memberId, items) {
  const receipts = await listReceiptsForMember(pool, memberId, items);
  const keys = new Set();
  for (const [key, receipt] of receipts.entries()) {
    if (receipt.read_at) keys.add(key);
  }
  return keys;
}

/**
 * Count fully-read receipts for analytics (unique members; unique constraint).
 * @returns {Promise<number>}
 */
async function countReadsForSource(pool, organizationId, sourceType, sourceId) {
  const summary = await summarizeReceiptsForSource(pool, organizationId, sourceType, sourceId);
  return summary.read_count;
}

/**
 * Count first-seen receipts (impressions / seen). Unique members with a receipt row.
 * @returns {Promise<number>}
 */
async function countSeenForSource(pool, organizationId, sourceType, sourceId) {
  const summary = await summarizeReceiptsForSource(pool, organizationId, sourceType, sourceId);
  return summary.seen_count;
}

/**
 * Aggregate seen + read for one feed item (single query).
 * @returns {Promise<{ seen_count: number, read_count: number }>}
 */
async function summarizeReceiptsForSource(pool, organizationId, sourceType, sourceId) {
  const r = await pool.query(
    `SELECT
       COUNT(*)::int AS seen_count,
       COUNT(*) FILTER (WHERE read_at IS NOT NULL)::int AS read_count
     FROM public.church_feed_item_reads
     WHERE organization_id = $1
       AND source_type = $2
       AND source_id = $3`,
    [organizationId, sourceType, sourceId]
  );
  const row = r.rows[0] || {};
  return {
    seen_count: row.seen_count || 0,
    read_count: row.read_count || 0,
  };
}

/**
 * Branch breakdown of seen/read in one query.
 * @param {number[]} [branchIds] optional filter; omit for all org receipts for this source
 * @returns {Promise<Array<{ branch_id: number, seen_count: number, read_count: number }>>}
 */
async function summarizeReceiptsByBranchForSource(pool, organizationId, sourceType, sourceId, branchIds) {
  const params = [organizationId, sourceType, sourceId];
  let branchFilter = "";
  if (Array.isArray(branchIds)) {
    if (!branchIds.length) return [];
    params.push(branchIds);
    branchFilter = ` AND branch_id = ANY($${params.length}::bigint[])`;
  }
  const r = await pool.query(
    `SELECT
       branch_id,
       COUNT(*)::int AS seen_count,
       COUNT(*) FILTER (WHERE read_at IS NOT NULL)::int AS read_count
     FROM public.church_feed_item_reads
     WHERE organization_id = $1
       AND source_type = $2
       AND source_id = $3
       ${branchFilter}
     GROUP BY branch_id
     ORDER BY branch_id ASC`,
    params
  );
  return r.rows.map((row) => ({
    branch_id: Number(row.branch_id),
    seen_count: row.seen_count || 0,
    read_count: row.read_count || 0,
  }));
}

module.exports = {
  markFeedItemSeen,
  markFeedItemsSeen,
  markFeedItemRead,
  markFeedItemsRead,
  listReceiptsForMember,
  listReadKeysForMember,
  countReadsForSource,
  countSeenForSource,
  summarizeReceiptsForSource,
  summarizeReceiptsByBranchForSource,
};
