"use strict";

/**
 * ActiveClinic Stitch public page presentation (R01–R12).
 *
 * Builds validated platform presentation DTOs + rendered shared-component HTML
 * from already-resolved clinic/domain locals. Does not invent clinical copy.
 * Does not create a second services/doctors store, booking engine, or gallery upload engine.
 */

const presentation = require("../../platform/website/presentation");
const adapter = require("./activeClinicWebsitePresentationAdapter");

const {
  renderPresentationComponent,
  validatePresentationComponent,
  PRESENTATION_COMPONENT_TYPES,
} = presentation;

const WIRED_TEMPLATES = Object.freeze({
  "tenant/home": "R01",
  "tenant/about": "R02",
  "tenant/services": "R03",
  "tenant/doctors": "R04",
  "tenant/doctor-profile": "R05",
  "tenant/service-detail": "R06",
  "tenant/contact": "R07",
  "booking/consultation-type": "R08",
  "tenant/location": "R09",
  "tenant/gallery": "R10",
  "tenant/patient-information": "R11",
  "tenant/custom-page": "R12",
});

const EDIT_KEYS = Object.freeze({
  hero: {
    eyebrow: "home.hero.eyebrow",
    title: "home.hero.title",
    subtitle: "home.hero.subtitle",
    image: "home.hero.image",
    primaryLabel: "home.hero.button_label",
  },
  about: {
    heading: "about.story.heading",
    body: "about.story.body",
    image: "about.story.image",
  },
  promo: {
    heading: "home.promo.heading",
    body: "home.promo.body",
  },
  servicesIntro: {
    title: "services.page_title",
    lead: "services.intro",
  },
  servicesEmpty: {
    title: "services.empty_heading",
    lead: "services.empty_body",
  },
  doctorsIntro: {
    title: "doctors.page_title",
    lead: "doctors.intro",
  },
  doctorsEmpty: {
    title: "doctors.empty_heading",
    lead: "doctors.empty_body",
  },
  contactIntro: {
    eyebrow: "contact.eyebrow",
    title: "contact.page_title",
    lead: "contact.intro",
  },
  bookIntro: {
    lead: "book.intro",
  },
  locationIntro: {
    eyebrow: "location.eyebrow",
    title: "location.page_title",
    lead: "location.intro",
  },
  galleryIntro: {
    title: "about.gallery_heading",
  },
  patientInfo: {
    heading: "patient.info_title",
    body: "patient.info_body",
  },
  contactFacts: {
    intro: "contact.intro",
    phone: "contact.phone",
    email: "contact.email",
  },
  hoursFacts: {
    text: "location.hours",
  },
});

const GALLERY_PAGE_SLUGS = Object.freeze(["gallery", "environment", "clinic-environment"]);

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function clinicPaths(clinic) {
  const pages = asObject(clinic && clinic.publicPagePaths);
  const base = clinic && clinic.publicBasePath ? clinic.publicBasePath : clinic && clinic.clinicKey ? `/clinics/${clinic.clinicKey}` : "";
  return {
    home: pages.home || base || "#",
    about: pages.about || (base ? `${base}/about` : "#"),
    services: pages.services || (base ? `${base}/services` : "#"),
    doctors: pages.doctors || (base ? `${base}/doctors` : "#"),
    contact: pages.contact || (base ? `${base}/contact` : "#"),
    location: pages.location || (base ? `${base}/location` : "#"),
    book: pages.book || (base ? `${base}/book` : "#"),
    pricing: pages.pricing || (base ? `${base}/pricing` : "#"),
    patientInformation: pages.patientInformation || (base ? `${base}/patient-information` : "#"),
    gallery: pages.gallery || (base ? `${base}/p/gallery` : "#"),
  };
}

function renderOk(componentId, dto, options) {
  if (!dto) return "";
  const result = renderPresentationComponent(componentId, dto, options || {});
  return result && result.ok ? result.html : "";
}

function enrichHero(clinic, heroResult, paths) {
  if (!heroResult || !heroResult.ok) return heroResult;
  const value = { ...heroResult.value };
  const phone = clinic.publicPhoneDisplay || clinic.headerPhone || null;
  if (!value.primaryCta || !value.primaryCta.label) {
    value.primaryCta = {
      label: clinic.publicBookingEnabled ? "Book Appointment" : "Request Appointment",
      url: paths.book,
    };
  } else if (!value.primaryCta.url || value.primaryCta.url === "#") {
    value.primaryCta = { ...value.primaryCta, url: paths.book };
  }
  if (!value.secondaryCta || !value.secondaryCta.label) {
    if (phone) {
      value.secondaryCta = {
        label: String(phone),
        url: `tel:${String(phone).replace(/[^\d+]/g, "")}`,
      };
    } else {
      value.secondaryCta = { label: "Contact the clinic", url: paths.contact };
    }
  }
  return { ok: true, value };
}

function facilityAddressLine(clinic) {
  const primaryFacility =
    Array.isArray(clinic.facilities) && clinic.facilities.length
      ? clinic.facilities.find((f) => f && f.isPrimary) || clinic.facilities[0]
      : null;
  if (!primaryFacility) return null;
  const bits = [];
  if (primaryFacility.addressLine1) bits.push(primaryFacility.addressLine1);
  if (primaryFacility.addressLine2) bits.push(primaryFacility.addressLine2);
  if (primaryFacility.city) bits.push(primaryFacility.city);
  if (primaryFacility.province || primaryFacility.state) {
    bits.push(primaryFacility.province || primaryFacility.state);
  }
  if (primaryFacility.countryCode || primaryFacility.country) {
    bits.push(primaryFacility.countryCode || primaryFacility.country);
  }
  return bits.length ? bits.join(", ") : null;
}

