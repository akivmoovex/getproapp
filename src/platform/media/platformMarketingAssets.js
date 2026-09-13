"use strict";

/**
 * Platform (non-tenant) marketing / system image assets delivered via the same
 * Hostinger CDN keyspace as website media.
 *
 * Keys: {env}/platform/{blessboard|activeclinic|shared}/<stable-path>
 * Public path prefixes (/church/images, /activeclinic/assets) are compatibility
 * inputs only — renderers must emit CDN URLs from storage keys.
 */

const path = require("path");
const { resolveMediaEnvironment } = require("./hostingerMediaConfig");

/** @type {Readonly<Record<string, string>>} publicPath → relative key under platform/ */
const PUBLIC_TO_RELATIVE_KEY = Object.freeze({
  // BlessBoard apex / brand
  "/church/images/brand/blessboard-small-church-logo.png":
    "blessboard/brand/blessboard-small-church-logo.png",
  "/church/images/brand/blessboard-church-logo.png":
    "blessboard/brand/blessboard-church-logo.png",
  "/church/images/brand/blessboard-favicon-32.png":
    "blessboard/brand/blessboard-favicon-32.png",
  "/church/images/brand/blessboard-apple-touch-icon.png":
    "blessboard/brand/blessboard-apple-touch-icon.png",
  "/church/images/homepage/desktop-hero-auditorium.jpg":
    "blessboard/homepage/desktop-hero-auditorium.jpg",
  "/church/images/homepage/apex-hero-mobile.jpg": "blessboard/homepage/apex-hero-mobile.jpg",
  "/church/images/homepage/apex-feature-website.jpg":
    "blessboard/homepage/apex-feature-website.jpg",
  "/church/images/homepage/apex-feature-engagement.jpg":
    "blessboard/homepage/apex-feature-engagement.jpg",
  "/church/images/homepage/apex-feature-admin.jpg":
    "blessboard/homepage/apex-feature-admin.jpg",
  "/church/images/homepage/apex-feature-multibranch.jpg":
    "blessboard/homepage/apex-feature-multibranch.jpg",
  "/church/images/auth/login-bg-desktop.jpg": "blessboard/auth/login-bg-desktop.jpg",
  "/church/images/auth/waiting-verification.jpg": "blessboard/auth/waiting-verification.jpg",
  "/church/images/auth/forgot-password.jpg": "blessboard/auth/forgot-password.jpg",
  "/church/images/auth/registration-submitted.jpg":
    "blessboard/auth/registration-submitted.jpg",

  // BlessBoard tenant soft-fill / testing demo system assets (not tenant-owned uploads)
  "/church/images/tenant-public/home-desktop-hero.jpg":
    "blessboard/demo/tenant-public/home-desktop-hero.jpg",
  "/church/images/tenant-public/home-mobile-hero.jpg":
    "blessboard/demo/tenant-public/home-mobile-hero.jpg",
  "/church/images/tenant-public/about-hero-building.jpg":
    "blessboard/demo/tenant-public/about-hero-building.jpg",
  "/church/images/homepage/mobile-hero-sanctuary.jpg":
    "blessboard/homepage/mobile-hero-sanctuary.jpg",
  "/church/images/homepage/mobile-ministry-worship.jpg":
    "blessboard/homepage/mobile-ministry-worship.jpg",
  "/church/images/homepage/mobile-ministry-children.jpg":
    "blessboard/homepage/mobile-ministry-children.jpg",
  "/church/images/leadership/pastor-desktop.jpg":
    "blessboard/demo/leadership/pastor-desktop.jpg",
  "/church/images/leadership/assistant-desktop.jpg":
    "blessboard/demo/leadership/assistant-desktop.jpg",
  "/church/images/leadership/elder-1.jpg": "blessboard/demo/leadership/elder-1.jpg",
  "/church/images/leadership/elder-2.jpg": "blessboard/demo/leadership/elder-2.jpg",
  "/church/images/leadership/elder-3.jpg": "blessboard/demo/leadership/elder-3.jpg",
  "/church/images/leadership/elder-4.jpg": "blessboard/demo/leadership/elder-4.jpg",
  "/church/images/leadership/ministry-1.jpg": "blessboard/demo/leadership/ministry-1.jpg",
  "/church/images/leadership/ministry-2.jpg": "blessboard/demo/leadership/ministry-2.jpg",
  "/church/images/leadership/ministry-3.jpg": "blessboard/demo/leadership/ministry-3.jpg",
  "/church/images/leadership/ministry-m1.jpg": "blessboard/demo/leadership/ministry-m1.jpg",
  "/church/images/events/event-1.jpg": "blessboard/demo/events/event-1.jpg",
  "/church/images/events/event-2.jpg": "blessboard/demo/events/event-2.jpg",
  "/church/images/events/event-3.jpg": "blessboard/demo/events/event-3.jpg",
  "/church/images/sermons/sermon-featured-desktop.jpg":
    "blessboard/demo/sermons/sermon-featured-desktop.jpg",
  "/church/images/sermons/sermon-1.jpg": "blessboard/demo/sermons/sermon-1.jpg",
  "/church/images/sermons/sermon-2.jpg": "blessboard/demo/sermons/sermon-2.jpg",
  "/church/images/sermons/sermon-3.jpg": "blessboard/demo/sermons/sermon-3.jpg",
  "/church/images/sermons/sermon-thumb-1.jpg": "blessboard/demo/sermons/sermon-thumb-1.jpg",
  "/church/images/sermons/sermon-thumb-2.jpg": "blessboard/demo/sermons/sermon-thumb-2.jpg",

  // ActiveClinic platform marketing + demo system assets (not tenant-owned)
  "/activeclinic/assets/platform/home-hero.jpg": "activeclinic/platform/home-hero.jpg",
  "/activeclinic/assets/clinic-hero-default.jpg": "activeclinic/system/clinic-hero-default.jpg",
  "/activeclinic/assets/clinic/julflona-hero.jpg": "activeclinic/clinic/julflona-hero.jpg",
  "/activeclinic/assets/clinic/directory-waiting.jpg":
    "activeclinic/clinic/directory-waiting.jpg",
  "/activeclinic/assets/clinic/directory-dental.jpg":
    "activeclinic/clinic/directory-dental.jpg",
  "/activeclinic/assets/clinic/directory-lab.jpg": "activeclinic/clinic/directory-lab.jpg",
  "/activeclinic/assets/doctors/doctor-fallback.svg":
    "activeclinic/doctors/doctor-fallback.svg",
  "/activeclinic/assets/doctors/dr-julflona-banda.jpg":
    "activeclinic/doctors/dr-julflona-banda.jpg",
  "/activeclinic/assets/doctors/dr-julflona-mwansa.jpg":
    "activeclinic/doctors/dr-julflona-mwansa.jpg",
  "/activeclinic/assets/icons/consultation.svg": "activeclinic/icons/consultation.svg",
  "/activeclinic/assets/icons/general.svg": "activeclinic/icons/general.svg",
  "/activeclinic/assets/icons/lab.svg": "activeclinic/icons/lab.svg",
  "/activeclinic/assets/icons/procedure.svg": "activeclinic/icons/procedure.svg",
  "/activeclinic/assets/stitch/ACW01-01-ActiveClinic-Home-Desktop-1.jpg":
    "activeclinic/stitch/ACW01-01-ActiveClinic-Home-Desktop-1.jpg",
  "/activeclinic/assets/stitch/ACW01-01-ActiveClinic-Home-Desktop-2.jpg":
    "activeclinic/stitch/ACW01-01-ActiveClinic-Home-Desktop-2.jpg",
  "/activeclinic/assets/stitch/ACW01-02-ActiveClinic-Home-Mobile-1.jpg":
    "activeclinic/stitch/ACW01-02-ActiveClinic-Home-Mobile-1.jpg",
  "/activeclinic/assets/stitch/ACW01-02-ActiveClinic-Home-Mobile-2.jpg":
    "activeclinic/stitch/ACW01-02-ActiveClinic-Home-Mobile-2.jpg",
  "/activeclinic/assets/stitch/ACW03-01-For-Clinics-Desktop-1.jpg":
    "activeclinic/stitch/ACW03-01-For-Clinics-Desktop-1.jpg",
  "/activeclinic/assets/stitch/ACW04-01-Clinic-Website-Feature-Desktop-1.jpg":
    "activeclinic/stitch/ACW04-01-Clinic-Website-Feature-Desktop-1.jpg",
  "/activeclinic/assets/stitch/ACW04-01-Clinic-Website-Feature-Desktop-2.jpg":
    "activeclinic/stitch/ACW04-01-Clinic-Website-Feature-Desktop-2.jpg",
  "/activeclinic/assets/stitch/ACW04-01-Clinic-Website-Feature-Desktop-3.jpg":
    "activeclinic/stitch/ACW04-01-Clinic-Website-Feature-Desktop-3.jpg",
  "/activeclinic/assets/stitch/ACW04-01-Clinic-Website-Feature-Desktop-4.jpg":
    "activeclinic/stitch/ACW04-01-Clinic-Website-Feature-Desktop-4.jpg",
  "/activeclinic/assets/stitch/ACW05-01-For-Patients-Desktop-1.jpg":
    "activeclinic/stitch/ACW05-01-For-Patients-Desktop-1.jpg",
  "/activeclinic/assets/stitch/ACW05-01-For-Patients-Desktop-2.jpg":
    "activeclinic/stitch/ACW05-01-For-Patients-Desktop-2.jpg",
  "/activeclinic/assets/stitch/ACW05-02-For-Patients-Mobile-1.jpg":
    "activeclinic/stitch/ACW05-02-For-Patients-Mobile-1.jpg",
});

