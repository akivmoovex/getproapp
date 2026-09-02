"use strict";

/**
 * Shared registration transaction lifecycle (draft + password vault).
 */

const { PRODUCT } = require("./constants");
const {
  resolveRegistrationDraftForGet,
  sanitizeRegistrationDraftFormData,
} = require("./registrationDraftLifecycle");
const {
  clearRegistrationPasswordVault,
  storeRegistrationPasswordVault,
  mergeRegistrationBodyWithPasswordVault,
} = require("./registrationPasswordVault");

function productCodeFromDraftModule(draftModule) {
  if (!draftModule || !draftModule.COOKIE_NAME) return null;
  if (draftModule.COOKIE_NAME === "bb_reg_draft") return PRODUCT.BLESSBOARD;
  if (draftModule.COOKIE_NAME === "ac_reg_draft") return PRODUCT.ACTIVECLINIC;
  return null;
}

/**
 * @param {import('express').Response} res
 * @param {{ isProduction: boolean, productCode: string, clearDraft: Function }} input
 */
function clearRegistrationTransaction(res, input) {
  const { isProduction, productCode, clearDraft } = input;
  clearDraft(res, { isProduction });
  clearRegistrationPasswordVault(res, { isProduction, productCode });
}

/**
 * @param {{
 *   req: import('express').Request,
 *   res: import('express').Response,
 *   isProduction: boolean,
 *   env: NodeJS.ProcessEnv,
 *   productCode: string,
 *   clearDraft: Function,
 *   readDraft: Function,
 * }} input
 */
function resolveRegistrationTransactionForGet(input) {
  const draftResolution = resolveRegistrationDraftForGet(input);
  if (!draftResolution.restoreDraft) {
    clearRegistrationPasswordVault(input.res, {
      isProduction: input.isProduction,
      productCode: input.productCode,
    });
  }
  return draftResolution;
}

/**
 * @param {import('express').Response} res
 * @param {NodeJS.ProcessEnv} env
 * @param {object} body
 * @param {{ isProduction: boolean, productCode: string }} opts
 */
function persistRegistrationPasswordFromBody(res, env, body, opts) {
  return storeRegistrationPasswordVault(res, env, body, opts);
}

/**
 * @param {import('express').Request} req
 * @param {NodeJS.ProcessEnv} env
 * @param {string} productCode
 * @param {object} body
 */
function mergeRegistrationBodyForValidation(req, env, productCode, body) {
  return mergeRegistrationBodyWithPasswordVault(req, env, productCode, body);
}

module.exports = {
  productCodeFromDraftModule,
  clearRegistrationTransaction,
  resolveRegistrationTransactionForGet,
  persistRegistrationPasswordFromBody,
  mergeRegistrationBodyForValidation,
  sanitizeRegistrationDraftFormData,
};
