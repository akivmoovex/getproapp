"use strict";

const {
  resolvePublishableClinicByKey,
  RESULT: VISIBILITY,
} = require("../services/activeClinicPublicVisibilityService");
const instanceRepo = require("../../platform/website/instanceRepository");
const resolver = require("../../platform/website/resolver");
const {
  registerActiveClinicWebsiteTemplate,
} = require("./activeClinicWebsiteTemplate");
const { buildActiveClinicWebsiteTemplateContent } = require("./activeClinicWebsiteTemplateContent");
const { applyLibraryPresentation } = require("./clinicWebsiteCms");

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

function valuesFromSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object") return { values: {}, visibility: {} };
  if (snapshot.values && typeof snapshot.values === "object") {
    return {
      values: { ...snapshot.values },
      visibility: snapshot.visibility && typeof snapshot.visibility === "object" ? { ...snapshot.visibility } : {},
    };
  }
  return { values: { ...snapshot }, visibility: {} };
}

function pickContent(values, defaults, key) {
  if (Object.prototype.hasOwnProperty.call(values, key) && values[key] != null) {
    return values[key];
  }
  if (Object.prototype.hasOwnProperty.call(defaults, key)) return defaults[key];
  return null;
}

function pickBool(values, defaults, key, fallback) {
  if (Object.prototype.hasOwnProperty.call(values, key) && typeof values[key] === "boolean") {
    return values[key];
  }
  if (Object.prototype.hasOwnProperty.call(defaults, key) && typeof defaults[key] === "boolean") {
    return defaults[key];
  }
  return fallback;
}

function pickHexColor(values, key) {
  const raw = values && Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null;
  const text = String(raw || "").trim();
  return /^#[0-9A-Fa-f]{6}$/.test(text) ? text.toLowerCase() : null;
}

function pickUrl(values, defaults, key) {
  const raw = pickContent(values, defaults, key);
  const text = String(raw || "").trim();
  return text || null;
}

