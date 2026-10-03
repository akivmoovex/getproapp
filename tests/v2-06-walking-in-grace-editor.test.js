"use strict";

/**
 * V2.06 — Home “Walking in Grace” / Listen and Reflect sermon feature
 * must reuse existing structured website editor (parity with sermons featured
 * + home leader cards): text + image, save, reopen overlay, publish path, auth.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ejs = require("ejs");

const {
  applyStructuredDraftsToModel,
} = require("../src/blessboard/services/websiteStructuredDraftService");
const {
  validateStructuredPayload,
} = require("../src/blessboard/services/websiteStructuredDraftValidation");
const {
  resolveEditableField,
} = require("../src/blessboard/services/websiteInlineEditableFields");
const {
  hasWebsitePermission,
  PERMISSIONS,
} = require("../src/platform/website/permissions");
const {
  buildPublicDemoPack,
} = require("../src/blessboard/services/tenantPublicDemoContent");

const ROOT = path.join(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("V2.06 Walking in Grace home sermon editor", () => {
  it("sermons_intro section remains on editable-field + image coverage contracts", () => {
    assert.ok(resolveEditableField("home", "sermons_intro", "heading"));
    assert.ok(resolveEditableField("home", "sermons_intro", "bodyText"));
    assert.ok(resolveEditableField("home", "sermons_intro", "buttonText"));
    const coverage = read("src/blessboard/website/blessboardImageEditorCoverage.js");
    assert.match(coverage, /bb\.home\.sermon\.image/);
    assert.match(coverage, /home\.sermons_intro\.sermon\.imageUrl/);
  });

  it("demo pack exposes Walking in Grace series for public home teaser", () => {
    const pack = buildPublicDemoPack({ publicName: "Test Church" });
    assert.equal(pack.home.sermonIntroHeading, "Listen and Reflect");
    assert.ok(pack.sermons.some((s) => s.series === "Walking in Grace"));
    assert.ok(pack.sermons.some((s) => s.category === "Walking in Grace"));
  });

  it("home wires image pencil + Edit details with series in payload (parity with sermons featured)", () => {
    const home = read("views/blessboard/v5/public/home.ejs");
    assert.match(home, /data-bb-sermon-feature="1"/);
    assert.match(home, /entity-image-edit-trigger/);
    assert.match(home, /editButtonText:\s*'Edit details'/);
    assert.match(home, /editKind:\s*'sermon'/);
    assert.match(home, /series:\s*_homeSermonSeries/);
    assert.match(home, /data-bb-sermon-series="1"/);
    assert.match(home, /bb-tp-sermon-feature__edit-actions/);
  });

  it("CSS surfaces home sermon image pencil over overflow-clipped media", () => {
    const css = read("public/blessboard/v5/tenant-public.css");
    assert.match(css, /\.bb-tp-sermon-feature__media\.bb-tp-edit-media-wrap/);
    assert.match(css, /\.bb-tp-sermon-feature__media \.bb-tp-structured-pencil/);
    assert.match(css, /\.bb-tp-sermon-feature__edit-actions/);
  });

  it("renders edit controls for Walking in Grace soft-fill sermon; public mode has none", async () => {
    const homePath = path.join(ROOT, "views/blessboard/v5/public/home.ejs");
    // Render only the sermon feature fragment via a tiny harness template.
    const fragment = `
      <% var teasers = homeTeasers; %>
      <% var sermon = teasers.sermons[0]; %>
      <% var _homeSermonKey = String(sermon.id || ('sermon-' + (sermon.title || 'home'))); %>
      <% var _homeSermonSeries = sermon.series || sermon.category || ''; %>
      <% var _homeSermonPayload = {
        title: sermon.title || '',
        speakerName: sermon.speakerName || '',
        preachedAt: sermon.preachedAt || '',
        summary: sermon.summary || '',
        scripture: sermon.scripture || '',
        series: _homeSermonSeries,
        category: _homeSermonSeries,
        mediaUrl: sermon.mediaUrl || '',
        imageUrl: sermon.imageUrl || '',
        placement: null,
        featured: true,
        visible: true
      }; %>
      <article data-bb-sermon-feature="1">
        <div class="bb-tp-sermon-feature__media bb-tp-edit-media-wrap">
          <%- include(partials + '/entity-image-edit-trigger', {
            editKind: 'sermon',
            editEntityKey: _homeSermonKey,
            editPayload: _homeSermonPayload
          }) %>
        </div>
        <div>
          <% if (_homeSermonSeries) { %><p data-bb-sermon-series="1"><%= _homeSermonSeries %></p><% } %>
          <h3><%= sermon.title %></h3>
          <% if (websiteAdmin && websiteAdmin.editingMode) { %>
          <%- include(partials + '/structured-edit-trigger', {
            editKind: 'sermon',
            editEntityKey: _homeSermonKey,
            editLabel: 'Edit details',
            editDialogTitle: 'Edit details',
            editButtonText: 'Edit details',
            editPayload: _homeSermonPayload
          }) %>
          <% } %>
        </div>
      </article>
    `;
    const sermon = {
      id: "demo-sermon-1",
      title: "Finding Peace in the Noise",
      speakerName: "Pastor Jordan Hale",
      preachedAt: "2026-09-26T00:00:00.000Z",
      category: "Walking in Grace",
      series: "Walking in Grace",
      summary: "When life feels crowded…",
      scripture: "Philippians 4:6-7",
      imageUrl: "/media/demo/sermon.jpg",
    };
    const editHtml = ejs.render(
      fragment,
      {
        homeTeasers: { sermons: [sermon] },
        websiteAdmin: { editingMode: true },
        partials: path.join(ROOT, "views/blessboard/v5/partials"),
      },
      { filename: homePath }
    );
    assert.match(editHtml, /Walking in Grace/);
    assert.match(editHtml, /data-bb-kind="sermon"/);
    assert.match(editHtml, /data-bb-entity="demo-sermon-1"/);
    assert.match(editHtml, /data-bb-edit-details="1"/);
    assert.match(editHtml, /Edit details/);
    assert.match(editHtml, /aria-label="Edit image"/);
    assert.match(editHtml, /series[^"]*Walking in Grace/);

    const publicHtml = ejs.render(
      fragment,
      {
        homeTeasers: { sermons: [sermon] },
        websiteAdmin: { editingMode: false },
        partials: path.join(ROOT, "views/blessboard/v5/partials"),
      },
      { filename: homePath }
    );
    assert.match(publicHtml, /Walking in Grace/);
    assert.doesNotMatch(publicHtml, /data-bb-edit-details/);
    assert.doesNotMatch(publicHtml, /data-bb-structured-open/);
  });

  it("text/image draft save validates series and overlays home teaser for reopen", () => {
    const validated = validateStructuredPayload(
      "sermon",
      {
        title: "Finding Peace UPDATED",
        speakerName: "Pastor Jordan Hale",
        date: "2026-09-26",
        series: "Walking in Grace",
        scripture: "Philippians 4:6-7",
        description: "Updated summary for draft reopen.",
        imageUrl: "https://cdn.example.test/sermon.jpg",
        featured: true,
        visible: true,
      },
      "upsert"
    );
    assert.equal(validated.ok, true, validated.error);
    assert.equal(validated.payload.series, "Walking in Grace");
    assert.match(String(validated.payload.summary || ""), /Category:\s*Walking in Grace/);

    const model = {
      pageKey: "home",
      homeTeasers: {
        sermons: [
          {
            id: "demo-sermon-1",
            title: "Finding Peace in the Noise",
            category: "Walking in Grace",
            series: "Walking in Grace",
            imageUrl: "/old.jpg",
          },
        ],
      },
    };
    applyStructuredDraftsToModel(model, [
      {
        draftKind: "sermon",
        pageKey: "home",
        op: "upsert",
        entityKey: "demo-sermon-1",
        payload: validated.payload,
      },
    ]);
    const overlay = model.homeTeasers.sermons[0];
    assert.equal(overlay.title, "Finding Peace UPDATED");
    assert.equal(overlay.series, "Walking in Grace");
    assert.equal(overlay.category, "Walking in Grace");
    assert.equal(overlay.imageUrl, "https://cdn.example.test/sermon.jpg");
  });

  it("authorization: website.edit required; publish is a distinct permission", () => {
    assert.equal(hasWebsitePermission(["website.view"], PERMISSIONS.EDIT), false);
    assert.equal(hasWebsitePermission(["website.edit"], PERMISSIONS.EDIT), true);
    assert.equal(hasWebsitePermission(["website.edit"], PERMISSIONS.PUBLISH), false);
    assert.equal(hasWebsitePermission(["website.publish"], PERMISSIONS.PUBLISH), true);
  });

  it("structured editor form includes Series field used for Walking in Grace", () => {
    const js = read("public/blessboard/v5/website-structured-edit.js");
    assert.match(js, /field\("Series",\s*"series"/);
    assert.match(js, /p\.series\s*\|\|\s*p\.category/);
  });
});
