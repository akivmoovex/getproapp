"use strict";

const {
  parseRegistrationReturnContext,
  registrationLinkLocals,
  PRODUCT_CODE,
  withRegistrationNavParam,
  ALLOWED_REGISTRATION_PATHS,
  ALLOWED_WIZARD_STEPS,
} = require("./registrationReturnContext");
const {
  REGISTRATION_PASSWORD_RULES,
  PASSWORD_MIN,
  PASSWORD_MAX,
} = require("./registrationPasswordPolicy");

/**
 * Build an inbound registration wizard link that preserves draft state.
 * @param {string} product
 * @param {{ step?: string|null, plan?: string|null }} [extra]
 */
function buildRegistrationStepHref(product, extra = {}) {
  const productKey =
    product === PRODUCT_CODE.BLESSBOARD || product === PRODUCT_CODE.ACTIVECLINIC
      ? product
      : null;
  const registrationPath = productKey ? ALLOWED_REGISTRATION_PATHS[productKey] : null;
  if (!registrationPath) return "/";

  const stepRaw = extra && extra.step != null ? String(extra.step).trim().toLowerCase() : "";
  const allowedSteps = productKey ? ALLOWED_WIZARD_STEPS[productKey] : new Set();
  const step = allowedSteps.has(stepRaw) ? stepRaw : null;
  const plan = extra && extra.plan != null ? String(extra.plan).trim() : "";

  const params = new URLSearchParams();
  if (step) params.set("step", step);
  if (plan && productKey === PRODUCT_CODE.BLESSBOARD) {
    params.set("plan", plan.slice(0, 40));
  }
  const qs = params.toString();
  return withRegistrationNavParam(qs ? `${registrationPath}?${qs}` : registrationPath);
}

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
    registrationStepHref: (stepName, planOverride) =>
      buildRegistrationStepHref(product, {
        step: stepName,
        plan: planOverride != null ? planOverride : plan,
      }),
    passwordRules: REGISTRATION_PASSWORD_RULES,
    passwordMin: PASSWORD_MIN,
    passwordMax: PASSWORD_MAX,
  };
}

module.exports = {
  buildRegistrationPageLocals,
  buildRegistrationStepHref,
  PRODUCT_CODE,
};
