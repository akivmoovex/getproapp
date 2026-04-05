/** Default workflow statuses for company contact leads (admin). */
const LEAD_STATUSES = Object.freeze(["open", "in_progress", "deferred", "closed"]);

function normalizeLeadStatus(raw) {
  const s = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
  if (s === "new") return "open";
  if (LEAD_STATUSES.includes(s)) return s;
  return "open";
}

function leadStatusLabel(s) {
  const v = normalizeLeadStatus(s);
  const map = {
    open: "Open",
    in_progress: "In progress",
    deferred: "Deferred",
    closed: "Closed",
  };
  return map[v] || v;
}

module.exports = { LEAD_STATUSES, normalizeLeadStatus, leadStatusLabel };
