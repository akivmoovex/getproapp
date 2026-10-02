"use strict";

/**
 * ActiveClinic V2.04 staff Add Patient domain foundation (Phase 5).
 *
 * Reuses ACN10 registration / duplicate prevention and ACN11 profile update —
 * does not create a parallel patient stack.
 *
 * Rules:
 * - Staff-only create via platform person workflow + existing register path
 * - Patient record does not require portal activation
 * - Patient Number remains HCO-scoped AC-YYYY-NNNNNN (immutable)
 * - Shared duplicate engine via ACN10 service
 * - Clinical data never accepted on demographic paths
 * - Demographics RBAC ≠ clinical access
 */

const {
  PATIENT_STATUS,
  CREATE_TIME_PATIENT_STATUSES,
  PORTAL_ACCESS_STATUS,
  PATIENT_PERMISSION,
  PATIENT_PERMISSION_ALIASES,
  PATIENT_NUMBER_POLICY,
  CLINICAL_FORBIDDEN_FIELDS,
} = require("./patientDomainConstants");
const {
  runStaffManagedPersonWorkflow,
  STAFF_PERSON_WORKFLOW_CODE,
} = require("../../platform/person/workflow");
const {
  createActiveClinicStaffPatientAdapter,
  PORTAL_ACCESS,
} = require("./activeClinicStaffPatientWorkflowAdapter");
const {
  isValidPatientNumberFormat,
} = require("./generateActiveClinicPatientNumber");
const {
  SHARED_AUDIT_ACTION,
  SHARED_AUDIT_OUTCOME,
  recordSharedPlatformAudit,
} = require("../../platform/audit");

const RESULT = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  UNAUTHORIZED: "unauthorized",
  NOT_FOUND: "patient_not_found",
  DUPLICATE_WARNING: "duplicate_warning",
  IDENTIFIER_CONFLICT: "identifier_conflict",
  DUPLICATE_PATIENT_NUMBER: "duplicate_patient_number",
  PATIENT_NUMBER_IMMUTABLE: "patient_number_immutable",
  CLINICAL_FIELD_FORBIDDEN: "clinical_field_forbidden",
  PORTAL_NOT_REQUIRED: "portal_not_required",
  TENANT_MISMATCH: "tenant_mismatch",
  HCO_MISMATCH: "hco_mismatch",
  VALIDATION_FAILED: "validation_failed",
  SELF_CREATE_FORBIDDEN: "self_create_forbidden",
});

function resolvePermissionKey(permission) {
  const raw = String(permission || "").trim();
  if (!raw) return null;
  if (PATIENT_PERMISSION_ALIASES[raw]) return PATIENT_PERMISSION_ALIASES[raw];
  return raw;
}

function createAuthorize(deps) {
  return (
    (deps && deps.authorize) ||
    (async (db, input) => {
      const {
        authorizeStaffPermission,
        RESULT: AUTHZ_RESULT,
      } = require("./activeClinicAuthorizationService");
      const permissionKey = resolvePermissionKey(input.permission);
      const authz = await authorizeStaffPermission(db, {
        organizationId: input.organizationId,
        staffMemberId: input.staffMemberId,
        platformIdentityId: input.platformIdentityId || null,
        permissionKey,
        facilityId: input.facilityId || null,
      });
      return {
        allowed: authz && authz.ok === true,
        reasonCode:
          authz && authz.ok
            ? "RBAC_ALLOWED"
            : (authz && authz.code) || AUTHZ_RESULT.DENIED || "unauthorized",
        permission: permissionKey,
        authz,
      };
    })
  );
}

async function requirePerm(db, authorize, input, permission) {
  const permissionKey = resolvePermissionKey(permission);
  const authz = await authorize(db, {
    permission: permissionKey,
    organizationId: input.organizationId,
    staffMemberId: input.staffMemberId,
    platformIdentityId: input.platformIdentityId,
    facilityId: input.facilityId,
  });
  if (!authz || authz.allowed !== true) {
    return {
      ok: false,
      code: RESULT.UNAUTHORIZED,
      reasonCode: (authz && authz.reasonCode) || "unauthorized",
      permission: permissionKey,
    };
  }
  return { ok: true, authz, permission: permissionKey };
}

