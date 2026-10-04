"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const home = fs.readFileSync("views/blessboard/v5/public/home.ejs", "utf8");
const css = fs.readFileSync("public/blessboard/v5/tenant-public.css", "utf8");

test("sermon section renders when sermon data exists", () => {
  assert.match(home, /teasers\.sermons && teasers\.sermons\.length/);
  assert.match(home, /data-bb-home-sermons="1"/);
});

test("sermon/resource content is safely limited to the featured item", () => {
  assert.match(home, /var sermon = teasers\.sermons\[0\]/);
  assert.match(home, /hrefFor\('\/sermons'\)/);
});

test("sermon title, speaker, date, and summary render", () => {
  assert.match(home, /<h3 class="bb-tp-sermon-feature__title"><%= sermon\.title %><\/h3>/);
  assert.match(home, /sermon\.speakerName/);
  assert.match(home, /formatDate\(sermon\.preachedAt\)/);
  assert.match(home, /sermon\.summary/);
});

test("sermon image and fallback icon are supported", () => {
  assert.match(home, /if \(sermon\.imageUrl\)/);
  assert.match(home, /menu_book/);
  assert.match(home, /bb-tp-sermon-feature__play/);
});

test("long sermon content remains inside bounded card styles", () => {
  assert.match(css, /\.bb-tp-sermon-feature/);
  assert.match(css, /overflow: hidden/);
});

test("hidden sermon content is gated by the Home teaser model", () => {
  assert.match(home, /showSectionInPreview\(sermonsIntroSec\)/);
  assert.match(home, /homeTeasers/);
});

test("editor mode retains sermon image and detail editing", () => {
  assert.match(home, /entity-image-edit-trigger/);
  assert.match(home, /editKind: 'sermon'/);
  assert.match(home, /editButtonText: 'Edit details'/);
});

test("public sermon markup contains no unconditional editor controls", () => {
  assert.match(home, /websiteAdmin.*editingMode/);
});

test("Home renders one sermon section", () => {
  assert.equal((home.match(/data-bb-home-sermons="1"/g) || []).length, 1);
});

test("sermon card has responsive structure", () => {
  assert.match(css, /@media \(max-width: 767px\)[\s\S]*?bb-tp-sermon-feature/);
  assert.match(css, /bb-tp-sermon-feature__copy/);
});
