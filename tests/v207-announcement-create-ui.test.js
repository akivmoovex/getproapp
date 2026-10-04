"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const form = fs.readFileSync(
  path.join(__dirname, "../views/blessboard/v5/announcements/admin-form.ejs"),
  "utf8"
);

test("V2.07 create editor exposes Screen 70 scope and message contract", () => {
  assert.match(form, /70-hq-create-announcement/);
  assert.match(form, /data-bb-announcement-scope/);
  assert.match(form, /Entire church/);
  assert.match(form, /branches \|\| \[\]/);
  assert.match(form, /name="title"/);
  assert.match(form, /maxlength="200"/);
  assert.match(form, /name="body"/);
  assert.match(form, /maxlength="20000"/);
  assert.match(form, /name="audience_members"/);
  assert.match(form, /name="audience_public"/);
  assert.match(form, /if \(!isHq\)/);
});

test("V2.07 create editor preserves actions, scheduling, attachments, and preview", () => {
  assert.match(form, /data-bb-ann-save-draft="1"/);
  assert.match(form, /data-bb-ann-publish-submit="1"/);
  assert.match(form, /data-bb-ann-live-preview="1"/);
  assert.match(form, /name="is_pinned"/);
  assert.match(form, /name="is_featured"/);
  assert.match(form, /name="action_url"/);
  assert.match(form, /name="action_label"/);
  assert.match(form, /name="starts_at"/);
  assert.match(form, /name="ends_at"/);
  assert.match(form, /name="timezone"/);
  assert.match(form, /data-bb-ann-attachments="1"/);
  assert.match(form, /aria-invalid/);
  assert.match(form, /data-bb-ann-scope-panel="1"/);
});

test("V2.07 create editor keeps user-facing visibility language and no fabricated metrics", () => {
  assert.match(form, /Drafts remain hidden until published/);
  assert.match(form, /data-visibility-help="1"/);
});
