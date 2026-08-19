"use strict";

const constants = require("./constants");
const lifecycle = require("./lifecycle");
const { decideReview } = require("./reviewPolicy");
const killSwitch = require("./killSwitch");
const { submitPlatformRegistration, resolvePlatformRegistrationReview } = require("./orchestrator");
const { initializeOrganizationWebsite } = require("./initializeOrganizationWebsite");
const { ACTION: LIFECYCLE_AUDIT_ACTION, recordLifecycleAudit } = require("./lifecycleAudit");
const { listUnifiedRegistrations } = require("./unifiedRegistrationQueue");
const statusCompatibility = require("./statusCompatibility");
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
  const product = String(productCode || "");
  if (product === constants.PRODUCT.ACTIVECLINIC) {
    return require("../../activeclinic/registration/activeClinicRegistrationAdapter");
  }
  if (product === constants.PRODUCT.BLESSBOARD) {
    return require("../../blessboard/registration/blessboardChurchRegistrationAdapter");
  }
  return null;
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
  ...statusCompatibility,
  ...provisioningStages,
  inspectOrganizationProvisioningCompleteness,
  resumeOrganizationProvisioning,
  isRetryablePartialProvision,
  describePartialProvision,
  loadTenantHealthSummary,
  loadTenantHealthSummariesForOrganization,
  retryTenantProvisioningIfUnhealthy,
  presentTenantHealthSummary,
};
