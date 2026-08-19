"use strict";

const {
  resolvePublishableClinicByKey,
  RESULT: VISIBILITY,
} = require("../services/activeClinicPublicVisibilityService");
const instanceRepo = require("../../platform/website/instanceRepository");
const resolver = require("../../platform/website/resolver");
const { registerActiveClinicWebsiteTemplate } = require("./activeClinicWebsiteTemplate");

const MODE = resolver.MODE;

function operationalFromClinic(clinic) {
  const primary =
    (clinic.facilities || []).find((f) => f.isPrimary) || (clinic.facilities || [])[0] || null;
  const addressParts = [];
  if (primary) {
    if (primary.addressLine1) addressParts.push(primary.addressLine1);
    if (primary.city) addressParts.push(primary.city);
    if (primary.province) addressParts.push(primary.province);
    if (primary.countryCode) addressParts.push(primary.countryCode);
  }
  return {
    clinic_name: clinic.publicName || null,
    phone: clinic.publicPhoneDisplay || (primary && primary.phoneDisplay) || null,
    email: clinic.publicEmailDisplay || (primary && primary.emailDisplay) || null,
    address: addressParts.join(", ") || null,
    hours: primary && primary.publicHours ? primary.publicHours : null,
    hoursUnavailable: Boolean(primary && primary.hoursUnavailable === true),
    booking: clinic.publicBookingEnabled === true,
    services: Array.isArray(clinic.services) ? clinic.services : null,
    doctors: Array.isArray(clinic.doctors) ? clinic.doctors : null,
    logo: clinic.websiteLogoUrl || null,
  };
}

function mergeClinicPresentation(clinic, resolved, operational) {
  const values = resolved.values || {};
  const vis = resolved.visibility || {};
  const heroImage = values["home.hero.image"];
  const heroSrc =
    heroImage && typeof heroImage === "object" ? heroImage.src : heroImage || clinic.websiteHeroUrl || null;
  const heroAltFromContent =
    heroImage && typeof heroImage === "object" && heroImage.alt ? String(heroImage.alt) : "";
  const usesDefaultHero =
    Boolean(heroSrc) && String(heroSrc).indexOf("clinic-hero-default") !== -1;
  const aboutImage = values["about.story.image"];
  const aboutImageSrc =
    aboutImage && typeof aboutImage === "object" ? aboutImage.src : aboutImage || null;
  const aboutImageAlt =
    aboutImage && typeof aboutImage === "object" && aboutImage.alt ? String(aboutImage.alt) : "";
  const aboutImageMediaId =
    aboutImage && typeof aboutImage === "object" && aboutImage.mediaId ? aboutImage.mediaId : "";
  const logoImage = values["home.logo"];
  return {
    ...clinic,
    websiteContent: values,
    websiteVisibility: vis,
    websiteUnpublishedCount: resolved.unpublishedCount || 0,
    websiteMode: resolved.mode,
    websiteInstanceId: resolved.instance && resolved.instance.id,
    websiteTemplateVersion: resolved.instance && resolved.instance.templateVersion,
    heroTitle: values["home.hero.title"] || `Welcome to ${operational.clinic_name || clinic.publicName}`,
    heroSubtitle: values["home.hero.subtitle"] || clinic.websiteAbout || null,
    heroEyebrow: values["home.hero.eyebrow"] || clinic.websiteTagline || null,
    websiteHeroUrl: heroSrc || clinic.websiteHeroUrl || null,
    websiteHeroAlt:
      heroAltFromContent ||
      (usesDefaultHero ? `Template photo for ${clinic.publicName}` : ""),
    websiteLogoUrl:
      (logoImage && typeof logoImage === "object" && logoImage.src) ||
      clinic.websiteLogoUrl ||
      null,
    websiteLogoAlt:
      (logoImage && typeof logoImage === "object" && logoImage.alt ? String(logoImage.alt) : "") ||
      "",
    websiteLogoMediaId:
      (logoImage && typeof logoImage === "object" && logoImage.mediaId) || "",
    aboutHeading: values["about.story.heading"] || "About our clinic",
    aboutBody: values["about.story.body"] || clinic.websiteAbout || null,
    aboutStoryImageSrc: aboutImageSrc || null,
    aboutStoryImageAlt: aboutImageAlt,
    aboutStoryImageMediaId: aboutImageMediaId,
    contactIntro: values["contact.intro"] || null,
    bookIntro: values["book.intro"] || null,
    footerLegal: values["footer.legal"] || null,
    footerTagline: values["footer.tagline"] || null,
    promoHeading: values["home.promo.heading"] || null,
    promoBody: values["home.promo.body"] || null,
    testimonials: Array.isArray(values["home.testimonials"]) ? values["home.testimonials"] : [],
    faq: Array.isArray(values["home.faq"]) ? values["home.faq"] : [],
    showPricing: vis["page.pricing.visible"] !== "hidden" && values["page.pricing.visible"] !== false,
    showDoctors: vis["page.doctors.visible"] !== "hidden" && values["page.doctors.visible"] !== false,
    showInsurance: values["page.insurance.visible"] === true,
    showTestimonials: values["section.testimonials.visible"] === true,
    showFaq: values["section.faq.visible"] === true,
    showPromo: values["section.promo.visible"] === true,
    servicesIntro: values["services.intro"] || null,
    serviceExamples: Array.isArray(values["services.examples"]) ? values["services.examples"] : [],
    doctorsIntro: values["doctors.intro"] || null,
    doctorExamples: Array.isArray(values["doctors.examples"]) ? values["doctors.examples"] : [],
    locationIntro: values["location.intro"] || null,
    locationAddressOverlay: values["location.address"] || null,
    locationHoursOverlay: values["location.hours"] || null,
    operational,
  };
}

async function resolveActiveClinicWebsite(db, input) {
  registerActiveClinicWebsiteTemplate();
  const clinicResult = input.clinic
    ? { ok: true, clinic: input.clinic }
    : await resolvePublishableClinicByKey(db, { clinicKey: input.clinicKey });
  if (!clinicResult.ok) return clinicResult;

  const clinic = clinicResult.clinic;
  const instance =
    input.instance ||
    (await instanceRepo.findWebsiteInstanceByOrgProduct(db, {
      organizationId: clinic.organizationId,
      productCode: "activeclinic",
    }));

  const mode = input.mode === MODE.DRAFT ? MODE.DRAFT : MODE.LIVE;
  let resolved = {
    ok: true,
    mode,
    instance: instance || null,
    values: {},
    visibility: {},
    changes: [],
    unpublishedCount: 0,
  };
  if (instance) {
    resolved = await resolver.resolveWebsiteContent(db, {
      organizationId: clinic.organizationId,
      instance,
      mode,
    });
  }

  const operational = operationalFromClinic(clinic);
  if (input.operational) Object.assign(operational, input.operational);

  return {
    ok: true,
    code: VISIBILITY.OK,
    clinic: mergeClinicPresentation(clinic, resolved, operational),
    instance: instance || null,
    resolved,
    operational,
  };
}

module.exports = {
  MODE,
  resolveActiveClinicWebsite,
  operationalFromClinic,
  mergeClinicPresentation,
};
