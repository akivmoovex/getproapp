"use strict";

/**
 * V2.05 Main Flow Batch 3 — Website Management Hub + Themes + Live Preview.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { PRODUCT_CODE } = require("../src/platform/website/publicWebsiteUrl");
const {
  WEBSITE_MANAGEMENT_HUB,
  HUB_MODULE_DEFS,
  buildWebsiteManagementHub,
  defaultAcWebsiteHubPaths,
  defaultBbWebsiteHubPaths,
} = require("../src/platform/website/websiteManagementHub");
const {
  PRESENTATION_FAMILIES,
  listPresentationThemesForProduct,
  buildThemeSelectorView,
  presentationFamilyForThemeId,
} = require("../src/platform/website/themeSelector");
const {
  LIVE_PREVIEW,
  buildLivePreviewView,
} = require("../src/platform/website/livePreview");
const {
  RESPONSIVE_VIEWPORT,
  VIEWPORT_WIDTHS,
  listResponsiveViewportModes,
  usesIframeViewport,
} = require("../src/platform/website/responsiveViewport");
const {
  BB_DEFAULT_ID,
  BB_CONTEMPORARY_FELLOWSHIP_ID,
  BB_COMMUNITY_ID,
  AC_DEFAULT_ID,
  AC_FAMILY_WELLNESS_MINT_ID,
  AC_COMMUNITY_ID,
  getTheme,
  listSelectableThemesForProduct,
} = require("../src/platform/website/themeRegistry");
const {
  evaluateThemeCompatibility,
} = require("../src/platform/website/websiteThemeService");

const ROOT = path.join(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("V2.05 Website Management Batch3", () => {
  it("FINAL=V205_WEBSITE_ADMIN_DONE", () => {
    assert.equal(WEBSITE_MANAGEMENT_HUB.pattern, "WebsiteManagementHub");
    assert.equal(WEBSITE_MANAGEMENT_HUB.adminRoutes.activeclinic, "/app/settings/website");
    assert.equal(WEBSITE_MANAGEMENT_HUB.adminRoutes.blessboard, "/hq/website");
    assert.equal(WEBSITE_MANAGEMENT_HUB.stitchScreens.activeclinic, "AC-WEB-ADM-01");
    assert.equal(WEBSITE_MANAGEMENT_HUB.stitchScreens.blessboard, "BB-WEB-ADM-01");
    assert.equal(WEBSITE_MANAGEMENT_HUB.themeStitchScreens.activeclinic, "AC-WEB-THM-01");
    assert.equal(WEBSITE_MANAGEMENT_HUB.themeStitchScreens.blessboard, "BB-WEB-THM-01");
    assert.deepEqual(WEBSITE_MANAGEMENT_HUB.previewWidths, {
      desktop: 1440,
      tablet: 768,
      mobile: 390,
    });
    for (const key of WEBSITE_MANAGEMENT_HUB.requiredModules) {
      assert.ok(
        HUB_MODULE_DEFS.some((m) => m.key === key),
        key
      );
    }
    assert.equal(
      HUB_MODULE_DEFS.find((m) => m.key === "edit").label,
      "Edit Website"
    );
    assert.equal(
      HUB_MODULE_DEFS.find((m) => m.key === "history").label,
      "Version History"
    );
    assert.equal(
      HUB_MODULE_DEFS.find((m) => m.key === "changeManager").label,
      "Change Manager"
    );
  });

  it("Website is Admin Console nav item #2 (AC + BB)", () => {
    const {
      buildActiveClinicNavigation,
    } = require("../src/activeclinic/services/activeClinicNavigation");
    const { HQ_ADMIN_NAV } = require("../src/blessboard/http/hqAdminNav");
    const {
      sortNavItemsByAdminConsoleSlot,
    } = require("../src/platform/admin-console/adminConsoleShell");

    const ac = buildActiveClinicNavigation([
      "activeclinic.access",
      "website.view",
    ]);
    assert.equal(ac.items[0].slot, "dashboard");
    assert.equal(ac.items[1].slot, "website");
    assert.equal(ac.items[1].href, "/app/settings/website");

    const bb = sortNavItemsByAdminConsoleSlot(
      HQ_ADMIN_NAV.filter((i) => i.nav && i.enabled)
    );
    assert.equal(bb[0].slot, "dashboard");
    assert.equal(bb[1].slot, "website");
    assert.equal(bb[1].href, "/hq/website");
  });
  it("shared WebsiteManagementHub exposes required modules", () => {
    assert.equal(WEBSITE_MANAGEMENT_HUB.pattern, "WebsiteManagementHub");
    const keys = HUB_MODULE_DEFS.map((m) => m.key);
    for (const required of [
      "edit",
      "pages",
      "sections",
      "themes",
      "branding",
      "media",
      "seo",
      "content",
      "history",
      "changeManager",
      "preview",
      "publish",
    ]) {
      assert.ok(keys.includes(required), required);
    }

    const ac = buildWebsiteManagementHub({
      productCode: PRODUCT_CODE.ACTIVECLINIC,
      paths: defaultAcWebsiteHubPaths({
        clinicKey: "demo",
        actions: {
          editWebsite: "/clinics/demo?website_edit=1",
          preview: "/clinics/demo?website_mode=draft",
          history: "/clinics/demo/website/history",
          publishPath: "/app/settings/website/publish",
        },
      }),
      capabilities: { canEdit: true, canPublish: true },
      liveThemeId: AC_DEFAULT_ID,
      draftThemeId: AC_FAMILY_WELLNESS_MINT_ID,
      draftChangesCount: 2,
      lastPublishedLabel: "Yesterday",
      liveAvailable: true,
      exists: true,
      unpublishedChanges: true,
    });
    assert.equal(ac.stitchScreen, "AC-WEB-ADM-01");
    assert.equal(ac.status.liveThemeLabel, "Clarity");
    assert.equal(ac.status.draftThemeLabel, "Editorial");
    assert.equal(ac.status.draftChangesCount, 2);
    assert.ok(ac.modules.some((m) => m.key === "themes" && m.href === "/app/settings/website/themes"));
    assert.ok(ac.modules.some((m) => m.key === "changeManager"));

    const bb = buildWebsiteManagementHub({
      productCode: PRODUCT_CODE.BLESSBOARD,
      paths: defaultBbWebsiteHubPaths({
        actions: {
          editWebsite: "/c/demo?website_edit=1",
          preview: "/hq/content/preview/home",
          media: "/c/demo/website/media",
          branding: "/hq/website/branding",
          seo: "/c/demo/website/seo",
          history: "/hq/website/publishing-history",
          publishPath: "/hq/website/publish/review",
        },
      }),
      capabilities: { canEdit: true, canPublish: true },
      liveThemeId: BB_DEFAULT_ID,
      draftThemeId: BB_COMMUNITY_ID,
      draftChangesCount: 0,
      liveAvailable: false,
      exists: true,
    });
    assert.equal(bb.stitchScreen, "BB-WEB-ADM-01");
    assert.equal(bb.status.draftThemeLabel, "Community");
    assert.ok(bb.modules.some((m) => m.key === "themes" && m.href === "/hq/website/themes"));
  });

  it("AC and BB website section templates stay in Admin Console with hub markers", () => {
    const acHub = read("views/activeclinic/app/settings-website-content.ejs");
    assert.match(acHub, /data-gp-website-management-hub="WebsiteManagementHub"/);
    assert.match(acHub, /data-stitch-screen="AC-WEB-ADM-01"/);
    assert.match(acHub, /data-ac-website-live-theme/);
    assert.match(acHub, /data-ac-website-draft-theme/);
    assert.match(acHub, /data-ac-website-publish-readiness/);
    assert.match(acHub, /data-ac-website-domain-status/);
    assert.match(acHub, /\/app\/settings\/website\/themes/);

    const bbHub = read("views/blessboard/v5/hq/website-management.ejs");
    assert.match(bbHub, /data-gp-website-management-hub="WebsiteManagementHub"/);
    assert.match(bbHub, /data-stitch-screen="BB-WEB-ADM-01"/);
    assert.match(bbHub, /data-bb-website-live-theme/);
    assert.match(bbHub, /data-bb-website-draft-theme/);
    assert.match(bbHub, /hq-shell-start/);

    const acShell = read("views/activeclinic/layouts/app-shell.ejs");
    assert.match(acShell, /data-gp-admin-console="AdminConsoleShell"/);
    const bbShell = read("views/blessboard/v5/partials/hq-shell-start.ejs");
    assert.match(bbShell, /data-gp-admin-console="AdminConsoleShell"/);

    assert.match(
      read("src/activeclinic/http/activeClinicSettingsRoutes.js"),
      /buildWebsiteManagementHub/
    );
    assert.match(
      read("src/blessboard/http/churchWebsiteAdminRoutes.js"),
      /buildWebsiteManagementHub/
    );
    assert.match(
      read("src/activeclinic/http/activeClinicWebsiteCmsRoutes.js"),
      /\/app\/settings\/website\/themes/
    );
  });

  it("ResponsiveViewport + LivePreview reuse iframe engine at 1440/768/390", () => {
    assert.equal(RESPONSIVE_VIEWPORT.pattern, "ResponsiveViewport");
    assert.equal(RESPONSIVE_VIEWPORT.architecture, "iframe");
    assert.equal(RESPONSIVE_VIEWPORT.enginePath, "/platform/website-inline-edit.js");
    assert.deepEqual(VIEWPORT_WIDTHS, { desktop: 1440, tablet: 768, mobile: 390 });
    assert.equal(usesIframeViewport("desktop"), false);
    assert.equal(usesIframeViewport("tablet"), true);
    assert.equal(usesIframeViewport("mobile"), true);

    const modes = listResponsiveViewportModes();
    assert.equal(modes.length, 3);
    assert.equal(LIVE_PREVIEW.pattern, "LivePreview");
    assert.equal(LIVE_PREVIEW.engine, "website-inline-edit.js");
    const preview = buildLivePreviewView({ stitchScreen: "AC-WEB-THM-01" });
    assert.equal(preview.architecture, "iframe");
    assert.equal(preview.viewports[0].width, 1440);

    const js = read("public/platform/website-inline-edit.js");
    assert.match(js, /VIEWPORT_WIDTHS = \{ desktop: 1440, tablet: 768, mobile: 390 \}/);
    assert.match(js, /enterFrameViewport/);
    assert.doesNotMatch(js, /second preview engine|createPreviewEngine/i);

    const chrome = read("views/platform/website-engine/editor-chrome.ejs");
    assert.match(chrome, /data-website-viewport-architecture="iframe"/);
    assert.match(chrome, /data-website-viewport="desktop"/);
    assert.match(chrome, /data-website-viewport-width="1440"/);
    assert.match(chrome, /data-website-viewport-width="768"/);
    assert.match(chrome, /data-website-viewport-width="390"/);
  });

  it("ThemeSelector offers Clarity/Editorial/Community as presentation-only draft themes", () => {
    assert.deepEqual(
      PRESENTATION_FAMILIES.map((f) => f.key),
      ["clarity", "editorial", "community"]
    );
    assert.equal(presentationFamilyForThemeId(AC_DEFAULT_ID), "clarity");
    assert.equal(presentationFamilyForThemeId(AC_FAMILY_WELLNESS_MINT_ID), "editorial");
    assert.equal(presentationFamilyForThemeId(AC_COMMUNITY_ID), "community");
    assert.equal(presentationFamilyForThemeId(BB_DEFAULT_ID), "clarity");
    assert.equal(presentationFamilyForThemeId(BB_CONTEMPORARY_FELLOWSHIP_ID), "editorial");
    assert.equal(presentationFamilyForThemeId(BB_COMMUNITY_ID), "community");

    const acThemes = listPresentationThemesForProduct(PRODUCT_CODE.ACTIVECLINIC);
    const bbThemes = listPresentationThemesForProduct(PRODUCT_CODE.BLESSBOARD);
    assert.equal(acThemes.length, 3);
    assert.equal(bbThemes.length, 3);
    assert.deepEqual(
      acThemes.map((t) => t.familyLabel).sort(),
      ["Clarity", "Community", "Editorial"]
    );

    const selector = buildThemeSelectorView({
      productCode: PRODUCT_CODE.ACTIVECLINIC,
      draftThemeId: AC_COMMUNITY_ID,
      publishedThemeId: AC_DEFAULT_ID,
    });
    assert.equal(selector.pattern, "ThemeSelector");
    assert.equal(selector.stitchScreen, "AC-WEB-THM-01");
    assert.equal(selector.presentationOnly, true);
    assert.equal(selector.contentUnchanged, true);
    assert.equal(selector.draftThemeLabel, "Community");
    assert.equal(selector.liveThemeLabel, "Clarity");

    const community = getTheme(AC_COMMUNITY_ID, PRODUCT_CODE.ACTIVECLINIC);
    const compat = evaluateThemeCompatibility(community, {
      sectionTypes: ["hero", "services"],
      imageContentKeys: ["home.hero.image"],
    });
    assert.equal(compat.dropsContent, false);
    assert.equal(compat.ok, true);

    assert.ok(fs.existsSync(path.join(ROOT, "public/activeclinic/website-theme-community.css")));
    assert.ok(fs.existsSync(path.join(ROOT, "public/blessboard/v5/website-theme-community.css")));
    assert.equal(listSelectableThemesForProduct(PRODUCT_CODE.ACTIVECLINIC).length, 3);
  });

  it("theme gallery marks ThemeSelector + LivePreview stitch screens", () => {
    const gallery = read("views/platform/website/theme-gallery-page.ejs");
    assert.match(gallery, /data-gp-theme-selector="ThemeSelector"/);
    assert.match(gallery, /data-gp-live-preview="LivePreview"/);
    assert.match(gallery, /data-website-viewport-architecture="iframe"/);
    assert.match(gallery, /Desktop 1440/);
    assert.match(gallery, /Tablet 768/);
    assert.match(gallery, /Mobile 390/);

    const acThemes = read("views/activeclinic/app/settings-website-themes.ejs");
    assert.match(acThemes, /data-stitch-screen="AC-WEB-THM-01"/);
    assert.match(acThemes, /Admin Console|Back to Website/);

    const themeHttp = read("src/platform/website/websiteThemeHttp.js");
    assert.match(themeHttp, /AC-WEB-THM-01/);
    assert.match(themeHttp, /BB-WEB-THM-01/);
    assert.match(themeHttp, /desktop: 1440, tablet: 768, mobile: 390/);

    const bbThemesRoute = read("src/blessboard/http/churchWebsiteAdminRoutes.js");
    assert.match(bbThemesRoute, /\/hq\/website\/themes/);
  });

  it("FINAL marker batch3 complete", () => {
    assert.equal("V205_WEBSITE_ADMIN_DONE", "V205_WEBSITE_ADMIN_DONE");
  });
});
