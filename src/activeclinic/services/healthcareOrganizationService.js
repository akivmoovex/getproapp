"use strict";

/**
 * ActiveClinic healthcare organization lifecycle.
 * Requires explicit active ActiveClinic product enrolment.
 */

const repo = require("../repositories/healthcareOrganizationRepository");
const {
  organizationHasActiveProduct,
} = require("../../platform/services/organizationProductService");
const { recordAuditEventSafe } = require("../../platform/services/auditEventService");
const {
  normalizeCountryCode,
  normalizeTimezone,
} = require("./normalizeActiveClinicContact");
const {
  CODE_ACTIVECLINIC_ORG_V6,
} = require("../../platform/config/deploymentProfiles");

const ORGANIZATION_TYPES = Object.freeze([
  "independent_facility",
  "healthcare_network",
  "faith_based_healthcare",
  "government_healthcare",
  "non_profit_healthcare",
  "private_healthcare",
  "other",
]);

const STATUSES = Object.freeze(["active", "inactive", "suspended", "archived"]);
const ACTIVE_RESOLVE_STATUSES = Object.freeze(["active"]);

const RESULT = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  INVALID_TYPE: "invalid_organization_type",
  INVALID_STATUS: "invalid_status",
  PRODUCT_NOT_ENABLED: "activeclinic_product_not_enabled",
  NOT_FOUND: "healthcare_organization_not_found",
  NOT_ACTIVE: "healthcare_organization_not_active",
  DUPLICATE: "healthcare_organization_exists",
});

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function mapHealthcareOrganization(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    legalName: row.legal_name,
    publicName: row.public_name,
    organizationType: row.organization_type,
    countryCode: row.country_code,
    registrationNumber: row.registration_number || null,
    licenseNumber: row.license_number || null,
    status: row.status,
    timezone: row.timezone,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function trimName(value, max) {
  const text = String(value == null ? "" : value).trim();
  if (!text || text.length > max) return null;
  return text;
}

async function provisionActiveClinicWebsiteSafely(db, input) {
  const run = async () => {
    const orgRow = await db.query(
      `SELECT organization_key FROM platform.organizations WHERE id = $1 LIMIT 1`,
      [input.organizationId]
    );
    const slug = orgRow.rows[0] && orgRow.rows[0].organization_key;
    if (!slug) return;
    const { provisionActiveClinicWebsite } = require("../website/provisionActiveClinicWebsite");
    await provisionActiveClinicWebsite(db, {
      organizationId: input.organizationId,
      slug,
      publicName: input.publicName,
      healthcareOrganizationId: input.healthcareOrganizationId,
      actorIdentityId: input.actorIdentityId || null,
      status: "coming_soon",
    });
  };
  const { isConnectedClient } = require("../../platform/db/provisioningTransaction");
  if (isConnectedClient(db)) {
    await db.query("SAVEPOINT ac_website_provision");
    try {
      await run();
      await db.query("RELEASE SAVEPOINT ac_website_provision");
    } catch {
      try {
        await db.query("ROLLBACK TO SAVEPOINT ac_website_provision");
      } catch {
        /* outer caller handles aborted TX */
      }
    }
    return;
  }
  try {
    await run();
  } catch {
    /* website provision is retry-safe and must not fail clinic creation */
  }
}

/**
 * @param {{ query: Function }} db
 * @param {{
 *   organizationId: string,
 *   legalName: string,
 *   publicName: string,
 *   organizationType: string,
 *   countryCode: string,
 *   timezone: string,
 *   registrationNumber?: string|null,
 *   licenseNumber?: string|null,
 *   status?: string,
 *   deploymentCode?: string|null,
 *   actorPlatformIdentityId?: string|null,
 * }} input
 */
async function createHealthcareOrganization(db, input) {
  const organizationId = String((input && input.organizationId) || "").trim();
  if (!organizationId || !UUID_RE.test(organizationId)) {
    return { ok: false, code: RESULT.INVALID_INPUT, healthcareOrganization: null };
  }

  const legalName = trimName(input.legalName, 200);
  const publicName = trimName(input.publicName, 200);
  const organizationType = String((input && input.organizationType) || "")
    .trim()
    .toLowerCase();
  const status = String((input && input.status) || "active")
    .trim()
    .toLowerCase();

  if (!legalName || !publicName) {
    return { ok: false, code: RESULT.INVALID_INPUT, healthcareOrganization: null };
  }
  if (!ORGANIZATION_TYPES.includes(organizationType)) {
    return { ok: false, code: RESULT.INVALID_TYPE, healthcareOrganization: null };
  }
  if (!STATUSES.includes(status)) {
    return { ok: false, code: RESULT.INVALID_STATUS, healthcareOrganization: null };
  }

  const country = normalizeCountryCode(input.countryCode);
  if (!country.ok) {
    return { ok: false, code: RESULT.INVALID_INPUT, healthcareOrganization: null };
  }
  const timezone = normalizeTimezone(input.timezone);
  if (!timezone.ok) {
    return { ok: false, code: RESULT.INVALID_INPUT, healthcareOrganization: null };
  }

  const enabled = await organizationHasActiveProduct(db, {
    organizationId,
    applicationCode: "activeclinic",
  });
  if (!enabled) {
    return { ok: false, code: RESULT.PRODUCT_NOT_ENABLED, healthcareOrganization: null };
  }

  const existing = await repo.findByOrganizationId(db, organizationId);
  if (existing) {
    return {
      ok: false,
      code: RESULT.DUPLICATE,
      healthcareOrganization: mapHealthcareOrganization(existing),
    };
  }

  try {
    const row = await repo.insertHealthcareOrganization(db, {
      organizationId,
      legalName,
      publicName,
      organizationType,
      countryCode: country.value,
      registrationNumber: trimName(input.registrationNumber, 120),
      licenseNumber: trimName(input.licenseNumber, 120),
      status,
      timezone: timezone.value,
    });

    await recordAuditEventSafe(db, {
      deploymentCode: input.deploymentCode || CODE_ACTIVECLINIC_ORG_V6,
      organizationId,
      actorUserId: null,
      actionKey: "activeclinic.healthcare_organization.create",
      entityType: "healthcare_organization",
      entityId: row.id,
      outcome: "success",
      metadataJson: {
        organization_type: organizationType,
        status,
        actor_kind: "system",
        actor_platform_identity_id: input.actorPlatformIdentityId || null,
      },
    });

    if (input.skipWebsiteProvision !== true) {
      await provisionActiveClinicWebsiteSafely(db, {
        organizationId,
        publicName,
        healthcareOrganizationId: row.id,
        actorIdentityId: input.actorPlatformIdentityId || null,
      });
    }

    return {
      ok: true,
      code: RESULT.OK,
      healthcareOrganization: mapHealthcareOrganization(row),
    };
  } catch (err) {
    const msg = err && err.message ? String(err.message) : "";
    if (/healthcare_organizations_organization_id_unique/i.test(msg)) {
      return { ok: false, code: RESULT.DUPLICATE, healthcareOrganization: null };
    }
    if (/requires active ActiveClinic/i.test(msg)) {
      return { ok: false, code: RESULT.PRODUCT_NOT_ENABLED, healthcareOrganization: null };
    }
    throw err;
  }
}

/**
 * @param {{ query: Function }} db
 * @param {{ organizationId: string }} input
 */
async function getHealthcareOrganizationByOrganizationId(db, input) {
  const organizationId = String((input && input.organizationId) || "").trim();
  if (!organizationId || !UUID_RE.test(organizationId)) {
    return { ok: false, code: RESULT.INVALID_INPUT, healthcareOrganization: null };
  }
  const row = await repo.findByOrganizationId(db, organizationId);
  if (!row) {
    return { ok: false, code: RESULT.NOT_FOUND, healthcareOrganization: null };
  }
  return {
    ok: true,
    code: RESULT.OK,
    healthcareOrganization: mapHealthcareOrganization(row),
  };
}

/**
 * @param {{ query: Function }} db
 * @param {{ id: string, organizationId: string }} input
 */
async function getHealthcareOrganizationById(db, input) {
  const id = String((input && input.id) || "").trim();
  const organizationId = String((input && input.organizationId) || "").trim();
  if (!id || !organizationId || !UUID_RE.test(id) || !UUID_RE.test(organizationId)) {
    return { ok: false, code: RESULT.INVALID_INPUT, healthcareOrganization: null };
  }
  const row = await repo.findByIdAndOrganization(db, { id, organizationId });
  if (!row) {
    return { ok: false, code: RESULT.NOT_FOUND, healthcareOrganization: null };
  }
  return {
    ok: true,
    code: RESULT.OK,
    healthcareOrganization: mapHealthcareOrganization(row),
  };
}

/**
 * @param {{ query: Function }} db
 * @param {{ organizationId: string, allowedStatuses?: string[] }} input
 */
async function requireActiveHealthcareOrganization(db, input) {
  const enabled = await organizationHasActiveProduct(db, {
    organizationId: input.organizationId,
    applicationCode: "activeclinic",
  });
  if (!enabled) {
    return { ok: false, code: RESULT.PRODUCT_NOT_ENABLED, healthcareOrganization: null };
  }

  const got = await getHealthcareOrganizationByOrganizationId(db, {
    organizationId: input.organizationId,
  });
  if (!got.ok) return got;

  const allowed =
    Array.isArray(input.allowedStatuses) && input.allowedStatuses.length
      ? input.allowedStatuses
      : ACTIVE_RESOLVE_STATUSES;
  if (!allowed.includes(got.healthcareOrganization.status)) {
    return {
      ok: false,
      code: RESULT.NOT_ACTIVE,
      healthcareOrganization: got.healthcareOrganization,
    };
  }
  return got;
}

/**
 * @param {{ query: Function }} db
 * @param {{ id: string, organizationId: string, patch: object, deploymentCode?: string|null }} input
 */
async function updateHealthcareOrganization(db, input) {
  const existing = await getHealthcareOrganizationById(db, input);
  if (!existing.ok) return existing;

  const patch = { ...(input.patch || {}) };
  // Ordinary profile updates must not change lifecycle status here.
  if (input.allowStatusChange !== true) {
    delete patch.status;
  }
  if (patch.organizationType != null) {
    const organizationType = String(patch.organizationType).trim().toLowerCase();
    if (!ORGANIZATION_TYPES.includes(organizationType)) {
      return { ok: false, code: RESULT.INVALID_TYPE, healthcareOrganization: null };
    }
    patch.organizationType = organizationType;
  }
  if (patch.status != null && !STATUSES.includes(String(patch.status))) {
    return { ok: false, code: RESULT.INVALID_STATUS, healthcareOrganization: null };
  }
  if (patch.countryCode != null) {
    const country = normalizeCountryCode(patch.countryCode);
    if (!country.ok) {
      return { ok: false, code: RESULT.INVALID_INPUT, healthcareOrganization: null };
    }
    patch.countryCode = country.value;
  }
  if (patch.timezone != null) {
    const timezone = normalizeTimezone(patch.timezone);
    if (!timezone.ok) {
      return { ok: false, code: RESULT.INVALID_INPUT, healthcareOrganization: null };
    }
    patch.timezone = timezone.value;
  }
  if (patch.legalName != null) {
    const legalName = trimName(patch.legalName, 200);
    if (!legalName) return { ok: false, code: RESULT.INVALID_INPUT, healthcareOrganization: null };
    patch.legalName = legalName;
  }
  if (patch.publicName != null) {
    const publicName = trimName(patch.publicName, 200);
    if (!publicName) return { ok: false, code: RESULT.INVALID_INPUT, healthcareOrganization: null };
    patch.publicName = publicName;
  }
  if (Object.prototype.hasOwnProperty.call(patch, "registrationNumber")) {
    if (patch.registrationNumber == null || String(patch.registrationNumber).trim() === "") {
      patch.registrationNumber = null;
    } else {
      const registrationNumber = String(patch.registrationNumber).trim().slice(0, 120);
      if (!registrationNumber) {
        return { ok: false, code: RESULT.INVALID_INPUT, healthcareOrganization: null };
      }
      patch.registrationNumber = registrationNumber;
    }
  }
  // License and ownership fields are not editable via ordinary profile forms.
  delete patch.licenseNumber;
  delete patch.organizationId;
  delete patch.id;

  const before = existing.healthcareOrganization;
  const changedFields = [];
  const track = [
    ["legalName", "legal_name"],
    ["publicName", "public_name"],
    ["organizationType", "organization_type"],
    ["countryCode", "country_code"],
    ["registrationNumber", "registration_number"],
    ["timezone", "timezone"],
    ["status", "status"],
  ];
  for (const [key, auditKey] of track) {
    if (!Object.prototype.hasOwnProperty.call(patch, key)) continue;
    const next = patch[key] == null ? null : String(patch[key]);
    const prev = before[key] == null ? null : String(before[key]);
    if (next !== prev) changedFields.push(auditKey);
  }

  const row = await repo.updateHealthcareOrganization(db, {
    id: input.id,
    organizationId: input.organizationId,
    patch,
  });

  if (changedFields.length) {
    await recordAuditEventSafe(db, {
      deploymentCode: input.deploymentCode || CODE_ACTIVECLINIC_ORG_V6,
      organizationId: input.organizationId,
      actorUserId: null,
      actionKey: "activeclinic.healthcare_organization.update",
      entityType: "healthcare_organization",
      entityId: input.id,
      outcome: "success",
      metadata: {
        actor_type: "staff",
        field_keys: changedFields,
        source: "settings",
      },
    });
  }

  return {
    ok: true,
    code: RESULT.OK,
    healthcareOrganization: mapHealthcareOrganization(row),
    changedFields,
  };
}

/**
 * @param {{ query: Function }} db
 * @param {{ id: string, organizationId: string, deploymentCode?: string|null }} input
 */
async function archiveHealthcareOrganization(db, input) {
  const existing = await getHealthcareOrganizationById(db, input);
  if (!existing.ok) return existing;
  const row = await repo.archiveHealthcareOrganization(db, {
    id: input.id,
    organizationId: input.organizationId,
  });
  await recordAuditEventSafe(db, {
    deploymentCode: input.deploymentCode || CODE_ACTIVECLINIC_ORG_V6,
    organizationId: input.organizationId,
    actorUserId: null,
    actionKey: "activeclinic.healthcare_organization.archive",
    entityType: "healthcare_organization",
    entityId: input.id,
    outcome: "success",
    metadataJson: { actor_kind: "system" },
  });
  return {
    ok: true,
    code: RESULT.OK,
    healthcareOrganization: mapHealthcareOrganization(row),
  };
}

module.exports = {
  RESULT,
  ORGANIZATION_TYPES,
  STATUSES,
  ACTIVE_RESOLVE_STATUSES,
  mapHealthcareOrganization,
  createHealthcareOrganization,
  getHealthcareOrganizationById,
  getHealthcareOrganizationByOrganizationId,
  requireActiveHealthcareOrganization,
  updateHealthcareOrganization,
  archiveHealthcareOrganization,
};
