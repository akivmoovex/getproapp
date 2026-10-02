"use strict";

/**
 * Invite acceptance button label must be escaped once (not double-encoded).
 */

const assert = require("node:assert/strict");
const { describe, it } = require("node:test");
const { renderV5Ejs } = require("../src/blessboard/http/v5EjsTemplateCache");

describe("invite accept button label encoding", () => {
  it("renders Set password & join with a single HTML escape", () => {
    const html = renderV5Ejs("invite/accept.ejs", {
      csrfToken: "test-csrf",
      csrfField: "_csrf",
      token: "test-token",
      invitation: {
        roleKey: "church_hq_admin",
        requiresPassword: true,
      },
      error: null,
      saved: false,
    });

    assert.match(html, /data-bb-invite-accept-form="1"/);
    assert.match(html, /Set password &amp; join/);
    assert.doesNotMatch(html, /Set password &amp;amp; join/);
    assert.doesNotMatch(html, /Set password & join/);

    // Visible text after one decode of the button label fragment.
    const buttonMatch = html.match(
      /<button[^>]*type="submit"[^>]*>([\s\S]*?)<\/button>/i
    );
    assert.ok(buttonMatch, "submit button missing");
    const visible = String(buttonMatch[1])
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, " ")
      .trim();
    assert.equal(visible, "Set password & join");
  });

  it("keeps Accept invitation label when password is not required", () => {
    const html = renderV5Ejs("invite/accept.ejs", {
      csrfToken: "test-csrf",
      csrfField: "_csrf",
      token: "test-token",
      invitation: {
        roleKey: "branch_admin",
        requiresPassword: false,
      },
      error: null,
      saved: false,
    });
    assert.match(html, />\s*Accept invitation\s*</);
    assert.doesNotMatch(html, /Set password/);
  });
});
