"use strict";

/**
 * Staff-managed person workflow orchestrator (V2.04 Phase 3).
 *
 * authorize → normalize → search/match → duplicate evaluation →
 * create/reuse person → invoke product adapter → audit → return
 *
 * Does NOT invent a merged member+patient domain. Product semantics stay in adapters.
 */

const {
  STAFF_PERSON_WORKFLOW_CODE,
  STAFF_PERSON_WORKFLOW_SOURCE,
} = require("./staffPersonWorkflowCodes");
const { assertStaffPersonAdapter } = require("./staffPersonAdapterContract");
const { normalizePersonDemographics } = require("../personNormalization");
const { assertTrustedPersonScope, assertProductCode } = require("../personScope");
const {
  createPerson,
  getPerson,
  linkPersonProductRelationship,
} = require("../personService");
const {
  evaluatePersonDuplicates,
  PERSON_MATCH_CODE,
  PERSON_MATCH_ACTION,
  BASELINE_DUPLICATE_POLICY,
} = require("../duplicate");
const {
  getPersonProductAdapter,
} = require("../../contracts/productRuntimeRegistry");
const {
  SHARED_AUDIT_ACTION,
  SHARED_AUDIT_ENTITY,
  SHARED_AUDIT_OUTCOME,
  recordSharedPlatformAudit,
} = require("../../audit");

const RESULT = STAFF_PERSON_WORKFLOW_CODE;

function resolveAdapter(input) {
  if (input && input.adapter) {
    return input.adapter;
  }
  const product = assertProductCode(input && input.productCode);
  if (!product.ok) return null;
  const registered = getPersonProductAdapter(product.productCode);
  if (!registered || !registered.staffManagedWorkflow) return null;
  return registered.staffManagedWorkflow;
}

async function defaultAudit(db, payload) {
  if (typeof recordSharedPlatformAudit === "function") {
    return recordSharedPlatformAudit(db, payload);
  }
  return { ok: true, skipped: true };
}

/**
 * @param {{ query: Function }} db
 * @param {{
 *   productCode: string,
 *   trusted: { organizationId: string, branchId?: string|null, facilityId?: string|null, churchId?: string|null },
 *   actor: object,
 *   demographics?: object,
 *   product?: object,
 *   body?: object,
 *   reusePersonId?: string|null,
 *   duplicateOverride?: boolean,
 *   duplicateOverrideReason?: string|null,
 *   source?: string,
 *   adapter?: object,
 *   hooks?: {
 *     createPerson?: Function,
 *     getPerson?: Function,
 *     linkPersonProductRelationship?: Function,
 *     evaluatePersonDuplicates?: Function,
 *     recordAudit?: Function,
 *   },
 * }} input
 */
