"use strict";

const { PUBLISH_POLICY } = require("./publishPolicy");
const { LIFECYCLE_STATUS } = require("./lifecycleStatus");

const ADAPTER_MODE = Object.freeze({
  SHARED_ENGINE: "shared_engine",
  LEGACY_CMS: "legacy_cms",
});

const PRODUCT_WEBSITE_DEFAULTS = Object.freeze({
  activeclinic: Object.freeze({
    publishPolicy: PUBLISH_POLICY.TENANT_PUBLISH,
    lifecycleStatus: LIFECYCLE_STATUS.PROVISIONAL,
    adapterMode: ADAPTER_MODE.SHARED_ENGINE,
  }),
  blessboard: Object.freeze({
    publishPolicy: PUBLISH_POLICY.REVIEW_BEFORE_PUBLISH,
    lifecycleStatus: LIFECYCLE_STATUS.PUBLIC,
    adapterMode: ADAPTER_MODE.SHARED_ENGINE,
  }),
});

function productWebsiteDefaults(productCode) {
  const key = String(productCode || "").trim();
  return (
    PRODUCT_WEBSITE_DEFAULTS[key] || {
      publishPolicy: PUBLISH_POLICY.REVIEW_BEFORE_PUBLISH,
      lifecycleStatus: LIFECYCLE_STATUS.PROVISIONAL,
      adapterMode: ADAPTER_MODE.SHARED_ENGINE,
    }
  );
}

module.exports = {
  ADAPTER_MODE,
  PRODUCT_WEBSITE_DEFAULTS,
  productWebsiteDefaults,
};