function assertStaffActor(input) {
  const staffMemberId = String((input && input.staffMemberId) || "").trim();
  const organizationId = String((input && input.organizationId) || "").trim();
  const healthcareOrganizationId = String(
    (input && input.healthcareOrganizationId) || ""
  ).trim();
  if (!staffMemberId || !organizationId || !healthcareOrganizationId) {
    return { ok: false, code: RESULT.INVALID_INPUT };
  }
  if (input.selfCreate === true || input.actorKind === "patient_self") {
    return { ok: false, code: RESULT.SELF_CREATE_FORBIDDEN };
  }
  return { ok: true, staffMemberId, organizationId, healthcareOrganizationId };
}

/**
 * Reject clinical payloads on demographic create/edit paths.
 * Reception create/edit must not become a clinical write surface.
 */
function assertClinicalBoundary(payload) {
  const bags = [
    payload,
    payload && payload.demographics,
    payload && payload.product,
    payload && payload.profile,
    payload && payload.body,
  ].filter(Boolean);

  for (const bag of bags) {
    if (typeof bag !== "object") continue;
    for (const field of CLINICAL_FORBIDDEN_FIELDS) {
      if (bag[field] != null) {
        return {
          ok: false,
          code: RESULT.CLINICAL_FIELD_FORBIDDEN,
          field,
        };
      }
    }
  }
  return { ok: true };
}

function derivePortalAccessStatus(patient) {
  if (!patient) return PORTAL_ACCESS_STATUS.NONE;
  if (patient.platformIdentityId || patient.platform_identity_id) {
    return PORTAL_ACCESS_STATUS.LINKED;
  }
  return PORTAL_ACCESS_STATUS.NONE;
}

function assertPatientNumberPolicy(value) {
  if (value == null || String(value).trim() === "") {
    return { ok: true, allocated: true };
  }
  const text = String(value).trim();
  if (!isValidPatientNumberFormat(text)) {
    return {
      ok: false,
      code: RESULT.INVALID_INPUT,
      detail: "patient_number_format",
      policy: PATIENT_NUMBER_POLICY,
    };
  }
  return { ok: true, patientNumber: text, allocated: false };
}

/**
 * Patient Number is immutable after create. Staff cannot patch it.
 */
function assertPatientNumberImmutable(existing, attempted) {
  if (attempted == null || String(attempted).trim() === "") {
    return { ok: true };
  }
  const next = String(attempted).trim();
  const current = String(
    (existing && (existing.patientNumber || existing.patient_number)) || ""
  ).trim();
  if (current && next !== current) {
    return { ok: false, code: RESULT.PATIENT_NUMBER_IMMUTABLE };
  }
  return { ok: true };
}

async function auditPatientChange(db, payload) {
  return recordSharedPlatformAudit(db, {
    actionKey: payload.actionKey || SHARED_AUDIT_ACTION.STAFF_PERSON_WORKFLOW_COMPLETED,
    outcome: payload.outcome || SHARED_AUDIT_OUTCOME.SUCCESS,
    productCode: "activeclinic",
    organizationId: payload.organizationId,
    facilityId: payload.facilityId || null,
    actorUserId: payload.actorUserId || null,
    actorIdentityId: payload.actorIdentityId || null,
    entityType: "patient",
    entityId: payload.patientId || null,
    metadata: payload.metadata || {},
  });
}

function splitFullName(demographics) {
  const src = demographics && typeof demographics === "object" ? demographics : {};
  if (src.firstName || src.lastName) {
    return {
      firstName: src.firstName || null,
      middleName: src.middleName || null,
      lastName: src.lastName || null,
      preferredName: src.preferredName || null,
      dateOfBirth: src.dateOfBirth || null,
      phoneNormalized: src.phoneNormalized || null,
      phoneDisplay: src.phoneDisplay || null,
      emailNormalized: src.emailNormalized || src.email || null,
      emailDisplay: src.emailDisplay || null,
      email: src.email || null,
    };
  }
  const full = String(src.fullName || "").trim();
  if (!full) return { ...src };
  const parts = full.split(/\s+/);
  if (parts.length === 1) {
    return { ...src, firstName: parts[0], lastName: parts[0] };
  }
  return {
    ...src,
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  };
}

