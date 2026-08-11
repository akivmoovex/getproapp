"use strict";

/**
 * ActiveClinic patient registration, update, search, and status transitions.
 * Administrative only — no clinical records, no portal identities, no merge.
 */

const patientRepo = require("../repositories/patientRepository");
const identifierRepo = require("../repositories/patientIdentifierRepository");
const registrationRepo = require("../repositories/patientRegistrationRepository");
const emergencyRepo = require("../repositories/patientEmergencyContactRepository");
const accessRepo = require("../repositories/staffAccessRepository");
const {
  getHealthcareOrganizationById,
} = require("./healthcareOrganizationService");
const {
  requireActiveFacility,
} = require("./facilityService");
const {
  authorizeStaffPermission,
  NETWORK_ADMIN,
  RESULT: AUTHZ_RESULT,
} = require("./activeClinicAuthorizationService");
const {
  organizationHasActiveProduct,
} = require("../../platform/services/organizationProductService");
const { recordAuditEventSafe } = require("../../platform/services/auditEventService");
const {
  CODE_ACTIVECLINIC_ORG_V6,
} = require("../../platform/config/deploymentProfiles");
const {
  generateActiveClinicPatientNumber,
} = require("./generateActiveClinicPatientNumber");
const {
  STATUSES,
  REGISTRATION_METHODS,
  normalizePatientDemographics,
  normalizePatientContacts,
  normalizePatientAddress,
  normalizeIdentifierInput,
  normalizeEmergencyContactInput,
} = require("./activeClinicPatientValidation");
const {
  findPotentialPatientDuplicates,
  findIdentifierConflict,
} = require("./activeClinicPatientDuplicateService");
const {
  toPatientSearchSummary,
  formatPatientDisplayName,
  maskIdentifier,
  maskPhone,
  maskEmail,
} = require("./patientPrivacyHelpers");

const RESULT = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  INVALID_STATUS: "invalid_status",
  PRODUCT_NOT_ENABLED: "activeclinic_product_not_enabled",
  HCO_NOT_FOUND: "healthcare_organization_not_found",
  HCO_NOT_ACTIVE: "healthcare_organization_not_active",
  FACILITY_NOT_FOUND: "facility_not_found",
  FACILITY_NOT_ACTIVE: "facility_not_active",
  NOT_FOUND: "patient_not_found",
  ACCESS_DENIED: "access_denied",
  DUPLICATE_WARNING: "duplicate_warning",
  IDENTIFIER_CONFLICT: "identifier_conflict",
  IDENTIFIER_MANAGEMENT_REQUIRED: "identifier_management_required",
  OVERRIDE_REQUIRED: "duplicate_override_required",
  OVERRIDE_DENIED: "duplicate_override_denied",
});

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const PERM = Object.freeze({
  VIEW: "activeclinic.patient.view",
  SEARCH: "activeclinic.patient.search",
  CREATE: "activeclinic.patient.create",
  QUICK_REGISTER: "activeclinic.patient.quick_register",
  UPDATE: "activeclinic.patient.update",
  ARCHIVE: "activeclinic.patient.archive",
  MANAGE_IDENTIFIERS: "activeclinic.patient.manage_identifiers",
  VIEW_SENSITIVE: "activeclinic.patient.view_sensitive_contact",
  DUPLICATE_OVERRIDE: "activeclinic.patient.duplicate_override",
});

const CREATION_MODES = Object.freeze({
  FULL: "full_registration",
  QUICK: "quick_registration",
  WALK_IN: "walk_in_registration",
  APPOINTMENT: "appointment_registration",
});

function mapPatient(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    healthcareOrganizationId: row.healthcare_organization_id,
    patientNumber: row.patient_number,
    firstName: row.first_name,
    middleName: row.middle_name || null,
    lastName: row.last_name,
    preferredName: row.preferred_name || null,
    displayName: formatPatientDisplayName({
      firstName: row.first_name,
      middleName: row.middle_name,
      lastName: row.last_name,
      preferredName: row.preferred_name,
    }),
    dateOfBirth: row.date_of_birth || null,
    estimatedDateOfBirth: row.estimated_date_of_birth === true,
    sexAtRegistration: row.sex_at_registration || null,
    nationalityCountryCode: row.nationality_country_code || null,
    primaryLanguage: row.primary_language || null,
    phoneNormalized: row.phone_normalized || null,
    phoneDisplay: row.phone_display || null,
    emailNormalized: row.email_normalized || null,
    emailDisplay: row.email_display || null,
    addressLine1: row.address_line_1 || null,
    addressLine2: row.address_line_2 || null,
    city: row.city || null,
    district: row.district || null,
    province: row.province || null,
    countryCode: row.country_code || null,
    postalCode: row.postal_code || null,
    preferredContactMethod: row.preferred_contact_method || null,
    allowAdminReminders: row.allow_admin_reminders,
    status: row.status,
    registrationStatus: row.registration_status || "complete",
    deceasedAt: row.deceased_at || null,
    archivedAt: row.archived_at || null,
    archiveReason: row.archive_reason || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdByStaffId: row.created_by_staff_id || null,
    updatedByStaffId: row.updated_by_staff_id || null,
  };
}

