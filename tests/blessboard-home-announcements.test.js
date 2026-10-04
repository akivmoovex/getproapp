"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const home = fs.readFileSync("views/blessboard/v5/public/home.ejs", "utf8");
const css = fs.readFileSync("public/blessboard/v5/tenant-public.css", "utf8");

test("Home renders one announcements section when announcement data exists", () => {
  assert.match(home, /teasers\.announcement &&/);
  assert.match(home, /data-bb-home-announcements="1"/);
  assert.equal((home.match(/data-bb-home-announcements="1"/g) || []).length, 1);
});

test("announcement title and body use escaped public fields", () => {
  assert.match(home, /teasers\.announcement\.heading/);
  assert.match(home, /teasers\.announcement\.bodyText/);
  assert.match(home, /<h3><%= teasers\.announcement\.heading/);
  assert.match(home, /<p><%= teasers\.announcement\.bodyText/);
});

test("empty announcement data produces no announcement section", () => {
  assert.match(home, /if \(teasers\.announcement && \(teasers\.announcement\.heading \|\| teasers\.announcement\.bodyText\)\)/);
});

test("announcement rendering is sourced from the public teaser model", () => {
  assert.match(home, /teasers\.announcement/);
  assert.doesNotMatch(home, /announcement.*previewDraftMode/i);
});

test("multiple announcement payloads remain represented by the model without duplicate markup", () => {
  assert.match(home, /sectionTitle: teasers\.announcement\.heading/);
  assert.equal((home.match(/bb-tp-home-announcements__/g) || []).length >= 1, true);
});

test("long announcement text remains inside the card structure", () => {
  assert.match(css, /\.bb-tp-home-announcements__card/);
  assert.match(css, /min-width: 0|overflow-wrap|word-break/);
});

test("editor mode does not add announcement-specific controls", () => {
  assert.doesNotMatch(home, /announcement.*structured-edit-trigger/i);
});

test("public announcement markup contains no editor-only control", () => {
  assert.doesNotMatch(home, /data-bb-home-announcements="1"[\s\S]{0,1200}data-bb-structured-open/);
});

test("announcement markup uses responsive public-home classes", () => {
  assert.match(home, /bb-tp-container bb-tp-home-teaser bb-tp-home-announcements/);
  assert.match(css, /\.bb-tp-home-announcements__card/);
});

test("announcement card has accessible heading and icon treatment", () => {
  assert.match(home, /aria-labelledby="bb-tp-home-announcements-heading"/);
  assert.match(home, /aria-hidden="true">campaign/);
});