function mergeClinicPresentation(clinic, resolved, operational) {
  const values = resolved.values || {};
  const vis = resolved.visibility || {};
  const defaults = buildActiveClinicWebsiteTemplateContent({
    publicName: operational.clinic_name || clinic.publicName,
    phone: operational.phone,
    email: operational.email,
    address: operational.address,
  });
  const content = (key) => pickContent(values, defaults, key);
  const heroImage = content("home.hero.image");
  const heroSrc =
    heroImage && typeof heroImage === "object" ? heroImage.src : heroImage || clinic.websiteHeroUrl || null;
  const heroAltFromContent =
    heroImage && typeof heroImage === "object" && heroImage.alt ? String(heroImage.alt) : "";
  const usesDefaultHero =
    Boolean(heroSrc) && String(heroSrc).indexOf("clinic-hero-default") !== -1;
  const aboutImage = content("about.story.image");
  const aboutImageSrc =
    aboutImage && typeof aboutImage === "object" ? aboutImage.src : aboutImage || null;
  const aboutImageAlt =
    aboutImage && typeof aboutImage === "object" && aboutImage.alt ? String(aboutImage.alt) : "";
  const aboutImageMediaId =
    aboutImage && typeof aboutImage === "object" && aboutImage.mediaId ? aboutImage.mediaId : "";
  const logoImage = content("home.logo");
  const libraryItems = Array.isArray(content("cms.library")) ? content("cms.library") : [];
  const libraryPlacements = Array.isArray(content("cms.library_placements"))
    ? content("cms.library_placements")
    : [];
  const libraryFaqs = libraryItems
    .filter((item) => item && item.type === "faq" && item.visible !== false)
    .map((item) => ({ question: item.title, answer: item.body }));
  const libraryTestimonials = libraryItems
    .filter((item) => item && item.type === "testimonial" && item.visible !== false)
    .map((item) => ({ quote: item.body, attribution: item.attribution || "" }));
  const faq = libraryFaqs.length
    ? libraryFaqs
    : Array.isArray(content("home.faq"))
      ? content("home.faq")
      : [];
  const seoImage = content("seo.image");
  const overlayName = String(content("site.name") || "").trim();
  const brandPrimary = pickHexColor(values, "brand.primary_color");
  const brandAccent = pickHexColor(values, "brand.accent_color");
  return {
    ...clinic,
    websiteContent: values,
    websiteDefaults: defaults,
    websiteVisibility: vis,
    websiteUnpublishedCount: resolved.unpublishedCount || 0,
    websiteMode: resolved.mode,
    websiteInstanceId: resolved.instance && resolved.instance.id,
    websiteTemplateVersion: resolved.instance && resolved.instance.templateVersion,
    websiteDisplayName: overlayName || clinic.publicName,
    brandPrimary,
    brandAccent,
    headerShowLogo: pickBool(values, defaults, "header.show_logo", true) !== false,
    headerShowNav: pickBool(values, defaults, "header.show_nav", true) !== false,
    headerShowPhone: pickBool(values, defaults, "header.show_phone", false) === true,
    footerShowContact: pickBool(values, defaults, "footer.show_contact", true) !== false,
    headerPhone: content("contact.phone") || operational.phone || clinic.publicPhoneDisplay || null,
    socialFacebookUrl: pickUrl(values, defaults, "social.facebook_url"),
    socialInstagramUrl: pickUrl(values, defaults, "social.instagram_url"),
    socialWhatsappUrl: pickUrl(values, defaults, "social.whatsapp_url"),
    socialXUrl: pickUrl(values, defaults, "social.x_url"),
    seoTitle: content("seo.title") || null,
    seoDescription: content("seo.description") || null,
    seoImageUrl:
      (seoImage && typeof seoImage === "object" && seoImage.src) ||
      (typeof seoImage === "string" ? seoImage : null) ||
      null,
    seoImageAlt: (seoImage && typeof seoImage === "object" && seoImage.alt ? String(seoImage.alt) : "") || "",
    seoImageMediaId: (seoImage && typeof seoImage === "object" && seoImage.mediaId) || "",
    heroTitle: content("home.hero.title") || `Welcome to ${operational.clinic_name || clinic.publicName}`,
    heroSubtitle: content("home.hero.subtitle") || clinic.websiteAbout || null,
    heroEyebrow: content("home.hero.eyebrow") || clinic.websiteTagline || null,
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
    aboutEyebrow: content("about.eyebrow") || "About",
    aboutHeading: content("about.story.heading") || "About our clinic",
    aboutBody: content("about.story.body") || clinic.websiteAbout || null,
    aboutStoryImageSrc: aboutImageSrc || null,
    aboutStoryImageAlt: aboutImageAlt,
    aboutStoryImageMediaId: aboutImageMediaId,
    contactEyebrow: content("contact.eyebrow") || "Contact",
    contactPageTitle: content("contact.page_title") || `Contact ${clinic.publicName}`,
    contactAsideHeading: content("contact.aside_heading") || "Clinic contact",
    contactIntro: content("contact.intro") || null,
    bookIntro: content("book.intro") || null,
    footerLegal: content("footer.legal") || null,
    footerTagline: content("footer.tagline") || null,
    promoHeading: content("home.promo.heading") || null,
    promoBody: content("home.promo.body") || null,
    faqHeading: content("home.faq_heading") || "Questions",
    homePreviewServicesHeading: content("home.preview.services_heading") || "Services",
    homePreviewDoctorsHeading: content("home.preview.doctors_heading") || "Doctors",
    homePreviewVisitHeading: content("home.preview.visit_heading") || "Visit us",
    testimonials: libraryTestimonials.length
      ? libraryTestimonials
      : Array.isArray(content("home.testimonials"))
        ? content("home.testimonials")
        : [],
    faq,
    showPricing:
      vis["page.pricing.visible"] !== "hidden" &&
      (typeof values["page.pricing.visible"] === "boolean"
        ? values["page.pricing.visible"] !== false
        : true),
    showDoctors:
      vis["page.doctors.visible"] !== "hidden" &&
      (typeof values["page.doctors.visible"] === "boolean"
        ? values["page.doctors.visible"] !== false
        : true),
    showInsurance: pickBool(values, defaults, "page.insurance.visible", false) === true,
    showTestimonials: pickBool(values, defaults, "section.testimonials.visible", false) === true,
    showFaq:
      vis["section.faq.visible"] !== "hidden" &&
      pickBool(values, defaults, "section.faq.visible", true) === true,
    showPromo: pickBool(values, defaults, "section.promo.visible", true) === true,
    showPatientInformation: pickBool(values, defaults, "page.patient_information.visible", true) !== false,
    servicesPageTitle: content("services.page_title") || "Services",
    servicesIntro: content("services.intro") || null,
    servicesEmptyHeading: content("services.empty_heading") || "Service listings are not available yet",
    servicesEmptyBody: content("services.empty_body") || null,
    serviceExamples: Array.isArray(values["services.examples"]) ? values["services.examples"] : [],
    doctorsPageTitle: content("doctors.page_title") || "Our Doctors",
    doctorsIntro: content("doctors.intro") || null,
    doctorsEmptyHeading: content("doctors.empty_heading") || "Doctor listings are not available yet",
    doctorsEmptyBody: content("doctors.empty_body") || null,
    doctorExamples: Array.isArray(values["doctors.examples"]) ? values["doctors.examples"] : [],
    locationEyebrow: content("location.eyebrow") || "Visit us",
    locationPageTitle: content("location.page_title") || "Location & hours",
    locationIntro: content("location.intro") || null,
    locationAddressOverlay: content("location.address") || null,
    locationHoursOverlay: content("location.hours") || null,
    pricingPageTitle: content("pricing.page_title") || "Pricing",
    pricingIntro: content("pricing.intro") || null,
    patientInformationTitle: content("patient.info_title") || "Patient information",
    patientInformationBody: content("patient.info_body") || null,
    cmsPages: Array.isArray(content("cms.pages")) ? content("cms.pages") : [],
    cmsSections: Array.isArray(content("cms.sections")) ? content("cms.sections") : [],
    cmsBlocks: Array.isArray(content("cms.blocks")) ? content("cms.blocks") : [],
    cmsLibrary: libraryItems,
    cmsLibraryPlacements: libraryPlacements,
    doctors: applyLibraryPresentation(clinic.doctors, libraryItems, "doctor", "staffKey"),
    services: applyLibraryPresentation(clinic.services, libraryItems, "service", "serviceKey"),
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
  if (input.snapshot) {
    const snap = valuesFromSnapshot(input.snapshot);
    resolved = {
      ok: true,
      mode: "preview",
      instance: instance || null,
      values: snap.values,
      visibility: snap.visibility,
      changes: [],
      unpublishedCount: 0,
    };
  } else if (instance) {
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
  valuesFromSnapshot,
};