function enrichContactLocation(clinic, contactResult, locationResult, hoursResult) {
  const facilityAddress = facilityAddressLine(clinic);
  const directionsNote =
    clinic.locationDirectionsNote ||
    clinic.locationAddressOverlay ||
    (clinic.websiteContent && clinic.websiteContent["location.address"]) ||
    null;

  let contact = contactResult;
  if (contact && contact.ok) {
    const value = { ...contact.value };
    // Facility address is authoritative; overlay is directions only.
    if (facilityAddress) {
      value.address = facilityAddress;
    } else if (!value.address) {
      value.address = null;
    }
    if (!value.phone) {
      value.phone = clinic.publicPhoneDisplay || clinic.headerPhone || null;
    }
    if (!value.email) {
      value.email = clinic.publicEmailDisplay || null;
    }
    contact = { ok: true, value };
  }

  let location = locationResult;
  if (location && location.ok) {
    const value = { ...location.value };
    if (facilityAddress) {
      value.address = facilityAddress;
      if (directionsNote && String(directionsNote).trim() !== String(facilityAddress).trim()) {
        value.directions = String(directionsNote).trim();
      }
    } else {
      // Never present directions overlay as a substitute facility address.
      if (value.address && directionsNote && String(value.address).trim() === String(directionsNote).trim()) {
        value.address = null;
        value.directions = String(directionsNote).trim();
      }
    }
    location = { ok: true, value };
  }

  return { contact, location, hours: hoursResult };
}

function buildTrustFactStrip(clinic, hoursResult, contactResult, paths) {
  const items = [];
  const hoursText = hoursResult && hoursResult.ok ? hoursResult.value.text : null;
  const phone = contactResult && contactResult.ok ? contactResult.value.phone : null;
  const address = contactResult && contactResult.ok ? contactResult.value.address : null;

  if (hoursText) {
    items.push({ label: "Opening hours", value: String(hoursText).slice(0, 200), href: paths.location, displayOrder: 1 });
  } else {
    const primaryFacility =
      Array.isArray(clinic.facilities) && clinic.facilities.length
        ? clinic.facilities.find((f) => f && f.isPrimary) || clinic.facilities[0]
        : null;
    const hoursMap = primaryFacility && primaryFacility.publicHours;
    if (hoursMap && typeof hoursMap === "object") {
      const entries = Object.entries(hoursMap).slice(0, 2);
      if (entries.length) {
        items.push({
          label: "Opening hours",
          value: entries.map(([day, val]) => `${day}: ${val}`).join(" · ").slice(0, 200),
          href: paths.location,
          displayOrder: 1,
        });
      }
    }
  }
  if (phone) {
    items.push({
      label: "Reception",
      value: String(phone),
      href: `tel:${String(phone).replace(/[^\d+]/g, "")}`,
      displayOrder: 2,
    });
  }
  if (address) {
    items.push({ label: "Location", value: String(address).slice(0, 200), href: paths.location, displayOrder: 3 });
  }
  if (!items.length) return null;
  return validatePresentationComponent(PRESENTATION_COMPONENT_TYPES.FACT_STRIP, {
    heading: null,
    layoutVariant: "row",
    items,
  });
}

function limitCollection(collectionResult, limit) {
  if (!collectionResult || !collectionResult.ok) return collectionResult;
  const items = Array.isArray(collectionResult.value.items)
    ? collectionResult.value.items.slice(0, limit)
    : [];
  return { ok: true, value: { ...collectionResult.value, items } };
}

function buildAboutMissionStrip(clinic, content) {
  const bag = asObject(content || clinic.websiteContent);
  const items = [];
  const mission = bag["about.mission"] || clinic.aboutMission || null;
  const vision = bag["about.vision"] || clinic.aboutVision || null;
  const values = bag["about.values"] || clinic.aboutValues || null;
  if (mission) items.push({ label: "Mission", value: String(mission).slice(0, 200), displayOrder: 1 });
  if (vision) items.push({ label: "Vision", value: String(vision).slice(0, 200), displayOrder: 2 });
  if (values) items.push({ label: "Values", value: String(values).slice(0, 200), displayOrder: 3 });
  if (!items.length) return null;
  return validatePresentationComponent(PRESENTATION_COMPONENT_TYPES.FACT_STRIP, {
    heading: "Mission, vision & values",
    layoutVariant: "grid",
    items,
  });
}

function withEdit(editEnabled, keys) {
  return {
    editEnabled: Boolean(editEnabled),
    edit: { enabled: Boolean(editEnabled), keys: keys || {} },
  };
}

function buildFacilityDataList(clinic) {
  const facilities = Array.isArray(clinic.facilities) ? clinic.facilities : [];
  if (!facilities.length) return null;
  const rows = [];
  facilities.forEach((facility, index) => {
    if (!facility) return;
    const bits = [
      facility.addressLine1,
      facility.addressLine2,
      facility.city,
      facility.district,
      facility.province,
      facility.postalCode,
      facility.countryCode || facility.country,
    ].filter(Boolean);
    const label = facility.displayName
      ? `${facility.displayName}${facility.isPrimary ? " (Primary)" : ""}`
      : `Facility ${index + 1}`;
    rows.push({
      label,
      value: bits.length ? bits.join(", ") : "Address not configured.",
      href: null,
      displayOrder: index,
    });
    if (facility.phoneDisplay) {
      rows.push({
        label: `${label} phone`,
        value: String(facility.phoneDisplay),
        href: `tel:${String(facility.phoneDisplay).replace(/[^\d+]/g, "")}`,
        displayOrder: index + 0.1,
      });
    }
  });
  if (!rows.length) return null;
  return validatePresentationComponent(PRESENTATION_COMPONENT_TYPES.DATA_LIST, {
    heading: "Facilities",
    rows,
    emptyState: null,
  });
}