/**
 * Staff create patient via shared person workflow → ACN10 register.
 * Portal defaults to none; Patient Number is server-allocated.
 */
async function createStaffManagedPatient(db, input, deps) {
  const gate = assertStaffActor(input);
  if (!gate.ok) return gate;

  const clinical = assertClinicalBoundary(input);
  if (!clinical.ok) return clinical;

  const facilityId = String((input && input.facilityId) || "").trim();
  if (!facilityId) {
    return { ok: false, code: RESULT.INVALID_INPUT, detail: "facility_required" };
  }

  const authorize = createAuthorize(deps);
  const authz = await requirePerm(
    db,
    authorize,
    {
      ...input,
      facilityId,
    },
    PATIENT_PERMISSION.CREATE
  );
  if (!authz.ok) return authz;

  const numberProbe = assertPatientNumberPolicy(input.patientNumber);
  if (!numberProbe.ok) return numberProbe;
  if (numberProbe.patientNumber && input.allocateClientPatientNumber === true) {
    return {
      ok: false,
      code: RESULT.INVALID_INPUT,
      detail: "client_patient_number_allocation_forbidden",
      policy: PATIENT_NUMBER_POLICY,
    };
  }

  const demographics = splitFullName(input.demographics || {});
  const adapter =
    (deps && deps.adapter) ||
    createActiveClinicStaffPatientAdapter({
      registerActiveClinicPatient:
        deps && deps.registerActiveClinicPatient
          ? deps.registerActiveClinicPatient
          : undefined,
    });

  const workflow = await runStaffManagedPersonWorkflow(db, {
    productCode: "activeclinic",
    adapter: {
      ...adapter,
      authorize: async () => ({ ok: true }),
      async createProductRelationship(innerDb, ctx) {
        const created = await adapter.createProductRelationship(innerDb, {
          ...ctx,
          product: {
            ...ctx.product,
            portalAccessStatus: PORTAL_ACCESS.NONE,
            patientStatus:
              (input.patientStatus &&
                CREATE_TIME_PATIENT_STATUSES.includes(
                  String(input.patientStatus).toLowerCase()
                ) &&
                String(input.patientStatus).toLowerCase()) ||
              PATIENT_STATUS.ACTIVE,
          },
        });
        return created;
      },
    },
    trusted: {
      organizationId: gate.organizationId,
      facilityId,
      healthcareOrganizationId: gate.healthcareOrganizationId,
    },
    actor: {
      staffMemberId: gate.staffMemberId,
      platformIdentityId: input.platformIdentityId || null,
    },
    demographics,
    product: {
      healthcareOrganizationId: gate.healthcareOrganizationId,
      facilityId,
      patientStatus:
        (input.patientStatus &&
          CREATE_TIME_PATIENT_STATUSES.includes(
            String(input.patientStatus).toLowerCase()
          ) &&
          String(input.patientStatus).toLowerCase()) ||
        PATIENT_STATUS.ACTIVE,
      portalAccessStatus: PORTAL_ACCESS_STATUS.NONE,
      registrationMethod: input.registrationMethod || "walk_in",
      creationMode: input.creationMode || "full",
      identifiers: input.identifiers || [],
      emergencyContacts: input.emergencyContacts || [],
      nextOfKin: input.nextOfKin || null,
      address: input.address || null,
      sexAtRegistration:
        (input.demographics && input.demographics.sexAtRegistration) ||
        input.sexAtRegistration ||
        null,
      patientNumber: numberProbe.patientNumber || null,
    },
    reusePersonId: input.reusePersonId || null,
    duplicateOverride: input.duplicateOverride === true,
    duplicateOverrideReason: input.duplicateOverrideReason || null,
    source: input.source || "staff_api",
    hooks: deps && deps.hooks,
  });

  if (!workflow.ok) {
    if (
      workflow.code === STAFF_PERSON_WORKFLOW_CODE.DUPLICATE_BLOCKED ||
      workflow.code === STAFF_PERSON_WORKFLOW_CODE.DUPLICATE_OVERRIDE_REQUIRED
    ) {
      return {
        ok: false,
        code: RESULT.DUPLICATE_WARNING,
        matches: workflow.matches || [],
        detail: workflow,
      };
    }
    if (workflow.detail && workflow.detail.code === "identifier_conflict") {
      return {
        ok: false,
        code: RESULT.IDENTIFIER_CONFLICT,
        detail: workflow.detail,
      };
    }
    if (
      workflow.detail &&
      (workflow.detail.code === "duplicate_warning" ||
        workflow.detail.code === RESULT.DUPLICATE_WARNING)
    ) {
      return {
        ok: false,
        code: RESULT.DUPLICATE_WARNING,
        matches: (workflow.detail && workflow.detail.matches) || [],
        detail: workflow.detail,
      };
    }
    return {
      ok: false,
      code: workflow.code || RESULT.VALIDATION_FAILED,
      detail: workflow,
    };
  }

  const patient =
    (workflow.productRecord && workflow.productRecord.patient) || null;
  const portalAccessStatus =
    workflow.portalAccessStatus || derivePortalAccessStatus(patient);
  const personId =
    (workflow.person && workflow.person.id) ||
    workflow.personId ||
    null;

  await auditPatientChange(db, {
    actionKey: "activeclinic.patient.create",
    organizationId: gate.organizationId,
    facilityId,
    actorIdentityId: input.platformIdentityId || null,
    patientId: workflow.subjectRef,
    metadata: {
      healthcare_organization_id: gate.healthcareOrganizationId,
      facility_id: facilityId,
      patient_number: workflow.productIdentifier,
      patient_status: workflow.relationshipStatus || PATIENT_STATUS.ACTIVE,
      portal_access_status: portalAccessStatus,
      person_id: personId,
      reuse_person_id: input.reusePersonId || null,
      source: input.source || "staff_api",
    },
  });

  return {
    ok: true,
    code: RESULT.OK,
    patientId: workflow.subjectRef,
    patientNumber: workflow.productIdentifier,
    patientStatus: workflow.relationshipStatus || PATIENT_STATUS.ACTIVE,
    portalAccessStatus,
    personId,
    patient,
    workflow,
  };
}

