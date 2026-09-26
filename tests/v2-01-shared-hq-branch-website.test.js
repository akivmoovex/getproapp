"use strict";

/**
 * V2.01 shared HQ/branch website management (E1).
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const {
  buildWebsiteScopeListPageView,
  publicationLabel,
} = require("../src/platform/website/websiteScopeListPageModel");
const {
  presentInheritanceState,
  presentActiveClinicInheritance,
  LABELS,
} = require("../src/platform/website/websiteInheritancePresentation");
const {
  buildPublicWebsiteWebsitesPath,
  PRODUCT_CODE,
} = require("../src/platform/website/publicWebsiteUrl");
const { presentEditorShell } = require("../src/platform/website-engine/editorShell");
const {
  buildFieldViewModel,
} = require("../src/blessboard/services/branchWebsiteSettingsEditorView");
const { SOURCE } = require("../src/blessboard/services/resolveBranchWebsiteSettings");

function read(rel) {
  return fs.readFileSync(path.join(__dirname, "..", rel), "utf8");
}

describe("V2_01 shared HQ/branch website management", () => {
  it("builds authorized website cards with pending + live/edit links", () => {
    const page = buildWebsiteScopeListPageView({
      productCode: PRODUCT_CODE.BLESSBOARD,
      siteLabel: "QA Church",
      websites: [
        {
          id: "hq",
          name: "QA Church — Headquarters",
          scopeKind: "hq",
          scopeLabel: "Headquarters",
          publicationStatus: "published",
          pendingChangeCount: 0,
          editHref: "/c/qa?website_edit=1",
          liveHref: "/c/qa",
          isCurrent: true,
        },
        {
          id: "branch:campus-a",
          name: "Campus A",
          scopeKind: "branch",
          scopeLabel: "Branch",
          publicationStatus: "published",
          pendingChangeCount: 2,
          editHref: "/c/qa/campus-a?website_edit=1",
          liveHref: "/c/qa/campus-a",
        },
      ],
    });
    assert.equal(page.pageTitle, "Choose Website to Edit");
    assert.equal(page.multiWebsite, true);
    assert.equal(page.websites.length, 2);
    assert.equal(page.websites[1].pendingLabel, "2 pending changes");
    assert.equal(publicationLabel("coming_soon"), "Draft");
  });

  it("exposes website chooser path builders for BB and AC", () => {
    assert.match(
      buildPublicWebsiteWebsitesPath({
        product: PRODUCT_CODE.BLESSBOARD,
        organizationKey: "bb-demo",
      }),
      /\/website\/websites$/
    );
    assert.match(
      buildPublicWebsiteWebsitesPath({
        product: PRODUCT_CODE.ACTIVECLINIC,
        organizationKey: "ac-demo",
      }),
      /\/website\/websites$/
    );
    assert.match(
      buildPublicWebsiteWebsitesPath({
        product: PRODUCT_CODE.BLESSBOARD,
        organizationKey: "bb-demo",
        scope: { kind: "branch", branchKey: "campus-a" },
      }),
      /campus-a\/website\/websites$/
    );
  });

  it("presents Screen 7 inheritance wording for BB settings fields", () => {
    const inherited = presentInheritanceState("inherited", {
      parentChurchLabel: "HQ Church",
    });
    assert.equal(inherited.badgeLabel, LABELS.fromHeadquarters);
    assert.match(inherited.detail, /From Headquarters/);
    const overridden = presentInheritanceState("overridden");
    assert.equal(overridden.resetActionLabel, LABELS.returnToHeadquartersDefault);
    assert.equal(presentActiveClinicInheritance().supported, false);

    const field = buildFieldViewModel(
      "identity.tagline",
      { source: SOURCE.CHURCH_DEFAULT, value: "Hello" },
      { parentChurchLabel: "HQ Church", allowHide: true }
    );
    assert.equal(field.stateLabel, "From Headquarters");
    assert.match(field.resetActionLabel, /Headquarters Default/);
  });

  it("shows selected website name and HQ publish caution in editor shell", () => {
    const shell = presentEditorShell({
      productCode: PRODUCT_CODE.BLESSBOARD,
      organizationKey: "bb-demo",
      pageKey: "home",
      editing: true,
      canEdit: true,
      canPublish: true,
      unpublishedCount: 1,
      websiteName: "Campus A",
      websiteScopeKind: "hq",
      changeWebsiteHref: "/c/bb-demo/website/websites",
      moreItems: [
        {
          id: "change-website",
          label: "Change Website",
          href: "/c/bb-demo/website/websites",
          group: "general",
        },
      ],
    });
    assert.equal(shell.labels.editingWebsite, "Editing website");
    assert.equal(shell.websiteName, "Campus A");
    assert.match(shell.labels.publishConfirmBody, /inherit live HQ/);
    assert.equal(shell.changeWebsiteHref, "/c/bb-demo/website/websites");
    assert.ok(shell.moreItems.some((item) => item.id === "change-website"));
  });

  it("wires shared list page, CSS, routes, and chrome", () => {
    assert.match(read("views/platform/website/website-scope-list-page.ejs"), /data-gp-website-scope-list/);
    assert.match(read("public/platform/website-scope-list.css"), /gp-we-scope-card/);
    assert.match(read("public/platform/website-scope-list.css"), /max-width:\s*640px/);
    assert.match(read("src/platform/website/renderWebsiteScopeList.js"), /v2-spt6-cards-1/);
    assert.match(
      read("src/blessboard/http/blessboardWebsiteEditorRoutes.js"),
      /website\/websites/
    );
    assert.match(
      read("src/activeclinic/http/activeClinicWebsiteRoutes.js"),
      /website\/websites/
    );
    assert.match(
      read("src/blessboard/http/attachWebsiteAdminChrome.js"),
      /Change Website/
    );
    assert.match(
      read("src/activeclinic/http/attachActiveClinicWebsiteChrome.js"),
      /websiteWebsitesUrl/
    );
    assert.doesNotMatch(
      read("src/activeclinic/http/attachActiveClinicWebsiteChrome.js"),
      /id: "change-website"/
    );
    assert.match(
      read("views/blessboard/v5/hq/branch-website-settings.ejs"),
      /Return to Headquarters Default/
    );
    assert.ok(fs.existsSync(path.join(__dirname, "../src/blessboard/website/blessboardAuthorizedWebsiteScopes.js")));
    assert.ok(
      fs.existsSync(
        path.join(__dirname, "../src/activeclinic/website/activeClinicAuthorizedWebsiteScopes.js")
      )
    );
  });
});
