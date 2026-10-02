"use strict";

/**
 * V2.04 Website Management platform consolidation — automated contracts.
 * Covers AC + BB option registries, parity matrix, route markers, lifecycle steps,
 * responsive viewport, hub tile crawl (static), and preserved regression packs.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const contract = require("../src/platform/website/websiteManagementFeatureContract");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function exists(rel) {
  return fs.existsSync(path.join(ROOT, rel));
}

describe("V2.04 website management feature contract registry", () => {
  it("exposes shared platform features and product adapters", () => {
    assert.ok(contract.listSharedPlatformFeatures().length >= 15);
    const ac = contract.productAdapter("activeclinic");
    const bb = contract.productAdapter("blessboard");
    assert.equal(ac.hubRoute, "/app/settings/website");
    assert.equal(bb.hubRoute, "/hq/website");
    assert.ok(ac.options.length >= 10);
    assert.ok(bb.options.length >= 8);
    assert.deepEqual(ac.catalogueDomain, ["services", "doctors"]);
    assert.ok(bb.catalogueDomain.includes("leadership"));
  });

  it("lifecycle steps cover DRAFT through REPUBLISH", () => {
    for (const step of [
      "DRAFT",
      "SAVE",
      "PREVIEW",
      "PUBLISH",
      "PUBLIC_VERIFY",
      "UNPUBLISH",
      "VERSION_HISTORY",
      "OLD_VERSION_PREVIEW",
      "RESTORE_AS_NEW",
      "REPUBLISH",
    ]) {
      assert.ok(contract.LIFECYCLE_STEPS.includes(step), step);
    }
  });

  it("parity matrix has no unresolved BB_GAP after hub tile fix", () => {
    const gaps = contract.parityGaps("BB_GAP");
    assert.equal(gaps.length, 0, gaps.map((g) => g.feature).join(","));
    const acOnly = contract.parityGaps("AC_ONLY_BY_DESIGN");
    assert.ok(acOnly.some((r) => r.feature === "Navigation"));
    assert.ok(acOnly.some((r) => r.feature === "Header/Footer Chrome"));
  });
});

describe("V2.04 AC website management route render contracts", () => {
  it("every AC option has registered route + template marker", () => {
    const cms = read("src/activeclinic/http/activeClinicWebsiteCmsRoutes.js");
    const settings = read("src/activeclinic/http/activeClinicSettingsRoutes.js");
    const combined = `${cms}\n${settings}`;
    let pass = 0;
    for (const opt of contract.listAcWebsiteOptions()) {
      const escaped = opt.route.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      assert.match(combined, new RegExp(`["']${escaped}["']`), `route ${opt.route}`);
      if (opt.template) {
        assert.ok(exists(opt.template), opt.template);
        assert.match(read(opt.template), opt.marker, opt.featureId);
      }
      pass += 1;
    }
    assert.equal(pass, contract.listAcWebsiteOptions().length);
  });

  it("AC Clinic Editor chrome remains ac-mw-editor without nav flex collision", () => {
    const nav = read("views/activeclinic/partials/website-cms-nav.ejs");
    assert.match(nav, /class="ac-mw-editor"/);
    assert.doesNotMatch(nav, /class="ac-mw-editor ac-mw-nav"/);
  });

  it("AC hub tiles cover canonical management options", () => {
    const hub = read("views/activeclinic/app/settings-website-content.ejs");
    for (const pathSuffix of [
      "/pages",
      "/branding",
      "/media",
      "/settings",
      "/sections",
      "/navigation",
      "/chrome",
      "/seo",
      "/catalogue",
      "/library",
    ]) {
      assert.match(hub, new RegExp(`/app/settings/website${pathSuffix.replace("/", "\\/")}`));
    }
  });
});

describe("V2.04 BB website management route + hub contracts", () => {
  it("BB hub and branding routes are registered", () => {
    const hq = read("src/blessboard/http/churchWebsiteAdminRoutes.js");
    assert.match(hq, /\/hq\/website/);
    assert.match(hq, /\/hq\/website\/branding/);
    assert.match(hq, /\/hq\/website\/publish/);
  });

  it("BB hub exposes branding, library, settings tiles (parity with shared UX actions)", () => {
    const hub = read("views/blessboard/v5/hq/website-management.ejs");
    assert.match(hub, /data-bb-website-action="branding"/);
    assert.match(hub, /data-bb-website-action="library"/);
    assert.match(hub, /data-bb-website-action="settings"/);
    assert.match(hub, /data-bb-website-action="media"/);
    assert.match(hub, /data-bb-website-action="seo"/);
    assert.match(hub, /data-bb-website-action="history"/);
  });

  it("BB options templates/routes exist or are registered in handlers", () => {
    const httpDir = path.join(ROOT, "src/blessboard/http");
    const combined = fs
      .readdirSync(httpDir)
      .filter((f) => f.endsWith(".js") && !f.includes(" 2."))
      .map((f) => read(`src/blessboard/http/${f}`))
      .join("\n");
    for (const opt of contract.listBbWebsiteOptions()) {
      if (opt.template) {
        assert.ok(exists(opt.template), opt.template);
        assert.match(read(opt.template), opt.marker, opt.featureId);
        continue;
      }
      if (opt.routeProbe) {
        assert.match(
          combined,
          new RegExp(opt.routeProbe.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
          `BB routeProbe missing for ${opt.featureId}`
        );
        continue;
      }
      const escaped = opt.route.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      assert.match(
        combined,
        new RegExp(escaped),
        `BB route registration missing for ${opt.featureId} ${opt.route}`
      );
    }
  });
});

describe("V2.04 shared lifecycle + responsive + version contracts still wired", () => {
  it("responsive iframe architecture preserved for BB and AC", () => {
    assert.ok(exists("src/platform/website-engine/editorViewportFrame.js"));
    const vp = read("src/platform/website-engine/editorViewportFrame.js");
    assert.match(vp, /768|390|website_frame|buildEditorViewportFramePath/);
    assert.match(read("src/blessboard/http/attachWebsiteAdminChrome.js"), /editorViewportFrame|frameMode|website_frame/);
    assert.match(
      read("src/activeclinic/http/attachActiveClinicWebsiteChrome.js"),
      /editorViewportFrame|frameMode|website_frame/
    );
  });

  it("historical version preview builds Stitch presentation", () => {
    const gov = read("src/platform/website/governanceVersionPreview.js");
    assert.match(gov, /buildActiveClinicStitchPublicPage/);
    assert.match(gov, /websitePresentation/);
  });

  it("AC publish go-live and BB readiness engine contact remain", () => {
    assert.match(read("src/activeclinic/http/activeClinicWebsiteRoutes.js"), /wantsPublic|setClinicWebsiteAvailability/);
    assert.match(read("src/blessboard/services/churchWebsitePublishService.js"), /hasEngineContact|loadFieldOverlayMap/);
  });

  it("shared platform modules remain product-agnostic", () => {
    const files = [
      "src/platform/website/contentService.js",
      "src/platform/website/versionService.js",
      "src/platform/website/websiteManagementPresentation.js",
      "src/platform/website-engine/editorViewportFrame.js",
      "src/platform/website/websiteManagementFeatureContract.js",
    ];
    for (const f of files) {
      assert.ok(exists(f), f);
      const src = read(f);
      assert.doesNotMatch(src, /require\(["'].*activeclinic.*["']\)/, `platform must not hard-require AC: ${f}`);
    }
  });
});

describe("V2.04 website management admin link crawl (static)", () => {
  it("enumerates AC hub + CMS nav links without blank targets", () => {
    const hub = read("views/activeclinic/app/settings-website-content.ejs");
    const nav = read("views/activeclinic/partials/website-cms-nav.ejs");
    const hrefs = [...`${hub}\n${nav}`.matchAll(/href="(\/app\/settings\/website[^"#?]*)/g)].map(
      (m) => m[1]
    );
    const unique = [...new Set(hrefs)];
    assert.ok(unique.length >= 10, `expected >=10 AC links, got ${unique.length}`);
    for (const href of unique) {
      assert.ok(href.startsWith("/app/settings/website"));
      assert.doesNotMatch(href, /undefined|null/);
    }
  });

  it("enumerates BB hub action tiles", () => {
    const hub = read("views/blessboard/v5/hq/website-management.ejs");
    const actions = [...hub.matchAll(/data-bb-website-action="([^"]+)"/g)].map((m) => m[1]);
    const unique = [...new Set(actions)];
    assert.ok(unique.includes("branding"));
    assert.ok(unique.includes("library"));
    assert.ok(unique.includes("settings"));
    assert.ok(unique.includes("media"));
    assert.ok(unique.length >= 8, `got ${unique.join(",")}`);
  });
});

module.exports = {
  contract,
};
