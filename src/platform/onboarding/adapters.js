"use strict";

const { getOnboardingAdapter: getRegisteredOnboardingAdapter } = require("../contracts/productRuntimeRegistry");

function getOnboardingAdapter(productCode) {
  return getRegisteredOnboardingAdapter(productCode);
}

module.exports = {
  getOnboardingAdapter,
};
