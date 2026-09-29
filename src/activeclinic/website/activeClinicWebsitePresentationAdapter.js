"use strict";

/**
 * ActiveClinic → platform website presentation adapter (V2.04 Overnight Step 3).
 *
 * Maps already-resolved AC website content + public catalogue rows into
 * platform presentation DTOs. Does NOT query ActiveClinic domain tables.
 * Does NOT wire into public EJS render paths (visual output unchanged).
 *
 * Prerequisites: Overnight Step 1 (presentation model) + Step 2 (shared components) PASS.
 *
 * Flow:
 *   AC DOMAIN (product-owned loaders)
 *     → AC PRESENTATION ADAPTER (this module)
 *     → PLATFORM PRESENTATION MODEL
 *     → SHARED COMPONENT (opt-in later)
 */

const presentation = require("../../platform/website/presentation");
const {
  PRESENTATION_COMPONENT_TYPES,
  UNIVERSAL_FIELDS,
  UNIVERSAL_FIELD_COUNT,
  mapUniversalContentToPresentation,
  productStorageKeyFor,
  validatePresentationComponent,
  validateCollectionPresentation,
  adaptDoctorToPersonPresentation,
  adaptServiceToOfferingCard,
  COLLECTION_CARD_KINDS,
  COLLECTION_LAYOUT_VARIANTS,
} = presentation;

const PRODUCT_CODE = "activeclinic";

/** Overnight Step 3 gate metadata (adapter available; public render unwired). */
const STEP = Object.freeze({
  id: "v2_04_overnight_step_3",
  name: "activeclinic_website_presentation_adapter",
  step1Prerequisite: "PASS",
  step2Prerequisite: "PASS",
  wiredToPublicRender: false,
  wiredToEditorMutation: false,
});

/** Product-specific content keys that must remain AC-owned (Class C). */
const PRODUCT_SPECIFIC_CONTENT_KEYS = Object.freeze([
  "book.intro",
  "patient.info_title",
  "patient.info_body",
  "pricing.page_title",
  "pricing.intro",
  "insurance.intro",
  "page.pricing.visible",
  "page.insurance.visible",
  "page.patient_information.visible",
  "services.empty_heading",
  "services.empty_body",
  "doctors.empty_heading",
  "doctors.empty_body",
  "home.preview.services_heading",
  "home.preview.doctors_heading",
  "home.preview.visit_heading",
  "services.examples",
  "doctors.examples",
  "footer.legal",
]);

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function contentBag(clinic, content) {
  if (content && typeof content === "object") return content;
  return asObject(clinic && clinic.websiteContent);
}

function pick(content, key, fallback) {
  if (Object.prototype.hasOwnProperty.call(content, key) && content[key] != null && content[key] !== "") {
    return content[key];
  }
  return fallback;
}

function imageOrNull(value) {
  if (value == null || value === "") return null;
  if (typeof value === "string") return { src: value, alt: null, mediaId: null };
  if (typeof value === "object") return value;
  return null;
}

/**
 * Branding presentation from AC content + clinic overlays.
 * @param {object} input
 */
function adaptActiveClinicBranding(input) {
  const clinic = asObject(input && input.clinic);
  const content = contentBag(clinic, input && input.content);
  const operational = asObject(clinic.operational || (input && input.operational));
  const model = {
    logo: imageOrNull(pick(content, "home.logo", clinic.websiteLogoUrl)),
    favicon: null,
    primaryColor: pick(content, "brand.primary_color", clinic.brandPrimary),
    accentColor: pick(content, "brand.accent_color", clinic.brandAccent),
    themeId: pick(content, "site.theme_id", null),
    siteName:
      pick(content, "site.name", null) ||
      clinic.websiteDisplayName ||
      operational.clinic_name ||
      clinic.publicName ||
      null,
  };
  return validatePresentationComponent(PRESENTATION_COMPONENT_TYPES.BRANDING, model);
}

function adaptActiveClinicHero(input) {
  const clinic = asObject(input && input.clinic);
  const content = contentBag(clinic, input && input.content);
  const operational = asObject(clinic.operational || (input && input.operational));
  const name = operational.clinic_name || clinic.publicName || "clinic";
  const model = {
    eyebrow: pick(content, "home.hero.eyebrow", clinic.heroEyebrow || clinic.websiteTagline),
    title: pick(content, "home.hero.title", clinic.heroTitle || `Welcome to ${name}`),
    subtitle: pick(content, "home.hero.subtitle", clinic.heroSubtitle || clinic.websiteAbout),
    image: imageOrNull(pick(content, "home.hero.image", clinic.websiteHeroUrl)),
    primaryCta: clinic.publicBookingEnabled
      ? {
          label: "Book Appointment",
          url: (clinic.publicPagePaths && clinic.publicPagePaths.book) || "#",
        }
      : null,
    secondaryCta: null,
  };
  return validatePresentationComponent(PRESENTATION_COMPONENT_TYPES.HERO, model);
}

