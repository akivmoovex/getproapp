/**
 * Intake client project: completeness checks before publishing (Stage 1 — no auto-allocation).
 * Tenant-scoped settings in intake_allocation_settings / intake_category_lead_settings.
 */

const intakeSettingsRepo = require("../db/pg/intakeSettingsRepo");
const categoriesRepo = require("../db/pg/categoriesRepo");

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

async function getAllocationSettingsAsync(pool, tenantId) {
  return intakeSettingsRepo.getAllocationSettings(pool, Number(tenantId));
}

async function getCategoryResponseWindowHoursAsync(pool, tenantId, categoryId) {
  return intakeSettingsRepo.getCategoryResponseWindowHours(pool, Number(tenantId), categoryId);
}

async function validateIntakeProjectForPublishAsync(pool, tenantId, projectRow, imageCount) {
  const errors = [];
  const warnings = [];
  const settings = await getAllocationSettingsAsync(pool, tenantId);
  const p = projectRow || {};

  if (settings.require_category_for_publish) {
    const cid = Number(p.intake_category_id);
    if (!cid || cid < 1) {
      errors.push({ code: "category", message: "A profession / category is required before publishing." });
    } else {
      const cat = await categoriesRepo.getByIdAndTenantId(pool, cid, Number(tenantId));
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
  getAllocationSettingsAsync,
  getCategoryResponseWindowHoursAsync,
  validateIntakeProjectForPublishAsync,
};
