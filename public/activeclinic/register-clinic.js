"use strict";

(function () {
  function qs(sel, root) {
    return (root || document).querySelector(sel);
  }

  function initProvinceMode() {
    var country = qs("#countryCode");
    var provinceWrap = qs("[data-ac-province-field]");
    if (!country || !provinceWrap) return;

    function render() {
      var code = String(country.value || "").toUpperCase();
      var isZm = code === "ZM";
      var select = qs("#provinceSelect", provinceWrap);
      var text = qs("#provinceText", provinceWrap);
      if (select) select.hidden = !isZm;
      if (text) text.hidden = isZm;
      if (select && isZm) {
        select.name = "province";
        if (text) text.name = "";
      } else if (text) {
        text.name = "province";
        if (select) select.name = "";
      }
    }

    country.addEventListener("change", render);
    render();
  }

  document.addEventListener("DOMContentLoaded", function () {
    if (!document.querySelector("[data-ac-register-step='clinic']")) return;
    initProvinceMode();
    if (window.GpLocationAutocomplete && typeof window.GpLocationAutocomplete.init === "function") {
      window.GpLocationAutocomplete.init({
        countryInput: "#countryCode",
        cityInput: "#city",
        locationIdInput: "#locationId",
        listbox: "[data-ac-city-listbox]",
        allowCustom: true,
      });
    }
  });
})();