function adaptActiveClinicAbout(input) {
  const clinic = asObject(input && input.clinic);
  const content = contentBag(clinic, input && input.content);
  const model = {
    heading: pick(content, "about.story.heading", clinic.aboutHeading || "About our clinic"),
    body: pick(content, "about.story.body", clinic.aboutBody || clinic.websiteAbout),
    image: imageOrNull(pick(content, "about.story.image", clinic.aboutStoryImageSrc)),
    imagePosition: "start",
    cta: null,
  };
  return validatePresentationComponent(PRESENTATION_COMPONENT_TYPES.IMAGE_TEXT, model);
}

function adaptActiveClinicContact(input) {
  const clinic = asObject(input && input.clinic);
  const content = contentBag(clinic, input && input.content);
  const operational = asObject(clinic.operational || (input && input.operational));
  const model = {
    phone: pick(content, "contact.phone", clinic.headerPhone || operational.phone || clinic.publicPhoneDisplay),
    email: pick(content, "contact.email", operational.email || clinic.publicEmailDisplay),
    address: pick(
      content,
      "location.address",
      clinic.locationAddressOverlay || operational.address || null
    ),
    intro: pick(content, "contact.intro", clinic.contactIntro),
    asideHeading: pick(content, "contact.aside_heading", clinic.contactAsideHeading),
  };
  return validatePresentationComponent(PRESENTATION_COMPONENT_TYPES.CONTACT, model);
}

function adaptActiveClinicHours(input) {
  const clinic = asObject(input && input.clinic);
  const content = contentBag(clinic, input && input.content);
  const operational = asObject(clinic.operational || (input && input.operational));
  const text = pick(
    content,
    "location.hours",
    clinic.locationHoursOverlay || operational.hours || null
  );
  const model = {
    heading: pick(content, "location.page_title", clinic.locationPageTitle || "Hours"),
    text: text == null ? null : String(text),
    rows: [],
  };
  return validatePresentationComponent(PRESENTATION_COMPONENT_TYPES.HOURS, model);
}

function adaptActiveClinicLocation(input) {
  const clinic = asObject(input && input.clinic);
  const content = contentBag(clinic, input && input.content);
  const operational = asObject(clinic.operational || (input && input.operational));
  const model = {
    heading: pick(content, "location.page_title", clinic.locationPageTitle || "Location"),
    address: pick(
      content,
      "location.address",
      clinic.locationAddressOverlay || operational.address || null
    ),
    mapUrl: null,
    directions: pick(content, "location.intro", clinic.locationIntro),
    landmark: pick(content, "location.address", clinic.locationDirectionsNote),
  };
  return validatePresentationComponent(PRESENTATION_COMPONENT_TYPES.LOCATION, model);
}

function adaptActiveClinicFooter(input) {
  const clinic = asObject(input && input.clinic);
  const content = contentBag(clinic, input && input.content);
  const model = {
    tagline: pick(content, "footer.tagline", clinic.footerTagline),
    legal: pick(content, "footer.legal", clinic.footerLegal),
    showContact: clinic.footerShowContact !== false,
  };
  return validatePresentationComponent(PRESENTATION_COMPONENT_TYPES.FOOTER, model);
}

function adaptActiveClinicSeo(input) {
  const clinic = asObject(input && input.clinic);
  const content = contentBag(clinic, input && input.content);
  const seo = asObject(input && input.seo);
  const model = {
    title: seo.title || pick(content, "seo.title", clinic.seoTitle),
    description: seo.description || pick(content, "seo.description", clinic.seoDescription),
    image: imageOrNull(seo.ogImageUrl || pick(content, "seo.image", clinic.seoImageUrl)),
    canonicalUrl: seo.canonicalUrl || pick(content, "seo.canonical_url", null),
    robots: seo.robots || pick(content, "seo.robots", "index"),
    sitemapInclude:
      typeof seo.sitemapInclude === "boolean"
        ? seo.sitemapInclude
        : pick(content, "seo.sitemap_include", true) !== false,
  };
  return validatePresentationComponent(PRESENTATION_COMPONENT_TYPES.SEO, model);
}

