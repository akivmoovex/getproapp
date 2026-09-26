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
  registerOutboundEmailStatusResolver,
} = require("../../platform/contracts/productRuntimeRegistry");
const { registerProductLifecycle } = require("../../platform/website-engine/lifecycleOrchestrator");
const { PRODUCT } = require("../../platform/registration/constants");
const publicationService = require("../../platform/website/publicationService");

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

  registerProductLifecycle(PRODUCT.ACTIVECLINIC, {
    publish: (db, request) => publicationService.publishWebsiteDraft(db, request),
    unpublish: (db, request) => publicationService.unpublishWebsite(db, request),
  });

  registerOutboundEmailStatusResolver(resolveOutboundEmailStatus);

  return { ok: true };
}

module.exports = {
  registerActiveClinicPlatformContracts,
};