/**
 * Staff demographic update — wraps ACN11 updateActiveClinicPatient.
 * Does not grant clinical write; rejects clinical fields.
 */
async function updatePatientDemographics(db, input, deps) {
  const gate = assertStaffActor(input);
  if (!gate.ok) return gate;

  const clinical = assertClinicalBoundary(input);
  if (!clinical.ok) return clinical;

  const patientId = String((input && input.patientId) || "").trim();
  if (!patientId) {
    return { ok: false, code: RESULT.INVALID_INPUT, detail: "patient_id_required" };
  }

  const immutability = assertPatientNumberImmutable(
    input.existingPatient || { patientNumber: input.currentPatientNumber },
    input.patientNumber
  );
  if (!immutability.ok) return immutability;

  const authorize = createAuthorize(deps);
  const authz = await requirePerm(
    db,
    authorize,
    {
      ...input,
      facilityId: input.facilityId,
    },
    PATIENT_PERMISSION.EDIT
  );
  if (!authz.ok) return authz;

  const updateFn =
    (deps && deps.updateActiveClinicPatient) ||
    ((innerDb, payload) =>
      require("./activeClinicPatientService").updateActiveClinicPatient(
        innerDb,
        payload
      ));

  const demographics = input.demographics
    ? splitFullName(input.demographics)
    : undefined;

  const updated = await updateFn(db, {
    organizationId: gate.organizationId,
    healthcareOrganizationId: gate.healthcareOrganizationId,
    patientId,
    facilityId: input.facilityId || null,
    actor: {
      staffMemberId: gate.staffMemberId,
      platformIdentityId: input.platformIdentityId || null,
      organizationId: gate.organizationId,
    },
    demographics,
    contacts: input.contacts || undefined,
    address: input.address || undefined,
    nextOfKin: input.nextOfKin || undefined,
    clinicFields: input.clinicFields,
    markRegistrationComplete: input.markRegistrationComplete,
  });

  if (!updated || !updated.ok) {
    if (updated && updated.code === "access_denied") {
      return { ok: false, code: RESULT.UNAUTHORIZED, detail: updated };
    }
    if (updated && updated.code === "patient_not_found") {
      return { ok: false, code: RESULT.NOT_FOUND, detail: updated };
    }
    return {
      ok: false,
      code: (updated && updated.code) || RESULT.VALIDATION_FAILED,
      detail: updated,
    };
  }

  if (
    updated.patient &&
    updated.patient.healthcareOrganizationId &&
    updated.patient.healthcareOrganizationId !== gate.healthcareOrganizationId
  ) {
    return { ok: false, code: RESULT.HCO_MISMATCH };
  }
  if (
    updated.patient &&
    updated.patient.organizationId &&
    updated.patient.organizationId !== gate.organizationId
  ) {
    return { ok: false, code: RESULT.TENANT_MISMATCH };
  }

  await auditPatientChange(db, {
    actionKey: "activeclinic.patient.update",
    organizationId: gate.organizationId,
    facilityId: input.facilityId || null,
    actorIdentityId: input.platformIdentityId || null,
    patientId,
    metadata: {
      healthcare_organization_id: gate.healthcareOrganizationId,
      patient_number: updated.patient && updated.patient.patientNumber,
      portal_access_status: derivePortalAccessStatus(updated.patient),
      patient_status: updated.patient && updated.patient.status,
      field_keys: [
        demographics ? "demographics" : null,
        input.contacts ? "contacts" : null,
        input.address ? "address" : null,
        input.nextOfKin ? "next_of_kin" : null,
      ].filter(Boolean),
      clinical_fields_accepted: false,
    },
  });

  return {
    ok: true,
    code: RESULT.OK,
    patient: updated.patient,
    portalAccessStatus: derivePortalAccessStatus(updated.patient),
  };
}