function adaptActiveClinicSocialLinks(input) {
  const clinic = asObject(input && input.clinic);
  const content = contentBag(clinic, input && input.content);
  const links = [];
  const pairs = [
    ["facebook", pick(content, "social.facebook_url", clinic.socialFacebookUrl)],
    ["instagram", pick(content, "social.instagram_url", clinic.socialInstagramUrl)],
    ["whatsapp", pick(content, "social.whatsapp_url", clinic.socialWhatsappUrl)],
    ["x", pick(content, "social.x_url", clinic.socialXUrl)],
  ];
  pairs.forEach(([network, url], index) => {
    if (!url) return;
    links.push({
      network,
      label: network,
      url: String(url),
      displayOrder: index,
      visibility: true,
    });
  });
  return validatePresentationComponent(PRESENTATION_COMPONENT_TYPES.SOCIAL_LINKS, { links });
}

/**
 * Navigation presentation from prebuilt nav items (product builds hrefs).
 * @param {object} input
 * @param {Array<{key?:string,label:string,href?:string,visible?:boolean}>} [input.navItems]
 */
function adaptActiveClinicNavigation(input) {
  const clinic = asObject(input && input.clinic);
  const content = contentBag(clinic, input && input.content);
  let items = Array.isArray(input && input.navItems) ? input.navItems : null;

  if (!items) {
    const defaults = [
      { key: "about", labelKey: "nav.about.label", defaultLabel: "About", href: "/about" },
      { key: "services", labelKey: "nav.services.label", defaultLabel: "Services", href: "/services" },
      { key: "doctors", labelKey: "nav.doctors.label", defaultLabel: "Doctors", href: "/doctors" },
      { key: "location", labelKey: "nav.location.label", defaultLabel: "Location", href: "/location" },
      { key: "contact", labelKey: "nav.contact.label", defaultLabel: "Contact", href: "/contact" },
      {
        key: "pricing",
        labelKey: "nav.pricing.label",
        defaultLabel: "Pricing",
        href: "/pricing",
        visible: clinic.showPricing !== false,
      },
      {
        key: "patient_information",
        labelKey: "nav.patient_information.label",
        defaultLabel: "Patient information",
        href: "/patient-information",
        visible: clinic.showPatientInformation !== false,
      },
    ];
    const paths = asObject(clinic.publicPagePaths);
    items = defaults.map((row, index) => ({
      key: row.key,
      label: pick(content, row.labelKey, row.defaultLabel),
      href: paths[row.key] || paths[row.key.replace(/_([a-z])/g, (_, c) => c.toUpperCase())] || row.href,
      visible: row.visible !== false,
      displayOrder: index,
    }));
  }

  const model = {
    items: items.map((item, index) => ({
      key: item.key || `nav_${index}`,
      label: item.label,
      href: item.href || "#",
      visible: item.visible !== false,
      displayOrder: item.displayOrder != null ? item.displayOrder : index,
    })),
  };
  return validatePresentationComponent(PRESENTATION_COMPONENT_TYPES.NAVIGATION, model);
}

/**
 * Doctor domain/public profile row → PersonPresentation (via platform helper).
 * Accepts AC visibility-service shape (displayName, title, bio, photoUrl, specialty).
 */
function adaptActiveClinicDoctorToPerson(doctor, opts) {
  const row = asObject(doctor);
  return adaptDoctorToPersonPresentation(
    {
      id: row.id,
      staffId: row.id,
      staffKey: row.staffKey,
      public_display_name: row.displayName || row.public_display_name,
      displayName: row.displayName,
      name: row.displayName || row.name,
      public_title: row.title || row.public_title,
      title: row.title,
      subtitle: row.specialty || row.subtitle || null,
      public_bio: row.bio || row.public_bio,
      bio: row.bio,
      photoUrl: row.photoUrl || row.image,
      image: row.photoUrl || row.image,
      featured: row.featured === true,
      sort_order: row.sortOrder != null ? row.sortOrder : row.displayOrder,
      displayOrder: row.displayOrder,
      public_profile_enabled: true,
      visible: row.visible !== false,
      ctaUrl: row.profileHref || row.href || null,
      ctaLabel: row.ctaLabel || null,
      bookingUrl: row.bookingUrl || null,
      bookingLabel: row.bookingLabel || null,
      // Never invent clinical credentials — only pass through when domain supplies them.
      badges: row.badges || row.qualifications || row.credentials || null,
      qualifications: row.qualifications || null,
    },
    { productCode: PRODUCT_CODE, ...(opts || {}) }
  );
}