function mapIdentifier(row) {
  if (!row) return null;
  return {
    id: row.id,
    patientId: row.patient_id,
    identifierType: row.identifier_type,
    identifierValueNormalized: row.identifier_value_normalized,
    identifierValueDisplay: row.identifier_value_display,
    identifierMasked: maskIdentifier(row.identifier_value_display),
    issuingCountryCode: row.issuing_country_code || null,
    issuer: row.issuer || null,
    isPrimary: row.is_primary === true,
    verificationStatus: row.verification_status,
    verifiedAt: row.verified_at || null,
    status: row.status,
    archivedAt: row.archived_at || null,
    createdAt: row.created_at,
  };
}

async function withClient(db, fn) {
  if (db && typeof db.query === "function" && typeof db.release === "function") {
    return fn(db);
  }
  if (db && typeof db.connect === "function") {
    const client = await db.connect();
    try {
      return await fn(client);
    } finally {
      client.release();
    }
  }
  return fn(db);
}

async function requireOrgWidePatientAccess(db, actor) {
  const roles = await accessRepo.listRoleAssignmentsForStaff(db, {
    staffMemberId: actor.staffMemberId,
    organizationId: actor.organizationId,
  });
  return roles.some(
    (r) =>
      r.status === "active" &&
      (r.scope_type === "organisation" || r.role_key === NETWORK_ADMIN)
  );
}

async function resolveActorFacilityScope(db, actor) {
  const orgWide = await requireOrgWidePatientAccess(db, actor);
  if (orgWide) {
    return { orgWide: true, facilityIds: null };
  }
  const assignments = await accessRepo.listFacilitiesForStaff(db, {
    staffMemberId: actor.staffMemberId,
    organizationId: actor.organizationId,
  });
  const facilityIds = assignments
    .filter((a) => a.status === "active")
    .map((a) => a.facility_id);
  return { orgWide: false, facilityIds };
}

async function authorizePatientAction(db, input) {
  const authz = await authorizeStaffPermission(db, {
    organizationId: input.organizationId,
    staffMemberId: input.actor.staffMemberId,
    platformIdentityId: input.actor.platformIdentityId,
    permissionKey: input.permissionKey,
    facilityId: input.facilityId || null,
  });
  if (!authz.ok) {
    return {
      ok: false,
      code:
        authz.code === AUTHZ_RESULT.DENIED
          ? RESULT.ACCESS_DENIED
          : authz.code || RESULT.ACCESS_DENIED,
    };
  }
  return { ok: true, staffMember: authz.staffMember, permissions: authz.permissions };
}

/**
 * Register a patient transactionally.
 */
