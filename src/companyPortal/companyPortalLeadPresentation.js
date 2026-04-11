/**
 * Provider portal: explicit, allowlisted view data for lead list + detail templates.
 * Do not pass raw DB rows or admin-only fields — only these shapes reach EJS.
 */

/**
 * @param {Record<string, unknown>|null|undefined} assignment mapCompanyPortalAssignmentSummary output
 * @param {{ displayPrefix?: string, code?: string }|null|undefined} budgetMeta
 * @returns {string}
 */
function formatLeadPriceDisplay(assignment, budgetMeta) {
  const a = assignment || {};
  const v = a.estimated_budget_value;
  if (v == null || v === "") return "—";
  const prefix = budgetMeta && budgetMeta.displayPrefix ? String(budgetMeta.displayPrefix).trim() : "";
  const cur = a.estimated_budget_currency != null ? String(a.estimated_budget_currency).trim() : "";
  const num = String(v).trim();
  const left = prefix ? `${prefix} ${num}` : num;
  return cur ? `${left} ${cur}` : left;
}

/** Provider portal: never expose estimated budget to company users. */
function formatLeadPriceDisplayForProviderPortal() {
  return "—";
}

/**
 * Card row for list templates (no client PII).
 * @param {Record<string, unknown>|null|undefined} assignment
 * @param {{ displayPrefix?: string, code?: string }|null|undefined} budgetMeta
 */
function buildCompanyPortalLeadCardVm(assignment, _budgetMeta) {
  const a = assignment || {};
  return {
    assignment_id: a.assignment_id,
    project_code: a.project_code,
    assignment_status: a.assignment_status,
    city: a.city,
    neighborhood: a.neighborhood,
    lead_price_display: formatLeadPriceDisplayForProviderPortal(),
  };
}

/**
 * Detail page VM: same allowlist + formatted budget line (single string for DOM).
 * @param {Record<string, unknown>|null|undefined} assignment
 * @param {{ displayPrefix?: string, code?: string }|null|undefined} budgetMeta
 */
function buildCompanyPortalLeadDetailVm(assignment, _budgetMeta) {
  const a = assignment || {};
  if (a.assignment_id == null) return null;
  return {
    assignment_id: a.assignment_id,
    assignment_status: a.assignment_status,
    assigned_at: a.assigned_at,
    assignment_responded_at: a.assignment_responded_at,
    assignment_response_note: a.assignment_response_note,
    project_id: a.project_id,
    project_code: a.project_code,
    city: a.city,
    neighborhood: a.neighborhood,
    project_status: a.project_status,
    project_created_at: a.project_created_at,
    lead_price_display: formatLeadPriceDisplayForProviderPortal(),
  };
}

module.exports = {
  formatLeadPriceDisplay,
  buildCompanyPortalLeadCardVm,
  buildCompanyPortalLeadDetailVm,
};
