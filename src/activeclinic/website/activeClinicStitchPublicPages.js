"use strict";

/**
 * ActiveClinic Stitch Batch 2 — public foundation page presentation (R01–R03).
 *
 * Builds validated platform presentation DTOs + rendered shared-component HTML
 * from already-resolved clinic/domain locals. Does not invent clinical copy.
 * Does not create a second services/doctors store.
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
  contact: {},
});

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

/**
 * @param {{
 *   template: string,
 *   clinic: object,
 *   services?: object[],
 *   doctors?: object[],
 *   procedures?: object[],
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

  const bundleInput = {
    clinic,
    doctors,
    services,
    navItems: opts.navItems,
  };

  const branding = adapter.adaptActiveClinicBranding(bundleInput);
  const hero = enrichHero(clinic, adapter.adaptActiveClinicHero(bundleInput), paths);
  const about = adapter.adaptActiveClinicAbout(bundleInput);
  const contact = adapter.adaptActiveClinicContact(bundleInput);
  const hours = adapter.adaptActiveClinicHours(bundleInput);
  const location = adapter.adaptActiveClinicLocation(bundleInput);
  const promo = adapter.adaptActiveClinicPromoCta(bundleInput);
  const navigation = adapter.adaptActiveClinicNavigation(bundleInput);
  const doctorsCollection = adapter.adaptActiveClinicDoctorsCollection(bundleInput);
  const servicesCollection = adapter.adaptActiveClinicServicesCollection(bundleInput);
  const faqCollection = adapter.adaptActiveClinicFaqCollection(bundleInput);
  const trust = buildTrustFactStrip(clinic, hours, contact, paths);
  const missionStrip = buildAboutMissionStrip(clinic, clinic.websiteContent);

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
        lead: null,
        cta: { label: "View all", url: paths.services },
      },
      withEdit(editEnabled, { title: "home.preview.services_heading" })
    );
    html.services = sections.servicesPreview && sections.servicesPreview.ok
      ? renderOk("collection_grid", sections.servicesPreview.value)
      : "";
    html.doctorsHeading = renderOk(
      "section_header",
      {
        title: clinic.homePreviewDoctorsHeading || "Meet Our Doctors",
        lead: null,
        cta: { label: "View doctors", url: paths.doctors },
      },
      withEdit(editEnabled, { title: "home.preview.doctors_heading" })
    );
    html.doctors = sections.doctorsPreview && sections.doctorsPreview.ok
      ? renderOk("person_grid", sections.doctorsPreview.value)
      : "";
    html.conversion = sections.conversion && sections.conversion.ok
      ? renderOk("cta", sections.conversion.value)
      : "";
    html.promo = promo && promo.ok && (clinic.showPromo || editEnabled)
      ? renderOk("cta", promo.value, withEdit(editEnabled, EDIT_KEYS.promo))
      : "";
    html.contact = contact && contact.ok ? renderOk("contact", contact.value) : "";
    html.location = location && location.ok ? renderOk("location", location.value) : "";
    html.hours = hours && hours.ok ? renderOk("hours", hours.value) : "";
    if (faqCollection && faqCollection.ok && faqCollection.value.items.length) {
      html.faq = renderOk("faq_list", {
        heading: clinic.faqHeading || faqCollection.value.intro || "Questions",
        lead: null,
        items: faqCollection.value.items.map((item, index) => ({
          question: item.title,
          answer: item.description,
          displayOrder: index,
          visibility: true,
        })),
      });
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
    html.contact = contact && contact.ok ? renderOk("contact", contact.value) : "";
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
      ? renderOk("collection_grid", servicesCollection.value)
      : "";
    html.proceduresHeading = procedureCollection && procedureCollection.ok && procedureCollection.value.items.length
      ? renderOk("section_header", { title: "Procedures & diagnostics", lead: null })
      : "";
    html.procedures = procedureCollection && procedureCollection.ok
      ? renderOk("collection_grid", procedureCollection.value)
      : "";
    html.empty = (!services.length && !procedures.length)
      ? renderOk("section_header", {
          title: clinic.servicesEmptyHeading || "Service listings are not available yet",
          lead: clinic.servicesEmptyBody || "This clinic has not published service listings yet.",
        })
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
      sharedComponentsUsed: Object.values(html).filter((chunk) => chunk && String(chunk).includes("data-gp-website-component")).length,
      doctorsCount: doctors.length,
      servicesCount: services.length,
      proceduresCount: procedures.length,
    },
  };
}

function isStitchPublicTemplate(template) {
  return Boolean(WIRED_TEMPLATES[String(template || "")]);
}

module.exports = {
  WIRED_TEMPLATES,
  EDIT_KEYS,
  isStitchPublicTemplate,
  buildActiveClinicStitchPublicPage,
};
