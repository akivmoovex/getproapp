"use strict";

document.addEventListener("DOMContentLoaded", function () {
  if (!document.querySelector("[data-bb-apex-page='register-church']")) return;
  if (!window.GpLocationAutocomplete || typeof window.GpLocationAutocomplete.init !== "function") {
    return;
  }
  window.GpLocationAutocomplete.init({
    countryInput: "#register_country",
    cityInput: "#register_city",
    locationIdInput: "#registerLocationId",
    listbox: "[data-gp-location-listbox]",
    allowCustom: true,
  });
});
