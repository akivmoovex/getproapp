"use strict";

(function (global) {
  function qs(sel, root) {
    return (root || document).querySelector(sel);
  }

  function resolveEl(sel, root) {
    if (!sel) return null;
    if (typeof sel !== "string") return sel;
    if (sel.charAt(0) === "#" || sel.charAt(0) === "." || sel.charAt(0) === "[") {
      return qs(sel, document);
    }
    return qs(sel, root) || qs("#" + sel, document);
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
      var listboxAttr = root.getAttribute("data-gp-location-listbox");
      var listboxEl = listboxAttr
        ? resolveEl(listboxAttr, root)
        : root.querySelector("[role='listbox']") || root.querySelector(".gp-location-listbox");
      var locationIdSel = root.getAttribute("data-gp-location-id") || null;
      var allowCustom = root.getAttribute("data-gp-location-custom") !== "0";
      initGpLocationField({
        countryInput: resolveEl(countrySel, root),
        cityInput: resolveEl(citySel, root),
        locationIdInput: locationIdSel ? resolveEl(locationIdSel, root) : null,
        listbox: listboxEl,
        allowCustom: allowCustom,
        clearCityOnCountryChange: root.getAttribute("data-gp-location-clear-on-country") !== "0",
      });
    });
  });

  global.GpLocationFieldInit = { init: initGpLocationField };
})(typeof window !== "undefined" ? window : globalThis);