/**
 * HCO-scoped duplicate evaluation — reuses ACN10 shared-engine path.
 * Never searches across HCO boundaries.
 */
async function evaluateStaffPatientDuplicates(db, input, deps) {
  const organizationId = String((input && input.organizationId) || "").trim();
  const healthcareOrganizationId = String(
    (input && input.healthcareOrganizationId) || ""
  ).trim();
  if (!organizationId || !healthcareOrganizationId) {
    return { ok: false, code: RESULT.INVALID_INPUT };
  }

  const findFn =
    (deps && deps.findPotentialPatientDuplicates) ||
    ((innerDb, payload) =>
      require("./activeClinicPatientDuplicateService").findPotentialPatientDuplicates(
        innerDb,
        payload
      ));

  const result = await findFn(db, {
    organizationId,
    healthcareOrganizationId,
    identifiers: input.identifiers || [],
    phoneNormalized: input.phoneNormalized || null,
    emailNormalized: input.emailNormalized || null,
    dateOfBirth: input.dateOfBirth || null,
    firstName: input.firstName || null,
    lastName: input.lastName || null,
    excludePatientId: input.excludePatientId || null,
  });

  if (!result || result.ok === false) {
    return {
      ok: false,
      code: (result && result.code) || RESULT.VALIDATION_FAILED,
      matches: [],
      blocking: false,
    };
  }

  return {
    ok: true,
    code: RESULT.OK,
    matches: result.matches || [],
    blocking: result.blocking === true,
    hasStrong: result.hasStrong === true,
  };
}

/**
 * Identifier conflict check — HCO-scoped via ACN10.
 */
