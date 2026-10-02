"use strict";

/**
 * Hybrid public pricing display.
 * Operational catalogue (verified public prices) is authoritative when present.
 * Clinic CMS may add insurance/informational copy only — never invented fees.
 */

const DEFAULT_INSURANCE_PLACEHOLDER = "Add insurance information";

function resolvePublicPricingDisplay(input) {
  const patterns = Array.isArray(input && input.patterns) ? input.patterns : [];
  const rawIntro = String((input && input.insuranceIntro) || "").trim();
  const insuranceIntro =
    rawIntro && rawIntro !== DEFAULT_INSURANCE_PLACEHOLDER ? rawIntro : null;
  const pageVisible = input && input.pageVisible === false ? false : true;
  return {
    source: "hybrid",
    operationalCatalogue: patterns,
    hasOperationalPrices: patterns.length > 0,
    insuranceIntro,
    showNav: pageVisible,
    showPage: pageVisible,
    showEmptyHonesty: pageVisible && patterns.length === 0,
  };
}

module.exports = {
  DEFAULT_INSURANCE_PLACEHOLDER,
  resolvePublicPricingDisplay,
};
