"use strict";

/**
 * Canonical V7 domain matrix (documentation-as-code).
 * Runtime authority remains deploymentProfiles.js via PLATFORM_DEPLOYMENT_CODE.
 */

const DOMAIN_MATRIX = Object.freeze([
  Object.freeze({
    type: "production",
    productOrSite: "BlessBoard",
    productKey: "blessboard",
    domain: "blessboard.com",
  }),
  Object.freeze({
    type: "testing",
    productOrSite: "BlessBoard",
    productKey: "blessboard",
    domain: "blessboard.pronline.org",
  }),
  Object.freeze({
    type: "legacy-redirect",
    productOrSite: "BlessBoard",
    productKey: "blessboard",
    domain: "blessboard.org",
    notes: "Future permanent path-preserving redirect to blessboard.com (not activated in Hostinger yet).",
  }),
  Object.freeze({
    type: "production",
    productOrSite: "ActiveClinic",
    productKey: "activeclinic",
    domain: "activeclinic.org",
  }),
  Object.freeze({
    type: "testing",
    productOrSite: "ActiveClinic",
    productKey: "activeclinic",
    domain: "activeclinic.pronline.org",
  }),
  Object.freeze({
    type: "production",
    productOrSite: "GetPro",
    productKey: "getpro",
    domain: "getproapp.org",
  }),
  Object.freeze({
    type: "testing",
    productOrSite: "GetPro",
    productKey: "getpro",
    domain: "getpro.pronline.org",
  }),
  Object.freeze({
    type: "production",
    productOrSite: "NGO / Netraz",
    productKey: "ngo",
    domain: "netraz.org",
  }),
  Object.freeze({
    type: "testing",
    productOrSite: "NGO / Netraz",
    productKey: "ngo",
    domain: "netraz.pronline.org",
  }),
  Object.freeze({
    type: "corporate",
    productOrSite: "Moovex",
    productKey: null,
    siteType: "corporate",
    domain: "moovex.org",
  }),
  Object.freeze({
    type: "testing-namespace",
    productOrSite: "Platform",
    productKey: null,
    domain: "pronline.org",
  }),
  Object.freeze({
    type: "private-project",
    productOrSite: "FunSong",
    productKey: null,
    domain: "funsong.org",
    notes: "Private / separate project — not part of the unified multi-product platform.",
  }),
]);

const TESTING_NAMESPACE = "pronline.org";

const HOSTINGER_DEPLOYMENT_CODES = Object.freeze([
  Object.freeze({
    hostingerApp: "Moovex platform testing (preferred)",
    deploymentCode: "moovex-platform-testing",
  }),
  Object.freeze({
    hostingerApp: "Moovex platform production (future)",
    deploymentCode: "moovex-platform-production",
  }),
  Object.freeze({
    hostingerApp: "BlessBoard production (transitional)",
    deploymentCode: "blessboard-com-production",
  }),
  Object.freeze({
    hostingerApp: "BlessBoard testing (transitional)",
    deploymentCode: "blessboard-pronline-testing",
  }),
  Object.freeze({
    hostingerApp: "ActiveClinic production (transitional)",
    deploymentCode: "activeclinic-org-production",
  }),
  Object.freeze({
    hostingerApp: "ActiveClinic testing (transitional)",
    deploymentCode: "activeclinic-pronline-testing",
  }),
  Object.freeze({
    hostingerApp: "GetPro production (transitional)",
    deploymentCode: "getproapp-org-production",
  }),
  Object.freeze({
    hostingerApp: "GetPro testing (transitional)",
    deploymentCode: "getpro-pronline-testing",
  }),
  Object.freeze({
    hostingerApp: "Netraz production (transitional)",
    deploymentCode: "netraz-org-production",
  }),
  Object.freeze({
    hostingerApp: "Netraz testing (transitional)",
    deploymentCode: "netraz-pronline-testing",
  }),
]);

module.exports = {
  DOMAIN_MATRIX,
  TESTING_NAMESPACE,
  HOSTINGER_DEPLOYMENT_CODES,
};
