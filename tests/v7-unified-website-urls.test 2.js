"use strict";

/**
 * Shared public website URL builder for ActiveClinic and BlessBoard.
 * Product prefixes stay distinct; generation, aliases, and query handling are one service.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  PRODUCT_CODE,
  publicWebsitePathPrefix,
  publicOriginForProduct,
  appendQuery,
  buildPublicOrganizationWebsitePath,
  buildPublicOrganizationWebsiteUrl,
  buildPublicWebsiteEditPath,
  buildPublicWebsitePreviewPath,
  buildPublicWebsiteHistoryPath,
  buildPublicWebsiteSettingsPath,
  buildPublicWebsitePublishPath,
  buildPublicWebsiteAdminPath,
  canonicalRedirectFromAlias,
  canonicalPublicWebsiteRedirect,
  buildPublicWebsitePagePaths,
  attachClinicPublicWebsitePaths,
} = require("../src/platform/website/publicWebsiteUrl");
const { publicClinicPath } = require("../src/activeclinic/services/clinicWebsiteAvailabilityService");
const {
  publicChurchHomePath,
  publicChurchPagePath,
  publicBranchHomePath,
  publicBranchPagePath,
} = require("../src/blessboard/urls/churchUrlHelper");
const { presentSuggestedOrganizationKeyPreview } = require("../src/blessboard/services/registrationQueuePresentation");
const { churchWidePublicPathForPage } = require("../src/blessboard/http/singleSiteBranchPublicRedirect");
const { resolveWebsiteActionUrls } = require("../src/blessboard/urls/websiteActionUrls");

describe("v7 unified website URLs", () => {
  it("uses one builder for canonical public paths", () => {
    const ac = buildPublicOrganizationWebsitePath({
      product: PRODUCT_CODE.ACTIVECLINIC,
      organizationKey: "sunrise-clinic",
    });
    const bb = buildPublicOrganizationWebsitePath({
      product: PRODUCT_CODE.BLESSBOARD,
      organizationKey: "sunrise-church",
    });
    assert.equal(ac, "/clinics/sunrise-clinic");
    assert.equal(bb, "/c/sunrise-church");
    assert.equal(publicWebsitePathPrefix(PRODUCT_CODE.ACTIVECLINIC), "/clinics");
    assert.equal(publicWebsitePathPrefix(PRODUCT_CODE.BLESSBOARD), "/c");
    assert.equal(publicClinicPath("sunrise-clinic"), ac);
    assert.equal(publicChurchHomePath("sunrise-church"), bb);
    assert.equal(
      publicChurchPagePath("sunrise-church", "about"),
      "/c/sunrise-church/about"
    );
  });

  it("resolves testing vs production hosts from the domain matrix", () => {
    assert.equal(
      publicOriginForProduct(PRODUCT_CODE.ACTIVECLINIC, { NODE_ENV: "test" }),
      "https://activeclinic.pronline.org"
    );
    assert.equal(
      publicOriginForProduct(PRODUCT_CODE.ACTIVECLINIC, { NODE_ENV: "production" }),
      "https://activeclinic.org"
    );
    assert.equal(
      publicOriginForProduct(PRODUCT_CODE.BLESSBOARD, { NODE_ENV: "test" }),
      "https://blessboard.pronline.org"
    );
    assert.equal(
      publicOriginForProduct(PRODUCT_CODE.BLESSBOARD, { NODE_ENV: "production" }),
      "https://blessboard.com"
    );
    assert.equal(
      buildPublicOrganizationWebsiteUrl({
        product: PRODUCT_CODE.ACTIVECLINIC,
        organizationKey: "sunrise-clinic",
        env: { NODE_ENV: "test" },
      }),
      "https://activeclinic.pronline.org/clinics/sunrise-clinic"
    );
    assert.equal(
      buildPublicOrganizationWebsiteUrl({
        product: PRODUCT_CODE.BLESSBOARD,
        organizationKey: "sunrise-church",
        env: { NODE_ENV: "production" },
      }),
      "https://blessboard.com/c/sunrise-church"
    );
  });

  it("builds product-specific editor, preview, settings, history, and publish URLs", () => {
    assert.equal(
      buildPublicWebsiteEditPath({
        product: PRODUCT_CODE.ACTIVECLINIC,
        organizationKey: "demo",
      }),
      "/clinics/demo?website_edit=1&website_mode=draft"
    );
    assert.equal(
      buildPublicWebsiteEditPath({
        product: PRODUCT_CODE.BLESSBOARD,
        organizationKey: "demo",
      }),
      "/c/demo?website_edit=1&website_mode=draft"
    );
    assert.equal(
      buildPublicWebsitePreviewPath({
        product: PRODUCT_CODE.ACTIVECLINIC,
        organizationKey: "demo",
      }),
      "/clinics/demo?website_mode=draft"
    );
    assert.equal(
      buildPublicWebsitePreviewPath({
        product: PRODUCT_CODE.BLESSBOARD,
        organizationKey: "demo",
      }),
      "/c/demo?website_mode=draft"
    );
    assert.equal(
      buildPublicWebsiteHistoryPath({
        product: PRODUCT_CODE.ACTIVECLINIC,
        organizationKey: "demo",
      }),
      "/clinics/demo/website/history"
    );
    assert.equal(
      buildPublicWebsiteHistoryPath({
        product: PRODUCT_CODE.BLESSBOARD,
        organizationKey: "demo",
      }),
      "/c/demo/website/history"
    );
    assert.equal(
      buildPublicWebsiteSettingsPath({ product: PRODUCT_CODE.ACTIVECLINIC }),
      "/app/settings/website"
    );
    assert.equal(
      buildPublicWebsiteSettingsPath({ product: PRODUCT_CODE.BLESSBOARD }),
      "/hq/website"
    );
    assert.equal(
      buildPublicWebsiteSettingsPath({
        product: PRODUCT_CODE.BLESSBOARD,
        actor: "branch_admin",
      }),
      "/branch-admin/website"
    );
    assert.equal(
      buildPublicWebsitePublishPath({
        product: PRODUCT_CODE.ACTIVECLINIC,
        organizationKey: "demo",
      }),
      "/clinics/demo/website/publish"
    );
    assert.equal(
      buildPublicWebsitePublishPath({
        product: PRODUCT_CODE.BLESSBOARD,
        organizationKey: "demo",
      }),
      "/hq/website/publish/review"
    );
    assert.equal(
      buildPublicWebsiteAdminPath({
        product: PRODUCT_CODE.BLESSBOARD,
        organizationKey: "demo",
        surface: "website-preview",
      }),
      "/admin/organizations/demo/website-preview"
    );
  });

  it("preserves query strings on alias redirects and never loops on canonical paths", () => {
    assert.equal(
      canonicalRedirectFromAlias(
        PRODUCT_CODE.ACTIVECLINIC,
        "/c/sunrise-clinic/about?website_edit=1&keep=1"
      ),
      "/clinics/sunrise-clinic/about?website_edit=1&keep=1"
    );
    assert.equal(
      canonicalRedirectFromAlias(PRODUCT_CODE.ACTIVECLINIC, "/clinics/sunrise-clinic/about?keep=1"),
      null
    );
    assert.equal(
      canonicalRedirectFromAlias(PRODUCT_CODE.ACTIVECLINIC, "/clinics/sunrise-clinic"),
      null
    );
    assert.equal(
      canonicalRedirectFromAlias(PRODUCT_CODE.BLESSBOARD, "/c/sunrise-church/about?keep=1"),
      null
    );
    assert.equal(
      appendQuery("/c/demo-church/about", "website_edit=1"),
      "/c/demo-church/about?website_edit=1"
    );
    assert.equal(
      appendQuery("/c/demo-church?website_edit=1", { website_mode: "draft" }),
      "/c/demo-church?website_edit=1&website_mode=draft"
    );
  });

  it("builds BlessBoard branch mini-website paths through the shared builder", () => {
    assert.equal(
      buildPublicOrganizationWebsitePath({
        product: PRODUCT_CODE.BLESSBOARD,
        organizationKey: "grace",
        scope: { kind: "branch", branchKey: "campus-east" },
      }),
      "/c/grace/campus-east"
    );
    assert.equal(
      publicBranchHomePath("grace", "campus-east"),
      "/c/grace/campus-east"
    );
    assert.equal(
      publicBranchPagePath("grace", "campus-east", "about"),
      "/c/grace/campus-east/about"
    );
    assert.equal(
      churchWidePublicPathForPage({
        routingMode: "path",
        organizationKey: "grace",
        pageKey: "events",
      }),
      "/c/grace/events"
    );
  });

  it("keeps settings, admin, and email preview links on the shared builder", () => {
    const suggested = presentSuggestedOrganizationKeyPreview("Grace Community Chapel");
    assert.equal(suggested.publicPath, `/c/${suggested.key}`);
    assert.equal(
      suggested.publicUrlPreview,
      `${publicOriginForProduct(PRODUCT_CODE.BLESSBOARD)}/c/${suggested.key}`
    );
    const hq = resolveWebsiteActionUrls({ actor: "hq", organizationKey: "demo3" });
    assert.equal(hq.publishedWebsiteUrl, "/c/demo3");
    assert.equal(hq.publishWorkflowUrl, buildPublicWebsiteSettingsPath({ product: PRODUCT_CODE.BLESSBOARD }));
    const pa = resolveWebsiteActionUrls({
      actor: "platform_admin",
      organizationKey: "demo3",
    });
    assert.equal(pa.previewUrl, "/admin/organizations/demo3/website-preview");
    assert.equal(pa.publishedWebsiteUrl, "/c/demo3");
    const branch = resolveWebsiteActionUrls({
      actor: "branch_admin",
      organizationKey: "demo3",
    });
    assert.equal(branch.previewUrl, "/c/demo3?website_edit=1&website_mode=draft");
    assert.equal(
      publicClinicPath("sunrise", { suffix: "contact/success" }),
      "/clinics/sunrise/contact/success"
    );
  });

  it("canonicalizes trailing slashes, organization-key case, aliases, and remaps without loops", () => {
    assert.equal(
      canonicalPublicWebsiteRedirect(
        PRODUCT_CODE.ACTIVECLINIC,
        "/clinics/Sunrise-Clinic/about/?keep=1"
      ),
      "/clinics/sunrise-clinic/about?keep=1"
    );
    assert.equal(
      canonicalPublicWebsiteRedirect(
        PRODUCT_CODE.ACTIVECLINIC,
        "/c/SUNRISE-CLINIC/about/?keep=1"
      ),
      "/clinics/sunrise-clinic/about?keep=1"
    );
    assert.equal(
      canonicalPublicWebsiteRedirect(PRODUCT_CODE.ACTIVECLINIC, "/clinics/sunrise-clinic"),
      null
    );
    assert.equal(
      canonicalPublicWebsiteRedirect(PRODUCT_CODE.ACTIVECLINIC, "/clinics/sunrise-clinic/about?keep=1"),
      null
    );
    assert.equal(
      canonicalPublicWebsiteRedirect(PRODUCT_CODE.BLESSBOARD, "/c/Sunrise-Church/about/"),
      "/c/sunrise-church/about"
    );
    assert.equal(
      canonicalPublicWebsiteRedirect(PRODUCT_CODE.BLESSBOARD, "/c/demo/about?keep=1", {
        remapOrganizationKey: (key) => (key === "demo" ? "demo-church" : key),
      }),
      "/c/demo-church/about?keep=1"
    );
    assert.equal(
      canonicalPublicWebsiteRedirect(
        PRODUCT_CODE.BLESSBOARD,
        "/c/demo-church/branches/lusaka/about?keep=1",
        {
          remapBranchKey: (org, branch) =>
            org === "demo-church" && branch === "lusaka" ? "demo-church-lusaka" : branch,
        }
      ),
      "/c/demo-church/demo-church-lusaka/about?keep=1"
    );
    assert.equal(
      canonicalPublicWebsiteRedirect(PRODUCT_CODE.BLESSBOARD, "/c/demo-church/about?keep=1", {
        remapOrganizationKey: (key) => (key === "demo" ? "demo-church" : key),
      }),
      null
    );
    assert.equal(
      canonicalPublicWebsiteRedirect(PRODUCT_CODE.ACTIVECLINIC, "/clinics//sunrise-clinic//about"),
      "/clinics/sunrise-clinic/about"
    );
  });

  it("builds tenant nav paths that match mounted public routes", () => {
    const pages = buildPublicWebsitePagePaths({
      product: PRODUCT_CODE.ACTIVECLINIC,
      organizationKey: "sunrise-clinic",
    });
    assert.equal(pages.home, "/clinics/sunrise-clinic");
    assert.equal(pages.about, "/clinics/sunrise-clinic/about");
    assert.equal(pages.book, "/clinics/sunrise-clinic/book");
    assert.equal(pages.patientLogin, "/clinics/sunrise-clinic/patient/login");
    assert.equal(pages.myBooking, "/clinics/sunrise-clinic/my-booking");
    const attached = attachClinicPublicWebsitePaths({ clinicKey: "Sunrise-Clinic", publicName: "Sunrise" });
    assert.equal(attached.publicBasePath, "/clinics/sunrise-clinic");
    assert.equal(attached.publicPagePaths.contact, "/clinics/sunrise-clinic/contact");
    assert.equal(
      buildPublicWebsiteAdminPath({ organizationKey: "Sunrise-Clinic", surface: "website" }),
      "/admin/organizations/sunrise-clinic/website"
    );
    const bbPages = buildPublicWebsitePagePaths({
      product: PRODUCT_CODE.BLESSBOARD,
      organizationKey: "sunrise-church",
    });
    assert.equal(bbPages.home, "/c/sunrise-church");
    assert.equal(bbPages.about, undefined);
  });
});