async function runStaffManagedPersonWorkflow(db, input) {
  const src = input && typeof input === "object" ? input : {};
  const hooks = src.hooks && typeof src.hooks === "object" ? src.hooks : {};
  const source =
    String(src.source || STAFF_PERSON_WORKFLOW_SOURCE.STAFF_API).trim() ||
    STAFF_PERSON_WORKFLOW_SOURCE.STAFF_API;

  const adapter = resolveAdapter(src);
  const adapterCheck = assertStaffPersonAdapter(adapter);
  if (!adapterCheck.ok) {
    return {
      ok: false,
      code: RESULT.ADAPTER_MISSING,
      detail: adapterCheck,
    };
  }

  const productCode = String(adapter.productCode)
    .trim()
    .toLowerCase();
  const scope = assertTrustedPersonScope({
    trusted: src.trusted,
    body: src.body,
  });
  if (!scope.ok) {
    return { ok: false, code: RESULT.SCOPE_DENIED, detail: scope };
  }

  // 1) authorize
  const authz = await adapter.authorize(db, {
    trusted: {
      organizationId: scope.organizationId,
      branchId: scope.branchId,
      facilityId: scope.facilityId,
      churchId: (src.trusted && src.trusted.churchId) || null,
    },
    actor: src.actor || {},
    product: src.product || {},
    permissionKey: adapter.createPermissionKey || null,
  });
  if (!authz || !authz.ok) {
    return {
      ok: false,
      code: RESULT.UNAUTHORIZED,
      detail: authz || { code: "unauthorized" },
    };
  }

  // 2) normalize (platform demographics + product fields)
  const demographics = normalizePersonDemographics(src.demographics || {});
  if (!demographics.ok) {
    return {
      ok: false,
      code: RESULT.VALIDATION_FAILED,
      detail: demographics,
    };
  }

  const productNorm = adapter.normalizeProductFields({
    product: src.product || {},
    demographics,
    trusted: {
      organizationId: scope.organizationId,
      branchId: scope.branchId,
      facilityId: scope.facilityId,
      churchId: (src.trusted && src.trusted.churchId) || null,
    },
  });
  if (!productNorm || !productNorm.ok) {
    return {
      ok: false,
      code: RESULT.VALIDATION_FAILED,
      detail: productNorm || { code: "product_validation_failed" },
    };
  }

  const probe = {
    firstName: demographics.firstName,
    lastName: demographics.lastName,
    nameNormalized: demographics.nameNormalized,
    phoneNormalized: demographics.phoneNormalized,
    emailNormalized: demographics.emailNormalized,
    dateOfBirth: demographics.dateOfBirth,
    productIdentifiers: Array.isArray(productNorm.productIdentifiers)
      ? productNorm.productIdentifiers
      : [],
  };

  // 3) search/match candidates (product-scoped)
  const loaded = await adapter.loadDuplicateCandidates(db, {
    trusted: {
      organizationId: scope.organizationId,
      branchId: scope.branchId,
      facilityId: scope.facilityId,
      churchId: (src.trusted && src.trusted.churchId) || null,
    },
    probe,
    product: productNorm.product,
  });
  if (!loaded || !loaded.ok) {
    return {
      ok: false,
      code: RESULT.VALIDATION_FAILED,
      detail: loaded || { code: "candidate_load_failed" },
    };
  }

  // 4) duplicate evaluation
  const evaluate =
    typeof hooks.evaluatePersonDuplicates === "function"
      ? hooks.evaluatePersonDuplicates
      : evaluatePersonDuplicates;
  const match = evaluate({
    trusted: { organizationId: scope.organizationId },
    productCode,
    probe,
    candidates: loaded.candidates || [],
    policy: adapter.duplicatePolicy || BASELINE_DUPLICATE_POLICY,
    presentMatch: adapter.presentMatch,
    excludeSubjectRef: productNorm.excludeSubjectRef || null,
  });

  if (!match.ok) {
    return {
      ok: false,
      code: RESULT.VALIDATION_FAILED,
      detail: match,
    };
  }

  if (match.blocking) {
    const overrideRequested = src.duplicateOverride === true;
    if (!overrideRequested) {
      const blockedHard =
        match.action === PERSON_MATCH_ACTION.BLOCK ||
        match.overallMatchCode === PERSON_MATCH_CODE.EXACT_IDENTIFIER_MATCH;
      return {
        ok: false,
        code: blockedHard
          ? RESULT.DUPLICATE_BLOCKED
          : RESULT.DUPLICATE_OVERRIDE_REQUIRED,
        overallMatchCode: match.overallMatchCode,
        action: match.action,
        matches: match.matches,
      };
    }
    if (match.action === PERSON_MATCH_ACTION.BLOCK || !match.overrideAllowed) {
      return {
        ok: false,
        code: RESULT.DUPLICATE_OVERRIDE_DENIED,
        overallMatchCode: match.overallMatchCode,
        action: match.action,
        matches: match.matches,
      };
    }
  }

  const actorIdentityId =
    (src.actor &&
      (src.actor.platformIdentityId || src.actor.identityId || null)) ||
    null;

  // 5) create / reuse person
  let person = null;
  let personCreated = false;
  const createPersonFn =
    typeof hooks.createPerson === "function" ? hooks.createPerson : createPerson;
  const getPersonFn =
    typeof hooks.getPerson === "function" ? hooks.getPerson : getPerson;

  if (src.reusePersonId) {
    const existing = await getPersonFn(db, {
      trusted: {
        organizationId: scope.organizationId,
        branchId: scope.branchId,
        facilityId: scope.facilityId,
      },
      personId: src.reusePersonId,
    });
    if (!existing.ok) {
      return { ok: false, code: RESULT.PERSON_FAILED, detail: existing };
    }
    person = existing.person;
  } else {
    const created = await createPersonFn(db, {
      trusted: {
        organizationId: scope.organizationId,
        branchId: scope.branchId,
        facilityId: scope.facilityId,
      },
      demographics,
      actorIdentityId,
      // Staff-managed: no portal identity required.
      platformIdentityId: null,
    });
    if (!created.ok) {
      return { ok: false, code: RESULT.PERSON_FAILED, detail: created };
    }
    person = created.person;
    personCreated = true;
  }

  // 6) invoke product adapter (member / patient create)
  const productCreated = await adapter.createProductRelationship(db, {
    trusted: {
      organizationId: scope.organizationId,
      branchId: scope.branchId,
      facilityId: scope.facilityId,
      churchId: (src.trusted && src.trusted.churchId) || null,
    },
    actor: src.actor || {},
    person,
    demographics,
    product: productNorm.product,
    duplicateOverride: src.duplicateOverride === true,
    duplicateOverrideReason: src.duplicateOverrideReason || null,
    overallMatchCode: match.overallMatchCode,
  });
  if (!productCreated || !productCreated.ok) {
    return {
      ok: false,
      code: RESULT.PRODUCT_CREATE_FAILED,
      detail: productCreated || { code: "product_create_failed" },
      person,
      personCreated,
    };
  }

  // 7) link person → product relationship
  const linkFn =
    typeof hooks.linkPersonProductRelationship === "function"
      ? hooks.linkPersonProductRelationship
      : linkPersonProductRelationship;
  const linked = await linkFn(db, {
    trusted: {
      organizationId: scope.organizationId,
      branchId: scope.branchId,
      facilityId: scope.facilityId,
    },
    personId: person.id,
    productCode,
    relationshipKey: adapter.relationshipKey,
    subjectRef: productCreated.subjectRef,
    actorIdentityId,
  });
  if (!linked.ok && linked.code !== "product_link_exists") {
    return {
      ok: false,
      code: RESULT.LINK_FAILED,
      detail: linked,
      person,
      productRecord: productCreated.productRecord || null,
    };
  }

  // 8) audit
  const recordAudit =
    typeof hooks.recordAudit === "function" ? hooks.recordAudit : defaultAudit;
  await recordAudit(db, {
    actionKey: SHARED_AUDIT_ACTION.STAFF_PERSON_WORKFLOW_COMPLETED,
    outcome: SHARED_AUDIT_OUTCOME.SUCCESS,
    productCode,
    organizationId: scope.organizationId,
    churchId: (src.trusted && src.trusted.churchId) || null,
    branchId: scope.branchId,
    facilityId: scope.facilityId,
    actorIdentityId,
    actorUserId: (src.actor && (src.actor.userId || src.actor.staffUserId)) || null,
    entityType: SHARED_AUDIT_ENTITY.PERSON,
    entityId: person.id,
    metadata: {
      source,
      person_id: person.id,
      person_created: personCreated,
      subject_ref: productCreated.subjectRef,
      relationship_key: adapter.relationshipKey,
      product_relationship: linked.link ? linked.link.id : null,
      product_identifier: productCreated.productIdentifier || null,
      relationship_status: productCreated.relationshipStatus || null,
      portal_access_status: productCreated.portalAccessStatus || null,
      overall_match_code: match.overallMatchCode,
      duplicate_override: src.duplicateOverride === true,
      reason: src.duplicateOverrideReason || null,
      location: productCreated.location || null,
    },
  });

  return {
    ok: true,
    code: RESULT.OK,
    person,
    personCreated,
    link: linked.link || null,
    productCode,
    relationshipKey: adapter.relationshipKey,
    subjectRef: productCreated.subjectRef,
    productIdentifier: productCreated.productIdentifier || null,
    relationshipStatus: productCreated.relationshipStatus || null,
    portalAccessStatus: productCreated.portalAccessStatus || null,
    productRecord: productCreated.productRecord || null,
    location: productCreated.location || {
      organizationId: scope.organizationId,
      branchId: scope.branchId,
      facilityId: scope.facilityId,
      churchId: (src.trusted && src.trusted.churchId) || null,
    },
    overallMatchCode: match.overallMatchCode,
    matches: match.matches,
    source,
  };
}

module.exports = {
  runStaffManagedPersonWorkflow,
  RESULT,
  STAFF_PERSON_WORKFLOW_CODE,
  STAFF_PERSON_WORKFLOW_SOURCE,
};