function contentArray(clinic, key) {
  const bag = asObject(clinic.websiteContent);
  const value = bag[key];
  return Array.isArray(value) ? value : [];
}

function resolveGalleryRows(clinic, opts) {
  if (Array.isArray(opts && opts.gallery) && opts.gallery.length) return opts.gallery;
  if (Array.isArray(clinic.gallery) && clinic.gallery.length) return clinic.gallery;
  const fromBlocks = [];
  const blocks = Array.isArray(opts && opts.pageBlocks) ? opts.pageBlocks : [];
  const library = Array.isArray(clinic.cmsLibrary) ? clinic.cmsLibrary : [];
  for (const block of blocks) {
    if (!block) continue;
    if (block.type === "image" && block.image) {
      fromBlocks.push({ image: block.image, caption: block.heading || block.caption || null });
      continue;
    }
    if (block.type === "library") {
      const item = library.find((row) => row && row.id === block.library_item_id);
      if (item && item.image) {
        fromBlocks.push({
          image: item.image,
          caption: item.title || item.caption || null,
        });
      }
    }
  }
  if (fromBlocks.length) return fromBlocks;
  return contentArray(clinic, "about.gallery").concat(contentArray(clinic, "home.gallery"));
}

/**
 * Map CMS custom-page blocks → shared presentation HTML modules (R12).
 * No R12-specific component framework — only platform shared components.
 */
function composeModularPageModules(input) {
  const clinic = asObject(input && input.clinic);
  const paths = clinicPaths(clinic);
  const page = asObject(input && input.customPage);
  const blocks = Array.isArray(input && input.pageBlocks) ? input.pageBlocks : [];
  const library = Array.isArray(clinic.cmsLibrary) ? clinic.cmsLibrary : [];
  const editEnabled = Boolean(input && input.websiteEdit);
  const modules = [];

  if (page.title || page.hero_image || page.heroImage) {
    const heroResult = validatePresentationComponent(PRESENTATION_COMPONENT_TYPES.HERO, {
      eyebrow: page.eyebrow || null,
      title: page.title || clinic.publicName || "Clinic page",
      subtitle: page.summary || page.meta_description || null,
      image: page.hero_image || page.heroImage || null,
      primaryCta: page.primary_cta_label
        ? { label: page.primary_cta_label, url: page.primary_cta_url || paths.contact }
        : null,
      secondaryCta: null,
    });
    if (heroResult.ok) {
      modules.push({
        id: "hero",
        component: "hero",
        html: renderOk("hero", heroResult.value),
      });
    }
  }

  const galleryImages = [];

  blocks.forEach((block, index) => {
    if (!block) return;
    let libraryItem = null;
    if (block.type === "library") {
      libraryItem = library.find((item) => item && item.id === block.library_item_id) || null;
      if (libraryItem && libraryItem.visible === false) return;
    }
    const heading = libraryItem ? libraryItem.title : block.heading;
    const body = libraryItem ? libraryItem.body || libraryItem.summary : block.body;
    const image = (libraryItem && libraryItem.image) || block.image || null;
    const type = String(block.type || "text");

    if (type === "heading" && heading) {
      modules.push({
        id: `heading-${index}`,
        component: "section_header",
        html: renderOk("section_header", { title: heading, lead: body || null }),
      });
      return;
    }

    if (type === "text" || (type === "library" && libraryItem && libraryItem.type === "faq")) {
      if (libraryItem && libraryItem.type === "faq") {
        const faqHtml = renderOk("faq_list", {
          heading: heading || "Questions",
          lead: null,
          items: [
            {
              question: libraryItem.title || heading || "Question",
              answer: body || "",
              displayOrder: index,
              visibility: true,
            },
          ],
        });
        if (faqHtml) modules.push({ id: `faq-${index}`, component: "faq_list", html: faqHtml });
        return;
      }
      const rich = renderOk("rich_text", { heading: heading || null, body: body || "" });
      if (rich) modules.push({ id: `text-${index}`, component: "rich_text", html: rich });
      return;
    }

    if (type === "image_text" || (type === "library" && image && body)) {
      const imageText = renderOk("image_text", {
        heading: heading || null,
        body: body || null,
        image: image || null,
        imagePosition: "start",
        cta: null,
      });
      if (imageText) modules.push({ id: `image-text-${index}`, component: "image_text", html: imageText });
      return;
    }

    if (type === "image" && image) {
      galleryImages.push({ image, caption: heading || block.caption || null, displayOrder: index });
      return;
    }

    if (type === "buttons" || (block.button_label && block.button_url)) {
      const cta = renderOk("cta", {
        heading: heading || null,
        body: body || null,
        primaryCta: {
          label: block.button_label || "Learn more",
          url: block.button_url || paths.contact,
        },
        secondaryCta: null,
      });
      if (cta) modules.push({ id: `cta-${index}`, component: "cta", html: cta });
      return;
    }

    if (type === "video" && (block.video_url || block.url)) {
      const video = renderOk("video", {
        title: heading || null,
        url: block.video_url || block.url,
        poster: image || block.poster || null,
      });
      if (video) modules.push({ id: `video-${index}`, component: "video", html: video });
      return;
    }

    if (type === "library" && libraryItem) {
      if (libraryItem.type === "testimonial") {
        const quote = renderOk("rich_text", {
          heading: libraryItem.attribution || heading || "Patient feedback",
          body: body || "",
        });
        if (quote) modules.push({ id: `quote-${index}`, component: "rich_text", html: quote });
        return;
      }
      const card = renderOk("collection_card", {
        cardKind: "generic",
        layoutVariant: "list",
        intro: null,
        emptyState: null,
        manageHref: null,
        items: [
          {
            kind: "generic",
            title: heading || "Content",
            subtitle: libraryItem.attribution || null,
            description: body || null,
            image: image || null,
            cta: null,
            visibility: true,
            displayOrder: index,
          },
        ],
      });
      if (card) modules.push({ id: `card-${index}`, component: "collection_card", html: card });
    }
  });

  if (galleryImages.length) {
    const gallery = validatePresentationComponent(PRESENTATION_COMPONENT_TYPES.GALLERY, {
      heading: "Gallery",
      items: galleryImages.map((row, i) => ({
        image: row.image,
        caption: row.caption,
        displayOrder: row.displayOrder != null ? row.displayOrder : i,
        visibility: true,
      })),
    });
    if (gallery.ok) {
      modules.push({ id: "gallery", component: "gallery", html: renderOk("gallery", gallery.value) });
    }
  }

  void editEnabled;
  return modules;
}

