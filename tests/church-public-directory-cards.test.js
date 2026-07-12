"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildOrganizationCard,
  buildBranchCard,
  formatServiceTimesLabel,
  formatRegistrationSummary,
} = require("../src/church/publicDirectoryCardModel");

test("buildOrganizationCard distinguishes org and branch for single-branch churches", () => {
  const card = buildOrganizationCard({
    slug: "grace",
    name: "Grace Chapel",
    city: "Lusaka",
    country: "Zambia",
    active_branch_count: 1,
    registration_available: true,
    preview_branch_slug: "main",
    preview_branch_name: "Downtown Campus",
    preview_branch_city: "Lusaka",
    preview_branch_country: "Zambia",
    preview_welcome_message: "Welcome to Grace Chapel downtown campus community.",
    preview_service_times: "Sunday 10:00",
  });

  assert.equal(card.name, "Grace Chapel");
  assert.equal(card.branch_name, "Downtown Campus");
  assert.equal(card.is_single_branch, true);
  assert.equal(card.visit_label, "Visit Church");
  assert.match(card.short_description, /Welcome to Grace Chapel/);
  assert.equal(card.registration_label, "Member registration open");
});

test("buildOrganizationCard avoids branch-specific details for multi-branch orgs", () => {
  const card = buildOrganizationCard({
    slug: "multi",
    name: "Multi Church",
    city: "Ndola",
    country: "Zambia",
    active_branch_count: 3,
    registration_available: false,
    preview_branch_name: "North Campus",
    preview_welcome_message: "Should not appear on org card",
    preview_service_times: "Sunday 09:00",
  });

  assert.equal(card.branch_name, null);
  assert.equal(card.short_description, null);
  assert.equal(card.service_times_label, "Service times vary by branch");
  assert.equal(card.visit_label, "Select branch");
  assert.match(card.branch_count_label, /3 active branches/);
});

test("buildBranchCard uses published website content when available", () => {
  const card = buildBranchCard(
    {
      slug: "main",
      host_slug: "main",
      name: "Main Campus",
      city: "Kitwe",
      country: "Zambia",
      location_text: "Central Avenue",
      service_times: "",
      welcome_message: "",
      member_registration_enabled: false,
      published_subtitle: "A welcoming congregation in Kitwe serving the community.",
      published_service_times: "Sunday Worship 09:30",
    },
    "Example Church"
  );

  assert.equal(card.organization_name, "Example Church");
  assert.match(card.short_description, /welcoming congregation/);
  assert.equal(card.service_times_label, "Sunday Worship 09:30");
  assert.equal(card.registration_label, "Registration not currently open");
});

test("formatServiceTimesLabel uses graceful fallback for missing data", () => {
  assert.equal(formatServiceTimesLabel(null), "Service times not published");
  assert.equal(formatRegistrationSummary({ activeBranchCount: 2, registrationAvailable: true }), "Registration open at some branches");
});
