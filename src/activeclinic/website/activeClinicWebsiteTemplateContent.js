"use strict";

/**
 * Authoritative ActiveClinic public-website template copy.
 * Source: ActiveClinic Demo Centre public page structure
 * (`activeClinicDemoClinicSpec`) plus the existing tenant page set
 * (home, about, services, doctors, location, contact, book, footer).
 * Not Juflona-named clinicians or HPCZ claims.
 *
 * Each new clinic receives a cloned, tenant-owned draft. Sample
 * services/clinicians are labeled placeholders, never operational records.
 */

const PLACEHOLDER_LABEL = "Template example — replace with your clinic’s information.";
const HERO_IMAGE_SRC = "/activeclinic/assets/clinic-hero-default.jpg";

function clinicName(raw) {
  const name = String(raw || "").trim();
  return name || "your clinic";
}

function interpolate(text, name) {
  return String(text || "").split("{clinicName}").join(name);
}

function exampleServices() {
  return [
    {
      name: "Example: General consultation",
      summary: `${PLACEHOLDER_LABEL} Demonstration consultation listing from the ActiveClinic demo website — not a published service of this clinic.`,
    },
    {
      name: "Example: Follow-up visit",
      summary: `${PLACEHOLDER_LABEL} Demonstration follow-up listing only. Not a published service of this clinic.`,
    },
    {
      name: "Example: Vital check",
      summary: `${PLACEHOLDER_LABEL} Demonstration vital-check listing only. Not a published service of this clinic.`,
    },
  ];
}

function exampleClinicians() {
  return [
    {
      name: "Sample clinician (template)",
      title: "Template profile — not a member of this clinic",
      bio: `${PLACEHOLDER_LABEL} Fictional clinician card from the ActiveClinic demo website structure. This person does not work here.`,
    },
    {
      name: "Sample nurse (template)",
      title: "Template profile — not a member of this clinic",
      bio: `${PLACEHOLDER_LABEL} Fictional nursing card for layout only. This person does not work here.`,
    },
  ];
}

/**
 * @param {{
 *   publicName?: string|null,
 *   phone?: string|null,
 *   email?: string|null,
 *   address?: string|null,
 *   hours?: string|null,
 * }} [input]
 */
