"use strict";

/**
 * Platform person service (V2.04 Phase 1).
 *
 * Creates/updates demographic persons and product relationship links.
 * Does not create members, patients, or portal identities.
 * Does not require platform_identity_id (staff-managed without portal).
 */

const repo = require("./personRepository");
const {
  normalizePersonDemographics,
  normalizePersonAddress,
  normalizeRelatedContact,
} = require("./personNormalization");
const {
  assertTrustedPersonScope,
  assertProductCode,
} = require("./personScope");
const { PERSON_STATUS } = require("./personConstants");
const {
  getPersonProductAdapter,
} = require("../contracts/productRuntimeRegistry");

const RESULT = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  NOT_FOUND: "person_not_found",
  LINK_EXISTS: "product_link_exists",
  FORBIDDEN_FIELD: "forbidden_person_field",
  SCOPE_DENIED: "scope_denied",
});

function resolveRelationshipKey(productCode, relationshipKey) {
  const key = String(relationshipKey || "").trim();
  if (key) return key;
  const adapter = getPersonProductAdapter(productCode);
  if (adapter && adapter.defaultRelationshipKey) {
    return String(adapter.defaultRelationshipKey).trim() || null;
  }
  if (
    adapter &&
    Array.isArray(adapter.relationshipKeys) &&
    adapter.relationshipKeys[0]
  ) {
    return String(adapter.relationshipKeys[0]).trim() || null;
  }
  return null;
}

/**
 * Create a demographic person without requiring portal activation.
 *
 * @param {{ query: Function }} db
 * @param {{
 *   trusted: { organizationId: string, branchId?: string|null, facilityId?: string|null },
 *   body?: object|null,
 *   demographics: object,
 *   platformIdentityId?: string|null,
 *   phoneVerifiedAt?: Date|string|null,
 *   emailVerifiedAt?: Date|string|null,
 *   actorIdentityId?: string|null,
 * }} input
 */
async function createPerson(db, input) {
  const scope = assertTrustedPersonScope({
    trusted: input && input.trusted,
    body: input && input.body,
  });
  if (!scope.ok) {
    return { ok: false, code: RESULT.SCOPE_DENIED, detail: scope };
  }

  const demo = normalizePersonDemographics(input && input.demographics);
  if (!demo.ok) {
    return {
      ok: false,
      code:
        demo.code === "forbidden_person_field"
          ? RESULT.FORBIDDEN_FIELD
          : RESULT.INVALID_INPUT,
      detail: demo,
    };
  }

  const person = await repo.insertPerson(db, {
    organizationId: scope.organizationId,
    branchId: scope.branchId,
    facilityId: scope.facilityId,
    platformIdentityId: (input && input.platformIdentityId) || null,
    status: PERSON_STATUS.ACTIVE,
    firstName: demo.firstName,
    middleName: demo.middleName,
    lastName: demo.lastName,
    preferredName: demo.preferredName,
    nameNormalized: demo.nameNormalized,
    dateOfBirth: demo.dateOfBirth,
    phoneDisplay: demo.phoneDisplay,
    phoneNormalized: demo.phoneNormalized,
    phoneVerifiedAt: (input && input.phoneVerifiedAt) || null,
    emailDisplay: demo.emailDisplay,
    emailNormalized: demo.emailNormalized,
    emailVerifiedAt: (input && input.emailVerifiedAt) || null,
    createdByIdentityId: (input && input.actorIdentityId) || null,
    updatedByIdentityId: (input && input.actorIdentityId) || null,
  });

  return { ok: true, code: RESULT.OK, person };
}

/**
 * @param {{ query: Function }} db
 * @param {{
 *   trusted: { organizationId: string, branchId?: string|null, facilityId?: string|null },
 *   body?: object|null,
 *   personId: string,
 *   demographics: object,
 *   actorIdentityId?: string|null,
 * }} input
 */
