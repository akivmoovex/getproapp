"use strict";

/**
 * Public website URL and redirect hardening for ActiveClinic and BlessBoard.
 * Product prefixes stay distinct; one shared builder drives generation and 301s.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const request = require("supertest");

const {
  PRODUCT_CODE,
  canonicalPublicWebsiteRedirect,
  sendCanonicalPublicWebsiteRedirect,
  buildPublicWebsiteEditPath,
  buildPublicWebsitePreviewPath,
  buildPublicWebsiteHistoryPath,
  buildPublicWebsiteSettingsPath,
  buildPublicWebsitePublishPath,
  buildPublicWebsiteAdminPath,
  buildPublicWebsitePagePaths,
} = require("../src/platform/website/publicWebsiteUrl");
const {
  legacyOrganizationKeyRedirectTarget,
  legacyBranchKeyRedirectTarget,
} = require("../src/blessboard/services/organizationKeyCompat");
const { publicClinicPath } = require("../src/activeclinic/services/clinicWebsiteAvailabilityService");
const { publicChurchHomePath, publicChurchPagePath } = require("../src/blessboard/urls/churchUrlHelper");

function remapBlessBoard(organizationKey) {
  return legacyOrganizationKeyRedirectTarget(organizationKey) || organizationKey;
}

function remapBlessBoardBranch(organizationKey, branchKey) {
  return legacyBranchKeyRedirectTarget(organizationKey, branchKey) || branchKey;
}

function activeClinicPublicApp() {
  const app = express();
  function redirectIfNotCanonical(req, res, next) {
    const key = String(req.params.clinicKey || "").trim();
    if (!key) return next();
    if (sendCanonicalPublicWebsiteRedirect(req, res, PRODUCT_CODE.ACTIVECLINIC)) {
      return undefined;
    }
    return next();
  }
  app.use("/c/:clinicKey", redirectIfNotCanonical);
  app.use("/clinics/:clinicKey", redirectIfNotCanonical);
  app.get("/clinics/:clinicKey", (req, res) => res.status(200).send("home"));
  app.get("/clinics/:clinicKey/about", (req, res) => res.status(200).send("about"));
  app.post("/clinics/:clinicKey/contact", (req, res) => res.status(200).send("posted"));
  app.post("/c/:clinicKey/contact", (req, res) => res.status(200).send("alias-post"));
  return app;
}

function blessBoardPublicApp() {
  const app = express();
  const options = {
    remapOrganizationKey: remapBlessBoard,
    remapBranchKey: remapBlessBoardBranch,
  };
  app.use((req, res, next) => {
    if (sendCanonicalPublicWebsiteRedirect(req, res, PRODUCT_CODE.BLESSBOARD, options)) {
      return undefined;
    }
    return next();
  });
  app.get("/c/:organizationKey", (req, res) => res.status(200).send("home"));
  app.get("/c/:organizationKey/about", (req, res) => res.status(200).send("about"));
  app.get("/c/:organizationKey/branches/:branchKey", (req, res) => res.status(200).send("branch"));
  app.get("/c/:organizationKey/sitemap.xml", (req, res) => res.status(200).type("xml").send("<urlset/>"));
  return app;
}

describe("v7 public website URL hardening", () => {
  it("keeps product prefixes distinct while sharing one builder", () => {
    assert.equal(publicClinicPath("sunrise-clinic"), "/clinics/sunrise-clinic");
    assert.equal(publicChurchHomePath("sunrise-church"), "/c/sunrise-church");
    assert.equal(publicChurchPagePath("sunrise-church", "about"), "/c/sunrise-church/about");
    assert.notEqual(publicClinicPath("sunrise-clinic"), publicChurchHomePath("sunrise-clinic"));
  });

  it("matches UI action URLs to the mounted public and admin routes", () => {
    const key = "sunrise-clinic";
    const pages = buildPublicWebsitePagePaths({
      product: PRODUCT_CODE.ACTIVECLINIC,
      organizationKey: key,
    });
    assert.equal(
      buildPublicWebsiteEditPath({ product: PRODUCT_CODE.ACTIVECLINIC, organizationKey: key }),
      `${pages.home}?website_edit=1&website_mode=draft`
    );
    assert.equal(
      buildPublicWebsitePreviewPath({ product: PRODUCT_CODE.ACTIVECLINIC, organizationKey: key }),
      `${pages.home}/website/preview`
    );
    assert.equal(
      buildPublicWebsiteHistoryPath({ product: PRODUCT_CODE.ACTIVECLINIC, organizationKey: key }),
      `${pages.home}/website/history`
    );
    assert.equal(
      buildPublicWebsitePublishPath({ product: PRODUCT_CODE.ACTIVECLINIC, organizationKey: key }),
      `${pages.home}/website/publish`
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
      buildPublicWebsiteAdminPath({ organizationKey: "Sunrise-Church", surface: "website" }),
      "/admin/organizations/sunrise-church/website"
    );
    assert.equal(
      buildPublicWebsiteAdminPath({
        organizationKey: "sunrise-church",
        surface: "website-preview",
      }),
      "/admin/organizations/sunrise-church/website-preview"
    );
  });

  it("HTTP ActiveClinic alias, trailing slash, and case redirect in one hop with query preserved", async () => {
    const app = activeClinicPublicApp();
    const alias = await request(app).get("/c/sunrise-clinic/about?keep=1");
    assert.equal(alias.status, 301);
    assert.equal(alias.headers.location, "/clinics/sunrise-clinic/about?keep=1");

    const slash = await request(app).get("/clinics/sunrise-clinic/about/?keep=1");
    assert.equal(slash.status, 301);
    assert.equal(slash.headers.location, "/clinics/sunrise-clinic/about?keep=1");

    const mixed = await request(app).get("/clinics/SUNRISE-CLINIC?keep=1");
    assert.equal(mixed.status, 301);
    assert.equal(mixed.headers.location, "/clinics/sunrise-clinic?keep=1");

    const aliasSlash = await request(app).get("/c/SUNRISE-CLINIC/about/?keep=1");
    assert.equal(aliasSlash.status, 301);
    assert.equal(aliasSlash.headers.location, "/clinics/sunrise-clinic/about?keep=1");

    const canonical = await request(app).get("/clinics/sunrise-clinic/about?keep=1");
    assert.equal(canonical.status, 200);
    assert.equal(canonical.headers.location, undefined);
    assert.equal(canonical.text, "about");
  });

  it("does not 301 POST website writes and does not loop canonical GET", async () => {
    const app = activeClinicPublicApp();
    const posted = await request(app).post("/clinics/sunrise-clinic/contact").send({});
    assert.equal(posted.status, 200);
    assert.equal(posted.text, "posted");

    const aliasPost = await request(app).post("/c/sunrise-clinic/contact").send({});
    assert.equal(aliasPost.status, 200);
    assert.equal(aliasPost.headers.location, undefined);
    assert.equal(aliasPost.text, "alias-post");

    const home = await request(app).get("/clinics/sunrise-clinic");
    assert.equal(home.status, 200);
    assert.equal(home.headers.location, undefined);
  });

  it("HTTP BlessBoard lowercases, strips trailing slash, and remaps legacy org/branch keys in one hop", async () => {
    const app = blessBoardPublicApp();
    const mixed = await request(app).get("/c/SUNRISE-CHURCH/about/?keep=1");
    assert.equal(mixed.status, 301);
    assert.equal(mixed.headers.location, "/c/sunrise-church/about?keep=1");

    const legacy = await request(app).get("/c/demo/about?keep=1");
    assert.equal(legacy.status, 301);
    assert.equal(legacy.headers.location, "/c/demo-church/about?keep=1");

    const legacyBranch = await request(app).get("/c/demo/branches/lusaka?keep=1");
    assert.equal(legacyBranch.status, 301);
    assert.equal(legacyBranch.headers.location, "/c/demo-church/branches/demo-church-lusaka?keep=1");

    const canonical = await request(app).get("/c/demo-church/about?keep=1");
    assert.equal(canonical.status, 200);
    assert.equal(canonical.headers.location, undefined);

    const sitemap = await request(app).get("/c/DEMO-CHURCH/sitemap.xml");
    assert.equal(sitemap.status, 301);
    assert.equal(sitemap.headers.location, "/c/demo-church/sitemap.xml");
  });

  it("never returns a redirect target equal to the request (no loops)", () => {
    const already = [
      "/clinics/sunrise-clinic",
      "/clinics/sunrise-clinic/about?keep=1",
      "/c/sunrise-church",
      "/c/sunrise-church/about?keep=1",
      "/c/demo-church/branches/demo-church-lusaka",
    ];
    for (const path of already) {
      const dest = canonicalPublicWebsiteRedirect(
        path.startsWith("/clinics") ? PRODUCT_CODE.ACTIVECLINIC : PRODUCT_CODE.BLESSBOARD,
        path,
        {
          remapOrganizationKey: remapBlessBoard,
          remapBranchKey: remapBlessBoardBranch,
        }
      );
      assert.equal(dest, null, path);
    }
  });
});