function buildActiveClinicWebsiteTemplateContent(input) {
  const extra = input && typeof input === "object" ? input : {};
  const name = clinicName(extra.publicName);
  const phone = String(extra.phone || extra.contactPhone || "").trim();
  const email = String(extra.email || extra.contactEmail || "").trim();
  const address = String(extra.address || "").trim();
  const hours = String(extra.hours || "").trim();
  return {
    "home.hero.title": name === "your clinic" ? null : name,
    "home.hero.subtitle": interpolate(
      `Welcome to {clinicName}. Find opening hours, location, and how to book a visit. This public website uses the ActiveClinic clinic template so patients can learn who you are and how to get in touch. ${PLACEHOLDER_LABEL} It is not a clinical claim.`,
      name
    ),
    "home.hero.eyebrow": "Community clinic",
    "home.hero.image": {
      src: HERO_IMAGE_SRC,
      alt: interpolate("Template photo for {clinicName}", name),
    },
    "about.story.heading": interpolate("About {clinicName}", name),
    "about.story.body": interpolate(
      `{clinicName} is getting started on ActiveClinic. Use this page to tell patients who you are, what to expect on a visit, and how to get in touch. ${PLACEHOLDER_LABEL} Replace this description with your own clinic story. Do not present template copy as a medical claim, specialty list, or certification.`,
      name
    ),
    "services.page_title": "Services",
    "services.intro": interpolate(
      `Browse care offerings {clinicName} chooses to publish. Listings appear here when the clinic publishes services from clinic operations.`,
      name
    ),
    "services.empty_heading": "No public services yet",
    "services.empty_body": interpolate(
      `{clinicName} has not published a public service catalogue yet. Use clinic operations to add consultations and procedures patients can book.`,
      name
    ),
    "services.examples": exampleServices(),
    "doctors.page_title": "Our Doctors",
    "doctors.intro": interpolate(
      `Meet clinicians when {clinicName} publishes public profiles.`,
      name
    ),
    "doctors.empty_heading": "No public clinician profiles yet",
    "doctors.empty_body": interpolate(
      `{clinicName} has not published public clinician profiles yet. Use staff settings to enable profiles patients can see.`,
      name
    ),
    "doctors.examples": exampleClinicians(),
    "contact.eyebrow": "Contact",
    "contact.page_title": interpolate("Contact {clinicName}", name),
    "contact.aside_heading": "Clinic contact",
    "contact.intro": interpolate(
      `Contact {clinicName} for appointments and enquiries. Staff review messages during business hours. This form does not send SMS or email confirmation.`,
      name
    ),
    "contact.phone": phone || null,
    "contact.email": email || null,
    "about.eyebrow": "About",
    "location.eyebrow": "Visit us",
    "location.page_title": "Location & hours",
    "location.intro": interpolate(
      `Visit {clinicName}. Address and hours below combine registration details with template guidance. Example hours are placeholders until the clinic publishes real opening times.`,
      name
    ),
    "location.address": address || null,
    "location.hours":
      hours ||
      `Example hours (${PLACEHOLDER_LABEL})\nMon–Thu 08:00–17:00\nFri 08:00–16:00\nSat 09:00–12:00\nSun Closed`,
    "book.intro": interpolate(
      `Book an appointment with {clinicName}. Online booking is available when the clinic enables it. Clinic staff review requests before confirmation.`,
      name
    ),
    "footer.tagline": interpolate("{clinicName} · Powered by ActiveClinic", name),
    "footer.legal":
      "This website does not provide emergency medical care. In an emergency call local emergency services.",
    "home.promo.heading": "Plan your visit",
    "home.promo.body": interpolate(
      `Call or book online when you are ready. {clinicName} will confirm the next available slot. ${PLACEHOLDER_LABEL}`,
      name
    ),
    "home.faq_heading": "Questions",
    "home.preview.services_heading": "Services",
    "home.preview.doctors_heading": "Doctors",
    "home.preview.visit_heading": "Visit us",
    "pricing.page_title": "Pricing",
    "pricing.intro": interpolate(
      `Fees listed here are only those {clinicName} has chosen to publish. Contact the clinic for anything not shown.`,
      name
    ),
    "patient.info_title": "Patient information",
    "patient.info_body":
      "Please bring a valid identity document to your visit when required by the clinic. Online appointment requests are subject to clinic confirmation.",
    "nav.about.label": "About",
    "nav.services.label": "Services",
    "nav.doctors.label": "Doctors",
    "nav.contact.label": "Contact",
    "nav.location.label": "Location",
    "nav.pricing.label": "Pricing",
    "nav.patient_information.label": "Patient information",
    "page.patient_information.visible": true,
    "home.faq": [
      {
        question: "How do I book?",
        answer: interpolate(
          `Use Book appointment on this website, or contact {clinicName} by phone or email.`,
          name
        ),
      },
      {
        question: "Is this emergency care?",
        answer: "No. This website does not provide emergency medical care. Call local emergency services.",
      },
      {
        question: "Are the example services and clinicians real?",
        answer: `${PLACEHOLDER_LABEL} Sample listings are layout examples only. They are not this clinic’s published catalogue or staff.`,
      },
    ],
    "home.testimonials": [],
    "page.pricing.visible": false,
    "page.doctors.visible": true,
    "page.insurance.visible": false,
    "section.testimonials.visible": false,
    "section.faq.visible": true,
    "section.promo.visible": true,
    "insurance.intro": `${PLACEHOLDER_LABEL} Add insurance information when you are ready. This is template copy, not a coverage claim.`,
    "cms.pages": require("./clinicWebsiteCms").defaultPages(),
    "cms.sections": require("./clinicWebsiteCms").defaultHomeSections(),
    "cms.blocks": [],
  };
}

module.exports = {
  PLACEHOLDER_LABEL,
  HERO_IMAGE_SRC,
  buildActiveClinicWebsiteTemplateContent,
  interpolate,
};
