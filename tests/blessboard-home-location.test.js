"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const home = fs.readFileSync("views/blessboard/v5/public/home.ejs", "utf8");
const css = fs.readFileSync("public/blessboard/v5/tenant-public.css", "utf8");

test("Location card renders when address data exists", () => {
  assert.match(home, /contact && contact\.addressText/);
  assert.match(home, /bb-tp-home-location-card/);
});

test("address text is escaped by the EJS output", () => {
  assert.match(home, /<%= contact\.addressText %>/);
});

test("directions action uses the resolved safe href", () => {
  assert.match(home, /directionsHref \|\| hrefFor\('\/contact'\)/);
  assert.match(home, />\s*Directions\s*</);
});

test("missing optional contact fields do not break the card", () => {
  assert.match(home, /if \(contact && contact\.phone\)/);
  assert.match(home, /if \(contact && contact\.email\)/);
});

test("long addresses remain contained in the location body", () => {
  assert.match(css, /\.bb-tp-home-location-card__body/);
  assert.match(css, /white-space: pre-line/);
});

test("Location markup preserves editor mode without editor controls", () => {
  const location = home.slice(home.indexOf("bb-tp-home-location-card"), home.indexOf("bb-tp-home-contact__grid", home.indexOf("bb-tp-home-location-card")) + 1);
  assert.doesNotMatch(location, /data-bb-structured-open/);
});

test("public Location markup has no editor-only trigger", () => {
  assert.doesNotMatch(home, /bb-tp-home-location-card[\s\S]{0,1200}data-bb-structured-open/);
});

test("Home has one Location card section", () => {
  assert.equal((home.match(/bb-tp-home-location-card"/g) || []).length, 1);
});

test("Location card has responsive mobile structure", () => {
  assert.match(css, /@media \(max-width: 767px\)[\s\S]*?\.bb-tp-home-location-card__body/);
  assert.match(css, /overflow: hidden/);
});

test("Location link does not render an unsanitized raw URL", () => {
  assert.doesNotMatch(home, /href="<%= contact\.(directionsUrl|mapUrl)/);
  assert.match(home, /href="<%= directionsHref \|\| hrefFor\('\/contact'\) %>"/);
});
