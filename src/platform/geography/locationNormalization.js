"use strict";

/**
 * Normalize geographic location names for duplicate detection.
 */

function normalizeLocationName(raw) {
  return String(raw || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 120);
}

function canonicalLocationName(raw) {
  const text = String(raw || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  if (!text) return "";
  return text
    .split(" ")
    .map((part) => {
      if (!part) return "";
      if (part.length <= 3 && /^[a-z]+$/i.test(part)) {
        return part.toUpperCase();
      }
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join(" ");
}

module.exports = {
  normalizeLocationName,
  canonicalLocationName,
};
