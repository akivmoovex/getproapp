"use strict";

/**
 * Product runtime contracts — platform slots products fill at bootstrap.
 *
 * Platform code must look up handlers here instead of hard-requiring
 * `src/blessboard`, `src/church`, or `src/activeclinic` implementation modules.
 *
 * Products register via:
 *   src/blessboard/bootstrap/registerBlessBoardPlatformContracts.js
 *   src/activeclinic/bootstrap/registerActiveClinicPlatformContracts.js
 *
 * Composition roots (foundation servers / startup) call those registrars once.
 * This is NOT a general service locator — only named cross-product seams live here.
 */

/** @type {Map<string, object>} */
const registrationAdapters = new Map();
/** @type {Map<string, object>} */
const onboardingAdapters = new Map();
/** @type {Map<string, Function>} */
const rbacAuthorizers = new Map();
/** @type {Map<string, object>} */
const sectionActionServices = new Map();
/** @type {Map<string, object>} */
const websiteAddSectionHandlers = new Map();
/** @type {Map<string, Function>} */
const websiteFieldRegistrars = new Map();
/**
 * Product hooks that sync product-local availability flags after platform
 * lifecycle status changes (e.g. church website_status, clinic website_published).
 * @type {Map<string, Function>}
 */
const websiteAvailabilitySyncHandlers = new Map();
/** @type {Map<string, object>} */
const identityNormalizers = new Map();

/** @type {null | (() => object)} */
let outboundEmailStatusResolver = null;

/** @type {null | object} */
let platformAdminSettingsContrib = null;

/** @type {null | ((env?: NodeJS.ProcessEnv, overrides?: object) => object)} */
let blessBoardOperationalMediaStorageFactory = null;

function normalizeProductCode(productCode) {
  return String(productCode || "")
    .trim()
    .toLowerCase();
}

function registerRegistrationAdapter(productCode, adapter) {
  const key = normalizeProductCode(productCode);
  if (!key || !adapter || typeof adapter !== "object") return false;
  registrationAdapters.set(key, adapter);
  return true;
}

function ensureContractsLoaded() {
  const ready =
    registrationAdapters.has("blessboard") &&
    registrationAdapters.has("activeclinic") &&
    identityNormalizers.has("blessboard") &&
    identityNormalizers.has("activeclinic");
  if (ready) return;
  try {
    // Composition helper lives outside src/platform and may register product handlers.
    require("../../startup/ensureProductPlatformContracts").ensureProductPlatformContracts();
  } catch (_err) {
    /* products may be unavailable in narrow unit contexts */
  }
}

function getRegistrationAdapter(productCode) {
  ensureContractsLoaded();
  return registrationAdapters.get(normalizeProductCode(productCode)) || null;
}

function registerOnboardingAdapter(productCode, adapter) {
  const key = normalizeProductCode(productCode);
  if (!key || !adapter || typeof adapter !== "object") return false;
  onboardingAdapters.set(key, adapter);
  return true;
}

function getOnboardingAdapter(productCode) {
  ensureContractsLoaded();
  return onboardingAdapters.get(normalizeProductCode(productCode)) || null;
}

function registerRbacAuthorizer(productCode, authorizeFn) {
  const key = normalizeProductCode(productCode);
  if (!key || typeof authorizeFn !== "function") return false;
  rbacAuthorizers.set(key, authorizeFn);
  return true;
}

function getRbacAuthorizer(productCode) {
  ensureContractsLoaded();
  return rbacAuthorizers.get(normalizeProductCode(productCode)) || null;
}

function registerSectionActionService(productCode, service) {
  const key = normalizeProductCode(productCode);
  if (!key || !service || typeof service !== "object") return false;
  sectionActionServices.set(key, service);
  return true;
}

function getSectionActionService(productCode) {
  ensureContractsLoaded();
  return sectionActionServices.get(normalizeProductCode(productCode)) || null;
}

function registerWebsiteAddSectionHandler(productCode, handler) {
  const key = normalizeProductCode(productCode);
  if (!key || !handler || typeof handler !== "object") return false;
  websiteAddSectionHandlers.set(key, handler);
  return true;
}

function getWebsiteAddSectionHandler(productCode) {
  ensureContractsLoaded();
  return websiteAddSectionHandlers.get(normalizeProductCode(productCode)) || null;
}

function registerWebsiteFieldRegistrar(productCode, fn) {
  const key = normalizeProductCode(productCode);
  if (!key || typeof fn !== "function") return false;
  websiteFieldRegistrars.set(key, fn);
  return true;
}

function runWebsiteFieldRegistrar(productCode) {
  ensureContractsLoaded();
  const fn = websiteFieldRegistrars.get(normalizeProductCode(productCode));
  if (typeof fn === "function") fn();
}

/**
 * @param {string} productCode
 * @param {(db: object, instance: object, lifecycleStatus: string) => Promise<void>|void} handler
 */
