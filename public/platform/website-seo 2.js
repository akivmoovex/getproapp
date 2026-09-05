(function () {
  "use strict";
  var form = document.querySelector("[data-gp-website-seo-form]");
  if (!form) return;
  function updateCounter(field) {
    var max = Number(field.getAttribute("data-gp-seo-advisory-max") || 0);
    if (!max) return;
    var counter = form.querySelector('[data-gp-seo-counter-for="' + field.id + '"]');
    if (!counter) return;
    var len = String(field.value || "").length;
    counter.textContent = len + " / ~" + max + " characters (advisory)";
  }
  form.querySelectorAll("[data-gp-seo-advisory-max]").forEach(function (field) {
    updateCounter(field);
    field.addEventListener("input", function () {
      updateCounter(field);
    });
  });
})();