async function updatePerson(db, input) {
  const scope = assertTrustedPersonScope({
    trusted: input && input.trusted,
    body: input && input.body,
  });
  if (!scope.ok) {
    return { ok: false, code: RESULT.SCOPE_DENIED, detail: scope };
  }
  const personId = String((input && input.personId) || "").trim();
  if (!personId) {
    return { ok: false, code: RESULT.INVALID_INPUT, detail: { code: "person_id_required" } };
  }

  const existing = await repo.findPersonById(db, {
    organizationId: scope.organizationId,
    personId,
  });
  if (!existing) {
    return { ok: false, code: RESULT.NOT_FOUND };
  }

  const demo = normalizePersonDemographics(input && input.demographics);
  if (!demo.ok) {
    return {
      ok: false,
      code:
        demo.code === "forbidden_person_field"
          ? RESULT.FORBIDDEN_FIELD
          : RESULT.INVALID_INPUT,
      detail: demo,
    };
  }

  const person = await repo.updatePersonDemographics(db, {
    personId,
    organizationId: scope.organizationId,
    firstName: demo.firstName,
    middleName: demo.middleName,
    lastName: demo.lastName,
    preferredName: demo.preferredName,
    nameNormalized: demo.nameNormalized,
    dateOfBirth: demo.dateOfBirth,
    phoneDisplay: demo.phoneDisplay,
    phoneNormalized: demo.phoneNormalized,
    emailDisplay: demo.emailDisplay,
    emailNormalized: demo.emailNormalized,
    branchId: scope.branchId,
    facilityId: scope.facilityId,
    updatedByIdentityId: (input && input.actorIdentityId) || null,
  });

  return { ok: true, code: RESULT.OK, person };
}

/**
 * Link an existing person to a product record (member/patient id as subject_ref).
 * Does not create or modify the product record.
 */
async function linkPersonProductRelationship(db, input) {
  const scope = assertTrustedPersonScope({
    trusted: input && input.trusted,
    body: input && input.body,
  });
  if (!scope.ok) {
    return { ok: false, code: RESULT.SCOPE_DENIED, detail: scope };
  }

  const product = assertProductCode(input && input.productCode);
  if (!product.ok) {
    return { ok: false, code: RESULT.INVALID_INPUT, detail: product };
  }

  const personId = String((input && input.personId) || "").trim();
  const subjectRef = String((input && input.subjectRef) || "").trim();
  const relationshipKey = resolveRelationshipKey(
    product.productCode,
    input && input.relationshipKey
  );
  if (!personId || !subjectRef || !relationshipKey) {
    return {
      ok: false,
      code: RESULT.INVALID_INPUT,
      detail: { code: "link_fields_required" },
    };
  }

  const person = await repo.findPersonById(db, {
    organizationId: scope.organizationId,
    personId,
  });
  if (!person) {
    return { ok: false, code: RESULT.NOT_FOUND };
  }

  const existing = await repo.findLiveProductLink(db, {
    organizationId: scope.organizationId,
    productCode: product.productCode,
    relationshipKey,
    subjectRef,
  });
  if (existing) {
    return { ok: false, code: RESULT.LINK_EXISTS, link: existing };
  }

  const link = await repo.linkPersonToProduct(db, {
    organizationId: scope.organizationId,
    personId,
    productCode: product.productCode,
    relationshipKey,
    subjectRef,
    branchId: scope.branchId,
    facilityId: scope.facilityId,
    createdByIdentityId: (input && input.actorIdentityId) || null,
    updatedByIdentityId: (input && input.actorIdentityId) || null,
  });

  return { ok: true, code: RESULT.OK, link, person };
}

async function getPerson(db, input) {
  const scope = assertTrustedPersonScope({
    trusted: input && input.trusted,
    body: input && input.body,
  });
  if (!scope.ok) {
    return { ok: false, code: RESULT.SCOPE_DENIED, detail: scope };
  }
  const personId = String((input && input.personId) || "").trim();
  if (!personId) {
    return { ok: false, code: RESULT.INVALID_INPUT };
  }
  const person = await repo.findPersonById(db, {
    organizationId: scope.organizationId,
    personId,
  });
  if (!person) return { ok: false, code: RESULT.NOT_FOUND };
  const links = await repo.listProductLinksForPerson(db, {
    organizationId: scope.organizationId,
    personId,
  });
  return { ok: true, code: RESULT.OK, person, links };
}

