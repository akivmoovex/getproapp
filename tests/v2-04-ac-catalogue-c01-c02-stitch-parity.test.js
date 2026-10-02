"use strict";

/**
 * V2.04 AC-MW-C01 / C02 true Stitch parity contracts.
 * Structure + markers + tokens + E03 catalogue wiring — not route smoke alone.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const ejs = require("ejs");

const ROOT = path.join(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function renderCatalogue(tab, extraCms) {
  const tpl = read("views/activeclinic/app/website-cms-catalogue.ejs");
  const doctors = [
    {
      id: "d1",
      kind: "doctor",
      name: "Dr. Marcus Vance",
      title: "Senior GP",
      specialty: "General Practice",
      qualifications: "MBBS, FRACGP",
      bio: "Preventative care specialist.",
      websiteVisible: true,
      canShow: false,
      canHide: true,
      needsProfile: false,
      inactive: false,
      bookable: false,
      image: { mediaId: "", src: "", alt: "" },
      editHref: "/app/settings/website/catalogue/doctors/d1/edit",
    },
    {
      id: "d2",
      kind: "doctor",
      name: "Dr. Lucas Meyer",
      title: "",
      specialty: "Orthopaedics",
      qualifications: "",
      bio: "",
      websiteVisible: false,
      canShow: false,
      canHide: false,
      needsProfile: true,
      inactive: false,
      bookable: false,
      image: { mediaId: "", src: "", alt: "" },
      editHref: "/app/settings/website/catalogue/doctors/d2/edit",
    },
  ];
  const services = [
    {
      id: "s1",
      kind: "service",
      name: "General Consultation (Standard)",
      description: "Comprehensive health review.",
      subtitle: "General Practice",
      category: "General Practice",
      publicSummary: "General Practice",
      defaultDurationMinutes: 15,
      websiteVisible: true,
      canShow: false,
      canHide: true,
      needsProfile: false,
      inactive: false,
      bookable: true,
      editHref: "/app/settings/website/catalogue/services/s1/edit",
    },
    {
      id: "s2",
      kind: "service",
      name: "Travel Medicine",
      description: "Immunisation consult.",
      subtitle: "Preventative Health",
      category: "Preventative Health",
      publicSummary: "Preventative Health",
      defaultDurationMinutes: 20,
      websiteVisible: false,
      canShow: true,
      canHide: false,
      needsProfile: false,
      inactive: false,
      bookable: false,
      editHref: "/app/settings/website/catalogue/services/s2/edit",
    },
  ];
  return ejs.render(
    tpl,
    {
      pageData: {
        cms: {
          tab,
          doctors,
          services,
          canEdit: true,
          clinicKey: "demo-clinic",
          previewHref: `/clinics/demo-clinic/${tab}`,
          returnTo: "",
          saved: false,
          error: "",
          ...(extraCms || {}),
        },
        cmsNav: { active: "catalogue" },
      },
      shell: { healthcareOrganization: { publicName: "Demo Clinic" } },
      csrfField: "_csrf",
      csrfToken: "tok",
    },
    { filename: path.join(ROOT, "views/activeclinic/app/website-cms-catalogue.ejs") }
  );
}

describe("V2.04 AC C01/C02 true Stitch catalogue parity", () => {
  it("C01 route template renders Stitch marker", () => {
    const html = renderCatalogue("services");
    assert.match(html, /data-ac-stitch-screen="C01"/);
    assert.match(html, /data-ac-stitch-screen-mobile="C01-M"/);
    assert.match(html, /data-ac-stitch-id="d64d1134d165472b8d80b5587eef84f8"/);
  });

  it("C02 route template renders Stitch marker", () => {
    const html = renderCatalogue("doctors");
    assert.match(html, /data-ac-stitch-screen="C02"/);
    assert.match(html, /data-ac-stitch-screen-mobile="C02-M"/);
    assert.match(html, /data-ac-stitch-id="9a9ba9d9c7594f7d8190f77216a7c6d3"/);
  });

  it("C01 desktop structure contract", () => {
    const html = renderCatalogue("services");
    assert.match(html, /data-ac-catalogue-desktop="1"/);
    assert.match(html, /data-ac-catalogue-table="services"/);
    assert.match(html, /Service Name &amp; Duration|Service Name & Duration/);
    assert.match(html, /Category \/ Department/);
    assert.match(html, /Public Description/);
    assert.match(html, /Price Display/);
    assert.match(html, /data-ac-catalogue-breadcrumb="1"/);
    assert.match(html, /data-ac-catalogue-banner="1"/);
    assert.match(html, /data-ac-catalogue-stats="1"/);
    assert.match(html, /General Consultation \(Standard\)/);
    assert.match(html, /15 mins/);
    assert.match(html, /Contact clinic/);
    assert.match(html, /ac-mw-c-chip--published/);
    assert.match(html, /data-ac-catalogue-action="edit"/);
    assert.match(html, /data-ac-catalogue-action="hide"/);
  });

  it("C01 mobile structure contract", () => {
    const html = renderCatalogue("services");
    assert.match(html, /data-ac-catalogue-mobile="1"/);
    assert.match(html, /data-ac-catalogue-sticky="1"/);
    assert.match(html, /ac-mw-c-card__title/);
    assert.match(html, /Edit Service/);
    assert.match(html, /Add service/);
    assert.match(html, /Preview Public/);
  });

  it("C02 desktop structure contract", () => {
    const html = renderCatalogue("doctors");
    assert.match(html, /data-ac-catalogue-desktop="1"/);
    assert.match(html, /data-ac-catalogue-table="doctors"/);
    assert.match(html, /Practitioner &amp; Photo|Practitioner & Photo/);
    assert.match(html, /Specialty &amp; Department|Specialty & Department/);
    assert.match(html, /Public Bio Summary/);
    assert.match(html, /Public Status/);
    assert.match(html, /Dr\. Marcus Vance/);
    assert.match(html, /ac-mw-c-avatar/);
    assert.match(html, /ac-mw-c-chip--incomplete/);
    assert.match(html, /Complete/);
  });

  it("C02 mobile structure contract", () => {
    const html = renderCatalogue("doctors");
    assert.match(html, /data-ac-catalogue-mobile="1"/);
    assert.match(html, /Edit Public Profile|Complete Profile/);
    assert.match(html, /data-ac-catalogue-sticky="1"/);
    assert.match(html, /Add doctor/);
  });

  it("C01/C02 CSS uses frozen AC tokens (not hardcoded Stitch hex theme)", () => {
    const css = read("public/activeclinic/website-cms.css");
    assert.match(css, /AC-MW-C01 \/ C02 catalogue Stitch parity/);
    assert.match(css, /--ac-c-primary:\s*var\(--ac-mw-primary/);
    assert.match(css, /\.ac-mw-c-table/);
    assert.match(css, /\.ac-mw-c-cards/);
    assert.match(css, /\.ac-mw-c-sticky/);
    assert.match(css, /@media \(max-width:\s*899px\)/);
    assert.match(css, /@media \(max-width:\s*390px\)/);
    // Must not introduce a parallel purple/indigo hard theme for catalogue.
    assert.doesNotMatch(css, /\.ac-mw-catalogue--stitch[^{]*\{[^}]*#7c3aed/i);
  });

  it("E03 doctor image editor integration on catalogue form", () => {
    const form = read("views/activeclinic/app/website-cms-catalogue-doctor-form.ejs");
    assert.match(form, /data-ac-stitch-screen="C02"/);
    assert.match(form, /data-ac-stitch-editor="E03"/);
    assert.match(form, /framingEnabled:\s*true/);
    assert.match(form, /catalogue\.doctor\.photo/);
    const media = read("views/platform/website/partials/media-field.ejs");
    assert.match(media, /Upload from computer/);
    assert.match(media, /Choose from Content Library/);
    assert.match(media, /Adjust Picture/);
    assert.match(media, /Remove image/);
  });

  it("empty state still implemented for C01 and C02", () => {
    const emptyServices = renderCatalogue("services", { services: [], doctors: [] });
    assert.match(emptyServices, /data-ac-catalogue-empty="services"/);
    const emptyDoctors = renderCatalogue("doctors", { services: [], doctors: [] });
    assert.match(emptyDoctors, /data-ac-catalogue-empty="doctors"/);
  });

  it("screen map documents resolved Stitch IDs", () => {
    const map = read("docs/design/stitch-exports/AC_MW_C01_C02_E03_SCREEN_MAP.md");
    assert.match(map, /d64d1134d165472b8d80b5587eef84f8/);
    assert.match(map, /9fc7495dee354f8f8f945b928abb1914/);
    assert.match(map, /9a9ba9d9c7594f7d8190f77216a7c6d3/);
    assert.match(map, /d772e512d7284473bd10d8895944957c/);
    assert.match(map, /c37072acba8c437fb334234845dbf930/);
    assert.match(map, /09401aea3f1d4cc68c54305733566f39/);
  });

  it("data authority and privacy modules unchanged (no second catalogue domain)", () => {
    const coverage = read("src/activeclinic/website/activeClinicWebsiteEditorCoverage.js");
    assert.match(coverage, /appointment_service_types via public catalogue/);
    assert.match(coverage, /staff public profiles via public catalogue/);
    const policy = read("src/activeclinic/website/publicCatalogueFieldPolicy.js");
    assert.match(policy, /PUBLIC_DOCTOR_FIELDS|projectPublicDoctor/);
    const routes = read("src/activeclinic/http/activeClinicWebsiteCmsRoutes.js");
    assert.match(routes, /requirePermission\(viewOrEdit\)/);
    assert.match(routes, /catalogueService\.loadCatalogue/);
  });
});