/**
 * Local filesystem path under public/ for a known marketing public URL path.
 * @param {string} publicPath
 * @returns {string|null}
 */
function localPublicFilePath(publicPath) {
  const raw = String(publicPath || "").trim();
  if (!PUBLIC_TO_RELATIVE_KEY[raw]) return null;
  if (raw.startsWith("/church/images/")) {
    return path.join("public", "church", "images", raw.slice("/church/images/".length));
  }
  if (raw.startsWith("/activeclinic/assets/")) {
    return path.join("public", "activeclinic", "assets", raw.slice("/activeclinic/assets/".length));
  }
  return null;
}

function isPlatformMarketingPublicPath(publicPath) {
  return Boolean(PUBLIC_TO_RELATIVE_KEY[String(publicPath || "").trim()]);
}

/**
 * @param {string} publicPath
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string|null} full storage key including environment prefix
 */
function storageKeyForPublicPath(publicPath, env) {
  const rel = PUBLIC_TO_RELATIVE_KEY[String(publicPath || "").trim()];
  if (!rel) return null;
  const environment = resolveMediaEnvironment(env || process.env);
  return `${environment}/platform/${rel}`;
}

/**
 * @returns {string[]}
 */
function listMarketingPublicPaths() {
  return Object.keys(PUBLIC_TO_RELATIVE_KEY);
}

module.exports = {
  PUBLIC_TO_RELATIVE_KEY,
  isPlatformMarketingPublicPath,
  storageKeyForPublicPath,
  localPublicFilePath,
  listMarketingPublicPaths,
};
