"use strict";

/**
 * D15 — website section and theme contracts.
 * Database-free. Does not publish or mutate a website.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const ejs = require("ejs");

const { newSectionId } = require("../../../src/activeclinic/website/clinicWebsiteCms");
const { parseCmsSectionFieldKey } = require("../../../src/platform/website-engine/sectionLifecycle");
const {
  selectAppliedTheme,
  unwrapThemeValue,
} = require("../../../src/platform/website/websiteThemeService");
const { getTheme, listSelectableThemesForProduct } = require("../../../src/platform/website/themeRegistry");

const ROOT = path.join(__dirname, "../../..");
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function render(rel, locals) {
  const filename = path.join(ROOT, rel);
  return ejs.render(fs.readFileSync(filename, "utf8"), locals, { filename });
}

describe("D15 website sections and themes", () => {
  it("gives a new clinic section one uuid entity key and the supported fields", () => {
    const id = newSectionId();
    assert.match(id, UUID_RE);
    const parsed = parseCmsSectionFieldKey(`cms.section.${id}.bodyText`);
    assert.equal(parsed.sectionId, id);
    assert.equal(parsed.field, "body");

    const html = render("views/activeclinic/app/website-cms-section-settings.ejs", {
      csrfField: "_csrf",
      csrfToken: "token-d15",
      pageData: {
        cms: {
          clinicKey: "clinic-d15",
          section: {
            id,
            type: "image_text",
            title: "Welcome",
            heading: "Draft heading",
            body: "Draft section body",
            visible: true,
            image: { src: "/clinics/clinic-d15/website/media/hero", alt: "Clinic entrance", mediaId: id },
            button_label: "Visit",
            button_url: "/contact",
          },
        },
        cmsNav: {},
      },
      shell: {},
    });
    assert.match(html, new RegExp(`action="/app/settings/website/sections/${id}"`));
    assert.match(html, /name="heading"/);
    assert.match(html, /name="body"/);
    assert.match(html, /name="visible"/);
    assert.match(html, /name="imageSrc"/);
    assert.match(html, /name="imageAlt"/);
    assert.match(html, /Draft heading/);
    assert.match(html, /Draft section body/);

    const home = render("views/activeclinic/tenant/home.ejs", {
      clinic: {
        cmsSections: [
          {
            id,
            page_id: "tpl_home",
            type: "text",
            visible: true,
            heading: "Draft heading",
            body: "Draft section body",
          },
          {
            id: "11111111-1111-4111-8111-111111111111",
            page_id: "tpl_home",
            type: "text",
            visible: false,
            heading: "Hidden heading",
            body: "Hidden body",
          },
        ],
        cmsLibrary: [],
        cmsLibraryPlacements: [],
      },
      websiteEdit: false,
    });
    assert.match(home, /Draft heading/);
    assert.match(home, /Draft section body/);
    assert.equal(home.includes("Hidden heading"), false);
    assert.match(home, new RegExp(`data-ac-cms-section-id="${id}"`));
  });

  it("keeps a selected theme in draft until publish and rejects the other product", () => {
    assert.equal(unwrapThemeValue({ v: "bb.community" }), "bb.community");
    assert.equal(unwrapThemeValue({ value: { v: "ac.family-wellness-mint" } }), "ac.family-wellness-mint");
    assert.equal(unwrapThemeValue({ unexpected: true }), null);

    const draft = selectAppliedTheme({
      productCode: "activeclinic",
      mode: "draft",
      draftThemeId: { v: "ac.family-wellness-mint" },
      publishedThemeId: "ac.default",
    });
    assert.equal(draft.themeId, "ac.family-wellness-mint");
    assert.equal(draft.cssClass, "gp-website-theme--ac-family-wellness-mint");
    assert.equal(draft.published, false);

    const live = selectAppliedTheme({
      productCode: "activeclinic",
      mode: "live",
      draftThemeId: "ac.family-wellness-mint",
      publishedThemeId: "ac.default",
    });
    assert.equal(live.themeId, "ac.default");
    assert.equal(live.cssClass, "gp-website-theme--ac-default");
    assert.equal(live.published, true);

    const published = selectAppliedTheme({
      productCode: "blessboard",
      mode: "live",
      draftThemeId: "bb.default",
      publishedThemeId: { v: "bb.community" },
    });
    assert.equal(published.themeId, "bb.community");
    assert.equal(published.cssClass, "gp-website-theme--bb-community");

    assert.equal(
      selectAppliedTheme({
        productCode: "activeclinic",
        mode: "draft",
        draftThemeId: "bb.community",
      }).code,
      "invalid_theme"
    );
    assert.equal(getTheme("ac.family-wellness-mint", "blessboard"), null);
    assert.equal(
      listSelectableThemesForProduct("blessboard").some((theme) => theme.id.startsWith("ac.")),
      false
    );
    assert.equal(
      listSelectableThemesForProduct("activeclinic").some((theme) => theme.id.startsWith("bb.")),
      false
    );

    const routes = fs.readFileSync(
      path.join(ROOT, "src/activeclinic/http/activeClinicWebsiteCmsRoutes.js"),
      "utf8"
    );
    assert.match(routes, /sectionErrorStatus/);
    assert.match(routes, /code === "not_found"/);
    assert.match(routes, /code === "forbidden"/);
  });
});
