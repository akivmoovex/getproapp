"use strict";

/**
 * MW01–MW07 Stitch chrome/copy contracts. Semantic selectors only — not pixel tests.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("activeclinic MW Stitch parity chrome", () => {
  it("Clinic Editor chrome exposes Pages, Sections, Assets, History, Publish and omits Theme", () => {
    const nav = read("views/activeclinic/partials/website-cms-nav.ejs");
    assert.match(nav, />Clinic Editor</);
    assert.match(nav, /data-ac-mw-nav="pages">Pages</);
    assert.match(nav, /data-ac-mw-nav="sections">Sections</);
    assert.match(nav, /data-ac-mw-nav="media">Assets</);
    assert.match(nav, /data-ac-mw-nav="history">History</);
    assert.match(nav, /data-ac-mw-nav="publish">Publish</);
    assert.match(nav, /edit_note<\/span>\s*Editor/);
    assert.match(nav, /layers<\/span>\s*Layers/);
    assert.match(nav, /image<\/span>\s*Media/);
    assert.match(nav, />Back to clinic app</);
    assert.doesNotMatch(nav, />Theme</);
    assert.doesNotMatch(nav, />Emergency</);
  });

  it("CMS screens keep Stitch titles and working upload/publish controls", () => {
    const pages = read("views/activeclinic/app/website-cms-pages.ejs");
    assert.match(pages, />Pages Manager</);
    assert.match(pages, /\+ Add New Page/);
    assert.match(pages, /name="pageIds"/);

    const pageNew = read("views/activeclinic/app/website-cms-page-new.ejs");
    assert.match(pageNew, />Add New Page</);
    assert.match(pageNew, /Select a Template/);
    assert.match(pageNew, /e\.g\., Patient Portal/);

    const pageSettings = read("views/activeclinic/app/website-cms-page-settings.ejs");
    assert.match(pageSettings, />Page Settings</);
    assert.match(pageSettings, /Basic Information/);
    assert.match(pageSettings, /Search Engine Optimization \(SEO\)/);
    assert.match(pageSettings, />Save Changes</);

    const sections = read("views/activeclinic/app/website-cms-sections.ejs");
    assert.match(sections, />Homepage Sections</);
    assert.match(sections, /\+ Add Section/);
    assert.match(sections, /id="ac-mw-add-section"/);
    assert.match(sections, /name="sectionIds"/);

    const builder = read("views/activeclinic/app/website-cms-builder.ejs");
    assert.match(builder, />Clinic Builder</);
    assert.match(builder, />Add Content Block</);
    assert.match(builder, /id="ac-mw-add-block"/);
    assert.match(builder, /method="post"/);

    const media = read("views/activeclinic/app/website-cms-media.ejs");
    // The Stitch heading now comes from the shared library view model, which
    // both products render, so assert it where it is actually set.
    assert.match(
      read("src/activeclinic/http/activeClinicWebsiteCmsRoutes.js"),
      /heading: selectMode \? "Select from Media Library" : "Media Library"/
    );
    assert.match(media, /cms\.renderLibrary\(/);
    assert.match(media, /Upload Media/);
    assert.match(media, /name="file"/);
    assert.match(media, /data-ac-mw-upload="1"/);
    assert.match(media, />Media Details</);
    assert.doesNotMatch(media, />Videos</);
    assert.doesNotMatch(media, /Search by tag/);

    const publish = read("views/activeclinic/app/website-cms-publish.ejs");
    assert.match(publish, /Site Status &amp; Publishing/);
    assert.match(publish, />Publish All Changes</);
    assert.match(publish, />Preview Site</);
    assert.match(publish, /Unpublished Changes/);
    assert.match(publish, /onsubmit="return confirm\(/);
    assert.doesNotMatch(publish, /name="publishNote"/);

    const history = read("views/activeclinic/tenant/website-history.ejs");
    assert.match(history, />Version History</);
    assert.match(history, /Restore as new draft/);
    assert.match(history, /method="post"/);
  });

  it("tenant home uses Stitch section labels without fake listing badges", () => {
    const home = read("views/activeclinic/tenant/home.ejs");
    assert.match(home, /Our Services/);
    assert.match(home, /Lead Physicians/);
    assert.match(home, /Opening Hours/);
    assert.match(home, /Visit Our Campus/);
    assert.match(home, /Book Appointment/);
    assert.doesNotMatch(home, /Listed on ActiveClinic/);
    assert.doesNotMatch(home, /Emergency/);

    const header = read("views/activeclinic/partials/public-tenant-header.ejs");
    assert.match(header, /Book Appointment/);
    assert.doesNotMatch(header, /Emergency/);

    const footer = read("src/activeclinic/website/activeClinicClinicWebsiteNav.js");
    assert.match(footer, /Privacy Policy/);
    assert.match(footer, /Terms of Service/);
    assert.match(footer, /Patient Portal/);
    assert.match(footer, /Contact Us/);
  });

  it("inline editor chrome uses the shared Stitch shell and real CMS destinations", () => {
    const chrome = read("views/activeclinic/partials/website-editor-chrome.ejs");
    const shared = read("views/platform/website-engine/editor-chrome.ejs");
    const attach = read("src/activeclinic/http/attachActiveClinicWebsiteChrome.js");
    assert.match(chrome, /platform\/website-engine\/editor-chrome/);
    assert.match(shared, /Editing website/);
    assert.match(attach, /href: "\/app\/settings\/website\/pages"/);
    assert.match(attach, /href: "\/app\/settings\/website\/sections"/);
    assert.match(attach, /href: "\/app\/settings\/website\/media"/);
    assert.match(shared, /labels\.publish \|\| 'Publish'/);
    assert.match(shared, /publishPath/);
    assert.doesNotMatch(chrome, />Theme</);
  });

  it("CMS shell hides staff ops chrome and versions ActiveClinic CSS", () => {
    const css = read("public/activeclinic/website-cms.css");
    assert.match(css, /\.ac-app-body--mw \.ac-sidebar/);
    assert.match(css, /background: #0b1c30/);
    assert.match(css, /\.ac-mw-editor__tab[\s\S]{0,180}min-height:\s*2\.75rem/);
    assert.match(css, /\.ac-mw-editor__rail-link[\s\S]{0,180}min-height:\s*2\.75rem/);
    assert.match(
      read("src/activeclinic/services/buildActiveClinicShellViewModel.js"),
      /v7-urp-1/
    );
    assert.match(read("src/activeclinic/http/renderActiveClinicPublic.js"), /v7-proj106-p6/);
    const shell = read("views/activeclinic/layouts/app-shell.ejs");
    assert.match(shell, /ac-app-body--mw/);
    assert.match(shell, /Material\+Symbols\+Outlined/);
  });
});