/**
 * Clinical service row → offering collection card.
 */
function adaptActiveClinicServiceToCard(service, opts) {
  const row = asObject(service);
  return adaptServiceToOfferingCard(
    {
      id: row.id,
      serviceKey: row.serviceKey,
      display_name: row.displayName || row.display_name || row.name,
      name: row.displayName || row.name,
      title: row.displayName || row.title,
      public_summary: row.summary || row.public_summary || row.description,
      summary: row.summary,
      body: row.body,
      iconUrl: row.iconUrl || null,
      icon: row.iconUrl || row.icon || null,
      image: row.image || row.iconUrl || null,
      featured: row.featured === true,
      sort_order: row.sortOrder != null ? row.sortOrder : row.displayOrder,
      visible: row.visible !== false,
      ctaUrl: row.href || row.detailHref || null,
      detailHref: row.detailHref || row.href || null,
      bookingUrl: row.bookingUrl || null,
      bookingLabel: row.bookingLabel || null,
      ctaLabel: row.ctaLabel || "Learn more",
    },
    { productCode: PRODUCT_CODE, ...(opts || {}) }
  );
}

function adaptActiveClinicDoctorsCollection(input) {
  const clinic = asObject(input && input.clinic);
  const content = contentBag(clinic, input && input.content);
  const doctors = Array.isArray(input && input.doctors)
    ? input.doctors
    : Array.isArray(clinic.doctors)
      ? clinic.doctors
      : [];

  const items = [];
  for (const doctor of doctors) {
    const person = adaptActiveClinicDoctorToPerson(doctor);
    if (person.ok) items.push(person.value);
  }

  return validateCollectionPresentation({
    cardKind: COLLECTION_CARD_KINDS.PERSON,
    layoutVariant: COLLECTION_LAYOUT_VARIANTS.GRID,
    intro: pick(content, "doctors.intro", clinic.doctorsIntro),
    emptyState: {
      heading: pick(content, "doctors.empty_heading", clinic.doctorsEmptyHeading),
      body: pick(content, "doctors.empty_body", clinic.doctorsEmptyBody),
    },
    manageHref: "/app/settings/website/catalogue/doctors",
    items,
  });
}

function adaptActiveClinicServicesCollection(input) {
  const clinic = asObject(input && input.clinic);
  const content = contentBag(clinic, input && input.content);
  const services = Array.isArray(input && input.services)
    ? input.services
    : Array.isArray(clinic.services)
      ? clinic.services
      : [];

  const items = [];
  for (const service of services) {
    const card = adaptActiveClinicServiceToCard(service);
    if (card.ok) items.push(card.value);
  }

  return validateCollectionPresentation({
    cardKind: COLLECTION_CARD_KINDS.OFFERING,
    layoutVariant: COLLECTION_LAYOUT_VARIANTS.GRID,
    intro: pick(content, "services.intro", clinic.servicesIntro),
    emptyState: {
      heading: pick(content, "services.empty_heading", clinic.servicesEmptyHeading),
      body: pick(content, "services.empty_body", clinic.servicesEmptyBody),
    },
    manageHref: "/app/settings/website/catalogue/services",
    items,
  });
}

function adaptActiveClinicTestimonialsCollection(input) {
  const clinic = asObject(input && input.clinic);
  const content = contentBag(clinic, input && input.content);
  const rows = Array.isArray(clinic.testimonials)
    ? clinic.testimonials
    : Array.isArray(content["home.testimonials"])
      ? content["home.testimonials"]
      : [];
  const items = rows.map((row, index) => ({
    kind: COLLECTION_CARD_KINDS.QUOTE,
    title: row.attribution || "Patient",
    subtitle: null,
    description: row.quote || row.body || "",
    displayOrder: index,
    visibility: true,
    featured: false,
    sourceProduct: PRODUCT_CODE,
    sourceDomain: "testimonial",
    sourceId: row.id != null ? String(row.id) : null,
  }));
  return validateCollectionPresentation({
    cardKind: COLLECTION_CARD_KINDS.QUOTE,
    layoutVariant: COLLECTION_LAYOUT_VARIANTS.LIST,
    intro: null,
    emptyState: null,
    items,
  });
}