/**
 * @param {{
 *   template: string,
 *   clinic: object,
 *   services?: object[],
 *   doctors?: object[],
 *   procedures?: object[],
 *   profile?: object|null,
 *   service?: object|null,
 *   serviceKind?: string|null,
 *   gallery?: object[],
 *   customPage?: object|null,
 *   pageBlocks?: object[],
 *   websiteEdit?: boolean,
 *   navItems?: object[],
 * }} input
 */
function buildActiveClinicStitchPublicPage(input) {
  const opts = input && typeof input === "object" ? input : {};
  const template = String(opts.template || "");
  const screenId = WIRED_TEMPLATES[template];
  if (!screenId) {
    return { ok: false, code: "template_not_wired", wired: false };
  }

  const clinic = asObject(opts.clinic);
  const paths = clinicPaths(clinic);
  const editEnabled = Boolean(opts.websiteEdit);
  const doctors = Array.isArray(opts.doctors)
    ? opts.doctors
    : Array.isArray(clinic.doctors)
      ? clinic.doctors
      : [];
  const services = Array.isArray(opts.services)
    ? opts.services
    : Array.isArray(clinic.services)
      ? clinic.services
      : [];
  const procedures = Array.isArray(opts.procedures) ? opts.procedures : [];
  const profile = opts.profile && typeof opts.profile === "object" ? opts.profile : null;
  const serviceDetail = opts.service && typeof opts.service === "object" ? opts.service : null;
  const serviceKind = opts.serviceKind ? String(opts.serviceKind) : null;
  const customPage = opts.customPage && typeof opts.customPage === "object" ? opts.customPage : null;
  const pageBlocks = Array.isArray(opts.pageBlocks) ? opts.pageBlocks : [];
  const galleryRows = resolveGalleryRows(clinic, {
    gallery: opts.gallery,
    pageBlocks,
  });

  const bundleInput = {
    clinic,
    doctors,
    services,
    navItems: opts.navItems,
    gallery: galleryRows,
  };

  const branding = adapter.adaptActiveClinicBranding(bundleInput);
  const hero = enrichHero(clinic, adapter.adaptActiveClinicHero(bundleInput), paths);
  const about = adapter.adaptActiveClinicAbout(bundleInput);
  const adaptedContact = adapter.adaptActiveClinicContact(bundleInput);
  const adaptedHours = adapter.adaptActiveClinicHours(bundleInput);
  const adaptedLocation = adapter.adaptActiveClinicLocation(bundleInput);
  const enriched = enrichContactLocation(clinic, adaptedContact, adaptedLocation, adaptedHours);
  const contact = enriched.contact;
  const hours = enriched.hours;
  const location = enriched.location;
  const promo = adapter.adaptActiveClinicPromoCta(bundleInput);
  const navigation = adapter.adaptActiveClinicNavigation(bundleInput);
  const doctorsCollection = adapter.adaptActiveClinicDoctorsCollection(bundleInput);
  const servicesCollection = adapter.adaptActiveClinicServicesCollection(bundleInput);
  const faqCollection = adapter.adaptActiveClinicFaqCollection(bundleInput);
  const gallery = adapter.adaptActiveClinicGallery(bundleInput);
  const trust = buildTrustFactStrip(clinic, hours, contact, paths);
  const missionStrip = buildAboutMissionStrip(clinic, clinic.websiteContent);
  const facilityList = buildFacilityDataList(clinic);

  const html = {};
  const sections = {};

  if (screenId === "R01") {
    sections.hero = hero;
    sections.trust = trust;
    sections.about = about;
    sections.servicesPreview = limitCollection(servicesCollection, 6);
    sections.doctorsPreview = limitCollection(doctorsCollection, 4);
    sections.promo = promo;
    sections.contact = contact;
    sections.location = location;
    sections.hours = hours;
    sections.faq = faqCollection;
    sections.conversion = validatePresentationComponent(PRESENTATION_COMPONENT_TYPES.CTA, {
      heading: clinic.publicBookingEnabled ? "Need to see a doctor?" : "Plan your visit",
      body: clinic.promoBody || null,
      primaryCta: {
        label: clinic.publicBookingEnabled ? "Book Appointment" : "Request Appointment",
        url: paths.book,
      },
      secondaryCta: { label: "Contact", url: paths.contact },
    });

    html.hero = renderOk("hero", hero && hero.value, withEdit(editEnabled, EDIT_KEYS.hero));
    html.trust = trust && trust.ok ? renderOk("fact_strip", trust.value) : "";
    html.about = about && about.ok ? renderOk("image_text", about.value, withEdit(editEnabled, EDIT_KEYS.about)) : "";
    html.servicesHeading = renderOk(
      "section_header",
      {
        title: clinic.homePreviewServicesHeading || "Our Services",
        lead: clinic.servicesIntro || null,
        cta: { label: "View all", url: paths.services },
      },
      withEdit(editEnabled, {
        title: "home.preview.services_heading",
        lead: "services.intro",
      })
    );
    html.services = sections.servicesPreview && sections.servicesPreview.ok
      ? renderOk("collection_grid", sections.servicesPreview.value, withEdit(editEnabled, {}))
      : "";
    html.doctorsHeading = renderOk(
      "section_header",
      {
        title: clinic.homePreviewDoctorsHeading || "Meet Our Doctors",
        lead: clinic.doctorsIntro || null,
        cta: { label: "View doctors", url: paths.doctors },
      },
      withEdit(editEnabled, {
        title: "home.preview.doctors_heading",
        lead: "doctors.intro",
      })
    );
    html.doctors = sections.doctorsPreview && sections.doctorsPreview.ok
      ? renderOk("person_grid", sections.doctorsPreview.value, withEdit(editEnabled, {}))
      : "";
    html.conversion = sections.conversion && sections.conversion.ok
      ? renderOk("cta", sections.conversion.value)
      : "";
    html.promo = promo && promo.ok && (clinic.showPromo || editEnabled)
      ? renderOk("cta", promo.value, withEdit(editEnabled, EDIT_KEYS.promo))
      : "";
    html.visitHeading = renderOk(
      "section_header",
      {
        title: clinic.homePreviewVisitHeading || "Visit us",
        lead: null,
      },
      withEdit(editEnabled, { title: "home.preview.visit_heading" })
    );
    html.contact = contact && contact.ok
      ? renderOk("contact", contact.value, withEdit(editEnabled, EDIT_KEYS.contactFacts))
      : "";
    // Facility address is authoritative — do not attach location.address WE01 on the facility line.
    html.location = location && location.ok ? renderOk("location", location.value) : "";
    html.hours = hours && hours.ok
      ? renderOk("hours", hours.value, withEdit(editEnabled, EDIT_KEYS.hoursFacts))
      : "";
    if (faqCollection && faqCollection.ok && faqCollection.value.items.length) {
      html.faq = renderOk(
        "faq_list",
        {
          heading: clinic.faqHeading || faqCollection.value.intro || "Questions",
          lead: null,
          items: faqCollection.value.items.map((item, index) => ({
            question: item.title,
            answer: item.description,
            displayOrder: index,
            visibility: true,
          })),
        },
        withEdit(editEnabled, { heading: "home.faq_heading" })
      );
    } else if (editEnabled) {
      html.faq = renderOk(
        "faq_list",
        {
          heading: clinic.faqHeading || "Questions",
          lead: null,
          items: [],
        },
        withEdit(editEnabled, { heading: "home.faq_heading" })
      );
    } else {
      html.faq = "";
    }
  }

  if (screenId === "R02") {
    sections.about = about;
    sections.mission = missionStrip;
    sections.contact = contact;
    sections.cta = validatePresentationComponent(PRESENTATION_COMPONENT_TYPES.CTA, {
      heading: "Visit or contact us",
      body: null,
      primaryCta: { label: "Location & hours", url: paths.location },
      secondaryCta: { label: "Send a message", url: paths.contact },
    });
    html.header = renderOk(
      "section_header",
      {
        eyebrow: clinic.aboutEyebrow || "About",
        title: (about && about.ok && about.value.heading) || clinic.aboutHeading || `About ${clinic.publicName || "our clinic"}`,
        lead: clinic.websiteTagline || null,
      },
      withEdit(editEnabled, {
        eyebrow: "about.eyebrow",
        title: "about.story.heading",
      })
    );
    html.story = about && about.ok
      ? renderOk("image_text", about.value, withEdit(editEnabled, EDIT_KEYS.about))
      : "";
    html.mission = missionStrip && missionStrip.ok ? renderOk("fact_strip", missionStrip.value) : "";
    html.contact = contact && contact.ok
      ? renderOk("contact", contact.value, withEdit(editEnabled, EDIT_KEYS.contactFacts))
      : "";
    html.cta = sections.cta && sections.cta.ok ? renderOk("cta", sections.cta.value) : "";
  }

  if (screenId === "R03") {
    const procedureItems = procedures.map((row, index) => ({
      id: row.id,
      serviceKey: row.procedureKey || row.serviceKey,
      displayName: row.displayName || row.name,
      summary: row.summary || row.description,
      iconUrl: row.iconUrl || null,
      href: clinic.clinicKey
        ? `/clinics/${clinic.clinicKey}/procedures/${row.procedureKey}`
        : null,
      sortOrder: index,
      visible: row.visible !== false,
    }));
    const procedureCollection = procedureItems.length
      ? adapter.adaptActiveClinicServicesCollection({
          clinic,
          services: procedureItems,
        })
      : null;

    sections.services = servicesCollection;
    sections.procedures = procedureCollection;
    html.header = renderOk(
      "section_header",
      {
        title: clinic.servicesPageTitle || "Our Services",
        lead: clinic.servicesIntro || null,
      },
      withEdit(editEnabled, EDIT_KEYS.servicesIntro)
    );
    html.services = servicesCollection && servicesCollection.ok
      ? renderOk("collection_grid", servicesCollection.value, withEdit(editEnabled, {}))
      : "";
    html.proceduresHeading = procedureCollection && procedureCollection.ok && procedureCollection.value.items.length
      ? renderOk("section_header", { title: "Procedures & diagnostics", lead: null })
      : "";
    html.procedures = procedureCollection && procedureCollection.ok
      ? renderOk("collection_grid", procedureCollection.value, withEdit(editEnabled, {}))
      : "";
    html.empty =
      !services.length && !procedures.length || editEnabled
        ? renderOk(
            "section_header",
            {
              title: clinic.servicesEmptyHeading || "Service listings are not available yet",
              lead: clinic.servicesEmptyBody || "This clinic has not published service listings yet.",
            },
            withEdit(editEnabled, EDIT_KEYS.servicesEmpty)
          )
        : "";
    html.cta = renderOk("cta", {
      heading: "Ready to book?",
      body: null,
      primaryCta: {
        label: clinic.publicBookingEnabled ? "Book Appointment" : "Request Appointment",
        url: paths.book,
      },
      secondaryCta: { label: "Pricing information", url: paths.pricing },
    });
  }

  if (screenId === "R04") {
    sections.doctors = doctorsCollection;
    html.header = renderOk(
      "section_header",
      {
        title: clinic.doctorsPageTitle || "Meet Our Doctors",
        lead: clinic.doctorsIntro || null,
      },
      withEdit(editEnabled, EDIT_KEYS.doctorsIntro)
    );
    html.doctors = doctorsCollection && doctorsCollection.ok
      ? renderOk("person_grid", doctorsCollection.value, withEdit(editEnabled, {}))
      : "";
    html.empty =
      !doctors.length || editEnabled
        ? renderOk(
            "section_header",
            {
              title: clinic.doctorsEmptyHeading || "Doctor listings are not available yet",
              lead: clinic.doctorsEmptyBody || "This clinic has not published doctor listings yet.",
            },
            withEdit(editEnabled, EDIT_KEYS.doctorsEmpty)
          )
        : "";
    html.cta = renderOk("cta", {
      heading: clinic.publicBookingEnabled ? "Book with a doctor" : "Plan a visit",
      body: null,
      primaryCta: {
        label: clinic.publicBookingEnabled ? "Book Appointment" : "Request Appointment",
        url: paths.book,
      },
      secondaryCta: { label: "Contact clinic", url: paths.contact },
    });
  }

  if (screenId === "R05") {
    const personResult = profile
      ? adapter.adaptActiveClinicDoctorToPerson(profile, { clinicKey: clinic.clinicKey })
      : null;
    let personDto = null;
    if (personResult && personResult.ok) {
      const bookingUrl =
        clinic.clinicKey && profile && profile.staffKey
          ? `/clinics/${clinic.clinicKey}/book?doctor=${encodeURIComponent(profile.staffKey)}`
          : paths.book;
      personDto = {
        ...personResult.value,
        // Profile page: book into existing wizard; avoid self "View Profile" CTA.
        cta: {
          label: clinic.publicBookingEnabled ? "Book Appointment" : "Request Appointment",
          url: bookingUrl,
        },
        secondaryCta: {
          label: "All doctors",
          url: paths.doctors,
        },
      };
    }
    sections.person = personDto ? { ok: true, value: personDto } : null;
    html.person = personDto ? renderOk("person_card", personDto) : "";
    html.cta = personDto
      ? renderOk("cta", {
          heading: clinic.publicBookingEnabled ? "Ready to book?" : "Need this clinician?",
          body: null,
          primaryCta: personDto.cta,
          secondaryCta: { label: "Contact clinic", url: paths.contact },
        })
      : "";
  }

  if (screenId === "R06") {
    const bookable =
      serviceKind === "consultation" && clinic.publicBookingEnabled && serviceDetail;
    const serviceForCard = serviceDetail
      ? {
          ...serviceDetail,
          summary: serviceDetail.summary || serviceDetail.description || null,
          body: serviceDetail.body || null,
          bookingUrl:
            bookable && clinic.clinicKey && serviceDetail.serviceKey
              ? `/clinics/${clinic.clinicKey}/book?service=${encodeURIComponent(serviceDetail.serviceKey)}`
              : null,
          bookingLabel: bookable
            ? clinic.publicBookingEnabled
              ? "Request this service"
              : "Request a visit"
            : null,
          ctaLabel: "Back to services",
          href: paths.services,
          detailHref: paths.services,
        }
      : null;
    const cardResult = serviceForCard
      ? adapter.adaptActiveClinicServiceToCard(serviceForCard, { clinicKey: clinic.clinicKey })
      : null;
    let detailCollection = null;
    if (cardResult && cardResult.ok) {
      const item = {
        ...cardResult.value,
        description:
          serviceDetail.body ||
          serviceDetail.summary ||
          cardResult.value.description ||
          null,
      };
      detailCollection = {
        cardKind: "offering",
        layoutVariant: "list",
        intro: null,
        emptyState: null,
        manageHref: null,
        items: [item],
      };
    }
    sections.service = detailCollection ? { ok: true, value: detailCollection } : null;
    html.header = renderOk("section_header", {
      eyebrow: serviceKind === "informational" ? "Information" : "Consultation",
      title: serviceDetail ? serviceDetail.displayName || serviceDetail.name || "Service" : "Service",
      lead: serviceDetail && serviceDetail.summary ? serviceDetail.summary : null,
    });
    html.service = detailCollection ? renderOk("collection_card", detailCollection, { single: true }) : "";
    if (bookable) {
      html.cta = renderOk("cta", {
        heading: "Request this service",
        body: null,
        primaryCta: {
          label: "Request this service",
          url: `/clinics/${clinic.clinicKey}/book?service=${encodeURIComponent(serviceDetail.serviceKey)}`,
        },
        secondaryCta: { label: "Pricing information", url: paths.pricing },
      });
    } else {
      html.cta = renderOk("cta", {
        heading: "Contact the clinic",
        body: "Online booking is not available for this service.",
        primaryCta: { label: "Contact clinic", url: paths.contact },
        secondaryCta: { label: "All services", url: paths.services },
      });
    }
  }

  if (screenId === "R07") {
    sections.contact = contact;
    sections.location = location;
    sections.hours = hours;
    html.header = renderOk(
      "section_header",
      {
        eyebrow: clinic.contactEyebrow || "Contact",
        title: clinic.contactPageTitle || (clinic.publicName ? `Contact ${clinic.publicName}` : "Contact"),
        lead: clinic.contactIntro || null,
      },
      withEdit(editEnabled, EDIT_KEYS.contactIntro)
    );
    html.contact = contact && contact.ok
      ? renderOk("contact", contact.value, withEdit(editEnabled, EDIT_KEYS.contactFacts))
      : "";
    html.location = location && location.ok ? renderOk("location", location.value) : "";
    html.hours = hours && hours.ok
      ? renderOk("hours", hours.value, withEdit(editEnabled, EDIT_KEYS.hoursFacts))
      : "";
    html.cta = renderOk("cta", {
      heading: "Visit us",
      body: null,
      primaryCta: { label: "Location & hours", url: paths.location },
      secondaryCta: {
        label: clinic.publicBookingEnabled ? "Book Appointment" : "Request Appointment",
        url: paths.book,
      },
    });
  }

  if (screenId === "R08") {
    sections.services = servicesCollection;
    html.header = renderOk(
      "section_header",
      {
        eyebrow: "Book an appointment",
        title: "Select service",
        lead:
          clinic.bookIntro ||
          "Choose the type of care you need. The clinic will confirm your appointment — this is not an automatic booking.",
      },
      withEdit(editEnabled, EDIT_KEYS.bookIntro)
    );
    html.cta = renderOk("cta", {
      heading: "Prefer to talk first?",
      body: null,
      primaryCta: { label: "Contact clinic", url: paths.contact },
      secondaryCta: { label: "Meet our doctors", url: paths.doctors },
    });
  }

  if (screenId === "R09") {
    sections.facilities = facilityList;
    sections.location = location;
    sections.hours = hours;
    sections.contact = contact;
    sections.gallery = gallery;
    sections.servicesPreview = limitCollection(servicesCollection, 4);
    html.header = renderOk(
      "section_header",
      {
        eyebrow: clinic.locationEyebrow || "Visit us",
        title: clinic.locationPageTitle || "Facilities & clinic info",
        lead: clinic.locationIntro || null,
      },
      withEdit(editEnabled, EDIT_KEYS.locationIntro)
    );
    html.facilities = facilityList && facilityList.ok ? renderOk("data_list", facilityList.value) : "";
    html.location = location && location.ok ? renderOk("location", location.value) : "";
    html.hours = hours && hours.ok
      ? renderOk("hours", hours.value, withEdit(editEnabled, EDIT_KEYS.hoursFacts))
      : "";
    html.contact = contact && contact.ok
      ? renderOk("contact", contact.value, withEdit(editEnabled, EDIT_KEYS.contactFacts))
      : "";
    html.gallery =
      gallery && gallery.ok && gallery.value.items && gallery.value.items.length
        ? renderOk("gallery", gallery.value)
        : "";
    html.services =
      sections.servicesPreview && sections.servicesPreview.ok && sections.servicesPreview.value.items.length
        ? renderOk("collection_grid", sections.servicesPreview.value)
        : "";
    html.empty = !(Array.isArray(clinic.facilities) && clinic.facilities.length)
      ? renderOk("section_header", {
          title: "Location details are not published yet",
          lead: "This clinic has not published facility addresses yet.",
        })
      : "";
    html.cta = renderOk("cta", {
      heading: "Need directions or a visit?",
      body: null,
      primaryCta: { label: "Contact clinic", url: paths.contact },
      secondaryCta: {
        label: clinic.publicBookingEnabled ? "Book Appointment" : "Request Appointment",
        url: paths.book,
      },
    });
  }

  if (screenId === "R10") {
    sections.gallery = gallery;
    html.header = renderOk(
      "section_header",
      {
        title: clinic.galleryHeading || (customPage && customPage.title) || "Clinic environment",
        lead: clinic.galleryIntro || (customPage && customPage.summary) || null,
      },
      withEdit(editEnabled, EDIT_KEYS.galleryIntro)
    );
    html.gallery =
      gallery && gallery.ok && gallery.value.items && gallery.value.items.length
        ? renderOk("gallery", gallery.value)
        : "";
    html.empty = !(gallery && gallery.ok && gallery.value.items && gallery.value.items.length)
      ? renderOk("section_header", {
          title: "Gallery photos are not published yet",
          lead: "Clinic environment images use the shared website media library when published.",
        })
      : "";
    html.cta = renderOk("cta", {
      heading: "Plan a visit",
      body: null,
      primaryCta: { label: "Location & hours", url: paths.location },
      secondaryCta: { label: "Contact clinic", url: paths.contact },
    });
  }

  if (screenId === "R11") {
    const content = asObject(clinic.websiteContent);
    const title = clinic.patientInformationTitle || content["patient.info_title"] || "Patient information";
    const body = clinic.patientInformationBody || content["patient.info_body"] || null;
    const checklist = Array.isArray(content["patient.checklist"])
      ? content["patient.checklist"]
      : Array.isArray(clinic.patientChecklist)
        ? clinic.patientChecklist
        : [];
    const patientFaq = Array.isArray(content["patient.faq"])
      ? content["patient.faq"]
      : Array.isArray(clinic.patientFaq)
        ? clinic.patientFaq
        : [];
    const announcementRaw = content["patient.announcement"] || clinic.patientAnnouncement || null;
    const guidanceImage = content["patient.image"] || clinic.patientGuidanceImage || null;

    html.header = renderOk(
      "section_header",
      {
        eyebrow: content["patient.eyebrow"] || clinic.patientEyebrow || "Guidance",
        title,
        lead: null,
      },
      withEdit(editEnabled, { title: "patient.info_title" })
    );
    html.body = renderOk(
      "rich_text",
      { heading: null, body: body || "" },
      withEdit(editEnabled, { body: "patient.info_body" })
    );

    if (checklist.length) {
      const rows = checklist
        .map((item, index) => {
          if (item == null) return null;
          if (typeof item === "string") {
            return { label: `Step ${index + 1}`, value: item, displayOrder: index };
          }
          if (typeof item === "object") {
            const label = item.label || item.title || `Step ${index + 1}`;
            const value = item.value || item.body || item.text || "";
            if (!value) return null;
            return { label: String(label), value: String(value), displayOrder: index };
          }
          return null;
        })
        .filter(Boolean);
      if (rows.length) {
        html.checklist = renderOk("data_list", {
          heading: content["patient.checklist_heading"] || "Before you visit",
          rows,
          emptyState: null,
        });
      } else {
        html.checklist = "";
      }
    } else {
      html.checklist = "";
    }

    if (patientFaq.length) {
      html.faq = renderOk("faq_list", {
        heading: content["patient.faq_heading"] || "Common questions",
        lead: null,
        items: patientFaq.map((item, index) => ({
          question: item.question || item.title,
          answer: item.answer || item.body || item.description,
          displayOrder: index,
          visibility: item.visibility !== false,
        })),
      });
    } else {
      html.faq = "";
    }

    if (guidanceImage || content["patient.image_text_body"]) {
      html.imageText = renderOk("image_text", {
        heading: content["patient.image_text_heading"] || null,
        body: content["patient.image_text_body"] || null,
        image: guidanceImage,
        imagePosition: "start",
        cta: null,
      });
    } else {
      html.imageText = "";
    }

    if (announcementRaw) {
      const ann =
        typeof announcementRaw === "string"
          ? { title: null, body: announcementRaw }
          : asObject(announcementRaw);
      html.announcement = renderOk("announcement", {
        title: ann.title || "Please note",
        body: ann.body || ann.text || null,
        cta: ann.cta || null,
        visibility: true,
        displayOrder: 0,
      });
    } else {
      html.announcement = "";
    }

    html.cta = renderOk("cta", {
      heading: clinic.publicBookingEnabled ? "Ready to book?" : "Need help?",
      body: null,
      primaryCta: {
        label: clinic.publicBookingEnabled ? "Book Appointment" : "Request Appointment",
        url: paths.book,
      },
      secondaryCta: { label: "Contact clinic", url: paths.contact },
    });
  }

  if (screenId === "R12") {
    const modules = composeModularPageModules({
      clinic,
      customPage,
      pageBlocks,
      websiteEdit: editEnabled,
    });
    sections.modules = modules;
    html.modules = modules;
    html.header =
      customPage && customPage.title && !modules.some((m) => m.component === "hero")
        ? renderOk("section_header", {
            title: customPage.title,
            lead: customPage.summary || customPage.meta_description || null,
          })
        : "";
    if (!modules.length && !(customPage && customPage.title)) {
      html.empty = renderOk("section_header", {
        title: "This page has no published content yet",
        lead: "Compose this page from shared website components in the clinic website editor.",
      });
    } else {
      html.empty = "";
    }
    const contactModule = contact && contact.ok ? renderOk("contact", contact.value) : "";
    if (contactModule && !modules.some((m) => m.component === "contact")) {
      html.contact = contactModule;
    } else {
      html.contact = "";
    }
    html.cta = renderOk("cta", {
      heading: "Questions?",
      body: null,
      primaryCta: { label: "Contact clinic", url: paths.contact },
      secondaryCta: {
        label: clinic.publicBookingEnabled ? "Book Appointment" : "Request Appointment",
        url: paths.book,
      },
    });
  }

  return {
    ok: true,
    wired: true,
    screenId,
    template,
    paths,
    branding: branding && branding.ok ? branding.value : null,
    navigation: navigation && navigation.ok ? navigation.value : null,
    sections,
    html,
    editEnabled,
    metrics: {
      sharedComponentsUsed: Object.values(html).filter((chunk) => {
        if (!chunk) return false;
        if (typeof chunk === "string") return chunk.includes("data-gp-website-component");
        if (Array.isArray(chunk)) {
          return chunk.some((mod) => mod && String(mod.html || "").includes("data-gp-website-component"));
        }
        return false;
      }).length,
      doctorsCount: doctors.length,
      servicesCount: services.length,
      proceduresCount: procedures.length,
      galleryCount: galleryRows.length,
      moduleCount: Array.isArray(html.modules) ? html.modules.length : 0,
    },
  };
}

function isStitchPublicTemplate(template) {
  return Boolean(WIRED_TEMPLATES[String(template || "")]);
}

function isGalleryPageSlug(slug) {
  return GALLERY_PAGE_SLUGS.includes(String(slug || "").trim().toLowerCase());
}

module.exports = {
  WIRED_TEMPLATES,
  EDIT_KEYS,
  GALLERY_PAGE_SLUGS,
  isStitchPublicTemplate,
  isGalleryPageSlug,
  buildActiveClinicStitchPublicPage,
};