async function setVerificationState(db, input) {
  const scope = assertTrustedPersonScope({
    trusted: input && input.trusted,
    body: input && input.body,
  });
  if (!scope.ok) {
    return { ok: false, code: RESULT.SCOPE_DENIED, detail: scope };
  }
  const personId = String((input && input.personId) || "").trim();
  if (!personId) return { ok: false, code: RESULT.INVALID_INPUT };

  const existing = await repo.findPersonById(db, {
    organizationId: scope.organizationId,
    personId,
  });
  if (!existing) return { ok: false, code: RESULT.NOT_FOUND };

  if (input && input.markPhoneVerified && !existing.phoneNormalized) {
    return {
      ok: false,
      code: RESULT.INVALID_INPUT,
      detail: { code: "phone_required_for_verification" },
    };
  }
  if (input && input.markEmailVerified && !existing.emailNormalized) {
    return {
      ok: false,
      code: RESULT.INVALID_INPUT,
      detail: { code: "email_required_for_verification" },
    };
  }

  const person = await repo.setPersonVerificationState(db, {
    personId,
    organizationId: scope.organizationId,
    markPhoneVerified: input && input.markPhoneVerified,
    clearPhoneVerified: input && input.clearPhoneVerified,
    markEmailVerified: input && input.markEmailVerified,
    clearEmailVerified: input && input.clearEmailVerified,
    updatedByIdentityId: (input && input.actorIdentityId) || null,
  });
  return { ok: true, code: RESULT.OK, person };
}

async function addPersonAddress(db, input) {
  const scope = assertTrustedPersonScope({
    trusted: input && input.trusted,
    body: input && input.body,
  });
  if (!scope.ok) {
    return { ok: false, code: RESULT.SCOPE_DENIED, detail: scope };
  }
  const personId = String((input && input.personId) || "").trim();
  if (!personId) return { ok: false, code: RESULT.INVALID_INPUT };

  const person = await repo.findPersonById(db, {
    organizationId: scope.organizationId,
    personId,
  });
  if (!person) return { ok: false, code: RESULT.NOT_FOUND };

  const addressNorm = normalizePersonAddress(input && input.address);
  if (!addressNorm.ok) {
    return { ok: false, code: RESULT.INVALID_INPUT, detail: addressNorm };
  }

  const address = await repo.insertAddress(db, {
    organizationId: scope.organizationId,
    personId,
    ...addressNorm,
  });
  return { ok: true, code: RESULT.OK, address };
}

async function addRelatedContact(db, input) {
  const scope = assertTrustedPersonScope({
    trusted: input && input.trusted,
    body: input && input.body,
  });
  if (!scope.ok) {
    return { ok: false, code: RESULT.SCOPE_DENIED, detail: scope };
  }
  const personId = String((input && input.personId) || "").trim();
  if (!personId) return { ok: false, code: RESULT.INVALID_INPUT };

  const person = await repo.findPersonById(db, {
    organizationId: scope.organizationId,
    personId,
  });
  if (!person) return { ok: false, code: RESULT.NOT_FOUND };

  const contactNorm = normalizeRelatedContact(input && input.contact);
  if (!contactNorm.ok) {
    return { ok: false, code: RESULT.INVALID_INPUT, detail: contactNorm };
  }

  const contact = await repo.insertRelatedContact(db, {
    organizationId: scope.organizationId,
    personId,
    ...contactNorm,
    createdByIdentityId: (input && input.actorIdentityId) || null,
    updatedByIdentityId: (input && input.actorIdentityId) || null,
  });
  return { ok: true, code: RESULT.OK, contact };
}

module.exports = {
  RESULT,
  createPerson,
  updatePerson,
  getPerson,
  linkPersonProductRelationship,
  setVerificationState,
  addPersonAddress,
  addRelatedContact,
  resolveRelationshipKey,
};
