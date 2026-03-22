/** CRM task workflow (stored snake_case in DB). */
const CRM_TASK_STATUSES = Object.freeze([
  "new",
  "in_progress",
  "pending",
  "completed",
  "deferred",
  "waiting",
]);

const LABELS = {
  new: "New",
  in_progress: "In Progress",
  pending: "Pending",
  completed: "Completed",
  deferred: "Deferred",
  waiting: "Waiting",
};

function normalizeCrmTaskStatus(raw) {
  const s = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
  if (CRM_TASK_STATUSES.includes(s)) return s;
  return "new";
}

function crmTaskStatusLabel(s) {
  const v = normalizeCrmTaskStatus(s);
  return LABELS[v] || v;
}

module.exports = { CRM_TASK_STATUSES, normalizeCrmTaskStatus, crmTaskStatusLabel };
