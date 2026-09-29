"use strict";

/**
 * Composition-root helper (outside src/platform) that registers product contracts.
 * Safe to call multiple times — registrars are idempotent.
 */

function ensureProductPlatformContracts() {
  const {
    registerBlessBoardPlatformContracts,
  } = require("../blessboard/bootstrap/registerBlessBoardPlatformContracts");
  const {
    registerActiveClinicPlatformContracts,
  } = require("../activeclinic/bootstrap/registerActiveClinicPlatformContracts");
  registerBlessBoardPlatformContracts();
  registerActiveClinicPlatformContracts();
  return { ok: true };
}

module.exports = {
  ensureProductPlatformContracts,
};