function registerWebsiteAvailabilitySync(productCode, handler) {
  const key = normalizeProductCode(productCode);
  if (!key || typeof handler !== "function") return false;
  websiteAvailabilitySyncHandlers.set(key, handler);
  return true;
}

/**
 * Invoke the registered product availability sync for a website instance.
 * No-op when no product handler is registered.
 */
async function runWebsiteAvailabilitySync(db, instance, lifecycleStatus) {
  ensureContractsLoaded();
  if (!instance || !instance.productCode) return;
  const handler = websiteAvailabilitySyncHandlers.get(
    normalizeProductCode(instance.productCode)
  );
  if (typeof handler !== "function") return;
  await handler(db, instance, lifecycleStatus);
}

function registerIdentityNormalizers(productCode, normalizers) {
  const key = normalizeProductCode(productCode);
  if (!key || !normalizers || typeof normalizers !== "object") return false;
  identityNormalizers.set(key, normalizers);
  return true;
}

function getIdentityNormalizers(productCode) {
  ensureContractsLoaded();
  return identityNormalizers.get(normalizeProductCode(productCode)) || null;
}

function registerOutboundEmailStatusResolver(fn) {
  if (typeof fn !== "function") return false;
  outboundEmailStatusResolver = fn;
  return true;
}

function resolveOutboundEmailStatusSafe(env) {
  ensureContractsLoaded();
  if (typeof outboundEmailStatusResolver !== "function") {
    return { configured: false, provider: null, reason: "not_registered" };
  }
  return outboundEmailStatusResolver(env);
}

function registerPlatformAdminSettingsContrib(contrib) {
  if (!contrib || typeof contrib !== "object") return false;
  platformAdminSettingsContrib = contrib;
  return true;
}

function getPlatformAdminSettingsContrib() {
  ensureContractsLoaded();
  return platformAdminSettingsContrib;
}

/**
 * BlessBoard operational church media storage (`blessboard.media_assets`).
 * Not website-engine Hostinger storage — see PLATFORM_MEDIA_OWNERSHIP.
 */
function registerBlessBoardOperationalMediaStorageFactory(fn) {
  if (typeof fn !== "function") return false;
  blessBoardOperationalMediaStorageFactory = fn;
  return true;
}

function createBlessBoardOperationalMediaStorage(env, overrides) {
  ensureContractsLoaded();
  if (typeof blessBoardOperationalMediaStorageFactory !== "function") {
    return null;
  }
  return blessBoardOperationalMediaStorageFactory(env, overrides || {});
}

/** Test / isolation helper — clears all slots. */
function clearProductRuntimeContracts() {
  registrationAdapters.clear();
  onboardingAdapters.clear();
  rbacAuthorizers.clear();
  sectionActionServices.clear();
  websiteAddSectionHandlers.clear();
  websiteFieldRegistrars.clear();
  websiteAvailabilitySyncHandlers.clear();
  identityNormalizers.clear();
  outboundEmailStatusResolver = null;
  platformAdminSettingsContrib = null;
  blessBoardOperationalMediaStorageFactory = null;
}

function describeProductRuntimeContracts() {
  return {
    registrationAdapters: [...registrationAdapters.keys()].sort(),
    onboardingAdapters: [...onboardingAdapters.keys()].sort(),
    rbacAuthorizers: [...rbacAuthorizers.keys()].sort(),
    sectionActionServices: [...sectionActionServices.keys()].sort(),
    websiteAddSectionHandlers: [...websiteAddSectionHandlers.keys()].sort(),
    websiteFieldRegistrars: [...websiteFieldRegistrars.keys()].sort(),
    websiteAvailabilitySyncHandlers: [
      ...websiteAvailabilitySyncHandlers.keys(),
    ].sort(),
    identityNormalizers: [...identityNormalizers.keys()].sort(),
    outboundEmailStatusResolver: Boolean(outboundEmailStatusResolver),
    platformAdminSettingsContrib: Boolean(platformAdminSettingsContrib),
    blessBoardOperationalMediaStorageFactory: Boolean(
      blessBoardOperationalMediaStorageFactory
    ),
  };
}

module.exports = {
  registerRegistrationAdapter,
  getRegistrationAdapter,
  registerOnboardingAdapter,
  getOnboardingAdapter,
  registerRbacAuthorizer,
  getRbacAuthorizer,
  registerSectionActionService,
  getSectionActionService,
  registerWebsiteAddSectionHandler,
  getWebsiteAddSectionHandler,
  registerWebsiteFieldRegistrar,
  runWebsiteFieldRegistrar,
  registerWebsiteAvailabilitySync,
  runWebsiteAvailabilitySync,
  registerIdentityNormalizers,
  getIdentityNormalizers,
  registerOutboundEmailStatusResolver,
  resolveOutboundEmailStatusSafe,
  registerPlatformAdminSettingsContrib,
  getPlatformAdminSettingsContrib,
  registerBlessBoardOperationalMediaStorageFactory,
  createBlessBoardOperationalMediaStorage,
  clearProductRuntimeContracts,
  describeProductRuntimeContracts,
};
