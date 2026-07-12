"use strict";

const MAX_DESCRIPTION_LENGTH = 160;

function trimText(value) {
  return String(value || "").trim();
}

function truncateText(value, max = MAX_DESCRIPTION_LENGTH) {
  const text = trimText(value);
  if (!text) return null;
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trim()}…`;
}

function pickPublishedOrBranch(published, branchValue) {
  const pub = trimText(published);
  if (pub) return pub;
  return trimText(branchValue) || null;
}

function pickShortDescription(fields) {
  const candidates = [
    fields.published_welcome,
    fields.published_subtitle,
    fields.welcome_message,
  ]
    .map(trimText)
    .filter((value) => value.length >= 10);
  return truncateText(candidates[0] || "");
}

function pickServiceTimes(fields) {
  return pickPublishedOrBranch(fields.published_service_times, fields.service_times);
}

function pickLocationText(fields) {
  return pickPublishedOrBranch(fields.published_location, fields.location_text);
}

function formatRegistrationSummary({ activeBranchCount, registrationAvailable }) {
  const count = Number(activeBranchCount) || 0;
  if (count <= 0) return null;
  if (count === 1) {
    return registrationAvailable ? "Member registration open" : "Registration not currently open";
  }
  return registrationAvailable
    ? "Registration open at some branches"
    : "Registration not currently open";
}

function formatServiceTimesLabel(serviceTimes, { activeBranchCount } = {}) {
  const count = Number(activeBranchCount) || 0;
  if (count > 1) return "Service times vary by branch";
  const value = trimText(serviceTimes);
  return value || "Service times not published";
}

function formatBranchCountLabel(count) {
  const n = Number(count) || 0;
  if (n <= 0) return null;
  return `${n} active branch${n === 1 ? "" : "es"}`;
}

function formatLocationLine({ city, country, locationText }) {
  const parts = [];
  const cityValue = trimText(city);
  const countryValue = trimText(country);
  const locationValue = trimText(locationText);

  if (cityValue) parts.push(cityValue);
  if (countryValue && countryValue !== cityValue) parts.push(countryValue);
  if (locationValue && !parts.includes(locationValue)) {
    return parts.length ? `${parts.join(", ")} · ${locationValue}` : locationValue;
  }
  return parts.join(", ") || null;
}

function buildOrganizationCard(row) {
  const activeBranchCount = Number(row.active_branch_count) || 0;
  const isSingleBranch = activeBranchCount === 1;
  const registrationAvailable = row.registration_available === true;

  const previewFields = {
    published_welcome: row.preview_published_welcome,
    published_subtitle: row.preview_published_subtitle,
    welcome_message: row.preview_welcome_message,
    published_service_times: row.preview_published_service_times,
    service_times: row.preview_service_times,
    published_location: row.preview_published_location,
    location_text: row.preview_location_text,
  };

  const city = isSingleBranch
    ? pickPublishedOrBranch(null, row.preview_branch_city) || trimText(row.city) || null
    : trimText(row.city) || null;
  const country = isSingleBranch
    ? pickPublishedOrBranch(null, row.preview_branch_country) || trimText(row.country) || null
    : trimText(row.country) || null;

  return {
    slug: row.slug,
    name: row.name,
    active_branch_count: activeBranchCount,
    is_single_branch: isSingleBranch,
    branch_slug: isSingleBranch ? row.preview_branch_slug || null : null,
    branch_name: isSingleBranch ? row.preview_branch_name || null : null,
    city,
    country,
    location_line: formatLocationLine({
      city,
      country,
      locationText: isSingleBranch ? pickLocationText(previewFields) : null,
    }),
    short_description: isSingleBranch ? pickShortDescription(previewFields) : null,
    service_times_label: formatServiceTimesLabel(
      isSingleBranch ? pickServiceTimes(previewFields) : null,
      { activeBranchCount }
    ),
    branch_count_label: formatBranchCountLabel(activeBranchCount),
    registration_label: formatRegistrationSummary({ activeBranchCount, registrationAvailable }),
    visit_label: isSingleBranch ? "Visit Church" : "Select branch",
    visit_href: `/churches/${encodeURIComponent(row.slug)}`,
  };
}

function buildBranchCard(row, organizationName) {
  const fields = {
    published_welcome: row.published_welcome,
    published_subtitle: row.published_subtitle,
    welcome_message: row.welcome_message,
    published_service_times: row.published_service_times,
    service_times: row.service_times,
    published_location: row.published_location,
    location_text: row.location_text,
  };

  const city = trimText(row.city) || null;
  const country = trimText(row.country) || null;

  return {
    slug: row.slug,
    host_slug: row.host_slug || row.slug,
    name: row.name,
    organization_name: trimText(organizationName) || null,
    city,
    country,
    location_line: formatLocationLine({
      city,
      country,
      locationText: pickLocationText(fields),
    }),
    short_description: pickShortDescription(fields),
    service_times_label: formatServiceTimesLabel(pickServiceTimes(fields)),
    registration_label: formatRegistrationSummary({
      activeBranchCount: 1,
      registrationAvailable: row.member_registration_enabled === true,
    }),
    visit_label: "Visit Church",
  };
}

module.exports = {
  MAX_DESCRIPTION_LENGTH,
  pickShortDescription,
  pickServiceTimes,
  pickLocationText,
  formatRegistrationSummary,
  formatServiceTimesLabel,
  formatBranchCountLabel,
  formatLocationLine,
  buildOrganizationCard,
  buildBranchCard,
};
