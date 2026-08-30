(function () {
  "use strict";
  var form = document.querySelector("[data-gp-website-styles-form]");
  if (!form) return;
  form.querySelectorAll("[data-gp-styles-color]").forEach(function (picker) {
    var text = picker.parentElement && picker.parentElement.querySelector("[data-gp-styles-color-text]");
    if (!text) return;
    picker.addEventListener("input", function () {
      text.value = picker.value;
    });
    text.addEventListener("input", function () {
      if (/^#[0-9A-Fa-f]{6}$/.test(text.value.trim())) {
        picker.value = text.value.trim();
      }
    });
  });
})();
