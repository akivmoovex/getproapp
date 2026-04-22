"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function read(rel) {
  return fs.readFileSync(path.join(__dirname, "..", rel), "utf8");
}

test("directory UI renders speciality and open-now controls", () => {
  const searchBar = read("views/partials/components/search_bar.ejs");
  assert.match(searchBar, /name="speciality"/);
  assert.match(searchBar, /id="<%= _pre %>-search-speciality"/);
  assert.match(searchBar, /name="open_now"/);
  assert.match(searchBar, /name="established_from"/);
  assert.match(searchBar, /value="1"/);
});

test("directory form passes speciality/open-now/established values for persistence", () => {
  const directory = read("views/directory.ejs");
  assert.match(directory, /specialityQuery:/);
  assert.match(directory, /openNowQuery:/);
  assert.match(directory, /establishedFromQuery:/);
});

test("directory chips still include q/city/speciality/open-now/established and clear filters", () => {
  const directory = read("views/directory.ejs");
  assert.match(directory, /searchQuery/);
  assert.match(directory, /cityQuery/);
  assert.match(directory, /Speciality:/);
  assert.match(directory, /Open now/);
  assert.match(directory, /Established from:/);
  assert.match(directory, /Clear filters/);
  assert.match(directory, /href="\/directory"/);
});

test("public route keeps canonical speciality/open_now/established query parsing", () => {
  const publicRoute = read("src/routes/public.js");
  assert.match(publicRoute, /req\.query\.speciality/);
  assert.match(publicRoute, /req\.query\.open_now/);
  assert.match(publicRoute, /req\.query\.established_from/);
  assert.match(publicRoute, /directoryStructuredFilters/);
});

test("company page established-year rendering stays conditional and safe", () => {
  const companyView = read("views/company.ejs");
  assert.match(companyView, /company\.established_year/);
  assert.match(companyView, /Established in/);
  assert.match(companyView, /company\.years_experience/);
});
