"use strict";

/**
 * V2.05 Task 8 — Stitch parity for implemented main-flow screens only.
 * Registry: docs/design/V2_05_STITCH_SCREEN_IMPLEMENTATION_REGISTRY.md
 *
 * Scope: AC-ADM-01, BB-ADM-01, AC-WEB-ADM-01, BB-WEB-ADM-01,
 *        AC-WEB-THM-01, BB-WEB-THM-01
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { PRODUCT_CODE } = require("../src/platform/website/publicWebsiteUrl");
const {
  ADMIN_CONSOLE_SHELL,
  adminConsoleStitchScreen,
  validateAdminConsoleNavOrder,
} = require("../src/platform/admin-console/adminConsoleShell");
const {
  WEBSITE_MANAGEMENT_HUB,
  buildWebsiteManagementHub,
  defaultAcWebsiteHubPaths,
  defaultBbWebsiteHubPaths,
  HUB_MODULE_DEFS,
} = require("../src/platform/website/websiteManagementHub");
const {
  buildThemeSelectorView,
  PRESENTATION_FAMILIES,
} = require("../src/platform/website/themeSelector");
const { LIVE_PREVIEW, buildLivePreviewView } = require("../src/platform/website/livePreview");
const { VIEWPORT_WIDTHS } = require("../src/platform/website/responsiveViewport");

const ROOT = path.join(__dirname, "..");
const REGISTRY = "docs/design/V2_05_STITCH_SCREEN_IMPLEMENTATION_REGISTRY.md";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

const SCOPE = Object.freeze([
  "AC-ADM-01",
  "BB-ADM-01",
  "AC-WEB-ADM-01",
  "BB-WEB-ADM-01",
  "AC-WEB-THM-01",
  "BB-WEB-THM-01",
]);

describe("V2.05 Main Flow Stitch Parity Task8", () => {
  it("FINAL=V205_MAIN_FLOW_STITCH_PARITY_DONE", () => {
    assert.deepEqual(SCOPE, [
      "AC-ADM-01",
      "BB-ADM-01",
      "AC-WEB-ADM-01",
      "BB-WEB-ADM-01",
      "AC-WEB-THM-01",
      "BB-WEB-THM-01",
    ]);
    const registry = read(REGISTRY);
    for (const id of SCOPE) {
      assert.match(registry, new RegExp(id));
    }
    assert.match(registry, /SHARED_PATTERN=AdminConsoleShell/);
    assert.match(registry, /SHARED_PATTERN=WebsiteManagementHub/);
    assert.match(registry, /ThemeSelector\+LivePreview|SHARED_PATTERN=ThemeSelector/);
    assert.match(registry, /Desktop 1440 \/ Tablet 768 \/ Mobile 390/);
    assert.match(registry, /Clarity, Editorial, Community/);
  });

  it("AC-ADM-01 + BB-ADM-01 — AdminConsoleShell layout/nav/1440/390", () => {
    assert.equal(adminConsoleStitchScreen("activeclinic"), "AC-ADM-01");
    assert.equal(adminConsoleStitchScreen("blessboard"), "BB-ADM-01");
    assert.equal(ADMIN_CONSOLE_SHELL.desktopBreakpoint, 1440);
    assert.equal(ADMIN_CONSOLE_SHELL.mobileBreakpoint, 390);
    assert.equal(ADMIN_CONSOLE_SHELL.websiteSlotOrder, 2);

    const order = validateAdminConsoleNavOrder([
      { slot: "dashboard", href: "/app" },
      { slot: "website", href: "/app/settings/website" },
      { slot: "content", href: "/app/content" },
    ]);
    assert.equal(order.ok, true);
    assert.equal(order.dashboardFirst, true);
    assert.equal(order.websiteSecond, true);

    const shellCss = read("public/platform/admin-console-shell.css");
    assert.match(shellCss, /--gp-admin-desktop-px:\s*1440/);
    assert.match(shellCss, /--gp-admin-mobile-px:\s*390/);

    const acShell = read("views/activeclinic/layouts/app-shell.ejs");
    assert.match(acShell, /data-gp-admin-console="AdminConsoleShell"/);
    assert.match(acShell, /data-gp-admin-console-stitch="AC-ADM-01"/);
    assert.match(acShell, /data-gp-admin-console-desktop="1440"/);
    assert.match(acShell, /data-gp-admin-console-mobile="390"/);

    const bbShell = read("views/blessboard/v5/partials/hq-shell-start.ejs");
    assert.match(bbShell, /data-gp-admin-console="AdminConsoleShell"/);
    assert.match(bbShell, /data-gp-admin-console-stitch="BB-ADM-01"/);
    assert.match(bbShell, /data-gp-admin-console-desktop="1440"/);
    assert.match(bbShell, /data-gp-admin-console-mobile="390"/);

    const acHome = read("views/activeclinic/app/home-content.ejs");
    assert.match(acHome, /data-ac-stitch-screen="AC-ADM-01"/);
    assert.match(acHome, /data-ac-stitch-desktop=".*11f37ed2bd054346ae93d7ca7a2fe5dc/);
    assert.match(acHome, /data-ac-stitch-mobile=".*f262fbc48ccc4541ab3c80292e051bf7/);
    assert.match(acHome, /Website/);

    const bbDash = read("views/blessboard/v5/hq/dashboard.ejs");
    assert.match(bbDash, /data-bb-stitch-screen="BB-ADM-01"/);
    assert.match(bbDash, /data-bb-stitch-desktop="528ccf3ebc5c4ea2a4cc610496b2c3ef"/);
    assert.match(bbDash, /data-bb-stitch-mobile="a3d953c5ea4348f1a8166deb1723c748"/);
    assert.match(bbDash, /Website/);
  });

  it("AC-WEB-ADM-01 + BB-WEB-ADM-01 — hub modules, actions, stitch markers", () => {
    assert.equal(WEBSITE_MANAGEMENT_HUB.stitchScreens.activeclinic, "AC-WEB-ADM-01");
    assert.equal(WEBSITE_MANAGEMENT_HUB.stitchScreens.blessboard, "BB-WEB-ADM-01");
    assert.deepEqual(WEBSITE_MANAGEMENT_HUB.previewWidths, {
      desktop: 1440,
      tablet: 768,
      mobile: 390,
    });

    for (const key of [
      "edit",
      "pages",
      "themes",
      "media",
      "history",
      "changeManager",
      "preview",
      "publish",
    ]) {
      assert.ok(
        HUB_MODULE_DEFS.some((m) => m.key === key),
        key
      );
    }

    const ac = buildWebsiteManagementHub({
      productCode: PRODUCT_CODE.ACTIVECLINIC,
      paths: defaultAcWebsiteHubPaths({
        clinicKey: "demo",
        actions: {
          editWebsite: "/clinics/demo?website_edit=1",
          preview: "/clinics/demo?website_mode=draft",
          history: "/clinics/demo/website/history",
        },
      }),
      capabilities: { canEdit: true, canPublish: true },
      draftChangesCount: 1,
      liveAvailable: true,
      exists: true,
    });
    assert.equal(ac.stitchScreen, "AC-WEB-ADM-01");
    assert.ok(ac.modules.some((m) => m.key === "changeManager"));
    assert.ok(ac.modules.some((m) => m.key === "themes"));
    assert.ok(ac.modules.some((m) => m.key === "preview"));
    assert.ok(ac.modules.some((m) => m.key === "publish"));

    const bb = buildWebsiteManagementHub({
      productCode: PRODUCT_CODE.BLESSBOARD,
      paths: defaultBbWebsiteHubPaths({
        actions: {
          editWebsite: "/c/demo?website_edit=1",
          preview: "/hq/content/preview/home",
          history: "/hq/website/publishing-history",
        },
      }),
      capabilities: { canEdit: true, canPublish: true },
      draftChangesCount: 0,
      liveAvailable: true,
      exists: true,
    });
    assert.equal(bb.stitchScreen, "BB-WEB-ADM-01");

    const acHub = read("views/activeclinic/app/settings-website-content.ejs");
    assert.match(acHub, /data-stitch-screen="AC-WEB-ADM-01"/);
    assert.match(acHub, /data-stitch-screen-mobile="AC-WEB-ADM-01"/);
    assert.match(acHub, /data-gp-website-management-hub="WebsiteManagementHub"/);

    const bbHub = read("views/blessboard/v5/hq/website-management.ejs");
    assert.match(bbHub, /data-stitch-screen="BB-WEB-ADM-01"/);
    assert.match(bbHub, /data-stitch-screen-mobile="BB-WEB-ADM-01"/);
    assert.match(bbHub, /data-gp-website-management-hub="WebsiteManagementHub"/);
  });

  it("AC-WEB-THM-01 + BB-WEB-THM-01 — theme controls + live preview 1440/768/390", () => {
    assert.equal(WEBSITE_MANAGEMENT_HUB.themeStitchScreens.activeclinic, "AC-WEB-THM-01");
    assert.equal(WEBSITE_MANAGEMENT_HUB.themeStitchScreens.blessboard, "BB-WEB-THM-01");
    assert.deepEqual(
      PRESENTATION_FAMILIES.map((f) => f.label).sort(),
      ["Clarity", "Community", "Editorial"]
    );
    assert.deepEqual(VIEWPORT_WIDTHS, { desktop: 1440, tablet: 768, mobile: 390 });
    assert.equal(LIVE_PREVIEW.architecture, "iframe");

    const acSel = buildThemeSelectorView({
      productCode: PRODUCT_CODE.ACTIVECLINIC,
      draftThemeId: PRESENTATION_FAMILIES[1].defaultThemeId,
      publishedThemeId: PRESENTATION_FAMILIES[0].defaultThemeId,
    });
    assert.equal(acSel.stitchScreen, "AC-WEB-THM-01");

    const bbSel = buildThemeSelectorView({
      productCode: PRODUCT_CODE.BLESSBOARD,
      draftThemeId: PRESENTATION_FAMILIES[2].defaultThemeId,
      publishedThemeId: PRESENTATION_FAMILIES[0].defaultThemeId,
    });
    assert.equal(bbSel.stitchScreen, "BB-WEB-THM-01");

    const preview = buildLivePreviewView({ stitchScreen: "AC-WEB-THM-01" });
    assert.equal(preview.pattern, "LivePreview");
    assert.ok(preview.viewports.some((v) => v.width === 1440));
    assert.ok(preview.viewports.some((v) => v.width === 390));

    const gallery = read("views/platform/website/theme-gallery-page.ejs");
    assert.match(gallery, /data-gp-theme-selector="ThemeSelector"/);
    assert.match(gallery, /data-gp-live-preview="LivePreview"/);
    assert.match(gallery, /data-stitch-screen="<%= page\.stitchScreen/);
    assert.match(gallery, /data-stitch-screen-mobile="<%= page\.stitchScreen/);
    assert.match(gallery, /data-website-viewport="desktop"/);
    assert.match(gallery, /data-website-viewport="tablet"/);
    assert.match(gallery, /data-website-viewport="mobile"/);
    assert.match(gallery, /data-website-viewport-width="1440"/);
    assert.match(gallery, /data-website-viewport-width="768"/);
    assert.match(gallery, /data-website-viewport-width="390"/);
    assert.match(gallery, /Apply to draft/);
    assert.match(gallery, /Applied to draft/);

    const galleryJs = read("public/platform/website-theme-gallery.js");
    assert.match(galleryJs, /data-website-viewport/);
    assert.match(galleryJs, /Apply to draft/);
    assert.match(galleryJs, /Applied to draft/);

    const galleryCss = read("public/platform/website-theme-gallery.css");
    assert.match(galleryCss, /gp-we-theme-gallery__viewport-btn/);
    assert.match(galleryCss, /max-width:\s*390px/);

    const acThemes = read("views/activeclinic/app/settings-website-themes.ejs");
    assert.match(acThemes, /data-stitch-screen="AC-WEB-THM-01"/);
    assert.match(acThemes, /data-stitch-screen-mobile="AC-WEB-THM-01"/);
    assert.match(acThemes, /Clarity, Editorial, or Community/);

    const themeHttp = read("src/platform/website/websiteThemeHttp.js");
    assert.match(themeHttp, /AC-WEB-THM-01/);
    assert.match(themeHttp, /BB-WEB-THM-01/);
  });
});
