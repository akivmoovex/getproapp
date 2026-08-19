"use strict";

const { PRODUCT } = require("./constants");

function getOnboardingAdapter(productCode) {
  const product = String(productCode || "");
  if (product === PRODUCT.ACTIVECLINIC) {
    return require("../../activeclinic/onboarding/activeClinicOnboardingAdapter");
  }
  if (product === PRODUCT.BLESSBOARD) {
    return require("../../blessboard/onboarding/blessboardOnboardingAdapter");
  }
  return null;
}

module.exports = {
  getOnboardingAdapter,
};