async function checkStaffPatientIdentifierConflict(db, input, deps) {
  const organizationId = String((input && input.organizationId) || "").trim();
  const healthcareOrganizationId = String(
    (input && input.healthcareOrganizationId) || ""
  ).trim();
  const identifierType = String((input && input.identifierType) || "").trim();
  const identifierValueNormalized = String(
    (input && input.identifierValueNormalized) || ""
  ).trim();
  if (
    !organizationId ||
    !healthcareOrganizationId ||
    !identifierType ||
    !identifierValueNormalized
  ) {
    return { ok: false, code: RESULT.INVALID_INPUT };
  }

  const findFn =
    (deps && deps.findIdentifierConflict) ||
    ((innerDb, payload) =>
      require("./activeClinicPatientDuplicateService").findIdentifierConflict(
        innerDb,
        payload
      ));

  const conflict = await findFn(db, {
    organizationId,
    healthcareOrganizationId,
    identifierType,
    identifierValueNormalized,
    excludePatientId: input.excludePatientId || null,
  });

  if (conflict && conflict.conflict) {
    return {
      ok: false,
      code: RESULT.IDENTIFIER_CONFLICT,
      conflict: conflict.conflict,
    };
  }
  return { ok: true, code: RESULT.OK, conflict: null };
}

/**
 * Safe person reuse: exact org-scoped phone or email on platform.persons.
 */
async function findReusablePersonForPatient(db, input) {
  const organizationId = String((input && input.organizationId) || "").trim();
  if (!organizationId) return { ok: false, code: RESULT.INVALID_INPUT };

  const phone = input.phoneNormalized
    ? String(input.phoneNormalized).trim()
    : null;
  const email = input.emailNormalized
    ? String(input.emailNormalized).trim().toLowerCase()
    : null;
  if (!phone && !email) {
    return { ok: true, person: null, reason: "no_safe_signal" };
  }

  const params = [organizationId];
  const clauses = [];
  let i = 2;
  if (phone) {
    clauses.push(`phone_normalized = $${i++}`);
    params.push(phone);
  }
  if (email) {
    clauses.push(`email_normalized = $${i++}`);
    params.push(email);
  }

  const { rows } = await db.query(
    `SELECT id, organization_id, phone_normalized, email_normalized, status
       FROM platform.persons
      WHERE organization_id = $1
        AND status = 'active'
        AND (${clauses.join(" OR ")})
      ORDER BY created_at ASC
      LIMIT 5`,
    params
  );

  if (!rows.length) return { ok: true, person: null, reason: "no_match" };
  if (rows.length > 1) {
    return {
      ok: true,
      person: null,
      reason: "ambiguous",
      candidates: rows.length,
    };
  }
  return {
    ok: true,
    person: {
      id: rows[0].id,
      organizationId: rows[0].organization_id,
      phoneNormalized: rows[0].phone_normalized,
      emailNormalized: rows[0].email_normalized,
    },
    reason: "exact_match",
  };
}

/**
 * Assert patient exists without portal — portal activation is optional.
 */
function assertPatientDoesNotRequirePortal(patient) {
  const portal = derivePortalAccessStatus(patient);
  return {
    ok: true,
    code: RESULT.PORTAL_NOT_REQUIRED,
    portalAccessStatus: portal,
    requiresPortal: false,
  };
}

module.exports = {
  RESULT,
  PATIENT_STATUS,
  PORTAL_ACCESS_STATUS,
  PATIENT_PERMISSION,
  PATIENT_PERMISSION_ALIASES,
  PATIENT_NUMBER_POLICY,
  resolvePermissionKey,
  assertStaffActor,
  assertClinicalBoundary,
  assertPatientNumberPolicy,
  assertPatientNumberImmutable,
  derivePortalAccessStatus,
  assertPatientDoesNotRequirePortal,
  createStaffManagedPatient,
  updatePatientDemographics,
  evaluateStaffPatientDuplicates,
  checkStaffPatientIdentifierConflict,
  findReusablePersonForPatient,
};
