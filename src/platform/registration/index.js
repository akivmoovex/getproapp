"use strict";

const constants = require("./constants");
const lifecycle = require("./lifecycle");
const { decideReview } = require("./reviewPolicy");
const killSwitch = require("./killSwitch");
const { submitPlatformRegistration, resolvePlatformRegistrationReview } = require("./orchestrator");
const { initializeOrganizationWebsite } = require("./initializeOrganizationWebsite");
const { listUnifiedRegistrations } = require("./unifiedRegistrationQueue");
const statusCompatibility = require("./statusCompatibility");

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
  ...statusCompatibility,
};
