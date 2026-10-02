"use strict";

/**
 * Registers ActiveClinic handlers into platform productRuntimeRegistry.
 * Call once from composition roots / tests — never from deep platform modules.
 */

const {
  registerRegistrationAdapter,
  registerOnboardingAdapter,
  registerRbacAuthorizer,
  registerSectionActionService,
  registerWebsiteAddSectionHandler,
  registerWebsiteFieldRegistrar,
  registerIdentityNormalizers,
  registerPersonProductAdapter,
  registerOutboundEmailStatusResolver,
  registerWebsiteAvailabilitySync,
} = require("../../platform/contracts/productRuntimeRegistry");
const {
  PERSON_RELATIONSHIP_KEY,
  projectPersonDraftFromActiveClinicPatient,
} = require("../../platform/person");
const {
  ACTIVECLINIC_DUPLICATE_POLICY,
  toActiveClinicMatchStrength,
} = require("../../platform/person/duplicate");
const {
  formatPatientDisplayName,
  maskPhone,
  formatApproximateAge,
} = require("../services/patientPrivacyHelpers");
const {
  activeClinicStaffPatientAdapter,
} = require("../services/activeClinicStaffPatientWorkflowAdapter");

function presentActiveClinicPersonMatch(candidate, scored, decision) {
  const strength = toActiveClinicMatchStrength(scored.matchCode, scored.reasons);
  return {
    subjectRef: candidate.subjectRef || candidate.id || null,
    matchCode: scored.matchCode,
    matchStrength: strength,
    reasons: scored.reasons.slice(),
    action: decision.action,
    displayName: formatPatientDisplayName({
      firstName: candidate.firstName,
      lastName: candidate.lastName,
      preferredName: candidate.preferredName,
    }),
    phoneMasked: maskPhone(candidate.phoneNormalized),
    approximateAge: formatApproximateAge(
      candidate.dateOfBirth,
      candidate.estimatedDateOfBirth === true
    ),
  };
}
const {
  registerPublicationGovernance,
} = require("../../platform/website/publicationOrchestrator");
const { PRODUCT } = require("../../platform/registration/constants");

const registrationAdapter = require("../registration/activeClinicRegistrationAdapter");
const onboardingAdapter = require("../onboarding/activeClinicOnboardingAdapter");
const sectionActions = require("../website/activeClinicSectionActionService");
const cmsService = require("../website/clinicWebsiteCmsService");
const { pageIdFor } = require("../website/activeClinicSectionActionService");
const {
  registerActiveClinicWebsiteTemplate,
} = require("../website/activeClinicWebsiteTemplate");
const {
  normalizeActiveClinicPhone,
  normalizeActiveClinicEmail,
} = require("../services/normalizeActiveClinicContact");
const {
  resolveOutboundEmailStatus,
} = require("../services/activeClinicEmailDelivery");
const activeClinicPublicationGovernanceAdapter = require("../website/activeClinicPublicationGovernanceAdapter");

function registerActiveClinicPlatformContracts() {
  registerRegistrationAdapter(PRODUCT.ACTIVECLINIC, registrationAdapter);
  registerOnboardingAdapter(PRODUCT.ACTIVECLINIC, onboardingAdapter);

  // Late-bind so tests can monkey-patch product authorize exports.
  registerRbacAuthorizer(PRODUCT.ACTIVECLINIC, (db, input) =>
    require("../services/activeClinicAuthorizationService").authorizeStaffPermission(
      db,
      input
    )
  );

  registerSectionActionService(PRODUCT.ACTIVECLINIC, {
    applySectionAction: (...args) => sectionActions.applySectionAction(...args),
    updateSection: (db, input) => cmsService.updateSection(db, input),
    cmsService,
    pageIdFor,
  });

  registerWebsiteAddSectionHandler(PRODUCT.ACTIVECLINIC, {
    cmsService,
    pageIdFor,
    listExistingSectionTypes: async (db, input) => {
      const pageId = pageIdFor(input.pageKey);
      const listed = await cmsService.listSections(db, {
        organizationId: input.organizationId,
        instanceId: input.instanceId,
        clinicId: input.clinicId,
        pageId,
        grantedPermissions: input.grantedPermissions,
      });
      if (!listed.ok) return [];
      return (listed.sections || []).map((s) => String(s.type));
    },
  });

  registerWebsiteFieldRegistrar(PRODUCT.ACTIVECLINIC, () => {
    registerActiveClinicWebsiteTemplate();
  });

  // Platform verification expects string email + {ok,normalized} phone shapes.
  registerIdentityNormalizers(PRODUCT.ACTIVECLINIC, {
    normalizeEmail: (raw) => {
      const result = normalizeActiveClinicEmail(raw);
      if (!result || result.ok === false) return "";
      return result.normalized || "";
    },
    normalizePhone: normalizeActiveClinicPhone,
  });

  // V2.04: declare patient relationship key; do not migrate patients here.
  // Clinical consent / Patient Number remain ActiveClinic-owned.
  // Duplicate policy reuses AC stronger WARN_REVIEW override gate.
  registerPersonProductAdapter(PRODUCT.ACTIVECLINIC, {
    relationshipKeys: [PERSON_RELATIONSHIP_KEY.AC_PATIENT],
    defaultRelationshipKey: PERSON_RELATIONSHIP_KEY.AC_PATIENT,
    projectPersonDraft: projectPersonDraftFromActiveClinicPatient,
    duplicatePolicy: ACTIVECLINIC_DUPLICATE_POLICY,
    presentMatch: presentActiveClinicPersonMatch,
    staffManagedWorkflow: activeClinicStaffPatientAdapter,
  });

  // PC10: AC governance adapter owns clinic submit/unpublish/publish policy;
  // platform publicationOrchestrator owns authz gate + dispatch. Submit stays
  // on the adapter (AC workflow) — not forced onto BB.
  registerPublicationGovernance(
    PRODUCT.ACTIVECLINIC,
    activeClinicPublicationGovernanceAdapter.lifecycleHandlers()
  );

  registerWebsiteAvailabilitySync(
    PRODUCT.ACTIVECLINIC,
    require("../website/activeClinicWebsiteAvailabilitySync")
      .syncActiveClinicAvailabilityFlag
  );

  registerOutboundEmailStatusResolver(resolveOutboundEmailStatus);

  return { ok: true };
}

module.exports = {
  registerActiveClinicPlatformContracts,
};
