"use strict";

/**
 * BB-04 — New sermon creation route/form/validation contracts.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const { buildSermonFields } = require("../../../src/blessboard/services/publicContentAdminService");

const ROOT = path.join(__dirname, "../../..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const THUMB = "/_bb/media/11111111-1111-4111-8111-111111111111";

describe("BB-04 new sermon contracts", () => {
  it("GET/POST branch sermon create routes enforce CSRF and branch scope", () => {
    const src = read("src/routes/church/branchAdminSermons.js");
    assert.match(src, /router\.get\("\/branch\/sermons\/new"/);
    assert.match(src, /router\.post\("\/branch\/sermons"/);
    assert.match(src, /requireChurchSessionCsrf/);
    assert.match(src, /requireChurchBranchAdminSession/);
    assert.match(src, /createSermonForBranch/);
    assert.match(src, /organization_id: org\.id/);
    assert.match(src, /branch_id: branch\.id/);
    assert.match(src, /Title is required/);
  });

  it("sermon form posts required title and optional media fields", () => {
    const form = read("views/church/branch-admin/sermon_form.ejs");
    assert.match(form, /method="post"/);
    assert.match(form, /action="<%= isEdit \? '\/branch\/sermons\/' \+ sermonId : '\/branch\/sermons' %>"/);
    assert.match(form, /name="title"/);
    assert.match(form, /name="speaker"/);
    assert.match(form, /name="media_url"|name="sermon_date"/);
  });

  it("publish intent is explicit via _intent rather than silent publish", () => {
    const src = read("src/routes/church/branchAdminSermons.js");
    assert.match(src, /body\._intent === "publish"/);
    assert.match(src, /status: publish \? "published" : "draft"/);
  });

  it("GET /branch/sermons/new is registered before the :sermonId route", () => {
    const src = read("src/routes/church/branchAdminSermons.js");
    const createAt = src.indexOf('router.get("/branch/sermons/new"');
    const paramAt = src.indexOf('"/branch/sermons/:sermonId"');
    assert.ok(createAt > 0);
    assert.ok(paramAt > createAt);
    assert.match(src, /optionalSermonDate/);
    assert.match(src, /optionalHttpsMedia/);
    assert.match(src, /sermonCreateError/);
    assert.match(src, /status\(400\)/);
  });

  it("Add sermon is a visible button, and the content-admin create form stays open", () => {
    const page = read("views/blessboard/v5/public/sermons.ejs");
    const admin = read("views/blessboard/v5/content-admin/entities.ejs");
    const hint = read("views/platform/website-engine/add-section-picker.ejs");
    const css = read("public/blessboard/v5/tenant-public.css");
    assert.match(page, /editButtonText: 'Add sermon'/);
    assert.match(page, /editEntityKey: 'new-sermon'/);
    assert.doesNotMatch(page, /<span class="bb-tp-se-hint">Add sermon<\/span>/);
    assert.match(css, /\.bb-tp-edit-collection-actions \.bb-tp-structured-pencil/);
    assert.match(css, /\.bb-tp-structured-edit-cta \{[^}]*display:\s*inline-flex/);
    assert.match(hint, /data-website-member-action/);
    assert.match(admin, /data-bb-sermons-action="new"/);
    assert.match(admin, /data-bb-sermons-create-card/);
    assert.match(admin, /createOpen \|\| isEvents \|\| isSermons/);
    assert.match(admin, /data-bb-sermons-create-card/);
    assert.match(admin, /data-bb-sermons-form="create"/);
    assert.match(admin, /name="action" value="create"/);
    assert.match(admin, /name="_csrf"/);
    const createAt = admin.indexOf('data-bb-sermons-form="create"');
    assert.ok(createAt > admin.indexOf('id="bb-ca-entity-create-form"'));
    assert.doesNotMatch(admin.slice(createAt, createAt + 700), /name="item_id"/);
  });

  it("requires title, speaker, and a real preached date, and keeps an edit that omits them", () => {
    const missing = buildSermonFields({ title: "Hope" }, { partial: false });
    assert.equal(missing.ok, false);

    const badDate = buildSermonFields(
      { title: "Hope", speakerName: "Ada", preachedAt: "18/07/2026", status: "draft" },
      { partial: false }
    );
    assert.equal(badDate.ok, false);
    assert.equal(badDate.reason, "preached_at");

    const created = buildSermonFields(
      {
        title: "Hope",
        speakerName: "Ada",
        preachedAt: "2026-07-18",
        summary: "Sunday message",
        status: "draft",
      },
      { partial: false }
    );
    assert.equal(created.ok, true);
    assert.equal(created.fields.title, "Hope");
    assert.equal(created.fields.speakerName, "Ada");
    assert.equal(created.fields.preachedAt, "2026-07-18T00:00:00.000Z");
    assert.equal(created.fields.status, "draft");

    const edited = buildSermonFields({ title: "Hope revised" }, { partial: true });
    assert.equal(edited.ok, true);
    assert.equal(edited.fields.title, "Hope revised");
    assert.equal(Object.prototype.hasOwnProperty.call(edited.fields, "preachedAt"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(edited.fields, "imageUrl"), false);
  });

  it("accepts a library thumbnail and https media, and rejects insecure media", () => {
    const good = buildSermonFields(
      {
        title: "Hope",
        speakerName: "Ada",
        preachedAt: "2026-07-18",
        mediaUrl: "https://example.com/sermons/hope.mp3",
        imageUrl: THUMB,
        status: "published",
      },
      { partial: false }
    );
    assert.equal(good.ok, true);
    assert.equal(good.fields.imageUrl, THUMB);
    assert.equal(good.fields.mediaUrl, "https://example.com/sermons/hope.mp3");
    assert.equal(good.fields.status, "published");

    const httpMedia = buildSermonFields(
      {
        title: "Hope",
        speakerName: "Ada",
        preachedAt: "2026-07-18",
        mediaUrl: "http://example.com/sermon.mp3",
        status: "draft",
      },
      { partial: false }
    );
    assert.equal(httpMedia.ok, false);

    const blankImage = buildSermonFields(
      {
        title: "Hope",
        speakerName: "Ada",
        preachedAt: "2026-07-18",
        imageUrl: "",
        mediaUrl: "",
        status: "draft",
      },
      { partial: false }
    );
    assert.equal(blankImage.ok, true);
    assert.equal(blankImage.fields.imageUrl, null);
    assert.equal(blankImage.fields.mediaUrl, null);
  });

  it("publication, authorization, and tenant scope stay on the existing routes", () => {
    const branch = read("src/routes/church/branchAdminSermons.js");
    const admin = read("src/blessboard/http/contentAdminRoutes.js");
    const repo = read("src/db/pg/church/sermonsRepo.js");
    const service = read("src/blessboard/services/publicContentAdminService.js");
    assert.match(branch, /requireChurchBranchAdminSession/);
    assert.match(branch, /requireChurchSessionCsrf/);
    assert.match(branch, /body\._intent === "publish"/);
    assert.match(branch, /status: publish \? "published" : "draft"/);
    assert.match(branch, /organization_id: org\.id/);
    assert.match(branch, /branch_id: branch\.id/);
    assert.match(branch, /updateSermonForBranch/);
    assert.match(admin, /sermons:\s*\{[\s\S]*createFn: createSermon/);
    assert.match(admin, /validateCsrfPost/);
    assert.match(admin, /gateContent/);
    assert.match(admin, /if \(!item \|\| item\.churchId !== scope\.churchId\) return false/);
    assert.match(admin, /action === "update"/);
    assert.match(repo, /WHERE s\.id = \$1 AND s\.branch_id = \$2/);
    assert.match(repo, /s\.status = 'published'/);
    assert.match(service, /built\.fields\.status === "published"/);
    assert.match(service, /requirePublishConfirm/);
  });
});
