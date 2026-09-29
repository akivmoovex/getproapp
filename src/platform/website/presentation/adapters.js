"use strict";

/**
 * Presentation adapter helpers.
 *
 * Domain entity → presentation DTO. Products own domain reads;
 * platform owns presentation validation only.
 *
 * These helpers are NOT wired into public website render paths in Phase 1.
 */

const { createPersonPresentation } = require("./personPresentation");
const {
  validateCollectionCardPresentation,
  validateCollectionPresentation,
  COLLECTION_CARD_KINDS,
} = require("./collectionPresentation");
const { assertDomainBoundary } = require("./domainBoundaries");
const { validatePresentationComponent } = require("./componentContracts");
const { PRESENTATION_COMPONENT_TYPES } = require("./componentTypes");
const {
  mapUniversalContentToPresentation,
  mapPresentationToProductStorage,
  resolveToPresentationKey,
} = require("./fieldKeyResolver");

/**
 * Map a pastor/leader-like domain record into PersonPresentation.
 * @param {object} leader
 * @param {{ productCode?: string }} [opts]
 */
function adaptLeaderToPersonPresentation(leader, opts) {
  const row = leader && typeof leader === "object" ? leader : {};
  return createPersonPresentation({
    image: row.imageUrl != null ? row.imageUrl : row.image != null ? row.image : null,
    name: row.displayName || row.name || "",
    title: row.roleTitle != null ? row.roleTitle : row.title != null ? row.title : null,
    subtitle: row.subtitle != null ? row.subtitle : null,
    description: row.biography != null ? row.biography : row.bio != null ? row.bio : null,
    cta:
      row.socialUrl || row.ctaUrl
        ? { label: row.ctaLabel || null, url: row.socialUrl || row.ctaUrl || null }
        : null,
    displayOrder: row.sortOrder != null ? row.sortOrder : row.displayOrder,
    visibility: row.visible !== false && row.status !== "hidden",
    featured: row.seniorLeader === true || row.featured === true,
    sourceProduct: (opts && opts.productCode) || "blessboard",
    sourceDomain: "pastor_leader",
    sourceId: row.id != null ? String(row.id) : row.leaderId != null ? String(row.leaderId) : null,
  });
}

/**
 * Map a doctor/clinician public profile into PersonPresentation.
 * @param {object} doctor
 * @param {{ productCode?: string }} [opts]
 */
function adaptDoctorToPersonPresentation(doctor, opts) {
  const row = doctor && typeof doctor === "object" ? doctor : {};
  return createPersonPresentation({
    image: row.photoUrl != null ? row.photoUrl : row.image != null ? row.image : null,
    name: row.public_display_name || row.displayName || row.name || row.title || "",
    title: row.public_title != null ? row.public_title : row.roleTitle != null ? row.roleTitle : row.summary,
    subtitle: row.subtitle != null ? row.subtitle : null,
    description: row.public_bio != null ? row.public_bio : row.body != null ? row.body : row.bio,
    cta: row.ctaUrl || row.bookingUrl
      ? { label: row.ctaLabel || "Book", url: row.ctaUrl || row.bookingUrl }
      : null,
    displayOrder: row.sort_order != null ? row.sort_order : row.displayOrder,
    visibility: row.public_profile_enabled !== false && row.visible !== false,
    featured: row.featured === true,
    sourceProduct: (opts && opts.productCode) || "activeclinic",
    sourceDomain: "doctor",
    sourceId: row.id != null ? String(row.id) : row.staffId != null ? String(row.staffId) : null,
  });
}

/**
 * Map ministry → offering collection card.
 */
function adaptMinistryToOfferingCard(ministry, opts) {
  const row = ministry && typeof ministry === "object" ? ministry : {};
  return validateCollectionCardPresentation({
    kind: COLLECTION_CARD_KINDS.OFFERING,
    image: row.imageUrl != null ? row.imageUrl : row.image,
    title: row.name || row.title || "",
    subtitle: row.audience || row.subtitle || null,
    description: row.summary || row.description || null,
    cta: row.joinUrl ? { label: row.joinLabel || "Join", url: row.joinUrl } : null,
    displayOrder: row.sortOrder != null ? row.sortOrder : row.displayOrder,
    visibility: row.visible !== false && row.status !== "hidden",
    featured: row.featured === true,
    sourceProduct: (opts && opts.productCode) || "blessboard",
    sourceDomain: "ministry",
    sourceId: row.id != null ? String(row.id) : null,
  });
}

/**
 * Map clinical service → offering collection card.
 */
function adaptServiceToOfferingCard(service, opts) {
  const row = service && typeof service === "object" ? service : {};
  return validateCollectionCardPresentation({
    kind: COLLECTION_CARD_KINDS.OFFERING,
    image: row.iconUrl != null ? row.iconUrl : row.image,
    title: row.display_name || row.name || row.title || "",
    subtitle: row.subtitle || null,
    description: row.public_summary || row.summary || row.body || null,
    cta: row.ctaUrl || row.bookingUrl
      ? { label: row.ctaLabel || "Learn more", url: row.ctaUrl || row.bookingUrl }
      : null,
    displayOrder: row.sort_order != null ? row.sort_order : row.displayOrder,
    visibility: row.visible !== false,
    featured: row.featured === true,
    sourceProduct: (opts && opts.productCode) || "activeclinic",
    sourceDomain: "clinical_service",
    sourceId: row.id != null ? String(row.id) : null,
  });
}

/**
 * Guard helper for adapter authors.
 */
function assertAdapterDomainBoundary(leftDomain, rightDomain) {
  return assertDomainBoundary(leftDomain, rightDomain);
}

module.exports = {
  PRESENTATION_COMPONENT_TYPES,
  adaptLeaderToPersonPresentation,
  adaptDoctorToPersonPresentation,
  adaptMinistryToOfferingCard,
  adaptServiceToOfferingCard,
  assertAdapterDomainBoundary,
  validatePresentationComponent,
  validateCollectionPresentation,
  mapUniversalContentToPresentation,
  mapPresentationToProductStorage,
  resolveToPresentationKey,
};
