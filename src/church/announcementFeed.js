"use strict";

function publishTimestamp(item) {
  if (!item || !item.publish_at) return 0;
  const t = new Date(item.publish_at).getTime();
  return Number.isNaN(t) ? 0 : t;
}

/**
 * Merge branch announcements and HQ broadcasts, newest first.
 * @param {object[]} branchItems
 * @param {object[]} hqItems
 * @param {number} [limit]
 * @returns {object[]}
 */
function mergeAnnouncementFeed(branchItems, hqItems, limit) {
  const cap = Math.min(Math.max(Number(limit) || 20, 1), 50);
  const merged = [
    ...(branchItems || []).map((item) => ({ ...item, source: item.source || "branch" })),
    ...(hqItems || []).map((item) => ({ ...item, source: item.source || "hq" })),
  ];
  merged.sort((a, b) => publishTimestamp(b) - publishTimestamp(a));
  return merged.slice(0, cap);
}

module.exports = {
  mergeAnnouncementFeed,
};
