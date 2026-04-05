/**
 * Intake client project: completeness checks before publishing (Stage 1 — no auto-allocation).
 * Tenant-scoped settings in intake_allocation_settings / intake_category_lead_settings.
 */

/** Canonical lifecycle values stored in intake_client_projects.status */
const INTAKE_PROJECT_LIFECYCLE_STATUSES = [
  "draft",
  "needs_review",
  "ready_to_publish",
  "published",
  "closed",
];

const INTAKE_PROJECT_PUBLISHABLE_STATUSES = new Set(["draft", "needs_review", "ready_to_publish"]);

const DEFAULT_RESPONSE_HOURS = 72;

/**
 * @param {import("better-sqlite3").Database} db
 * @param {number} tenantId
 */
function getAllocationSettings(db, tenantId) {
  const tid = Number(tenantId);
  const row = db.prepare(`SELECT * FROM intake_allocation_settings WHERE tenant_id = ?`).get(tid);
  const n = (v, d) => (v != null && v !== "" && Number.isFinite(Number(v)) ? Number(v) : d);
  const flag = (v, defaultTrue) => (v === 0 || v === false ? false : defaultTrue);
  if (!row) {
    return {
      established_min_rating: 3.0,
      established_min_review_count: 5,
      provisional_min_rating: 2.0,
      provisional_max_review_count: 4,
      initial_allocation_count: 3,
      target_positive_responses: 2,
      require_category_for_publish: true,
      require_budget_for_publish: true,
      require_min_images_for_publish: true,
      min_images_for_publish: 1,
    };
  }
  return {
    established_min_rating: n(row.established_min_rating, 3.0),
    established_min_review_count: n(row.established_min_review_count, 5),
    provisional_min_rating: n(row.provisional_min_rating, 2.0),
    provisional_max_review_count: n(row.provisional_max_review_count, 4),
    initial_allocation_count: n(row.initial_allocation_count, 3),
    target_positive_responses: n(row.target_positive_responses, 2),
    require_category_for_publish: flag(row.require_category_for_publish, true),
    require_budget_for_publish: flag(row.require_budget_for_publish, true),
    require_min_images_for_publish: flag(row.require_min_images_for_publish, true),
    min_images_for_publish: Math.max(0, Math.floor(n(row.min_images_for_publish, 1))),
  };
}

/**
 * Response SLA window (hours) for a category; default when no row.
 * @param {import("better-sqlite3").Database} db
 * @param {number} tenantId
 * @param {number} categoryId
 */
function getCategoryResponseWindowHours(db, tenantId, categoryId) {
  const tid = Number(tenantId);
  const cid = Number(categoryId);
  if (!cid || cid < 1) return DEFAULT_RESPONSE_HOURS;
  const row = db
    .prepare(`SELECT response_window_hours FROM intake_category_lead_settings WHERE tenant_id = ? AND category_id = ?`)
    .get(tid, cid);
  if (!row || row.response_window_hours == null) return DEFAULT_RESPONSE_HOURS;
  const h = Number(row.response_window_hours);
  return Number.isFinite(h) && h > 0 ? h : DEFAULT_RESPONSE_HOURS;
}

/**
 * @param {Record<string, unknown>} projectRow intake_client_projects row
 * @param {number} imageCount
 * @returns {{ ok: boolean, errors: { code: string, message: string }[], warnings: { code: string, message: string }[] }}
 */
function validateIntakeProjectForPublish(db, tenantId, projectRow, imageCount) {
  const errors = [];
  const warnings = [];
  const settings = getAllocationSettings(db, tenantId);
  const p = projectRow || {};

  if (settings.require_category_for_publish) {
    const cid = Number(p.intake_category_id);
    if (!cid || cid < 1) {
      errors.push({ code: "category", message: "A profession / category is required before publishing." });
    } else {
      const cat = db.prepare(`SELECT id FROM categories WHERE id = ? AND tenant_id = ?`).get(cid, Number(tenantId));
      if (!cat) {
        errors.push({ code: "category", message: "Selected category is invalid for this region." });
      }
    }
  }

  if (!String(p.city || "").trim()) {
    errors.push({ code: "city", message: "City is required." });
  }

  const neigh = String(p.neighborhood || "").trim();
  const street = String(p.street_name || "").trim();
  const house = String(p.house_number || "").trim();
  if (!neigh && !(street && house)) {
    errors.push({
      code: "location_detail",
      message: "Add a neighborhood or both street name and house number for the project site.",
    });
  }

  if (settings.require_budget_for_publish) {
    const bv = p.estimated_budget_value;
    if (bv == null || bv === "" || (typeof bv === "number" && (Number.isNaN(bv) || bv < 0))) {
      errors.push({ code: "budget", message: "Estimated budget is required before publishing." });
    }
  }

  if (settings.require_min_images_for_publish) {
    const min = settings.min_images_for_publish;
    const n = Number(imageCount) || 0;
    if (n < min) {
      errors.push({
        code: "images",
        message: `At least ${min} project photo(s) are required before publishing (currently ${n}).`,
      });
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}

module.exports = {
  INTAKE_PROJECT_LIFECYCLE_STATUSES,
  INTAKE_PROJECT_PUBLISHABLE_STATUSES,
  DEFAULT_RESPONSE_HOURS,
  getAllocationSettings,
  getCategoryResponseWindowHours,
  validateIntakeProjectForPublish,
};