function adaptActiveClinicFaqCollection(input) {
  const clinic = asObject(input && input.clinic);
  const content = contentBag(clinic, input && input.content);
  const rows = Array.isArray(clinic.faq)
    ? clinic.faq
    : Array.isArray(content["home.faq"])
      ? content["home.faq"]
      : [];
  const items = rows.map((row, index) => ({
    kind: COLLECTION_CARD_KINDS.FAQ,
    title: row.question || row.title || "",
    subtitle: null,
    description: row.answer || row.body || "",
    displayOrder: index,
    visibility: true,
    featured: false,
    sourceProduct: PRODUCT_CODE,
    sourceDomain: "faq",
    sourceId: row.id != null ? String(row.id) : null,
  }));
  return validateCollectionPresentation({
    cardKind: COLLECTION_CARD_KINDS.FAQ,
    layoutVariant: COLLECTION_LAYOUT_VARIANTS.LIST,
    intro: pick(content, "home.faq_heading", clinic.faqHeading),
    emptyState: null,
    items,
  });
}

/**
 * Gallery presentation from already-resolved gallery rows / content (no DB).
 * Shareable audit candidate — presentation only; media stays on platform media engine.
 */
function adaptActiveClinicGallery(input) {
  const clinic = asObject(input && input.clinic);
  const content = contentBag(clinic, input && input.content);
  const rows = Array.isArray(input && input.gallery)
    ? input.gallery
    : Array.isArray(clinic.gallery)
      ? clinic.gallery
      : Array.isArray(content["about.gallery"])
        ? content["about.gallery"]
        : Array.isArray(content["home.gallery"])
          ? content["home.gallery"]
          : [];
  const items = rows
    .map((row, index) => {
      const image = imageOrNull(
        row && (row.image || row.src || row.url || (typeof row === "string" ? row : null))
      );
      if (!image) return null;
      return {
        image,
        caption: row && (row.caption || row.alt || row.title) ? String(row.caption || row.alt || row.title) : null,
        displayOrder: row && row.displayOrder != null ? Number(row.displayOrder) : index,
        visibility: !(row && row.visibility === false),
      };
    })
    .filter(Boolean);
  return validatePresentationComponent(PRESENTATION_COMPONENT_TYPES.GALLERY, {
    heading: pick(content, "about.gallery_heading", clinic.galleryHeading || null),
    items,
  });
}

function adaptActiveClinicPromoCta(input) {
  const clinic = asObject(input && input.clinic);
  const content = contentBag(clinic, input && input.content);
  const model = {
    heading: pick(content, "home.promo.heading", clinic.promoHeading),
    body: pick(content, "home.promo.body", clinic.promoBody),
    primaryCta: null,
    secondaryCta: null,
  };
  return validatePresentationComponent(PRESENTATION_COMPONENT_TYPES.CTA, model);
}

/**
 * Count how many of the 18 universal presentation keys have a resolvable AC value.
 */
function countMappedUniversalFields(content, clinic) {
  const bag = contentBag(clinic, content);
  const mapped = mapUniversalContentToPresentation(PRODUCT_CODE, bag);
  let count = 0;
  const details = [];
  for (const field of UNIVERSAL_FIELDS) {
    const storageKey = productStorageKeyFor(PRODUCT_CODE, field.presentationKey);
    let value = mapped.presentation[field.presentationKey];
    // Fallbacks from resolved clinic presentation for measurement
    if (value == null && clinic) {
      const fallbacks = {
        "home.logo": clinic.websiteLogoUrl,
        "home.hero.image": clinic.websiteHeroUrl,
        "home.hero.eyebrow": clinic.heroEyebrow,
        "home.hero.title": clinic.heroTitle,
        "home.hero.subtitle": clinic.heroSubtitle,
        "about.story.heading": clinic.aboutHeading,
        "about.story.body": clinic.aboutBody,
        "contact.phone": clinic.headerPhone,
        "contact.email": clinic.publicEmailDisplay,
        "footer.tagline": clinic.footerTagline,
        "seo.title": clinic.seoTitle,
        "seo.description": clinic.seoDescription,
        "seo.image": clinic.seoImageUrl,
        "brand.primary_color": clinic.brandPrimary,
        "brand.accent_color": clinic.brandAccent,
      };
      value = fallbacks[field.presentationKey];
    }
    const present = value != null && value !== "";
    if (present) count += 1;
    details.push({
      presentationKey: field.presentationKey,
      storageKey,
      mapped: present,
    });
  }
  return { count, total: UNIVERSAL_FIELD_COUNT, details, presentationBag: mapped.presentation };
}

