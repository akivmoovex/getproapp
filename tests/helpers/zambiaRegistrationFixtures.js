"use strict";

/**
 * Canonical Zambia province/city values for registration test payloads.
 * Product validation accepts short province names (e.g. "Lusaka"), not
 * legacy labels such as "Lusaka".
 */

const ZAMBIA_PROVINCES = Object.freeze([
  "Central",
  "Copperbelt",
  "Eastern",
  "Luapula",
  "Lusaka",
  "Muchinga",
  "Northern",
  "North-Western",
  "Southern",
  "Western",
]);

const DEFAULT_ZAMBIA_PROVINCE = "Lusaka";
const DEFAULT_ZAMBIA_CITY = "Lusaka";

module.exports = {
  ZAMBIA_PROVINCES,
  DEFAULT_ZAMBIA_PROVINCE,
  DEFAULT_ZAMBIA_CITY,
};
