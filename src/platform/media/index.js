"use strict";

/**
 * Platform media — authoritative surface for shared storage / CDN / hydration.
 *
 * Website engine persistence API: `../website/mediaService.js`
 * (Hostinger bytes + `platform.website_media` metadata).
 *
 * BlessBoard operational church media (`blessboard.media_assets` via
 * `src/blessboard/media/*`) is product-domain and out of website-engine scope;
 * it must not become a second website storage path.
 */

const hostingerMediaConfig = require("./hostingerMediaConfig");
const { createHostingerMediaStorage } = require("./hostingerMediaStorage");
const cdnMediaPresentation = require("./cdnMediaPresentation");
const platformMarketingAssets = require("./platformMarketingAssets");
const hostingerMediaPersistenceProbe = require("./hostingerMediaPersistenceProbe");

module.exports = {
  hostingerMediaConfig,
  createHostingerMediaStorage,
  cdnMediaPresentation,
  platformMarketingAssets,
  hostingerMediaPersistenceProbe,
  PROVIDER_HOSTINGER: hostingerMediaConfig.PROVIDER_HOSTINGER,
  PROVIDER_DATABASE: hostingerMediaConfig.PROVIDER_DATABASE,
  resolveHostingerMediaConfig: hostingerMediaConfig.resolveHostingerMediaConfig,
  buildPublicMediaUrl: hostingerMediaConfig.buildPublicMediaUrl,
  presentCdnUrl: cdnMediaPresentation.presentCdnUrl,
  presentRuntimeImageSrc: cdnMediaPresentation.presentRuntimeImageSrc,
  presentImageValue: cdnMediaPresentation.presentImageValue,
  resolveCdnPublicBaseUrl: cdnMediaPresentation.resolveCdnPublicBaseUrl,
  parseAppMediatedMediaSrc: cdnMediaPresentation.parseAppMediatedMediaSrc,
  cdnMarketingAsset: cdnMediaPresentation.cdnMarketingAsset,
};
