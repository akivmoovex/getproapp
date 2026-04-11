/**
 * Company portal: allowlisted fields for assigned intake projects.
 * Never SELECT * or pass full intake_client_projects / intake_clients rows to company templates.
 */

/** Assignment list row (active company workflow; no client PII). */
const COMPANY_PORTAL_ASSIGNMENT_LIST_SELECT = [
  "a.id AS assignment_id",
  "a.status AS assignment_status",
  "a.created_at AS assigned_at",
  "a.responded_at AS assignment_responded_at",
  "a.response_note AS assignment_response_note",
  "p.id AS project_id",
  "p.project_code",
  "p.city",
  "p.neighborhood",
  "p.estimated_budget_value",
  "p.estimated_budget_currency",
  "p.deal_price AS project_deal_price",
  "p.status AS project_status",
  "p.created_at AS project_created_at",
  "p.updated_at AS project_updated_at",
].join(", ");

/** Single assignment + project detail (still no client identity or street address columns). */
const COMPANY_PORTAL_ASSIGNMENT_DETAIL_SELECT = COMPANY_PORTAL_ASSIGNMENT_LIST_SELECT;

/** Shown in company portal list (declined hidden from list query). */
const COMPANY_PORTAL_ACTIVE_ASSIGNMENT_STATUSES = [
  "pending",
  "allocated",
  "viewed",
  "interested",
  "callback_requested",
];

/**
 * @param {string} action interested | decline | callback
 * @returns {string|null} new status or null if invalid
 */
function nextAssignmentStatusFromCompanyAction(currentStatus, action) {
  const c = String(currentStatus || "").trim().toLowerCase();
  const a = String(action || "").trim().toLowerCase();
  if (c === "declined") return null;
  if (a === "interested") {
    if (c === "pending" || c === "allocated" || c === "viewed") return "interested";
    return null;
  }
  if (a === "decline") {
    if (
      c === "pending" ||
      c === "allocated" ||
      c === "viewed" ||
      c === "interested" ||
      c === "callback_requested"
    ) {
      return "declined";
    }
    return null;
  }
  if (a === "callback") {
    if (c === "pending" || c === "allocated" || c === "viewed" || c === "interested") return "callback_requested";
    return null;
  }
  return null;
}

function assignmentStatusLabelForPortal(status) {
  const s = String(status || "").trim().toLowerCase();
  if (s === "pending") return "Awaiting your response";
  if (s === "allocated") return "New lead assigned";
  if (s === "viewed") return "Viewed";
  if (s === "interested") return "Interested";
  if (s === "declined") return "Declined";
  if (s === "callback_requested") return "Callback requested";
  if (s === "timed_out") return "Response window ended";
  if (s === "expired") return "Expired";
  return s || "—";
}

/**
 * @param {Record<string, unknown>|null|undefined} row
 */
function mapCompanyPortalAssignmentSummary(row) {
  if (!row) return null;
  return {
    assignment_id: row.assignment_id,
    assignment_status: row.assignment_status,
    assigned_at: row.assigned_at,
    assignment_responded_at: row.assignment_responded_at,
    assignment_response_note: row.assignment_response_note,
    project_id: row.project_id,
    project_code: row.project_code,
    city: row.city,
    neighborhood: row.neighborhood,
    estimated_budget_value: row.estimated_budget_value,
    estimated_budget_currency: row.estimated_budget_currency,
    project_deal_price: row.project_deal_price,
    project_status: row.project_status,
    project_created_at: row.project_created_at,
    project_updated_at: row.project_updated_at,
  };
}

/**
 * @param {Record<string, unknown>|null|undefined} row
 */
function mapCompanyPortalAssignmentDetail(row) {
  return mapCompanyPortalAssignmentSummary(row);
}

module.exports = {
  COMPANY_PORTAL_ASSIGNMENT_LIST_SELECT,
  COMPANY_PORTAL_ASSIGNMENT_DETAIL_SELECT,
  COMPANY_PORTAL_ACTIVE_ASSIGNMENT_STATUSES,
  mapCompanyPortalAssignmentSummary,
  mapCompanyPortalAssignmentDetail,
  nextAssignmentStatusFromCompanyAction,
  assignmentStatusLabelForPortal,
};
