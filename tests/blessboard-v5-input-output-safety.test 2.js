"use strict";

/**
 * Focused BlessBoard V5 input validation + output escaping checks.
 * Complements public-pages / announcements / platform-admin suites.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const ejs = require("ejs");

const {
  safeExternalUrl,
  escapeHtml,
} = require("../src/blessboard/http/tenantPublicSafe");
const {
  httpsOrMediaUrl,
  presentAnnouncementForRender,
} = require("../src/blessboard/services/announcementsService");
const {
  normalizeListInput,
} = require("../src/platform/services/listPlatformOrganizations");

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe("blessboard v5 input/output safety", () => {
  it("rejects unsafe link protocols (render allowlist)", () => {
    assert.equal(safeExternalUrl("javascript:alert(1)"), null);
    assert.equal(safeExternalUrl("JAVASCRIPT:alert(1)"), null);
    assert.equal(safeExternalUrl("data:text/html,hi"), null);
    assert.equal(safeExternalUrl("vbscript:msgbox(1)"), null);
    assert.equal(safeExternalUrl("//evil.example/path"), null);
    assert.equal(safeExternalUrl("https://example.org/x"), "https://example.org/x");
    assert.equal(safeExternalUrl("http://example.org/x"), "http://example.org/x");
    assert.equal(safeExternalUrl("/_bb/media/11111111-1111-4111-8111-111111111111"), "/_bb/media/11111111-1111-4111-8111-111111111111");
  });

  it("rejects unsafe announcement action URLs at write validation", () => {
    assert.equal(httpsOrMediaUrl("javascript:alert(1)", "action_url").ok, false);
    assert.equal(httpsOrMediaUrl("data:text/html,hi", "action_url").ok, false);
    assert.equal(httpsOrMediaUrl("http://insecure.example/", "action_url").reason, "action_url_https_required");
    assert.equal(httpsOrMediaUrl("//evil.example/", "action_url").ok, false);
    assert.equal(httpsOrMediaUrl("/../../etc/passwd", "action_url").ok, false);
    assert.equal(httpsOrMediaUrl("/_bb/media/not-a-uuid", "action_url").ok, false);
    const okHttps = httpsOrMediaUrl("https://example.org/give", "action_url");
    assert.equal(okHttps.ok, true);
    assert.equal(okHttps.value, "https://example.org/give");
    const mediaId = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
    const okMedia = httpsOrMediaUrl(`/_bb/media/${mediaId}`, "action_url");
    assert.equal(okMedia.ok, true);
  });

  it("rejects overlong announcement action URLs", () => {
    const overlong = `https://example.org/${"a".repeat(2100)}`;
    const result = httpsOrMediaUrl(overlong, "action_url");
    assert.equal(result.ok, false);
    assert.equal(result.reason, "action_url_length");
  });

  it("validates UUID shape used by announcement routes", () => {
    assert.equal(UUID_RE.test("not-a-uuid"), false);
    assert.equal(UUID_RE.test("zzzzzzzz-zzzz-zzzz-zzzz-zzzzzzzzzzzz"), false);
    assert.equal(UUID_RE.test("11111111-1111-4111-8111-111111111111"), true);
  });

  it("bounds platform list pagination", () => {
    const zero = normalizeListInput({ page: "0", limit: "999" });
    assert.equal(zero.ok, true);
    assert.equal(zero.value.page, 1);
    assert.equal(zero.value.limit, 100);

    const huge = normalizeListInput({ page: "999999", limit: "10" });
    assert.equal(huge.ok, true);
    assert.equal(huge.value.page, 10000);

    const bad = normalizeListInput({ page: "abc", limit: "xyz" });
    assert.equal(bad.ok, true);
    assert.equal(bad.value.page, 1);
    assert.equal(bad.value.limit, 25);
  });

  it("presentAnnouncementForRender strips unsafe action URLs", () => {
    const stripped = presentAnnouncementForRender({
      id: "11111111-1111-4111-8111-111111111111",
      title: "Safe title",
      actionUrl: "javascript:alert(1)",
      actionLabel: "Open",
    });
    assert.equal(stripped.actionUrl, null);
    assert.equal(stripped.actionLabel, "Open");

    const kept = presentAnnouncementForRender({
      actionUrl: "https://example.org/x",
      actionLabel: "Give",
    });
    assert.equal(kept.actionUrl, "https://example.org/x");
  });

  it("escapes markup in user-provided content for HTML output", () => {
    const raw = `<script>alert(1)</script> & "quotes"`;
    assert.equal(
      escapeHtml(raw),
      "&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;quotes&quot;"
    );

    const html = ejs.render(
      '<h1><%= title %></h1><a href="<%= actionUrl %>"><%= label %></a>',
      {
        title: '<img src=x onerror=alert(1)>',
        actionUrl: safeExternalUrl("javascript:alert(1)"),
        label: "Click <b>me</b>",
      }
    );
    assert.doesNotMatch(html, /<script[\s>]|<img\s/i);
    assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
    assert.match(html, /Click &lt;b&gt;me&lt;\/b&gt;/);
    assert.match(html, /href=""/);
  });
});
