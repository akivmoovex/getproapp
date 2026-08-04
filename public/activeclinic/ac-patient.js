/**
 * ActiveClinic Patient Portal JS (AC-V6-P27)
 * Minimal client-side enhancements.
 */

(function () {
  "use strict";

  document.addEventListener("DOMContentLoaded", function () {
    const forms = document.querySelectorAll('form[data-ac-shell="patient"]');
    forms.forEach(function (form) {
      form.addEventListener("submit", function (e) {
        const requiredInputs = form.querySelectorAll("[required]");
        let valid = true;

        requiredInputs.forEach(function (input) {
          if (!input.value.trim()) {
            valid = false;
            input.style.borderColor = "#e53e3e";
          } else {
            input.style.borderColor = "#cbd5e0";
          }
        });

        if (!valid) {
          e.preventDefault();
          const live = document.getElementById("ac-patient-live");
          if (live) {
            live.textContent = "Please fill in all required fields.";
          }
        }
      });
    });
  });
})();
