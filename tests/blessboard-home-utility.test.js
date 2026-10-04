"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const home = fs.readFileSync("views/blessboard/v5/public/home.ejs", "utf8");
const css = fs.readFileSync("public/blessboard/v5/tenant-public.css", "utf8");

test("utility section renders with prayer and quick actions", () => {
  assert.match(home, /data-bb-home-utility="1"/);
  assert.match(home, /Need prayer\?/);
  assert.match(home, /Quick actions/);
});

test("utility section has an intentional non-empty presentation", () => {
  assert.match(home, /Request prayer/);
  assert.match(home, /Latest sermons/);
  assert.match(home, /Explore ministries/);
});

test("utility section supports multiple quick actions", () => {
  assert.match(home, /href="<%= hrefFor\('\/sermons'\) %>"/);
  assert.match(home, /href="<%= hrefFor\('\/ministries'\) %>"/);
});

test("utility text remains contained by responsive card styles", () => {
  assert.match(css, /\.bb-tp-home-utility__prayer/);
  assert.match(css, /\.bb-tp-home-utility__resources/);
});

test("utility section does not expose unpublished content fields", () => {
  const utility = home.slice(home.indexOf('data-bb-home-utility="1"'), home.indexOf('<% homeMiddleRenderOrder'));
  assert.doesNotMatch(utility, /unpublished|published/i);
});

test("utility section preserves editor mode without editor-only controls", () => {
  assert.doesNotMatch(home, /bb-tp-home-utility[\s\S]{0,1600}data-bb-structured-open/);
});

test("public utility links contain no editor-only controls", () => {
  assert.doesNotMatch(home, /data-bb-home-utility="1"[\s\S]{0,1600}editingMode/);
});

test("utility section is rendered once", () => {
  assert.equal((home.match(/data-bb-home-utility="1"/g) || []).length, 1);
});

test("utility markup has responsive grid behavior", () => {
  assert.match(home, /bb-tp-home-utility/);
  assert.match(css, /@media \(max-width: 767px\)[\s\S]*?\.bb-tp-home-utility/);
});

test("neighboring Home sections remain present", () => {
  assert.match(home, /data-bb-home-hero="1"/);
  assert.match(home, /data-bb-home-ministries="1"/);
  assert.match(home, /data-bb-home-events="1"/);
});