async function registerActiveClinicPatient(db, input) {
  const organizationId = String((input && input.organizationId) || "").trim();
  const healthcareOrganizationId = String(
    (input && input.healthcareOrganizationId) || ""
  ).trim();
  const facilityId = String((input && input.facilityId) || "").trim();
  const actor = input && input.actor;

  if (
    !UUID_RE.test(organizationId) ||
    !UUID_RE.test(healthcareOrganizationId) ||
    !UUID_RE.test(facilityId) ||
    !actor ||
    !UUID_RE.test(String(actor.staffMemberId || ""))
  ) {
    return { ok: false, code: RESULT.INVALID_INPUT, patient: null };
  }

  const enabled = await organizationHasActiveProduct(db, {
    organizationId,
    applicationCode: "activeclinic",
  });
  if (!enabled) {
    return { ok: false, code: RESULT.PRODUCT_NOT_ENABLED, patient: null };
  }

  const hco = await getHealthcareOrganizationById(db, {
    id: healthcareOrganizationId,
    organizationId,
  });
  if (!hco.ok) return { ok: false, code: RESULT.HCO_NOT_FOUND, patient: null };
  if (hco.healthcareOrganization.status !== "active") {
    return { ok: false, code: RESULT.HCO_NOT_ACTIVE, patient: null };
  }

  const facilityActive = await requireActiveFacility(db, {
    facilityId,
    organizationId,
  });
  if (!facilityActive.ok) {
    return {
      ok: false,
      code:
        facilityActive.code === "facility_not_active"
          ? RESULT.FACILITY_NOT_ACTIVE
          : RESULT.FACILITY_NOT_FOUND,
      patient: null,
    };
  }
  if (
    facilityActive.facility.healthcareOrganizationId !== healthcareOrganizationId
  ) {
    return { ok: false, code: RESULT.FACILITY_NOT_FOUND, patient: null };
  }

  const creationMode = String(input.creationMode || CREATION_MODES.FULL)
    .trim()
    .toLowerCase();
  const isQuick =
    creationMode === CREATION_MODES.QUICK ||
    creationMode === "quick_registration";
  const requiredPerm = isQuick ? PERM.QUICK_REGISTER : PERM.CREATE;

  let authz = await authorizePatientAction(db, {
    organizationId,
    facilityId,
    permissionKey: requiredPerm,
    actor,
  });
  // Full create also satisfies quick-register flows (permission union).
  if (!authz.ok && isQuick) {
    authz = await authorizePatientAction(db, {
      organizationId,
      facilityId,
      permissionKey: PERM.CREATE,
      actor,
    });
  }
  if (!authz.ok) return { ok: false, code: authz.code, patient: null };

  const scope = await resolveActorFacilityScope(db, {
    organizationId,
    staffMemberId: actor.staffMemberId,
  });
  if (!scope.orgWide && !(scope.facilityIds || []).includes(facilityId)) {
    return { ok: false, code: RESULT.ACCESS_DENIED, patient: null };
  }

  const demographics = normalizePatientDemographics(input.demographics || {});
  if (!demographics.ok) return { ok: false, code: demographics.code, patient: null };
  const contacts = normalizePatientContacts(input.contacts || {});
  if (!contacts.ok) return { ok: false, code: contacts.code, patient: null };
  const address = normalizePatientAddress(input.address || {});
  if (!address.ok) return { ok: false, code: address.code, patient: null };

  const registrationMethod = String(input.registrationMethod || "walk_in")
    .trim()
    .toLowerCase();
  if (!REGISTRATION_METHODS.includes(registrationMethod)) {
    return { ok: false, code: RESULT.INVALID_INPUT, patient: null };
  }

  const identifiersIn = Array.isArray(input.identifiers) ? input.identifiers : [];
  const normalizedIdentifiers = [];
  for (const raw of identifiersIn) {
    const n = normalizeIdentifierInput(raw);
    if (!n.ok) return { ok: false, code: n.code, patient: null };
    normalizedIdentifiers.push(n.value);
  }

  // Authoritative identifiers require manage_identifiers — create/update alone
  // only covers demographics/contact. Do not silently drop submitted IDs.
  if (normalizedIdentifiers.length) {
    const idAuthz = await authorizePatientAction(db, {
      organizationId,
      facilityId,
      permissionKey: PERM.MANAGE_IDENTIFIERS,
      actor,
    });
    if (!idAuthz.ok) {
      return {
        ok: false,
        code: RESULT.IDENTIFIER_MANAGEMENT_REQUIRED,
        patient: null,
      };
    }
  }

  const emergencyIn = Array.isArray(input.emergencyContacts)
    ? input.emergencyContacts
    : [];
  const normalizedEmergency = [];
  for (const raw of emergencyIn) {
    const n = normalizeEmergencyContactInput(raw);
    if (!n.ok) return { ok: false, code: n.code, patient: null };
    normalizedEmergency.push(n.value);
  }

  for (const idn of normalizedIdentifiers) {
    const conflict = await findIdentifierConflict(db, {
      organizationId,
      healthcareOrganizationId,
      identifierType: idn.identifierType,
      identifierValueNormalized: idn.identifierValueNormalized,
    });
    if (conflict.conflict) {
      return {
        ok: false,
        code: RESULT.IDENTIFIER_CONFLICT,
        conflict: conflict.conflict,
        patient: null,
      };
    }
  }

  const duplicates = await findPotentialPatientDuplicates(db, {
    organizationId,
    healthcareOrganizationId,
    identifiers: normalizedIdentifiers,
    phoneNormalized: contacts.value.phoneNormalized,
    emailNormalized: contacts.value.emailNormalized,
    dateOfBirth: demographics.value.dateOfBirth,
    firstName: demographics.value.firstName,
    lastName: demographics.value.lastName,
  });

  if (duplicates.blocking) {
    const override = input.duplicateOverride === true;
    if (!override) {
      await recordAuditEventSafe(db, {
        deploymentCode: input.deploymentCode || CODE_ACTIVECLINIC_ORG_V6,
        organizationId,
        actorUserId: null,
        actionKey: "activeclinic.patient.duplicate_warning",
        entityType: "patient",
        entityId: null,
        outcome: "denied",
        metadata: {
          count: duplicates.matches.length,
          match_strength: duplicates.hasStrong ? "strong" : "moderate",
          reason_code: "duplicate_warning",
        },
      });
      return {
        ok: false,
        code: RESULT.DUPLICATE_WARNING,
        matches: duplicates.matches,
        patient: null,
      };
    }
    const overrideAuthz = await authorizePatientAction(db, {
      organizationId,
      facilityId,
      permissionKey: PERM.DUPLICATE_OVERRIDE,
      actor,
    });
    if (!overrideAuthz.ok) {
      return { ok: false, code: RESULT.OVERRIDE_DENIED, matches: duplicates.matches, patient: null };
    }
  }

  try {
    return await withClient(db, async (client) => {
      await client.query("BEGIN");
      try {
        const patientNumber = await generateActiveClinicPatientNumber(client, {
          healthcareOrganizationId,
        });

        const registrationStatus =
          input.registrationStatus === "incomplete" || isQuick
            ? "incomplete"
            : "complete";

        const row = await patientRepo.insertPatient(client, {
          organizationId,
          healthcareOrganizationId,
          patientNumber,
          ...demographics.value,
          ...contacts.value,
          ...address.value,
          status: "active",
          registrationStatus,
          createdByStaffId: actor.staffMemberId,
          updatedByStaffId: actor.staffMemberId,
        });

        await registrationRepo.insertRegistration(client, {
          organizationId,
          healthcareOrganizationId,
          patientId: row.id,
          facilityId,
          registrationMethod,
          sourceReference: input.sourceReference || null,
          registeredByStaffId: actor.staffMemberId,
          isInitial: true,
          status: "completed",
        });

        await registrationRepo.insertFacilityLink(client, {
          organizationId,
          healthcareOrganizationId,
          patientId: row.id,
          facilityId,
          relationshipType: "registered_at",
          status: "active",
        });

        for (const idn of normalizedIdentifiers) {
          if (idn.isPrimary) {
            await identifierRepo.clearPrimaryForPatient(client, {
              organizationId,
              healthcareOrganizationId,
              patientId: row.id,
            });
          }
          await identifierRepo.insertIdentifier(client, {
            organizationId,
            healthcareOrganizationId,
            patientId: row.id,
            ...idn,
            createdByStaffId: actor.staffMemberId,
          });
        }

        let primaryAssigned = false;
        for (const ec of normalizedEmergency) {
          const isPrimary = ec.isPrimary || (!primaryAssigned && normalizedEmergency.length === 1);
          if (isPrimary) {
            await emergencyRepo.clearPrimaryForPatient(client, {
              organizationId,
              healthcareOrganizationId,
              patientId: row.id,
            });
            primaryAssigned = true;
          }
          await emergencyRepo.insertContact(client, {
            organizationId,
            healthcareOrganizationId,
            patientId: row.id,
            ...ec,
            isPrimary,
            createdByStaffId: actor.staffMemberId,
          });
        }

        await recordAuditEventSafe(client, {
          deploymentCode: input.deploymentCode || CODE_ACTIVECLINIC_ORG_V6,
          organizationId,
          actorUserId: null,
          actionKey: "activeclinic.patient.create",
          entityType: "patient",
          entityId: row.id,
          outcome: "success",
          metadata: {
            patient_number: patientNumber,
            registration_method: registrationMethod,
            creation_mode: isQuick
              ? CREATION_MODES.QUICK
              : creationMode === CREATION_MODES.WALK_IN ||
                  creationMode === CREATION_MODES.APPOINTMENT
                ? creationMode
                : CREATION_MODES.FULL,
            registration_status: registrationStatus,
            facility_key: facilityActive.facility.facilityKey,
            facility_id: facilityId,
            override: input.duplicateOverride === true,
            count: normalizedIdentifiers.length,
          },
        });

        if (input.duplicateOverride === true && duplicates.blocking) {
          await recordAuditEventSafe(client, {
            deploymentCode: input.deploymentCode || CODE_ACTIVECLINIC_ORG_V6,
            organizationId,
            actorUserId: null,
            actionKey: "activeclinic.patient.duplicate_override",
            entityType: "patient",
            entityId: row.id,
            outcome: "success",
            metadata: {
              patient_number: patientNumber,
              match_strength: duplicates.hasStrong ? "strong" : "moderate",
              count: duplicates.matches.length,
              reason_code: input.duplicateOverrideReason || "override_accepted",
            },
          });
        }

        await client.query("COMMIT");
        return {
          ok: true,
          code: RESULT.OK,
          patient: mapPatient(row),
          matches: duplicates.matches || [],
        };
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
    });
  } catch (err) {
    if (err && err.code === "23505") {
      return { ok: false, code: RESULT.IDENTIFIER_CONFLICT, patient: null };
    }
    throw err;
  }
}

async function getPatientByOrgAndId(db, input) {
  const row = await patientRepo.findByOrgAndId(db, {
    id: input.patientId || input.id,
    organizationId: input.organizationId,
    healthcareOrganizationId: input.healthcareOrganizationId,
  });
  if (!row) return { ok: false, code: RESULT.NOT_FOUND, patient: null };
  return { ok: true, code: RESULT.OK, patient: mapPatient(row) };
}

async function getPatientByOrgAndNumber(db, input) {
  const row = await patientRepo.findByOrgAndNumber(db, {
    organizationId: input.organizationId,
    healthcareOrganizationId: input.healthcareOrganizationId,
    patientNumber: input.patientNumber,
  });
  if (!row) return { ok: false, code: RESULT.NOT_FOUND, patient: null };
  return { ok: true, code: RESULT.OK, patient: mapPatient(row) };
}

/**
 * Scoped patient retrieval with facility visibility enforcement.
 */
async function resolvePatientForActor(db, input) {
  const authz = await authorizePatientAction(db, {
    organizationId: input.organizationId,
    facilityId: input.facilityId || null,
    permissionKey: PERM.VIEW,
    actor: input.actor,
  });
  if (!authz.ok) return { ok: false, code: authz.code, patient: null };

  const got = input.patientNumber
    ? await getPatientByOrgAndNumber(db, input)
    : await getPatientByOrgAndId(db, input);
  if (!got.ok) return got;

  const scope = await resolveActorFacilityScope(db, {
    organizationId: input.organizationId,
    staffMemberId: input.actor.staffMemberId,
  });
  if (!scope.orgWide) {
    const visible = await registrationRepo.patientVisibleInFacilities(db, {
      organizationId: input.organizationId,
      healthcareOrganizationId: got.patient.healthcareOrganizationId,
      patientId: got.patient.id,
      facilityIds: scope.facilityIds || [],
    });
    if (!visible) return { ok: false, code: RESULT.NOT_FOUND, patient: null };
  }
  return got;
}

async function searchActiveClinicPatients(db, input) {
  const organizationId = String((input && input.organizationId) || "").trim();
  const healthcareOrganizationId = String(
    (input && input.healthcareOrganizationId) || ""
  ).trim();
  if (!UUID_RE.test(organizationId) || !UUID_RE.test(healthcareOrganizationId)) {
    return { ok: false, code: RESULT.INVALID_INPUT, results: [] };
  }

  const authz = await authorizePatientAction(db, {
    organizationId,
    facilityId: input.facilityId || null,
    permissionKey: PERM.SEARCH,
    actor: input.actor,
  });
  if (!authz.ok) return { ok: false, code: authz.code, results: [] };

  const scope = await resolveActorFacilityScope(db, {
    organizationId,
    staffMemberId: input.actor.staffMemberId,
  });

  let facilityIds = null;
  if (!scope.orgWide) {
    facilityIds = scope.facilityIds || [];
    if (input.facilityId) {
      if (!facilityIds.includes(input.facilityId)) {
        return { ok: false, code: RESULT.ACCESS_DENIED, results: [] };
      }
      facilityIds = [input.facilityId];
    }
    if (!facilityIds.length) {
      return { ok: true, code: RESULT.OK, results: [], limit: 0, offset: 0 };
    }
  } else if (input.facilityId) {
    facilityIds = [input.facilityId];
  }

  const nameQuery = input.nameQuery != null ? String(input.nameQuery).trim() : "";
  if (nameQuery && nameQuery.length < 2 && !input.patientNumber && !input.phone && !input.dateOfBirth) {
    return { ok: false, code: "query_too_short", results: [] };
  }

  let phoneNormalized = null;
  let phoneDigitsPartial = null;
  if (input.phone) {
    const {
      buildPhoneSearchCriteria,
    } = require("../../platform/services/phoneNumberService");
    const criteria = buildPhoneSearchCriteria(input.phone, {
      clinicDefaultCountry: input.clinicDefaultCountry || null,
      defaultCountry: input.defaultCountry || "ZM",
    });
    if (!criteria.ok) {
      return { ok: false, code: criteria.code || "phone_invalid", results: [] };
    }
    if (criteria.mode === "exact") {
      phoneNormalized = criteria.e164;
    } else if (criteria.mode === "partial") {
      phoneDigitsPartial = criteria.digits;
    }
  }

  let identifierType = null;
  let identifierValueNormalized = null;
  if (input.identifierType || input.identifierValue) {
    const idAuthz = await authorizePatientAction(db, {
      organizationId,
      facilityId: input.facilityId || null,
      permissionKey: PERM.MANAGE_IDENTIFIERS,
      actor: input.actor,
    });
    // Identifier search also allowed with view_sensitive or manage_identifiers.
    const sens = await authorizePatientAction(db, {
      organizationId,
      facilityId: input.facilityId || null,
      permissionKey: PERM.VIEW_SENSITIVE,
      actor: input.actor,
    });
    if (!idAuthz.ok && !sens.ok) {
      return { ok: false, code: RESULT.ACCESS_DENIED, results: [] };
    }
    const n = normalizeIdentifierInput({
      identifierType: input.identifierType || "national_id",
      identifierValue: input.identifierValue,
    });
    if (!n.ok) return { ok: false, code: n.code, results: [] };
    identifierType = n.value.identifierType;
    identifierValueNormalized = n.value.identifierValueNormalized;

    await recordAuditEventSafe(db, {
      deploymentCode: input.deploymentCode || CODE_ACTIVECLINIC_ORG_V6,
      organizationId,
      actorUserId: null,
      actionKey: "activeclinic.patient.identifier_search",
      entityType: "patient",
      entityId: null,
      outcome: "success",
      metadata: {
        identifier_type: identifierType,
        search_kind: "identifier",
      },
    });
  }

  const limit = Math.min(Math.max(Number(input.limit) || 25, 1), 100);
  const offset = Math.max(Number(input.offset) || 0, 0);

  const rows = await patientRepo.searchPatientsByOrg(db, {
    organizationId,
    healthcareOrganizationId,
    patientNumber: input.patientNumber || null,
    nameQuery: nameQuery || null,
    phoneNormalized,
    phoneDigitsPartial,
    dateOfBirth: input.dateOfBirth || null,
    status: input.status || null,
    includeArchived: input.includeArchived === true,
    excludeDeceased: input.excludeDeceased === true,
    identifierType,
    identifierValueNormalized,
    facilityIds,
    limit,
    offset,
  });

  const canViewDob = (authz.permissions || []).includes(PERM.VIEW);
  const results = rows.map((row) =>
    toPatientSearchSummary(mapPatient(row), {
      includeDob: canViewDob,
      includeSex: false,
    })
  );

  return { ok: true, code: RESULT.OK, results, limit, offset };
}

async function updateActiveClinicPatient(db, input) {
  const organizationId = String((input && input.organizationId) || "").trim();
  const healthcareOrganizationId = String(
    (input && input.healthcareOrganizationId) || ""
  ).trim();
  const patientId = String((input && input.patientId) || "").trim();
  const actor = input && input.actor;

  if (
    !UUID_RE.test(organizationId) ||
    !UUID_RE.test(healthcareOrganizationId) ||
    !UUID_RE.test(patientId) ||
    !actor ||
    !UUID_RE.test(String(actor.staffMemberId || ""))
  ) {
    return { ok: false, code: RESULT.INVALID_INPUT, patient: null };
  }

  const authz = await authorizePatientAction(db, {
    organizationId,
    facilityId: input.facilityId || null,
    permissionKey: PERM.UPDATE,
    actor,
  });
  if (!authz.ok) return { ok: false, code: authz.code, patient: null };

  const existing = await resolvePatientForActor(db, {
    organizationId,
    healthcareOrganizationId,
    patientId,
    facilityId: input.facilityId || null,
    actor,
  });
  if (!existing.ok) return existing;

  const patch = {};
  const fieldKeys = [];

  if (input.demographics) {
    const demographics = normalizePatientDemographics({
      firstName: input.demographics.firstName ?? existing.patient.firstName,
      middleName:
        input.demographics.middleName !== undefined
          ? input.demographics.middleName
          : existing.patient.middleName,
      lastName: input.demographics.lastName ?? existing.patient.lastName,
      preferredName:
        input.demographics.preferredName !== undefined
          ? input.demographics.preferredName
          : existing.patient.preferredName,
      dateOfBirth:
        input.demographics.dateOfBirth !== undefined
          ? input.demographics.dateOfBirth
          : existing.patient.dateOfBirth,
      estimatedDateOfBirth:
        input.demographics.estimatedDateOfBirth !== undefined
          ? input.demographics.estimatedDateOfBirth
          : existing.patient.estimatedDateOfBirth,
      sexAtRegistration:
        input.demographics.sexAtRegistration !== undefined
          ? input.demographics.sexAtRegistration
          : existing.patient.sexAtRegistration,
      nationalityCountryCode:
        input.demographics.nationalityCountryCode !== undefined
          ? input.demographics.nationalityCountryCode
          : existing.patient.nationalityCountryCode,
      primaryLanguage:
        input.demographics.primaryLanguage !== undefined
          ? input.demographics.primaryLanguage
          : existing.patient.primaryLanguage,
    });
    if (!demographics.ok) return { ok: false, code: demographics.code, patient: null };
    Object.assign(patch, demographics.value);
    fieldKeys.push(
      "first_name",
      "last_name",
      "date_of_birth",
      "sex_at_registration"
    );
  }

  if (input.contacts) {
    const contacts = normalizePatientContacts(input.contacts);
    if (!contacts.ok) return { ok: false, code: contacts.code, patient: null };
    Object.assign(patch, contacts.value);
    fieldKeys.push("phone", "email");
  }

  if (input.address) {
    const address = normalizePatientAddress(input.address);
    if (!address.ok) return { ok: false, code: address.code, patient: null };
    Object.assign(patch, address.value);
    fieldKeys.push("address");
  }

  if (
    existing.patient.registrationStatus === "incomplete" &&
    (input.markRegistrationComplete === true || input.demographics)
  ) {
    patch.registrationStatus = "complete";
    fieldKeys.push("registration_status");
  }

  patch.updatedByStaffId = actor.staffMemberId;

  const row = await patientRepo.updatePatientByOrgAndId(db, {
    id: patientId,
    organizationId,
    healthcareOrganizationId,
    patch,
  });
  if (!row) return { ok: false, code: RESULT.NOT_FOUND, patient: null };

  await recordAuditEventSafe(db, {
    deploymentCode: input.deploymentCode || CODE_ACTIVECLINIC_ORG_V6,
    organizationId,
    actorUserId: null,
    actionKey: "activeclinic.patient.update",
    entityType: "patient",
    entityId: patientId,
    outcome: "success",
    metadata: {
      patient_number: row.patient_number,
      field_keys: fieldKeys,
    },
  });

  return { ok: true, code: RESULT.OK, patient: mapPatient(row) };
}

async function setPatientStatus(db, input) {
  const organizationId = String((input && input.organizationId) || "").trim();
  const healthcareOrganizationId = String(
    (input && input.healthcareOrganizationId) || ""
  ).trim();
  const patientId = String((input && input.patientId) || "").trim();
  const status = String((input && input.status) || "")
    .trim()
    .toLowerCase();
  const actor = input && input.actor;

  if (!STATUSES.includes(status)) {
    return { ok: false, code: RESULT.INVALID_STATUS, patient: null };
  }

  const authz = await authorizePatientAction(db, {
    organizationId,
    facilityId: input.facilityId || null,
    permissionKey: status === "active" || status === "inactive" ? PERM.UPDATE : PERM.ARCHIVE,
    actor,
  });
  if (!authz.ok) return { ok: false, code: authz.code, patient: null };

  const existing = await resolvePatientForActor(db, {
    organizationId,
    healthcareOrganizationId,
    patientId,
    facilityId: input.facilityId || null,
    actor,
  });
  if (!existing.ok) return existing;

  const patch = {
    status,
    updatedByStaffId: actor.staffMemberId,
    deceasedAt: status === "deceased" ? input.deceasedAt || new Date() : null,
    archivedAt: status === "archived" ? input.archivedAt || new Date() : null,
    archiveReason:
      status === "archived" ? String(input.reason || "archived").slice(0, 200) : null,
  };

  // Clearing deceased/archived timestamps when leaving those states.
  if (status !== "deceased") patch.deceasedAt = null;
  if (status !== "archived") {
    // Keep archived_at historical if reactivating? Schema requires null when not archived.
    patch.archivedAt = null;
    patch.archiveReason = null;
  }

  const row = await patientRepo.updatePatientByOrgAndId(db, {
    id: patientId,
    organizationId,
    healthcareOrganizationId,
    patch,
  });

  const actionKey =
    status === "archived"
      ? "activeclinic.patient.archive"
      : status === "deceased"
        ? "activeclinic.patient.mark_deceased"
        : "activeclinic.patient.status_change";

  await recordAuditEventSafe(db, {
    deploymentCode: input.deploymentCode || CODE_ACTIVECLINIC_ORG_V6,
    organizationId,
    actorUserId: null,
    actionKey,
    entityType: "patient",
    entityId: patientId,
    outcome: "success",
    metadata: {
      patient_number: row.patient_number,
      from_status: existing.patient.status,
      to_status: status,
      reason_code: input.reason || status,
    },
  });

  return { ok: true, code: RESULT.OK, patient: mapPatient(row) };
}

async function addPatientIdentifier(db, input) {
  const authz = await authorizePatientAction(db, {
    organizationId: input.organizationId,
    facilityId: input.facilityId || null,
    permissionKey: PERM.MANAGE_IDENTIFIERS,
    actor: input.actor,
  });
  if (!authz.ok) return { ok: false, code: authz.code, identifier: null };

  const patient = await resolvePatientForActor(db, {
    organizationId: input.organizationId,
    healthcareOrganizationId: input.healthcareOrganizationId,
    patientId: input.patientId,
    facilityId: input.facilityId || null,
    actor: input.actor,
  });
  if (!patient.ok) return { ok: false, code: patient.code, identifier: null };

  const normalized = normalizeIdentifierInput(input);
  if (!normalized.ok) return { ok: false, code: normalized.code, identifier: null };

  const conflict = await findIdentifierConflict(db, {
    organizationId: input.organizationId,
    healthcareOrganizationId: input.healthcareOrganizationId,
    identifierType: normalized.value.identifierType,
    identifierValueNormalized: normalized.value.identifierValueNormalized,
  });
  if (conflict.conflict) {
    return { ok: false, code: RESULT.IDENTIFIER_CONFLICT, conflict: conflict.conflict };
  }

  if (normalized.value.isPrimary) {
    await identifierRepo.clearPrimaryForPatient(db, {
      organizationId: input.organizationId,
      healthcareOrganizationId: input.healthcareOrganizationId,
      patientId: input.patientId,
    });
  }

  const row = await identifierRepo.insertIdentifier(db, {
    organizationId: input.organizationId,
    healthcareOrganizationId: input.healthcareOrganizationId,
    patientId: input.patientId,
    ...normalized.value,
    createdByStaffId: input.actor.staffMemberId,
  });

  await recordAuditEventSafe(db, {
    deploymentCode: input.deploymentCode || CODE_ACTIVECLINIC_ORG_V6,
    organizationId: input.organizationId,
    actorUserId: null,
    actionKey: "activeclinic.patient.identifier_add",
    entityType: "patient_identifier",
    entityId: row.id,
    outcome: "success",
    metadata: {
      patient_number: patient.patient.patientNumber,
      identifier_type: row.identifier_type,
    },
  });

  return { ok: true, code: RESULT.OK, identifier: mapIdentifier(row) };
}

async function listPatientIdentifiers(db, input) {
  const authz = await authorizePatientAction(db, {
    organizationId: input.organizationId,
    facilityId: input.facilityId || null,
    permissionKey: PERM.VIEW,
    actor: input.actor,
  });
  if (!authz.ok) return { ok: false, code: authz.code, identifiers: [] };

  const patient = await resolvePatientForActor(db, input);
  if (!patient.ok) return { ok: false, code: patient.code, identifiers: [] };

  const canSeeFull = (authz.permissions || []).includes(PERM.MANAGE_IDENTIFIERS);
  const rows = await identifierRepo.listByPatient(db, {
    organizationId: input.organizationId,
    healthcareOrganizationId: input.healthcareOrganizationId,
    patientId: input.patientId,
    includeArchived: input.includeArchived === true,
  });

  return {
    ok: true,
    code: RESULT.OK,
    identifiers: rows.map((row) => {
      const mapped = mapIdentifier(row);
      if (!canSeeFull) {
        mapped.identifierValueDisplay = mapped.identifierMasked;
        mapped.identifierValueNormalized = null;
      }
      return mapped;
    }),
  };
}

async function archivePatientIdentifier(db, input) {
  const authz = await authorizePatientAction(db, {
    organizationId: input.organizationId,
    facilityId: input.facilityId || null,
    permissionKey: PERM.MANAGE_IDENTIFIERS,
    actor: input.actor,
  });
  if (!authz.ok) return { ok: false, code: authz.code, identifier: null };

  const row = await identifierRepo.updateIdentifier(db, {
    id: input.identifierId,
    organizationId: input.organizationId,
    healthcareOrganizationId: input.healthcareOrganizationId,
    patch: {
      status: "archived",
      archivedAt: new Date(),
      isPrimary: false,
    },
  });
  if (!row) return { ok: false, code: RESULT.NOT_FOUND, identifier: null };

  await recordAuditEventSafe(db, {
    deploymentCode: input.deploymentCode || CODE_ACTIVECLINIC_ORG_V6,
    organizationId: input.organizationId,
    actorUserId: null,
    actionKey: "activeclinic.patient.identifier_archive",
    entityType: "patient_identifier",
    entityId: row.id,
    outcome: "success",
    metadata: { identifier_type: row.identifier_type },
  });

  return { ok: true, code: RESULT.OK, identifier: mapIdentifier(row) };
}

async function addEmergencyContact(db, input) {
  const authz = await authorizePatientAction(db, {
    organizationId: input.organizationId,
    facilityId: input.facilityId || null,
    permissionKey: PERM.UPDATE,
    actor: input.actor,
  });
  if (!authz.ok) return { ok: false, code: authz.code, contact: null };

  const patient = await resolvePatientForActor(db, {
    organizationId: input.organizationId,
    healthcareOrganizationId: input.healthcareOrganizationId,
    patientId: input.patientId,
    facilityId: input.facilityId || null,
    actor: input.actor,
  });
  if (!patient.ok) return { ok: false, code: patient.code, contact: null };

  const normalized = normalizeEmergencyContactInput(input);
  if (!normalized.ok) return { ok: false, code: normalized.code, contact: null };

  if (normalized.value.isPrimary) {
    await emergencyRepo.clearPrimaryForPatient(db, {
      organizationId: input.organizationId,
      healthcareOrganizationId: input.healthcareOrganizationId,
      patientId: input.patientId,
    });
  }

  const row = await emergencyRepo.insertContact(db, {
    organizationId: input.organizationId,
    healthcareOrganizationId: input.healthcareOrganizationId,
    patientId: input.patientId,
    ...normalized.value,
    createdByStaffId: input.actor.staffMemberId,
  });

  await recordAuditEventSafe(db, {
    deploymentCode: input.deploymentCode || CODE_ACTIVECLINIC_ORG_V6,
    organizationId: input.organizationId,
    actorUserId: null,
    actionKey: "activeclinic.patient.emergency_contact_add",
    entityType: "patient_emergency_contact",
    entityId: row.id,
    outcome: "success",
    metadata: { patient_number: patient.patient.patientNumber },
  });

  return {
    ok: true,
    code: RESULT.OK,
    contact: {
      id: row.id,
      fullName: row.full_name,
      relationship: row.relationship,
      phoneMasked: maskPhone(row.phone_normalized),
      emailMasked: maskEmail(row.email_normalized),
      isPrimary: row.is_primary === true,
      status: row.status,
    },
  };
}

async function listEmergencyContacts(db, input) {
  const authz = await authorizePatientAction(db, {
    organizationId: input.organizationId,
    facilityId: input.facilityId || null,
    permissionKey: PERM.VIEW_SENSITIVE,
    actor: input.actor,
  });
  if (!authz.ok) return { ok: false, code: authz.code, contacts: [] };

  const patient = await resolvePatientForActor(db, {
    organizationId: input.organizationId,
    healthcareOrganizationId: input.healthcareOrganizationId,
    patientId: input.patientId,
    facilityId: input.facilityId || null,
    actor: input.actor,
  });
  if (!patient.ok) return { ok: false, code: patient.code, contacts: [] };

  const rows = await emergencyRepo.listByPatient(db, {
    organizationId: input.organizationId,
    healthcareOrganizationId: input.healthcareOrganizationId,
    patientId: input.patientId,
    includeArchived: input.includeArchived === true,
  });

  return {
    ok: true,
    code: RESULT.OK,
    contacts: rows.map((row) => ({
      id: row.id,
      fullName: row.full_name,
      relationship: row.relationship,
      phoneDisplay: row.phone_display,
      phoneNormalized: row.phone_normalized,
      emailDisplay: row.email_display,
      emailNormalized: row.email_normalized,
      addressSummary: row.address_summary,
      isPrimary: row.is_primary === true,
      consentToContact: row.consent_to_contact,
      status: row.status,
    })),
  };
}

async function archiveEmergencyContact(db, input) {
  const authz = await authorizePatientAction(db, {
    organizationId: input.organizationId,
    facilityId: input.facilityId || null,
    permissionKey: PERM.UPDATE,
    actor: input.actor,
  });
  if (!authz.ok) return { ok: false, code: authz.code, contact: null };

  const row = await emergencyRepo.updateContact(db, {
    id: input.contactId,
    organizationId: input.organizationId,
    healthcareOrganizationId: input.healthcareOrganizationId,
    patch: {
      status: "archived",
      archivedAt: new Date(),
      isPrimary: false,
    },
  });
  if (!row) return { ok: false, code: RESULT.NOT_FOUND, contact: null };

  await recordAuditEventSafe(db, {
    deploymentCode: input.deploymentCode || CODE_ACTIVECLINIC_ORG_V6,
    organizationId: input.organizationId,
    actorUserId: null,
    actionKey: "activeclinic.patient.emergency_contact_archive",
    entityType: "patient_emergency_contact",
    entityId: row.id,
    outcome: "success",
    metadata: {},
  });

  return { ok: true, code: RESULT.OK, contact: { id: row.id, status: row.status } };
}

/** Reserved interface — not implemented in C01. */
async function mergeActiveClinicPatients() {
  return {
    ok: false,
    code: "merge_deferred",
    message:
      "Patient merge is deferred until product rules, conflict policy, and rollback strategy are approved.",
  };
}

module.exports = {
  RESULT,
  PERM,
  CREATION_MODES,
  mapPatient,
  mapIdentifier,
  registerActiveClinicPatient,
  updateActiveClinicPatient,
  setPatientStatus,
  searchActiveClinicPatients,
  getPatientByOrgAndId,
  getPatientByOrgAndNumber,
  resolvePatientForActor,
  addPatientIdentifier,
  listPatientIdentifiers,
  archivePatientIdentifier,
  addEmergencyContact,
  listEmergencyContacts,
  archiveEmergencyContact,
  mergeActiveClinicPatients,
  resolveActorFacilityScope,
};
