"use strict";

const REGISTRY_FILTERS = [
  "all",
  "active",
  "submitted_reports",
  "changes_requested",
  "missing_current_report",
  "needing_attention",
];

function parsePeriodMonth(raw) {
  const value = String(raw || "").trim().slice(0, 7);
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1, label: currentPeriodLabel(now) };
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1, label: currentPeriodLabel(now) };
  }
  return { year, month, label: `${year}-${String(month).padStart(2, "0")}` };
}

function currentPeriodLabel(date) {
  const d = date instanceof Date ? date : new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function formatBranchLocation(branch) {
  if (!branch) return "—";
  const parts = [branch.location_text, branch.city, branch.country].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : "—";
}

function formatBranchContact(branch, branchAdmin) {
  const name = branch.pastor_name || (branchAdmin && branchAdmin.full_name) || "";
  const phone = branch.contact_phone || (branchAdmin && branchAdmin.phone) || "";
  const email = branch.contact_email || (branchAdmin && branchAdmin.email) || "";
  return { name, phone, email };
}

function computeAttentionItems(flags) {
  const items = [];
  if (flags.missingCurrentMonthReport) {
    items.push({ key: "missing_report", label: "Missing current month report" });
  }
  if (flags.changesRequested) {
    items.push({ key: "changes_requested", label: "Report changes requested" });
  }
  if (flags.followUpRequestedCount > 0) {
    items.push({
      key: "ministry_follow_up",
      label: `${flags.followUpRequestedCount} ministry follow-up note(s)`,
    });
  }
  if (flags.pendingMembers > 0) {
    items.push({ key: "pending_members", label: `${flags.pendingMembers} pending member(s)` });
  }
  if (flags.openRequests > 0) {
    items.push({ key: "open_requests", label: `${flags.openRequests} open request(s)` });
  }
  return items;
}

function branchNeedsAttention(flags) {
  return computeAttentionItems(flags).length > 0;
}

function matchesRegistryFilter(row, filter) {
  if (!filter || filter === "all") return true;
  if (filter === "active") return row.status === "active";
  if (filter === "submitted_reports") {
    return row.currentMonthReportStatus === "submitted";
  }
  if (filter === "changes_requested") {
    return row.latestReportStatus === "changes_requested";
  }
  if (filter === "missing_current_report") {
    return row.missingCurrentMonthReport;
  }
  if (filter === "needing_attention") {
    return row.needsAttention;
  }
  return true;
}

function matchesRegistrySearch(row, query) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    row.name,
    row.location,
    row.contactName,
    row.contactPhone,
    row.contactEmail,
    row.pastor_name,
    row.city,
    row.country,
    row.location_text,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(q);
}

module.exports = {
  REGISTRY_FILTERS,
  parsePeriodMonth,
  currentPeriodLabel,
  formatBranchLocation,
  formatBranchContact,
  computeAttentionItems,
  branchNeedsAttention,
  matchesRegistryFilter,
  matchesRegistrySearch,
};
