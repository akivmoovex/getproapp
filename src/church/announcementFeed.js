"use strict";

function publishTimestamp(item) {
  if (!item || !item.publish_at) return 0;
  const t = new Date(item.publish_at).getTime();
  return Number.isNaN(t) ? 0 : t;
}

function priorityRank(priority) {
  const map = { emergency: 4, urgent: 3, important: 2, normal: 1 };
  return map[String(priority || "normal")] || 1;
}

function isActivelyFeatured(item) {
  if (!item) return false;
  const featured = item.is_featured === true || item.is_featured === "t";
  if (!featured) return false;
  if (!item.featured_until) return true;
  const until = new Date(item.featured_until).getTime();
  if (Number.isNaN(until)) return true;
  return until > Date.now();
}

function feedSortScore(item) {
  const featured = isActivelyFeatured(item) ? 1 : 0;
  const pinned = item && (item.is_pinned === true || item.is_pinned === "t") ? 1 : 0;
  return {
    featured,
    pinned,
    priority: priorityRank(item && item.priority),
    publish: publishTimestamp(item),
  };
}

/**
 * Merge branch announcements and HQ broadcasts.
 * Actively featured → pinned → priority → newest first.
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
  merged.sort((a, b) => {
    const sa = feedSortScore(a);
    const sb = feedSortScore(b);
    if (sb.featured !== sa.featured) return sb.featured - sa.featured;
    if (sb.pinned !== sa.pinned) return sb.pinned - sa.pinned;
    if (sb.priority !== sa.priority) return sb.priority - sa.priority;
    return sb.publish - sa.publish;
  });
  return merged.slice(0, cap);
}

function feedItemKey(item) {
  return `${item.source === "hq" ? "hq" : "branch"}:${item.id}`;
}

/**
 * Split feed into featured / pinned / remaining without duplicates.
 * @param {object[]} items
 * @returns {{ featured: object[], pinned: object[], remaining: object[], list: object[] }}
 */
function partitionAnnouncementFeed(items) {
  const list = Array.isArray(items) ? items : [];
  const featured = [];
  const pinned = [];
  const remaining = [];
  const seen = new Set();

  for (const item of list) {
    if (isActivelyFeatured(item)) {
      featured.push(item);
      seen.add(feedItemKey(item));
    }
  }
  for (const item of list) {
    const key = feedItemKey(item);
    if (seen.has(key)) continue;
    if (item.is_pinned === true || item.is_pinned === "t") {
      pinned.push(item);
      seen.add(key);
    }
  }
  for (const item of list) {
    const key = feedItemKey(item);
    if (seen.has(key)) continue;
    remaining.push(item);
  }

  return {
    featured,
    pinned,
    remaining,
    list: [...featured, ...pinned, ...remaining],
  };
}

function priorityDisplay(priority) {
  const key = String(priority || "normal");
  const map = {
    normal: { key: "normal", label: "Normal", icon: "flag" },
    important: { key: "important", label: "Important", icon: "priority_high" },
    urgent: { key: "urgent", label: "Urgent", icon: "warning" },
    emergency: { key: "emergency", label: "Emergency", icon: "e911_emergency" },
  };
  return map[key] || map.normal;
}

function attachmentTypeLabel(mimeType, filename) {
  const mime = String(mimeType || "").toLowerCase();
  if (mime === "application/pdf") return "PDF";
  if (mime === "image/png") return "PNG";
  if (mime === "image/jpeg") return "JPG";
  if (mime === "application/msword") return "DOC";
  if (mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return "DOCX";
  const ext = String(filename || "").split(".").pop();
  return ext ? String(ext).toUpperCase() : "File";
}

module.exports = {
  mergeAnnouncementFeed,
  partitionAnnouncementFeed,
  priorityRank,
  isActivelyFeatured,
  priorityDisplay,
  attachmentTypeLabel,
  feedItemKey,
};
