"use strict";

const {
  parseRegistrationReturnContext,
  registrationLinkLocals,
  PRODUCT_CODE,
} = require("./registrationReturnContext");
const {
  REGISTRATION_PASSWORD_RULES,
  PASSWORD_MIN,
  PASSWORD_MAX,
} = require("./registrationPasswordPolicy");

/**
 * Shared EJS locals for registration flows and outbound legal/pricing pages.
 * @param {import('express').Request|{ query?: object }|null|undefined} reqOrQuery
 * @param {string} product
 * @param {{ step?: string|null, plan?: string|null }} [extra]
 */
function buildRegistrationPageLocals(reqOrQuery, product, extra = {}) {
  const step = extra && extra.step != null ? String(extra.step) : null;
  const plan = extra && extra.plan != null ? String(extra.plan) : null;
  return {
    registrationReturn: parseRegistrationReturnContext(reqOrQuery, product),
    ...registrationLinkLocals({ product, step, plan }),
    passwordRules: REGISTRATION_PASSWORD_RULES,
    passwordMin: PASSWORD_MIN,
    passwordMax: PASSWORD_MAX,
  };
}

module.exports = {
  buildRegistrationPageLocals,
  PRODUCT_CODE,
};
