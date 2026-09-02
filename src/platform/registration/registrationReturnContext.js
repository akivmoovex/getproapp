"use strict";

/**
 * Shared registration return navigation for BlessBoard and ActiveClinic.
 * Only allowlisted internal paths — never arbitrary external redirect URLs.
 */

const PRODUCT_CODE = Object.freeze({
  BLESSBOARD: "blessboard",
  ACTIVECLINIC: "activeclinic",
});

const REGISTRATION_FROM = "registration";

const ALLOWED_REGISTRATION_PATHS = Object.freeze({
  [PRODUCT_CODE.BLESSBOARD]: "/register-church",
  [PRODUCT_CODE.ACTIVECLINIC]: "/register-clinic",
});

const ALLOWED_WIZARD_STEPS = Object.freeze({
  [PRODUCT_CODE.BLESSBOARD]: new Set(["church", "administrator", "review"]),
  [PRODUCT_CODE.ACTIVECLINIC]: new Set(["clinic", "administrator", "review"]),
});

const ALLOWED_RETURN_TO = Object.freeze({
  "register-church": {
    product: PRODUCT_CODE.BLESSBOARD,
    path: "/register-church",
  },
  "register-clinic": {
    product: PRODUCT_CODE.ACTIVECLINIC,
    path: "/register-clinic",
  },
});

function normalizeProduct(product) {
  const key = String(product || "").trim().toLowerCase();
  if (key === PRODUCT_CODE.BLESSBOARD || key === PRODUCT_CODE.ACTIVECLINIC) {
    return key;
  }
  return null;
}

function readQueryValue(query, key) {
  if (!query || query[key] == null) return "";
  return String(query[key]).trim();
}

/**
 * @param {import('express').Request|{ query?: object, url?: string }} reqOrQuery
 * @param {string} product
 */
function parseRegistrationReturnContext(reqOrQuery, product) {
  const productKey = normalizeProduct(product);
  const query =
    reqOrQuery && reqOrQuery.query
      ? reqOrQuery.query
      : reqOrQuery && typeof reqOrQuery === "object"
        ? reqOrQuery
        : {};
  const from = readQueryValue(query, "from").toLowerCase();
  const returnTo = readQueryValue(query, "returnTo").toLowerCase();
  const stepRaw = readQueryValue(query, "step").toLowerCase();
  const plan = readQueryValue(query, "plan");

  let registrationPath = productKey ? ALLOWED_REGISTRATION_PATHS[productKey] : null;
  let resolvedProduct = productKey;

  if (returnTo && ALLOWED_RETURN_TO[returnTo]) {
    registrationPath = ALLOWED_RETURN_TO[returnTo].path;
    resolvedProduct = ALLOWED_RETURN_TO[returnTo].product;
  }

  const isRegistrationReturn =
    from === REGISTRATION_FROM ||
    Boolean(returnTo && ALLOWED_RETURN_TO[returnTo]);

  if (!isRegistrationReturn || !registrationPath) {
    return {
      isRegistrationReturn: false,
      product: productKey,
      registrationPath: null,
      step: null,
      plan: null,
      backHref: null,
      backLabel: null,
    };
  }

  const allowedSteps = ALLOWED_WIZARD_STEPS[resolvedProduct] || new Set();
  const step = allowedSteps.has(stepRaw) ? stepRaw : null;

  const params = new URLSearchParams();
  if (step) params.set("step", step);
  if (plan && resolvedProduct === PRODUCT_CODE.BLESSBOARD) {
    params.set("plan", plan.slice(0, 40));
  }
  const qs = params.toString();
  const backHref = qs ? `${registrationPath}?${qs}` : registrationPath;

  return {
    isRegistrationReturn: true,
    product: resolvedProduct,
    registrationPath,
    step,
    plan: plan || null,
    backHref,
    backLabel: "Back to registration",
  };
}

/**
 * Build a link from registration to pricing/legal with safe return context.
 * @param {{
 *   product: string,
 *   targetPath: string,
 *   step?: string|null,
 *   plan?: string|null,
 * }} input
 */
function buildRegistrationOutboundLink(input) {
  const product = normalizeProduct(input && input.product);
  const targetPath = String((input && input.targetPath) || "").trim();
  if (!product || !targetPath.startsWith("/")) {
    return targetPath || "/";
  }
  const params = new URLSearchParams();
  params.set("from", REGISTRATION_FROM);
  params.set(
    "returnTo",
    product === PRODUCT_CODE.BLESSBOARD ? "register-church" : "register-clinic"
  );
  const step = String((input && input.step) || "").trim().toLowerCase();
  const allowedSteps = ALLOWED_WIZARD_STEPS[product] || new Set();
  if (step && allowedSteps.has(step)) {
    params.set("step", step);
  }
  const plan = String((input && input.plan) || "").trim();
  if (plan && product === PRODUCT_CODE.BLESSBOARD) {
    params.set("plan", plan.slice(0, 40));
  }
  return `${targetPath}?${params.toString()}`;
}

/**
 * @param {{
 *   product: string,
 *   step?: string|null,
 *   plan?: string|null,
 * }} input
 */
function registrationLinkLocals(input) {
  const product = normalizeProduct(input && input.product);
  const step = input && input.step ? String(input.step) : null;
  const plan = input && input.plan ? String(input.plan) : null;
  return {
    registrationPricingHref:
      product === PRODUCT_CODE.BLESSBOARD
        ? buildRegistrationOutboundLink({ product, targetPath: "/pricing", step, plan })
        : null,
    registrationTermsHref: buildRegistrationOutboundLink({
      product,
      targetPath: "/terms",
      step,
      plan,
    }),
    registrationPrivacyHref: buildRegistrationOutboundLink({
      product,
      targetPath: "/privacy",
      step,
      plan,
    }),
  };
}

module.exports = {
  PRODUCT_CODE,
  REGISTRATION_FROM,
  ALLOWED_REGISTRATION_PATHS,
  parseRegistrationReturnContext,
  buildRegistrationOutboundLink,
  registrationLinkLocals,
};
