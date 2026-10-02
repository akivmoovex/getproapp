"use strict";

/**
 * V2.04 AC public-site management fix pack.
 * Focused contracts for catalogue manage routes, RBAC wiring, pricing edit links,
 * public-field privacy, and Contact R07 Stitch parity — no second domains.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const ejs = require("ejs");

const adapter = require("../src/activeclinic/website/activeClinicWebsitePresentationAdapter");
const {
  buildActiveClinicStitchPublicPage,
} = require("../src/activeclinic/website/activeClinicStitchPublicPages");
const {
  renderPresentationComponent,
} = require("../src/platform/website/presentation/componentLibrary");
const {
  projectPublicDoctor,
  projectPublicService,
  PUBLIC_DOCTOR_FIELDS,
  FORBIDDEN_PUBLIC_FIELD_HINTS,
} = require("../src/activeclinic/website/publicCatalogueFieldPolicy");

const ROOT = path.join(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function sampleClinic(extra) {
  return {
    clinicKey: "demo-clinic",
    publicName: "Demo Clinic",
    publicBookingEnabled: true,
    publicPhoneDisplay: "+1 555 0100",
    publicEmailDisplay: "care@demo.example",
    doctorsIntro: "Published clinicians only.",
    servicesIntro: "Our services",
    publicPagePaths: {
      home: "/clinics/demo-clinic",
      services: "/clinics/demo-clinic/services",
      doctors: "/clinics/demo-clinic/doctors",
      contact: "/clinics/demo-clinic/contact",
      book: "/clinics/demo-clinic/book",
      pricing: "/clinics/demo-clinic/pricing",
      location: "/clinics/demo-clinic/location",
    },
    websiteContent: {},
    doctors: [
      {
        id: "d1",
        staffKey: "ada",
        displayName: "Dr Ada",
        title: "GP",
        specialty: "Family medicine",
        bio: "Experienced clinician",
        photoUrl: "/media/ada.jpg",
      },
    ],
    services: [
      {
        id: "s1",
        serviceKey: "dental",
        displayName: "Dental",
        summary: "Dental care",
        body: "Comprehensive dental assessments.",
        bookable: true,
      },
    ],
    facilities: [
      {
        isPrimary: true,
        addressLine1: "1 Medical Arts Tower",
        city: "Lusaka",
        countryCode: "ZM",
      },
    ],
    ...(extra || {}),
  };
}

describe("V2.04 AC public-site management fix pack", () => {
  it("1/2 services + doctors manageHref resolve to catalogue ?tab= routes", () => {
    const clinic = sampleClinic();
    const services = adapter.adaptActiveClinicServicesCollection({ clinic, services: clinic.services });
    const doctors = adapter.adaptActiveClinicDoctorsCollection({ clinic, doctors: clinic.doctors });
    assert.equal(services.ok, true);
    assert.equal(doctors.ok, true);
    assert.match(services.value.manageHref, /\/app\/settings\/website\/catalogue\?tab=services/);
    assert.match(doctors.value.manageHref, /\/app\/settings\/website\/catalogue\?tab=doctors/);
    assert.doesNotMatch(services.value.manageHref, /\/catalogue\/services$/);
    assert.doesNotMatch(doctors.value.manageHref, /\/catalogue\/doctors$/);
    assert.match(services.value.manageHref, /returnTo=/);
    assert.match(decodeURIComponent(services.value.manageHref), /website_edit=1/);
    assert.match(decodeURIComponent(doctors.value.manageHref), /website_mode=draft/);

    const helperSvc = adapter.catalogueManageHref("services", clinic);
    const helperDoc = adapter.catalogueManageHref("doctors", clinic);
    assert.equal(helperSvc, services.value.manageHref);
    assert.equal(helperDoc, doctors.value.manageHref);
  });

  it("compat GET aliases exist for /catalogue/services and /catalogue/doctors", () => {
    const routes = read("src/activeclinic/http/activeClinicWebsiteCmsRoutes.js");
    assert.match(routes, /"\/app\/settings\/website\/catalogue\/services"/);
    assert.match(routes, /"\/app\/settings\/website\/catalogue\/doctors"/);
    assert.match(routes, /tab:\s*"services"/);
    assert.match(routes, /tab:\s*"doctors"/);
    assert.match(routes, /res\.redirect\(302/);
  });

  it("3/4 RBAC: catalogue list + aliases require auth and website.view|edit", () => {
    const routes = read("src/activeclinic/http/activeClinicWebsiteCmsRoutes.js");
    const listIdx = routes.indexOf('"/app/settings/website/catalogue"');
    const svcAlias = routes.indexOf('"/app/settings/website/catalogue/services"');
    const docAlias = routes.indexOf('"/app/settings/website/catalogue/doctors"');
    assert.ok(listIdx > 0 && svcAlias > listIdx && docAlias > listIdx);
    const slice = routes.slice(listIdx, svcAlias + 400);
    assert.match(slice, /requireAuth/);
    assert.match(slice, /requirePermission\(viewOrEdit\)/);
    assert.match(routes, /viewOrEdit\s*=\s*\["website\.view",\s*"website\.edit"\]/);
  });

  it("5 operational-data persistence stays on catalogue service / appointment_service_types", () => {
    const svc = read("src/activeclinic/website/clinicWebsiteCatalogueService.js");
    assert.match(svc, /appointment_service_types/);
    assert.match(svc, /public_profile_/);
    assert.match(svc, /createCatalogueService|updateCatalogueService/);
    assert.match(svc, /createCatalogueDoctor|updateCatalogueDoctor/);
    assert.doesNotMatch(svc, /website_content.*services\.items|JSON\.stringify\(\s*services\s*\)/);

    const affordance = read("views/activeclinic/tenant/services.ejs");
    assert.match(affordance, /Manage Public Catalogue/);
    assert.match(affordance, /catalogue\?tab=services/);
    assert.match(affordance, /returnTo=/);
  });

  it("6 public-field privacy allowlist strips private/internal doctor fields", () => {
    const projected = projectPublicDoctor({
      id: "d1",
      staffKey: "ada",
      displayName: "Dr Ada",
      title: "GP",
      specialty: "Family medicine",
      bio: "Public bio",
      photoUrl: "/m.jpg",
      email: "private@clinic.example",
      phone: "+260900000000",
      hasLogin: true,
      editHref: "/app/settings/website/catalogue/doctors/d1/edit",
      clinicalNotes: "secret",
      passwordHash: "x",
    });
    assert.ok(projected);
    assert.equal(projected.displayName, "Dr Ada");
    assert.equal(projected.email, undefined);
    assert.equal(projected.phone, undefined);
    assert.equal(projected.hasLogin, undefined);
    assert.equal(projected.editHref, undefined);
    assert.equal(projected.clinicalNotes, undefined);
    assert.equal(projected.passwordHash, undefined);
    for (const hint of ["email", "phone", "hasLogin", "editHref", "clinical"]) {
      assert.ok(
        FORBIDDEN_PUBLIC_FIELD_HINTS.some((h) => h.includes(hint) || hint.includes(h)),
        `expected forbidden hint coverage for ${hint}`
      );
    }
    assert.ok(PUBLIC_DOCTOR_FIELDS.includes("displayName"));

    const service = projectPublicService({
      id: "s1",
      serviceKey: "dental",
      name: "Dental",
      summary: "Care",
      internalBillingCode: "SECRET",
      editHref: "/app/x",
    });
    assert.equal(service.editHref, undefined);
    assert.equal(service.internalBillingCode, undefined);
  });

  it("7/8/9 pricing CTAs use publicPagePaths (edit-stamped) and stay clean in public mode", () => {
    const tpl = read("views/activeclinic/tenant/pricing.ejs");
    assert.match(tpl, /clinic\.publicPagePaths/);
    assert.match(tpl, /data-ac-pricing-cta="contact"/);
    assert.match(tpl, /data-ac-pricing-cta="services"/);
    assert.doesNotMatch(tpl, /href="\/clinics\/<%= clinic\.clinicKey %>\/contact"/);
    assert.doesNotMatch(tpl, /href="\/clinics\/<%= clinic\.clinicKey %>\/services"/);
    assert.doesNotMatch(tpl, /website_edit=1/);

    const editPaths = {
      contact: "/clinics/demo-clinic/contact?website_edit=1&website_mode=draft",
      services: "/clinics/demo-clinic/services?website_edit=1&website_mode=draft",
    };
    const publicPaths = {
      contact: "/clinics/demo-clinic/contact",
      services: "/clinics/demo-clinic/services",
    };

    function render(paths) {
      return ejs.render(
        tpl,
        {
          clinic: { clinicKey: "demo-clinic", publicName: "Demo", publicPagePaths: paths },
          pricingDisplay: { operationalCatalogue: [] },
          websiteEdit: false,
          include() {
            return "";
          },
        },
        { filename: path.join(ROOT, "views/activeclinic/tenant/pricing.ejs") }
      );
    }

    const editHtml = render(editPaths);
    assert.match(editHtml, /website_edit=1/);
    assert.match(editHtml, /website_mode=draft/);
    assert.match(editHtml, /\/contact\?website_edit=1&amp;website_mode=draft/);
    assert.match(editHtml, /\/services\?website_edit=1&amp;website_mode=draft/);

    const publicHtml = render(publicPaths);
    assert.doesNotMatch(publicHtml, /website_edit=/);
    assert.doesNotMatch(publicHtml, /website_mode=/);
    assert.match(publicHtml, /href="\/clinics\/demo-clinic\/contact"/);
    assert.match(publicHtml, /href="\/clinics\/demo-clinic\/services"/);
  });

  it("10 Contact R07 Stitch parity contract markers", () => {
    const contact = read("views/activeclinic/tenant/contact.ejs");
    const css = read("public/activeclinic/ac-stitch-public.css");
    assert.match(contact, /data-ac-stitch-screen="R07"/);
    assert.match(contact, /data-ac-stitch-parity="r07"/);
    assert.match(contact, /data-ac-contact-urgent="1"/);
    assert.match(contact, /Urgent Medical Notice/);
    assert.match(contact, /Send a Direct Message|contact\.form_heading/);
    assert.match(contact, /data-ac-contact-legal="1"/);
    assert.match(contact, /data-ac-contact-form="1"/);
    assert.match(contact, /\/app\/settings\/organization/);
    assert.doesNotMatch(contact, /createContactDomain|second contact store/i);
    assert.match(css, /ac-stitch-page--r07/);
    assert.match(css, /ac-stitch-urgent-notice/);

    const page = buildActiveClinicStitchPublicPage({
      template: "tenant/contact",
      clinic: sampleClinic(),
    });
    assert.equal(page.screenId, "R07");
    assert.match(page.html.contact, /data-gp-website-component="contact"/);
    assert.match(page.html.contact, /1 Medical Arts Tower|\+1 555 0100/);
  });

  it("manage links only render in edit mode for person/collection grids", () => {
    const clinic = sampleClinic();
    const doctors = adapter.adaptActiveClinicDoctorsCollection({ clinic, doctors: clinic.doctors });
    const services = adapter.adaptActiveClinicServicesCollection({
      clinic,
      services: clinic.services,
    });

    const publicDoctors = renderPresentationComponent("person_grid", doctors.value, {
      editEnabled: false,
    });
    const editDoctors = renderPresentationComponent("person_grid", doctors.value, {
      editEnabled: true,
    });
    assert.equal(publicDoctors.ok, true);
    assert.equal(editDoctors.ok, true);
    assert.doesNotMatch(publicDoctors.html, /Manage Doctors|data-ac-website-manage="doctors"/);
    assert.match(editDoctors.html, /Manage Doctors/);
    assert.match(editDoctors.html, /catalogue\?tab=doctors/);

    const publicServices = renderPresentationComponent("collection_grid", services.value, {
      editEnabled: false,
    });
    const editServices = renderPresentationComponent("collection_grid", services.value, {
      editEnabled: true,
    });
    assert.doesNotMatch(publicServices.html, /Manage Public Catalogue/);
    assert.match(editServices.html, /Manage Public Catalogue/);
    assert.match(editServices.html, /catalogue\?tab=services/);

    const stitchPublic = buildActiveClinicStitchPublicPage({
      template: "tenant/doctors",
      clinic,
      doctors: clinic.doctors,
      websiteEdit: false,
    });
    const stitchEdit = buildActiveClinicStitchPublicPage({
      template: "tenant/doctors",
      clinic,
      doctors: clinic.doctors,
      websiteEdit: true,
    });
    assert.doesNotMatch(stitchPublic.html.doctors, /Manage Doctors/);
    assert.match(stitchEdit.html.doctors, /Manage Doctors/);
  });

  it("services/doctors affordances and coverage point at operational catalogue", () => {
    const doctorsTpl = read("views/activeclinic/tenant/doctors.ejs");
    assert.match(doctorsTpl, /Manage Doctors/);
    assert.match(doctorsTpl, /catalogue\?tab=doctors/);
    const coverage = read("src/activeclinic/website/activeClinicWebsiteEditorCoverage.js");
    assert.match(coverage, /appointment_service_types via public catalogue/);
    assert.match(coverage, /staff public profiles via public catalogue/);
    assert.match(coverage, /catalogue\?tab=services/);
    assert.match(coverage, /catalogue\?tab=doctors/);
  });
});
