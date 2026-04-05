/** CRM task workflow (stored snake_case in DB). */
const CRM_TASK_STATUSES = Object.freeze([
  "new",
  "in_progress",
  "blocked",
  "completed",
  "deferred",
]);

const LABELS = {
  new: "New",
  in_progress: "In Progress",
  blocked: "Blocked",
  completed: "Completed",
  deferred: "Deferred",
};

function normalizeCrmTaskStatus(raw) {
  const s = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
  if (s === "pending" || s === "waiting") return "blocked";
  if (CRM_TASK_STATUSES.includes(s)) return s;
  return "new";
}

function crmTaskStatusLabel(s) {
  const v = normalizeCrmTaskStatus(s);
  return LABELS[v] || v;
}

module.exports = { CRM_TASK_STATUSES, normalizeCrmTaskStatus, crmTaskStatusLabel };