function collectProductSpecificPreserved(content, clinic) {
  const bag = contentBag(clinic, content);
  const preserved = {};
  for (const key of PRODUCT_SPECIFIC_CONTENT_KEYS) {
    if (Object.prototype.hasOwnProperty.call(bag, key)) {
      preserved[key] = bag[key];
    }
  }
  // Domain behaviours stay as opaque flags — never folded into universal keys
  preserved.__domain = {
    bookingEnabled: clinic && clinic.publicBookingEnabled === true,
    showPricing: clinic ? clinic.showPricing !== false : true,
    showPatientInformation: clinic ? clinic.showPatientInformation !== false : true,
    doctorsDomain: "doctor",
    servicesDomain: "clinical_service",
  };
  return preserved;
}

/**
 * Build the full AC website presentation bundle from already-resolved inputs.
 * @param {{
 *   clinic?: object,
 *   content?: object,
 *   doctors?: object[],
 *   services?: object[],
 *   navItems?: object[],
 *   seo?: object,
 *   operational?: object,
 * }} input
 */
function buildActiveClinicWebsitePresentation(input) {
  const opts = input && typeof input === "object" ? input : {};
  const clinic = asObject(opts.clinic);
  const content = contentBag(clinic, opts.content);

  const branding = adaptActiveClinicBranding(opts);
  const hero = adaptActiveClinicHero(opts);
  const about = adaptActiveClinicAbout(opts);
  const contact = adaptActiveClinicContact(opts);
  const hours = adaptActiveClinicHours(opts);
  const location = adaptActiveClinicLocation(opts);
  const navigation = adaptActiveClinicNavigation(opts);
  const seo = adaptActiveClinicSeo(opts);
  const footer = adaptActiveClinicFooter(opts);
  const social = adaptActiveClinicSocialLinks(opts);
  const doctors = adaptActiveClinicDoctorsCollection(opts);
  const services = adaptActiveClinicServicesCollection(opts);
  const testimonials = adaptActiveClinicTestimonialsCollection(opts);
  const faq = adaptActiveClinicFaqCollection(opts);
  const gallery = adaptActiveClinicGallery(opts);
  const promo = adaptActiveClinicPromoCta(opts);

  const universal = countMappedUniversalFields(content, clinic);
  const productSpecific = collectProductSpecificPreserved(content, clinic);

  const collections = {
    doctors,
    services,
    testimonials,
    faq,
    gallery,
  };
  const collectionsAdapted = Object.values(collections).filter((c) => c && c.ok).length;

  const components = {
    branding,
    hero,
    about,
    contact,
    hours,
    location,
    navigation,
    seo,
    footer,
    social,
    promo,
    doctors,
    services,
    testimonials,
    faq,
    gallery,
  };

  const failed = Object.entries(components)
    .filter(([, result]) => !result || result.ok !== true)
    .map(([name, result]) => ({ name, code: result && result.code }));

  return {
    ok: failed.length === 0,
    productCode: PRODUCT_CODE,
    step: STEP,
    wiredToPublicRender: false,
    wiredToEditorMutation: false,
    components,
    collections,
    universalFields: universal,
    productSpecific,
    metrics: {
      universalFieldsMapped: universal.count,
      universalFieldsTotal: universal.total,
      collectionsAdapted,
      doctorPersonAdapter: doctors.ok === true,
      serviceCollectionAdapter: services.ok === true,
      productSpecificFieldsPreserved: Object.keys(productSpecific).filter((k) => k !== "__domain")
        .length,
      failedComponentCount: failed.length,
    },
    failed,
  };
}

module.exports = {
  PRODUCT_CODE,
  STEP,
  PRODUCT_SPECIFIC_CONTENT_KEYS,
  adaptActiveClinicBranding,
  adaptActiveClinicHero,
  adaptActiveClinicAbout,
  adaptActiveClinicContact,
  adaptActiveClinicHours,
  adaptActiveClinicLocation,
  adaptActiveClinicFooter,
  adaptActiveClinicSeo,
  adaptActiveClinicSocialLinks,
  adaptActiveClinicNavigation,
  adaptActiveClinicDoctorToPerson,
  adaptActiveClinicServiceToCard,
  adaptActiveClinicDoctorsCollection,
  adaptActiveClinicServicesCollection,
  adaptActiveClinicTestimonialsCollection,
  adaptActiveClinicFaqCollection,
  adaptActiveClinicGallery,
  adaptActiveClinicPromoCta,
  countMappedUniversalFields,
  buildActiveClinicWebsitePresentation,
};
