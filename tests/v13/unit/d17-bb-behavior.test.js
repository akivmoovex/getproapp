"use strict";

/**
 * D17 BlessBoard behavior. Query doubles are not database persistence.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const http = require("http");

const {
  assertEditableMutation,
  resolveEditableField,
  PRODUCT_CODE,
} = require("../../../src/platform/website/editableFieldSchema");
const {
  isPubliclyVisible,
  resolveEffectiveStatus,
  evaluateAnnouncementCapability,
  httpsOrMediaUrl,
  publicAnnouncementImageDto,
  listPublicWebsiteAnnouncements,
  getPublicWebsiteAnnouncement,
  mediaAssetVisibleOnPublicAnnouncement,
} = require("../../../src/blessboard/services/announcementsService");
const {
  buildEventFields,
  buildSermonFields,
} = require("../../../src/blessboard/services/publicContentAdminService");
const { validateEventBody } = require("../../../src/church/announcementsEventsValidation");
const { submitPublicChurchEnquiry } = require("../../../src/blessboard/services/publicChurchContactService");
const { acceptMemberPortalInvitation } = require("../../../src/blessboard/services/memberPortalInvitationService");
const {
  issueCsrfToken,
  validateCsrf,
  CSRF_FIELD,
  getCsrfCookieName,
} = require("../../../src/platform/http/v5Csrf");
const express = require("express");

const CHURCH_A = "11111111-1111-4111-8111-111111111111";
const CHURCH_B = "44444444-4444-4444-8444-444444444444";
const ORG_A = "22222222-2222-4222-8222-222222222222";
const ORG_B = "55555555-5555-4555-8555-555555555555";
const BRANCH_A = "33333333-3333-4333-8333-333333333333";
const BRANCH_B = "66666666-6666-4666-8666-666666666666";
const ANN = "77777777-7777-4777-8777-777777777777";
const MEDIA = "88888888-8888-4888-8888-888888888888";
const ENV = {
  NODE_ENV: "test",
  SESSION_SECRET: "d17-bb-behavior-secret-at-least-32-chars",
};

function section(sectionKey, fieldKey, value, permissions) {
  return assertEditableMutation({
    productCode: PRODUCT_CODE.BLESSBOARD,
    pageKey: "home",
    sectionKey,
    fieldKey,
    value,
    requirePermission: true,
    grantedPermissions: permissions || ["website.edit"],
  });
}

function announcementRow(overrides) {
  return {
    id: ANN,
    church_id: CHURCH_A,
    branch_id: null,
    title: "Sunday",
    body: "Worship at nine",
    status: "published",
    is_pinned: false,
    is_featured: false,
    action_url: null,
    action_label: null,
    published_at: "2026-01-01T00:00:00.000Z",
    created_by_user_id: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    timezone: "UTC",
    starts_at: null,
    ends_at: null,
    ...overrides,
  };
}

function announcementClient(state) {
  return {
    async query(sql, params) {
      const text = String(sql);
      if (text.includes("att.media_asset_id")) {
        return { rows: state.mediaVisible ? [{ ok: 1 }] : [] };
      }
      if (text.includes("announcement_attachments")) {
        return { rows: state.attachments || [] };
      }
      if (text.includes("FROM blessboard.announcement_audiences") && !text.includes("INNER JOIN")) {
        return { rows: state.audiences || [] };
      }
      if (text.includes("WHERE id = $1") && text.includes("blessboard.announcements")) {
        const row = (state.byId || {})[params[0]];
        return { rows: row ? [row] : [] };
      }
      if (text.includes("audience_key = 'public'")) {
        return { rows: state.publicRows || [] };
      }
      return { rows: [] };
    },
  };
}

describe("D17 BlessBoard behavior", () => {
  it("edits each homepage section type without changing another section", () => {
    const text = section("text_intro", "bodyText", "Opening words");
    const image = section("image_banner", "image", { url: "https://cdn.example/a.jpg", alt: "Hall" });
    const story = section("story_witness", "heading", "A witness");
    const cta = section("cta_visit", "buttonText", "Plan a visit");
    const url = section("cta_visit", "buttonUrl", "/visit");
    assert.equal(text.ok, true);
    assert.equal(image.ok, true);
    assert.equal(story.ok, true);
    assert.equal(cta.ok, true);
    assert.equal(url.value, "/visit");
    assert.notEqual(text.field.storage.sectionKey, cta.field.storage.sectionKey);
    assert.equal(text.value, "Opening words");

    const again = section("text_intro", "body_text", "Revised words");
    assert.equal(again.field.storage.sectionKey, "text_intro");
    assert.equal(again.value, "Revised words");
    assert.equal(text.value, "Opening words");

    assert.equal(section("text_intro", "buttonText", "Nope").ok, false);
    assert.equal(section("cta_visit", "buttonUrl", "javascript:alert(1)").ok, false);
    const heading = section("text_intro", "heading", "<script>alert(1)</script>");
    assert.equal(heading.ok, true);
    assert.equal(heading.field.type, "short_text");
    const editable = fs.readFileSync(
      path.join(__dirname, "../../../views/blessboard/v5/partials/editable-text.ejs"),
      "utf8"
    );
    assert.match(editable, /<%= _value %>/);
    assert.match(editable, /function _escAttr|_escAttr =/);
    assert.doesNotMatch(editable, /<%- _value/);
    assert.equal(section("text_intro", "heading", "Hello", []).code, "forbidden");
    assert.equal(
      resolveEditableField({
        productCode: PRODUCT_CODE.BLESSBOARD,
        pageKey: "home",
        sectionKey: "not-a-section",
        fieldKey: "heading",
      }).ok,
      false
    );
  });

  it("keeps published announcements public and drafts private, including the wrong church", async () => {
    const now = new Date("2026-06-01T12:00:00.000Z");
    assert.equal(isPubliclyVisible({ status: "published" }, now), true);
    assert.equal(isPubliclyVisible({ status: "draft" }, now), false);
    assert.equal(
      resolveEffectiveStatus(
        { status: "published", endsAt: "2026-01-01T00:00:00.000Z" },
        now
      ),
      "expired"
    );
    assert.equal(evaluateAnnouncementCapability(["member"], { branchId: BRANCH_A }, {}, "publish").ok, false);
    assert.equal(
      evaluateAnnouncementCapability(["branch_administrator"], { branchId: BRANCH_A }, {}, "publish").ok,
      true
    );
    assert.equal(
      evaluateAnnouncementCapability(["branch_administrator"], {}, {}, "publish").ok,
      false
    );
    assert.equal(httpsOrMediaUrl("javascript:alert(1)", "image").ok, false);

    const images = publicAnnouncementImageDto(
      [
        {
          churchId: CHURCH_A,
          mediaStatus: "active",
          mediaAssetId: MEDIA,
          mimeType: "image/jpeg",
          altText: "Door",
        },
        {
          churchId: CHURCH_B,
          mediaStatus: "active",
          mediaAssetId: "99999999-9999-4999-8999-999999999999",
          mimeType: "image/jpeg",
        },
      ],
      CHURCH_A,
      ENV
    );
    assert.equal(images.length, 1);
    assert.equal(images[0].mediaAssetId, MEDIA);

    const draftId = "99999999-9999-4999-8999-999999999991";
    const client = announcementClient({
      publicRows: [
        announcementRow(),
        announcementRow({ id: draftId, status: "draft", title: "Staff only" }),
      ],
      byId: {
        [ANN]: announcementRow(),
        [draftId]: announcementRow({ id: draftId, status: "draft", church_id: CHURCH_A }),
      },
      audiences: [{ id: "a", announcement_id: ANN, audience_key: "public", created_at: now }],
      attachments: [],
      mediaVisible: true,
    });
    const listed = await listPublicWebsiteAnnouncements(client, { churchId: CHURCH_A });
    assert.equal(listed.ok, true);
    assert.deepEqual(listed.items.map((item) => item.title), ["Sunday"]);
    const hidden = await getPublicWebsiteAnnouncement(client, { churchId: CHURCH_A, id: draftId });
    assert.equal(hidden.ok, false);
    const otherChurch = await getPublicWebsiteAnnouncement(client, { churchId: CHURCH_B, id: ANN });
    assert.equal(otherChurch.ok, false);
    assert.equal((await listPublicWebsiteAnnouncements(client, {})).ok, false);
    assert.equal(
      await mediaAssetVisibleOnPublicAnnouncement(client, { churchId: CHURCH_A, mediaAssetId: MEDIA }),
      true
    );
    assert.equal(
      await mediaAssetVisibleOnPublicAnnouncement({
        async query() {
          return { rows: [] };
        },
      }, { churchId: CHURCH_B, mediaAssetId: MEDIA }),
      false
    );
  });

  it("rejects invalid events and sermons before any database call", () => {
    const event = buildEventFields(
      {
        title: "Prayer",
        startsAt: "2026-07-01T18:00",
        endsAt: "2026-07-01T17:00",
        timezone: "Africa/Lusaka",
        status: "published",
      },
      { partial: false }
    );
    assert.equal(event.ok, false);
    assert.equal(event.reason, "ends_at");
    const valid = buildEventFields(
      {
        title: "Prayer",
        startsAt: "2026-07-01T18:00",
        endsAt: "2026-07-01T19:00",
        timezone: "Africa/Lusaka",
        status: "draft",
      },
      { partial: false }
    );
    assert.equal(valid.ok, true);
    assert.equal(valid.fields.status, "draft");
    assert.equal(buildEventFields({ title: "<b>x</b>", startsAt: "2026-07-01T18:00", timezone: "UTC" }, { partial: false }).ok, false);

    const form = validateEventBody({
      title: "Choir",
      event_date: "2026-07-02",
      start_time: "18:00",
      end_time: "17:00",
      visibility: "public",
    });
    assert.equal(form.ok, false);
    assert.match(form.error, /End time/);
    assert.equal(validateEventBody({ title: "", event_date: "2026-07-02" }).ok, false);

    const sermon = buildSermonFields(
      {
        title: "Grace",
        speakerName: "Pastor",
        preachedAt: "2026-07-18",
        imageUrl: "https://cdn.example/sermon.jpg",
        status: "published",
      },
      { partial: false }
    );
    assert.equal(sermon.ok, true);
    assert.equal(sermon.fields.imageUrl, "https://cdn.example/sermon.jpg");
    assert.equal(
      buildSermonFields(
        { title: "Grace", speakerName: "Pastor", preachedAt: "18/07/2026", mediaUrl: "http://cdn.example/a.mp3" },
        { partial: false }
      ).ok,
      false
    );
    assert.equal(
      buildSermonFields(
        { title: "Grace", speakerName: "Pastor", preachedAt: "2026-02-31" },
        { partial: false }
      ).ok,
      false
    );
  });

  it("sends a directory enquiry only to the resolved church", async () => {
    const writes = [];
    const pool = {
      async query(_sql, params) {
        writes.push(params);
        return {
          rows: [{
            id: ANN,
            organization_id: params[0],
            church_id: params[1],
            branch_id: params[2],
            full_name: params[3],
            email: params[4],
            phone: params[5],
            message: params[6],
            status: "new",
            reviewed_by_user_id: null,
            created_at: new Date(),
            updated_at: new Date(),
          }],
        };
      },
    };
    const body = {
      full_name: "Visitor",
      email: "visitor@example.com",
      message: "We would like to visit on Sunday.",
      church_id: CHURCH_B,
    };
    const first = await submitPublicChurchEnquiry(pool, {
      organizationId: ORG_A,
      churchId: CHURCH_A,
      branchId: BRANCH_A,
    }, body);
    const second = await submitPublicChurchEnquiry(pool, {
      organizationId: ORG_B,
      churchId: CHURCH_B,
      branchId: BRANCH_B,
    }, body);
    assert.equal(first.churchId, CHURCH_A);
    assert.equal(second.churchId, CHURCH_B);
    assert.equal(writes[0][1], CHURCH_A);
    assert.equal(writes[1][1], CHURCH_B);
    assert.notEqual(writes[0][1], body.church_id);
    const before = writes.length;
    const missing = await submitPublicChurchEnquiry(pool, { organizationId: ORG_A }, body);
    assert.equal(missing.status, 404);
    assert.equal(writes.length, before);
    const invalid = await submitPublicChurchEnquiry(pool, {
      organizationId: ORG_A,
      churchId: CHURCH_A,
      branchId: BRANCH_A,
    }, { full_name: "Visitor" });
    assert.equal(invalid.status, 400);
  });

  it("rejects member activation for a short password, an expired token, and the wrong church", async () => {
    assert.equal((await acceptMemberPortalInvitation({ async connect() { throw new Error("no db"); } }, {
      token: "short",
      password: "tiny",
    })).code, "invalid_input");

    const held = await acceptMemberPortalInvitation({ async connect() { throw new Error("no db"); } }, {
      token: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      password: "long-enough-password",
      otpActivation: "ACTIVE",
      env: {
        NODE_ENV: "test",
        DEPLOYMENT_ENV: "testing",
        DATABASE_IDENTITY_ENV: "testing",
        DATABASE_IDENTITY_EXPECTED: "moovex-platform-v7",
        PLATFORM_DEPLOYMENT_CODE: "moovex-platform-testing",
        GETPRO_OTP_ALLOW_FIXED_CODE: "1",
        GETPRO_OTP_PEPPER: "unit-test-otp-pepper-32b-minimum!!",
      },
      organizationId: ORG_A,
      accountId: "22222222-2222-4222-8222-222222222222",
    });
    assert.equal(held.code, "otp_required");

    function dbFor(rowHandler) {
      const client = {
        async query(sql, params) {
          return rowHandler(String(sql), params);
        },
        release() {},
      };
      return { async connect() { return client; } };
    }
    const expired = await acceptMemberPortalInvitation(dbFor((sql) => {
      if (sql.includes("SELECT * FROM blessboard.member_portal_invitations")) {
        return { rows: [{ id: ANN, expires_at: "2000-01-01T00:00:00.000Z", member_id: MEDIA, church_id: CHURCH_A }] };
      }
      return { rows: [] };
    }), { token: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", password: "long-enough-password" });
    assert.equal(expired.code, "expired");

    const wrongChurch = await acceptMemberPortalInvitation(dbFor((sql) => {
      if (sql.includes("SELECT * FROM blessboard.member_portal_invitations")) {
        return {
          rows: [{
            id: ANN,
            expires_at: "2999-01-01T00:00:00.000Z",
            member_id: MEDIA,
            church_id: CHURCH_B,
            organization_id: ORG_B,
          }],
        };
      }
      return { rows: [] };
    }), { token: "cccccccccccccccccccccccccccccccc", password: "long-enough-password" });
    assert.equal(wrongChurch.code, "member_unavailable");
  });

  it("rejects a member form whose CSRF cookie does not match the posted token", async () => {
    const app = express();
    app.use(express.urlencoded({ extended: false }));
    app.use((req, _res, next) => {
      req.cookies = {};
      for (const part of String(req.headers.cookie || "").split(";")) {
        const [name, ...rest] = part.trim().split("=");
        if (name) req.cookies[name] = decodeURIComponent(rest.join("="));
      }
      next();
    });
    app.get("/hq/members/new", (req, res) => {
      const token = issueCsrfToken(ENV);
      const name = getCsrfCookieName(ENV, req);
      res.setHeader("Set-Cookie", `${name}=${encodeURIComponent(token)}; Path=/`);
      res.status(200).type("html").send(`<form><input name="${CSRF_FIELD}" value="${token}"></form>`);
    });
    app.post("/hq/members", (req, res) => {
      if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], ENV)) {
        return res.status(403).send("Invalid or missing CSRF token.");
      }
      return res.status(201).send("created");
    });
    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = server.address().port;
    try {
      const form = await fetch(`http://127.0.0.1:${port}/hq/members/new`);
      const html = await form.text();
      const token = html.match(/value="([^"]+)"/)[1];
      const cookie = form.headers.get("set-cookie").split(";")[0];
      const missing = await fetch(`http://127.0.0.1:${port}/hq/members`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: "full_name=Ada",
      });
      assert.equal(missing.status, 403);
      const foreign = issueCsrfToken(ENV);
      const crossed = await fetch(`http://127.0.0.1:${port}/hq/members`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", cookie },
        body: `${CSRF_FIELD}=${encodeURIComponent(foreign)}`,
      });
      assert.equal(crossed.status, 403);
      const accepted = await fetch(`http://127.0.0.1:${port}/hq/members`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", cookie },
        body: `${CSRF_FIELD}=${encodeURIComponent(token)}`,
      });
      assert.equal(accepted.status, 201);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});
