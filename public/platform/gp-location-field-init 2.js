"use strict";

(function (global) {
  function qs(sel, root) {
    return (root || document).querySelector(sel);
  }

  function initGpLocationField(config) {
    config = config || {};
    if (
      !global.GpLocationAutocomplete ||
      typeof global.GpLocationAutocomplete.init !== "function"
    ) {
      return null;
    }
    return global.GpLocationAutocomplete.init(config);
  }

  document.addEventListener("DOMContentLoaded", function () {
    document.querySelectorAll("[data-gp-location-init]").forEach(function (root) {
      var countrySel = root.getAttribute("data-gp-location-country") || "#countryCode";
      var citySel = root.getAttribute("data-gp-location-city") || "#city";
      var listboxSel =
        root.getAttribute("data-gp-location-listbox") ||
        root.querySelector("[role='listbox']")
          ? "[role='listbox']"
          : ".gp-location-listbox";
      var locationIdSel = root.getAttribute("data-gp-location-id") || null;
      var allowCustom = root.getAttribute("data-gp-location-custom") !== "0";
      initGpLocationField({
        countryInput: countrySel.startsWith("#") ? countrySel : qs(countrySel, root),
        cityInput: citySel.startsWith("#") ? citySel : qs(citySel, root),
        locationIdInput: locationIdSel ? (locationIdSel.startsWith("#") ? locationIdSel : qs(locationIdSel, root)) : null,
        listbox: listboxSel.startsWith(".") || listboxSel.startsWith("#")
          ? listboxSel
          : qs(listboxSel, root),
        allowCustom: allowCustom,
      });
    });
  });

  global.GpLocationFieldInit = { init: initGpLocationField };
})(typeof window !== "undefined" ? window : globalThis);
