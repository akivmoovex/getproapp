"use strict";

/**
 * ActiveClinic facility lifecycle (organization-scoped).
 */

const repo = require("../repositories/facilityRepository");
const {
  requireActiveHealthcareOrganization,
  getHealthcareOrganizationById,
  RESULT: HCO_RESULT,
} = require("./healthcareOrganizationService");
const {
  organizationHasActiveProduct,
} = require("../../platform/services/organizationProductService");
const { recordAuditEventSafe } = require("../../platform/services/auditEventService");
const { normalizeFacilityKey } = require("./normalizeFacilityKey");
const {
  normalizeActiveClinicPhone,
  normalizeActiveClinicEmail,
  normalizeCountryCode,
  normalizeTimezone,
} = require("./normalizeActiveClinicContact");
const {
  CODE_ACTIVECLINIC_ORG_V6,
} = require("../../platform/config/deploymentProfiles");

const FACILITY_TYPES = Object.freeze([
  "hospital",
  "health_centre",
  "clinic",
  "diagnostic_centre",
  "pharmacy",
  "mobile_clinic",
  "administrative_office",
  "other",
]);

const STATUSES = Object.freeze([
  "planned",
  "active",
  "inactive",
  "suspended",
  "archived",
]);

const RESULT = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  INVALID_TYPE: "invalid_facility_type",
  INVALID_STATUS: "invalid_status",
  INVALID_KEY: "invalid_facility_key",
  PRODUCT_NOT_ENABLED: "activeclinic_product_not_enabled",
  HCO_NOT_FOUND: "healthcare_organization_not_found",
  HCO_NOT_ACTIVE: "healthcare_organization_not_active",
  NOT_FOUND: "facility_not_found",
  NOT_ACTIVE: "facility_not_active",
  DUPLICATE_KEY: "facility_key_exists",
  PRIMARY_CONFLICT: "primary_facility_conflict",
  OWNERSHIP_MISMATCH: "ownership_mismatch",
});

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function mapFacility(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    healthcareOrganizationId: row.healthcare_organization_id,
    facilityKey: row.facility_key,
    displayName: row.display_name,
    legalName: row.legal_name || null,
    facilityType: row.facility_type,
    status: row.status,
    isPrimary: row.is_primary === true,
    countryCode: row.country_code,
    province: row.province || null,
    district: row.district || null,
    city: row.city || null,
    addressLine1: row.address_line_1 || null,
    addressLine2: row.address_line_2 || null,
    postalCode: row.postal_code || null,
    phoneNormalized: row.phone_normalized,
    phoneDisplay: row.phone_display,
    emailNormalized: row.email_normalized || null,
    emailDisplay: row.email_display || null,
    timezone: row.timezone,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function trimOptional(value, max) {
  if (value == null || String(value).trim() === "") return null;
  const text = String(value).trim();
  if (text.length > max) return null;
  return text;
}

/**
 * @param {{ query: Function }} db
 * @param {object} input
 */
async function createFacility(db, input) {
  const healthcareOrganizationId = String(
    (input && input.healthcareOrganizationId) || ""
  ).trim();
  if (!healthcareOrganizationId || !UUID_RE.test(healthcareOrganizationId)) {
    return { ok: false, code: RESULT.INVALID_INPUT, facility: null };
  }

  // Derive organization ownership from HCO — do not trust client organizationId alone.
  let organizationId = String((input && input.organizationId) || "").trim();
  const hcoLookup = organizationId
    ? await getHealthcareOrganizationById(db, {
        id: healthcareOrganizationId,
        organizationId,
      })
    : null;

  let hco;
  if (hcoLookup && hcoLookup.ok) {
    hco = hcoLookup.healthcareOrganization;
  } else if (!organizationId) {
    // Internal path: resolve HCO then verify enrolment (still org-scoped afterward).
    return { ok: false, code: RESULT.INVALID_INPUT, facility: null };
  } else {
    return { ok: false, code: RESULT.HCO_NOT_FOUND, facility: null };
  }

  organizationId = hco.organizationId;

  const enabled = await organizationHasActiveProduct(db, {
    organizationId,
    applicationCode: "activeclinic",
  });
  if (!enabled) {
    return { ok: false, code: RESULT.PRODUCT_NOT_ENABLED, facility: null };
  }
  if (hco.status !== "active") {
    return { ok: false, code: RESULT.HCO_NOT_ACTIVE, facility: null };
  }

  const key = normalizeFacilityKey(input.facilityKey);
  if (!key.ok) {
    return { ok: false, code: RESULT.INVALID_KEY, facility: null };
  }

  const displayName = String((input && input.displayName) || "").trim();
  if (!displayName || displayName.length > 200) {
    return { ok: false, code: RESULT.INVALID_INPUT, facility: null };
  }

  const facilityType = String((input && input.facilityType) || "")
    .trim()
    .toLowerCase();
  if (!FACILITY_TYPES.includes(facilityType)) {
    return { ok: false, code: RESULT.INVALID_TYPE, facility: null };
  }

  const status = String((input && input.status) || "planned")
    .trim()
    .toLowerCase();
  if (!STATUSES.includes(status)) {
    return { ok: false, code: RESULT.INVALID_STATUS, facility: null };
  }

  const country = normalizeCountryCode(input.countryCode || hco.countryCode);
  if (!country.ok) {
    return { ok: false, code: RESULT.INVALID_INPUT, facility: null };
  }
  const timezone = normalizeTimezone(input.timezone || hco.timezone);
  if (!timezone.ok) {
    return { ok: false, code: RESULT.INVALID_INPUT, facility: null };
  }
  const phone = normalizeActiveClinicPhone(input.phone);
  if (!phone.ok) {
    return { ok: false, code: RESULT.INVALID_INPUT, facility: null };
  }
  const email = normalizeActiveClinicEmail(input.email);
  if (!email.ok) {
    return { ok: false, code: RESULT.INVALID_INPUT, facility: null };
  }

  const isPrimary = input.isPrimary === true;
  if (isPrimary && status !== "active") {
    return { ok: false, code: RESULT.INVALID_INPUT, facility: null };
  }

  try {
    const row = await repo.insertFacility(db, {
      organizationId,
      healthcareOrganizationId,
      facilityKey: key.value,
      displayName,
      legalName: trimOptional(input.legalName, 200),
      facilityType,
      status,
      isPrimary,
      countryCode: country.value,
      province: trimOptional(input.province, 120),
      district: trimOptional(input.district, 120),
      city: trimOptional(input.city, 120),
      addressLine1: trimOptional(input.addressLine1, 200),
      addressLine2: trimOptional(input.addressLine2, 200),
      postalCode: trimOptional(input.postalCode, 32),
      phoneNormalized: phone.normalized,
      phoneDisplay: phone.display,
      emailNormalized: email.normalized,
      emailDisplay: email.display,
      timezone: timezone.value,
    });

    await recordAuditEventSafe(db, {
      deploymentCode: input.deploymentCode || CODE_ACTIVECLINIC_ORG_V6,
      organizationId,
      actorUserId: null,
      actionKey: "activeclinic.facility.create",
      entityType: "facility",
      entityId: row.id,
      outcome: "success",
      metadataJson: {
        facility_key: key.value,
        facility_type: facilityType,
        status,
        actor_kind: "system",
      },
    });

    return { ok: true, code: RESULT.OK, facility: mapFacility(row) };
  } catch (err) {
    const msg = err && err.message ? String(err.message) : "";
    if (/facilities_hco_facility_key_unique/i.test(msg)) {
      return { ok: false, code: RESULT.DUPLICATE_KEY, facility: null };
    }
    if (/facilities_one_active_primary_per_hco_uidx/i.test(msg)) {
      return { ok: false, code: RESULT.PRIMARY_CONFLICT, facility: null };
    }
    if (/facilities_healthcare_org_fk|ownership/i.test(msg)) {
      return { ok: false, code: RESULT.OWNERSHIP_MISMATCH, facility: null };
    }
    if (/requires active ActiveClinic/i.test(msg)) {
      return { ok: false, code: RESULT.PRODUCT_NOT_ENABLED, facility: null };
    }
    throw err;
  }
}

/**
 * @param {{ query: Function }} db
 * @param {{ id: string, organizationId: string }} input
 */
async function getFacilityByIdAndOrganization(db, input) {
  const id = String((input && input.id) || "").trim();
  const organizationId = String((input && input.organizationId) || "").trim();
  if (!id || !organizationId || !UUID_RE.test(id) || !UUID_RE.test(organizationId)) {
    return { ok: false, code: RESULT.INVALID_INPUT, facility: null };
  }
  const row = await repo.findByIdAndOrganization(db, { id, organizationId });
  if (!row) return { ok: false, code: RESULT.NOT_FOUND, facility: null };
  return { ok: true, code: RESULT.OK, facility: mapFacility(row) };
}

/**
 * @param {{ query: Function }} db
 * @param {{ organizationId: string, facilityKey: string }} input
 */
async function getFacilityByOrganizationAndKey(db, input) {
  const organizationId = String((input && input.organizationId) || "").trim();
  const key = normalizeFacilityKey(input.facilityKey);
  if (!organizationId || !UUID_RE.test(organizationId) || !key.ok) {
    return { ok: false, code: RESULT.INVALID_INPUT, facility: null };
  }
  const row = await repo.findByOrganizationAndKey(db, {
    organizationId,
    facilityKey: key.value,
  });
  if (!row) return { ok: false, code: RESULT.NOT_FOUND, facility: null };
  return { ok: true, code: RESULT.OK, facility: mapFacility(row) };
}

/**
 * @param {{ query: Function }} db
 * @param {{
 *   organizationId: string,
 *   facilityKey?: string,
 *   facilityId?: string,
 *   allowedStatuses?: string[],
 * }} input
 */
async function requireActiveFacility(db, input) {
  const hco = await requireActiveHealthcareOrganization(db, {
    organizationId: input.organizationId,
  });
  if (!hco.ok) {
    if (hco.code === HCO_RESULT.PRODUCT_NOT_ENABLED) {
      return { ok: false, code: RESULT.PRODUCT_NOT_ENABLED, facility: null };
    }
    if (hco.code === HCO_RESULT.NOT_ACTIVE) {
      return { ok: false, code: RESULT.HCO_NOT_ACTIVE, facility: null };
    }
    return { ok: false, code: RESULT.HCO_NOT_FOUND, facility: null };
  }

  let got;
  if (input.facilityId) {
    got = await getFacilityByIdAndOrganization(db, {
      id: input.facilityId,
      organizationId: input.organizationId,
    });
  } else {
    got = await getFacilityByOrganizationAndKey(db, {
      organizationId: input.organizationId,
      facilityKey: input.facilityKey,
    });
  }
  if (!got.ok) return got;

  const allowed =
    Array.isArray(input.allowedStatuses) && input.allowedStatuses.length
      ? input.allowedStatuses
      : ["active"];
  if (!allowed.includes(got.facility.status)) {
    return { ok: false, code: RESULT.NOT_ACTIVE, facility: got.facility };
  }
  if (got.facility.healthcareOrganizationId !== hco.healthcareOrganization.id) {
    return { ok: false, code: RESULT.OWNERSHIP_MISMATCH, facility: null };
  }
  return got;
}

/**
 * @param {{ query: Function }} db
 * @param {{ organizationId: string, status?: string|null }} input
 */
async function listFacilitiesByOrganization(db, input) {
  const organizationId = String((input && input.organizationId) || "").trim();
  if (!organizationId || !UUID_RE.test(organizationId)) {
    return { ok: false, code: RESULT.INVALID_INPUT, facilities: [] };
  }
  const rows = await repo.listByOrganization(db, {
    organizationId,
    status: input.status || null,
  });
  return { ok: true, code: RESULT.OK, facilities: rows.map(mapFacility) };
}

/**
 * @param {{ query: Function }} db
 * @param {{ healthcareOrganizationId: string, organizationId: string, status?: string|null }} input
 */
async function listFacilitiesByHealthcareOrganization(db, input) {
  const hco = await getHealthcareOrganizationById(db, {
    id: input.healthcareOrganizationId,
    organizationId: input.organizationId,
  });
  if (!hco.ok) {
    return { ok: false, code: RESULT.HCO_NOT_FOUND, facilities: [] };
  }
  const rows = await repo.listByHealthcareOrganization(db, {
    healthcareOrganizationId: input.healthcareOrganizationId,
    organizationId: input.organizationId,
    status: input.status || null,
  });
  return { ok: true, code: RESULT.OK, facilities: rows.map(mapFacility) };
}

/**
 * @param {{ query: Function }} db
 * @param {{ id: string, organizationId: string, patch: object }} input
 */
async function updateFacility(db, input) {
  const existing = await getFacilityByIdAndOrganization(db, input);
  if (!existing.ok) return existing;
  const patch = { ...(input.patch || {}) };
  if (patch.facilityType != null && !FACILITY_TYPES.includes(String(patch.facilityType))) {
    return { ok: false, code: RESULT.INVALID_TYPE, facility: null };
  }
  if (patch.status != null && !STATUSES.includes(String(patch.status))) {
    return { ok: false, code: RESULT.INVALID_STATUS, facility: null };
  }
  if (patch.phone != null) {
    const phone = normalizeActiveClinicPhone(patch.phone);
    if (!phone.ok) return { ok: false, code: RESULT.INVALID_INPUT, facility: null };
    patch.phoneNormalized = phone.normalized;
    patch.phoneDisplay = phone.display;
  }
  if (patch.email !== undefined) {
    const email = normalizeActiveClinicEmail(patch.email);
    if (!email.ok) return { ok: false, code: RESULT.INVALID_INPUT, facility: null };
    patch.emailNormalized = email.normalized;
    patch.emailDisplay = email.display;
  }
  if (patch.countryCode != null) {
    const country = normalizeCountryCode(patch.countryCode);
    if (!country.ok) return { ok: false, code: RESULT.INVALID_INPUT, facility: null };
    patch.countryCode = country.value;
  }
  if (patch.timezone != null) {
    const timezone = normalizeTimezone(patch.timezone);
    if (!timezone.ok) return { ok: false, code: RESULT.INVALID_INPUT, facility: null };
    patch.timezone = timezone.value;
  }
  try {
    const row = await repo.updateFacility(db, {
      id: input.id,
      organizationId: input.organizationId,
      patch,
    });
    await recordAuditEventSafe(db, {
      deploymentCode: input.deploymentCode || CODE_ACTIVECLINIC_ORG_V6,
      organizationId: input.organizationId,
      actorUserId: null,
      actionKey: "activeclinic.facility.update",
      entityType: "facility",
      entityId: input.id,
      outcome: "success",
      metadataJson: { actor_kind: "system" },
    });
    return { ok: true, code: RESULT.OK, facility: mapFacility(row) };
  } catch (err) {
    const msg = err && err.message ? String(err.message) : "";
    if (/facilities_one_active_primary_per_hco_uidx/i.test(msg)) {
      return { ok: false, code: RESULT.PRIMARY_CONFLICT, facility: null };
    }
    throw err;
  }
}

/**
 * @param {{ query: Function }} db
 * @param {{ id: string, organizationId: string, deploymentCode?: string|null }} input
 */
async function archiveFacility(db, input) {
  const existing = await getFacilityByIdAndOrganization(db, input);
  if (!existing.ok) return existing;
  const row = await repo.archiveFacility(db, {
    id: input.id,
    organizationId: input.organizationId,
  });
  await recordAuditEventSafe(db, {
    deploymentCode: input.deploymentCode || CODE_ACTIVECLINIC_ORG_V6,
    organizationId: input.organizationId,
    actorUserId: null,
    actionKey: "activeclinic.facility.archive",
    entityType: "facility",
    entityId: input.id,
    outcome: "success",
    metadataJson: { actor_kind: "system" },
  });
  return { ok: true, code: RESULT.OK, facility: mapFacility(row) };
}

/**
 * @param {{ query: Function }} db
 * @param {{ id: string, organizationId: string }} input
 */
async function setPrimaryFacility(db, input) {
  const existing = await getFacilityByIdAndOrganization(db, input);
  if (!existing.ok) return existing;
  try {
    const row = await repo.setPrimaryFacility(db, {
      id: input.id,
      organizationId: input.organizationId,
      healthcareOrganizationId: existing.facility.healthcareOrganizationId,
    });
    await recordAuditEventSafe(db, {
      deploymentCode: input.deploymentCode || CODE_ACTIVECLINIC_ORG_V6,
      organizationId: input.organizationId,
      actorUserId: null,
      actionKey: "activeclinic.facility.set_primary",
      entityType: "facility",
      entityId: input.id,
      outcome: "success",
      metadataJson: { actor_kind: "system" },
    });
    return { ok: true, code: RESULT.OK, facility: mapFacility(row) };
  } catch (err) {
    const msg = err && err.message ? String(err.message) : "";
    if (/facilities_one_active_primary_per_hco_uidx/i.test(msg)) {
      return { ok: false, code: RESULT.PRIMARY_CONFLICT, facility: null };
    }
    throw err;
  }
}

module.exports = {
  RESULT,
  FACILITY_TYPES,
  STATUSES,
  mapFacility,
  createFacility,
  getFacilityByIdAndOrganization,
  getFacilityByOrganizationAndKey,
  requireActiveFacility,
  listFacilitiesByOrganization,
  listFacilitiesByHealthcareOrganization,
  updateFacility,
  archiveFacility,
  setPrimaryFacility,
};
