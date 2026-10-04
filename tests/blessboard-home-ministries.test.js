"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const home = fs.readFileSync("views/blessboard/v5/public/home.ejs", "utf8");
const card = fs.readFileSync("views/blessboard/v5/public/partials/content-card.ejs", "utf8");
const css = fs.readFileSync("public/blessboard/v5/tenant-public.css", "utf8");

test("Ministry section renders when ministry data exists", () => {
  assert.match(home, /teasers\.ministries && teasers\.ministries\.length/);
  assert.match(home, /data-bb-home-ministries="1"/);
});

test("multiple ministry cards are supported", () => {
  assert.match(home, /teasers\.ministries\.slice\(0, 3\)\.forEach/);
  assert.match(home, /data-bb-home-ministry-cards="1"/);
});

test("ministry title and summary render escaped", () => {
  assert.match(card, /<h3 class="bb-tp-content-card__title"><%= cardTitle %><\/h3>/);
  assert.match(card, /<p class="bb-tp-content-card__summary"><%= cardSummary %><\/p>/);
});

test("ministry images and fallback icon are supported", () => {
  assert.match(card, /if \(_imgSrc\)/);
  assert.match(card, /cardIcon.*'groups'/);
});

test("long ministry content remains within a bounded card", () => {
  assert.match(css, /\.bb-tp-content-card \{/);
  assert.match(css, /min-width: 0/);
});

test("hidden ministry items are filtered before Home teaser rendering", () => {
  assert.match(home, /homeTeasers/);
  assert.match(home, /teasers\.ministries\.slice/);
});

test("editor mode retains ministry image editing support", () => {
  assert.match(card, /_canEditMinistryImage/);
  assert.match(card, /entity-image-edit-trigger/);
});

test("public ministry cards contain no editor trigger", () => {
  assert.match(card, /if \(_canEditMinistryImage\)/);
});

test("Home renders one Ministry section", () => {
  assert.equal((home.match(/data-bb-home-ministries="1"/g) || []).length, 1);
});

test("ministry cards have responsive sizing", () => {
  assert.match(home, /bb-tp-content-card--ministry/);
  assert.match(css, /@media \(max-width: 699px\)[\s\S]*?bb-tp-content-card--ministry/);
});
