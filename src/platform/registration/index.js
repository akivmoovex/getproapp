"use strict";

const constants = require("./constants");
const lifecycle = require("./lifecycle");
const { decideReview } = require("./reviewPolicy");
const killSwitch = require("./killSwitch");
const { submitPlatformRegistration, resolvePlatformRegistrationReview } = require("./orchestrator");
const { initializeOrganizationWebsite } = require("./initializeOrganizationWebsite");
const { ACTION: LIFECYCLE_AUDIT_ACTION, recordLifecycleAudit } = require("./lifecycleAudit");
const { listUnifiedRegistrations } = require("./unifiedRegistrationQueue");
const provisioningStages = require("./provisioningStages");
const {
  inspectOrganizationProvisioningCompleteness,
  resumeOrganizationProvisioning,
  isRetryablePartialProvision,
  describePartialProvision,
} = require("./provisioningRecovery");
const {
  loadTenantHealthSummary,
  loadTenantHealthSummariesForOrganization,
  retryTenantProvisioningIfUnhealthy,
  presentTenantHealthSummary,
} = require("./tenantHealthSummary");

function getAdapter(productCode) {
  const { getRegistrationAdapter } = require("../contracts/productRuntimeRegistry");
  return getRegistrationAdapter(productCode);
}

async function submitProductRegistration(db, input) {
  const adapter = (input && input.adapter) || getAdapter(input && input.productCode);
  return submitPlatformRegistration(db, { ...input, adapter });
}

module.exports = {
  ...constants,
  ...lifecycle,
  decideReview,
  ...killSwitch,
  submitPlatformRegistration,
  resolvePlatformRegistrationReview,
  submitProductRegistration,
  getAdapter,
  listUnifiedRegistrations,
  initializeOrganizationWebsite,
  LIFECYCLE_AUDIT_ACTION,
  recordLifecycleAudit,
  ...provisioningStages,
  inspectOrganizationProvisioningCompleteness,
  resumeOrganizationProvisioning,
  isRetryablePartialProvision,
  describePartialProvision,
  loadTenantHealthSummary,
  loadTenantHealthSummariesForOrganization,
  retryTenantProvisioningIfUnhealthy,
  presentTenantHealthSummary,
  ...require("./registrationSuccessPresentation"),
  ...require("./registrationCountrySelection"),
  ...require("./registrationRenderLocals"),
  registrationLocation: require("./location"),
  isProvinceRegionVisibleInRegistration: require("./location")
    .isProvinceRegionVisibleInRegistration,
  isProvinceRegionRequiredInRegistration: require("./location")
    .isProvinceRegionRequiredInRegistration,
  REGISTRATION_VISIBLE_LOCATION_FIELDS: require("./location")
    .REGISTRATION_VISIBLE_LOCATION_FIELDS,
  createSignedRegistrationDraftCookie: require("./signedRegistrationDraftCookie")
    .createSignedRegistrationDraftCookie,
  DEFAULT_REGISTRATION_DRAFT_MAX_AGE_MS: require("./signedRegistrationDraftCookie")
    .DEFAULT_MAX_AGE_MS,
};
