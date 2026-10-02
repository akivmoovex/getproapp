"use strict";

/**
 * Zambia V1 province and starter city catalogue.
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

const ZAMBIA_SEED_CITIES = Object.freeze([
  { name: "Lusaka", province: "Lusaka" },
  { name: "Kitwe", province: "Copperbelt" },
  { name: "Ndola", province: "Copperbelt" },
  { name: "Kabwe", province: "Central" },
  { name: "Chingola", province: "Copperbelt" },
  { name: "Mufulira", province: "Copperbelt" },
  { name: "Livingstone", province: "Southern" },
  { name: "Luanshya", province: "Copperbelt" },
  { name: "Chipata", province: "Eastern" },
  { name: "Kasama", province: "Northern" },
  { name: "Solwezi", province: "North-Western" },
  { name: "Mongu", province: "Western" },
  { name: "Kafue", province: "Lusaka" },
  { name: "Mazabuka", province: "Southern" },
  { name: "Choma", province: "Southern" },
  { name: "Monze", province: "Southern" },
  { name: "Kapiri Mposhi", province: "Central" },
  { name: "Mpika", province: "Muchinga" },
  { name: "Mansa", province: "Luapula" },
  { name: "Kawambwa", province: "Luapula" },
  { name: "Petauke", province: "Eastern" },
  { name: "Serenje", province: "Central" },
  { name: "Siavonga", province: "Southern" },
  { name: "Samfya", province: "Luapula" },
]);

function isZambiaCountryCode(countryCode) {
  return String(countryCode || "").trim().toUpperCase() === "ZM";
}

function listZambiaProvinces() {
  return ZAMBIA_PROVINCES.slice();
}

function listZambiaSeedCities() {
  return ZAMBIA_SEED_CITIES.map((row) => ({ ...row }));
}

module.exports = {
  ZAMBIA_PROVINCES,
  ZAMBIA_SEED_CITIES,
  isZambiaCountryCode,
  listZambiaProvinces,
  listZambiaSeedCities,
};
