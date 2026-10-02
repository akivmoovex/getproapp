"use strict";

/**
 * ActiveClinic onboarding adapter — live clinic-setup facts, no church fields.
 */

const {
  SETUP_CLASSIFICATION,
  canSeeClinicSetupPanel,
  loadOrganizationClinicSetup,
} = require("../services/loadActiveClinicSettingsScreens");
const { STEP_KIND, PRODUCT, STATUS } = require("../../platform/onboarding/constants");

function canManage(actor) {
  if (!actor) return false;
  return canSeeClinicSetupPanel(actor.permissions || []);
}

function mapItem(item) {
  const required = item.classification === SETUP_CLASSIFICATION.REQUIRED_FOR_OPERATIONS;
  return {
    key: item.key,
    label: item.label,
    kind: required ? STEP_KIND.REQUIRED : STEP_KIND.RECOMMENDED,
    complete: item.complete === true,
    skippable: !required,
    destinationUrl: item.destinationUrl || null,
    explanation: item.description || null,
    currentState: item.currentState || null,
    actionPermissions: Array.isArray(item.actionPermissions) ? item.actionPermissions : [],
  };
}

async function listSteps(db, input) {
  const organizationId = String((input && input.organizationId) || "").trim();
  const setup = await loadOrganizationClinicSetup(db, { organizationId });
  return {
    steps: (setup && Array.isArray(setup.items) ? setup.items : []).map(mapItem),
    deploymentCode: null,
  };
}

async function getStoredTerminalStatus() {
  return null;
}

async function syncProductCompletion() {
  return { ok: true, status: STATUS.COMPLETED };
}

module.exports = {
  productCode: PRODUCT.ACTIVECLINIC,
  canManage,
  listSteps,
  getStoredTerminalStatus,
  syncProductCompletion,
};
