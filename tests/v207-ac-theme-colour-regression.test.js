"use strict";

/**
 * V2.07 ActiveClinic Themes + Colours regression contract.
 *
 * The real HTTP/database lifecycle is exercised by
 * shared-website-editor-wave4b2.test.js. This focused file guards the
 * product-specific wiring and coexistence contract without introducing a
 * second persistence model.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");

describe("V2.07 ActiveClinic Themes + Colours", () => {
  const routes = read("src/activeclinic/http/activeClinicWebsiteRoutes.js");
  const cmsRoutes = read("src/activeclinic/http/activeClinicWebsiteCmsRoutes.js");
  const branding = read("src/platform/website/branding.js");
  const settings = read("src/platform/website/websiteSettingsHttp.js");
  const resolver = read("src/activeclinic/website/activeClinicWebsiteResolver.js");
  const themeService = read("src/platform/website/websiteThemeService.js");
  const publicShell = read("views/activeclinic/layouts/public-shell.ejs");

  it("covers theme selector draft/reload/publish/public flow", () => {
    assert.match(routes, /handleGetThemeState/);
    assert.match(routes, /handleSaveThemeDraft/);
    assert.match(themeService, /draftValue/);
    assert.match(themeService, /publishedValue/);
    assert.match(routes, /publishProductWebsite/);
    assert.match(publicShell, /websiteThemeId/);
  });

  it("covers canonical colour draft/reload/publish/public flow", () => {
    assert.match(branding, /brand\.primary_color/);
    assert.match(branding, /brand\.accent_color/);
    assert.match(settings, /brand\.primary_color/);
    assert.match(settings, /brand\.accent_color/);
    assert.match(cmsRoutes, /saveSiteSettings/);
    assert.match(resolver, /brandPrimary/);
    assert.match(resolver, /brandAccent/);
  });

  it("preserves theme and colours as independent draft fields", () => {
    assert.match(themeService, /THEME_CONTENT_KEY/);
    assert.match(settings, /primaryColorText/);
    assert.match(settings, /accentColorText/);
    assert.doesNotMatch(settings, /themeId.*primary_color|primary_color.*themeId/s);
  });

  it("retains safe invalid/reset and authorization contracts", () => {
    assert.match(branding, /HEX_COLOR_RE/);
    assert.match(branding, /normalizeHexColor/);
    assert.match(routes, /canEditClinicWebsite/);
    assert.match(cmsRoutes, /requirePermission\(PERMISSIONS\.EDIT\)/);
  });

  it("keeps tenant scoping on both theme and colour persistence", () => {
    assert.match(routes, /organizationKey/);
    assert.match(cmsRoutes, /organizationId/);
    assert.match(branding, /instanceRepo\.findWebsiteInstanceByOrgProduct/);
  });
});
