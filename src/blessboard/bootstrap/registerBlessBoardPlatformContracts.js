"use strict";

/**
 * Registers BlessBoard handlers into platform productRuntimeRegistry.
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
  registerPlatformAdminSettingsContrib,
  registerBlessBoardOperationalMediaStorageFactory,
  registerWebsiteAvailabilitySync,
} = require("../../platform/contracts/productRuntimeRegistry");
const {
  registerPublicationGovernance,
} = require("../../platform/website/publicationOrchestrator");
const { PRODUCT } = require("../../platform/registration/constants");

const registrationAdapter = require("../registration/blessboardChurchRegistrationAdapter");
const onboardingAdapter = require("../onboarding/blessboardOnboardingAdapter");
const sectionActions = require("../website/blessboardSectionActionService");
const structuredDraft = require("../services/websiteStructuredDraftService");
const contentRepo = require("../repositories/publicContentRepository");
const {
  registerBlessBoardWebsiteTemplate,
} = require("../website/blessboardChurchTemplate");
const { normalizeEmail } = require("../services/createBlessBoardUser");
const {
  normalizeBlessBoardPhone,
} = require("../services/normalizeBlessBoardPhone");
const blessboardPublicationGovernanceAdapter = require("../website/blessboardPublicationGovernanceAdapter");
const { INVITE_TTL_MS } = require("../services/inviteBlessBoardStaff");
const { resolveOtpProvider } = require("../services/otp/otpProviders");
const { DEFAULT_COUNTRY: PHONE_DEFAULT_COUNTRY } = require("../services/normalizeBlessBoardPhone");
const {
  ORGANIZATION_RESERVED_SLUGS,
  BRANCH_HOST_RESERVED_SLUGS,
} = require("../../church/platformProvisioningValidation");
const { createMediaStorage } = require("../media/storage/createMediaStorage");

function registerBlessBoardPlatformContracts() {
  registerRegistrationAdapter(PRODUCT.BLESSBOARD, registrationAdapter);
  registerOnboardingAdapter(PRODUCT.BLESSBOARD, onboardingAdapter);
  // Late-bind so tests can monkey-patch product authorize exports.
  registerRbacAuthorizer(PRODUCT.BLESSBOARD, (db, input) =>
    require("../services/blessBoardRbacAuthorizationService").authorize(db, input)
  );
  registerSectionActionService(PRODUCT.BLESSBOARD, sectionActions);

  registerWebsiteAddSectionHandler(PRODUCT.BLESSBOARD, {
    saveStructuredDraft: structuredDraft.saveStructuredDraft,
    contentRepo,
    listExistingSectionKeys: async (db, input) => {
      const pageKey = String(input.pageKey || "home").trim() || "home";
      const page = await contentRepo.findPageByScope(db, {
        churchId: input.churchId,
        branchId: input.branchId || null,
        pageKey,
      });
      if (!page) return [];
      const sections = await contentRepo.listSectionsForPage(db, page.id, {});
      return (sections || []).map((s) => String(s.sectionKey || s.sectionType || ""));
    },
  });

  registerWebsiteFieldRegistrar(PRODUCT.BLESSBOARD, () => {
    require("../services/websiteInlineEditableFields");
    registerBlessBoardWebsiteTemplate();
  });

  registerIdentityNormalizers(PRODUCT.BLESSBOARD, {
    normalizeEmail,
    normalizePhone: normalizeBlessBoardPhone,
  });

  // PC10: BB governance adapter owns HQ/branch/multi-site rules; platform
  // publicationOrchestrator owns authz gate + dispatch.
  registerPublicationGovernance(
    PRODUCT.BLESSBOARD,
    blessboardPublicationGovernanceAdapter.lifecycleHandlers()
  );

  registerWebsiteAvailabilitySync(
    PRODUCT.BLESSBOARD,
    require("../website/blessboardWebsiteAvailabilitySync").syncBlessBoardWebsiteStatus
  );

  registerPlatformAdminSettingsContrib({
    inviteTtlMs: INVITE_TTL_MS,
    resolveOtpProvider,
    phoneDefaultCountry: PHONE_DEFAULT_COUNTRY,
    organizationReservedSlugs: ORGANIZATION_RESERVED_SLUGS,
    branchHostReservedSlugs: BRANCH_HOST_RESERVED_SLUGS,
  });

  registerBlessBoardOperationalMediaStorageFactory(createMediaStorage);

  return { ok: true };
}

module.exports = {
  registerBlessBoardPlatformContracts,
};
