"use strict";

(function (global) {
  function qs(sel, root) {
    return (root || document).querySelector(sel);
  }

  function initRegistrationPasswordRules(config) {
    config = config || {};
    var passwordInput =
      typeof config.passwordInput === "string"
        ? qs(config.passwordInput)
        : config.passwordInput;
    var rulesRoot =
      typeof config.rulesRoot === "string" ? qs(config.rulesRoot) : config.rulesRoot;
    if (!passwordInput || !rulesRoot) return null;

    var minLength = Number(config.minLength) > 0 ? Number(config.minLength) : 10;
    var maxLength = Number(config.maxLength) > 0 ? Number(config.maxLength) : 200;
    var ruleItems = rulesRoot.querySelectorAll("[data-gp-password-rule]");

    function render() {
      var value = String(passwordInput.value || "");
      var allMet = true;
      ruleItems.forEach(function (item) {
        var ruleId = item.getAttribute("data-gp-password-rule") || "";
        var met = false;
        if (ruleId === "min_length") met = value.length >= minLength;
        else if (ruleId === "max_length") met = value.length <= maxLength;
        item.classList.toggle("is-met", met);
        item.setAttribute("aria-checked", met ? "true" : "false");
        if (!met) allMet = false;
      });
      rulesRoot.setAttribute(
        "aria-label",
        allMet ? "All password requirements met" : "Password requirements not yet met"
      );
    }

    passwordInput.addEventListener("input", render);
    passwordInput.addEventListener("blur", render);
    render();
    return { refresh: render };
  }

  global.GpRegistrationPasswordRules = {
    init: initRegistrationPasswordRules,
  };
})(typeof window !== "undefined" ? window : globalThis);
