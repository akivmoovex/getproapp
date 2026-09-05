"use strict";

/**
 * Shared registration leave/refresh guard (BlessBoard + ActiveClinic).
 * Browser-native beforeunload only — no custom refresh modal.
 */
(function (global) {
  var NAV_ATTR = "data-gp-registration-nav";
  var NAV_SELECTOR = "a[" + NAV_ATTR + "], button[" + NAV_ATTR + "]";

  function qs(sel, root) {
    return (root || document).querySelector(sel);
  }

  function isIgnoredField(el) {
    if (!el || !el.name) return true;
    if (el.type === "hidden") return true;
    if (String(el.name) === "company_website") return true;
    if (el.closest && el.closest("[data-gp-registration-no-dirty='1']")) return true;
    return false;
  }

  /**
   * @param {HTMLFormElement} form
   * @param {{ releaseOnSubmit?: boolean }} [options]
   */
  function initRegistrationLifecycle(form, options) {
    options = options || {};
    if (!form) return null;

    var dirty = form.getAttribute("data-gp-registration-dirty") === "1";
    var released = false;
    var navigating = false;
    var navTimer = null;

    function setDirty() {
      dirty = true;
    }

    function releaseGuard() {
      released = true;
      dirty = false;
      navigating = false;
    }

    function allowTemporaryNavigation() {
      navigating = true;
      if (navTimer) global.clearTimeout(navTimer);
      navTimer = global.setTimeout(function () {
        navigating = false;
        navTimer = null;
      }, 4000);
    }

    function onBeforeUnload(ev) {
      if (released || !dirty || navigating) return;
      ev.preventDefault();
      ev.returnValue = "";
    }

    function onFieldInput(ev) {
      var target = ev.target;
      if (!target || !form.contains(target)) return;
      if (isIgnoredField(target)) return;
      setDirty();
    }

    form.addEventListener("input", onFieldInput, true);
    form.addEventListener("change", onFieldInput, true);

    document.addEventListener(
      "click",
      function (ev) {
        var link = ev.target && ev.target.closest ? ev.target.closest(NAV_SELECTOR) : null;
        if (!link) return;
        allowTemporaryNavigation();
      },
      true
    );

    form.addEventListener("submit", function (ev) {
      if (ev.defaultPrevented) return;
      releaseGuard();
    });

    global.addEventListener("beforeunload", onBeforeUnload);

    return {
      setDirty: setDirty,
      releaseGuard: releaseGuard,
      isDirty: function () {
        return dirty && !released;
      },
    };
  }

  function autoInit() {
    var forms = document.querySelectorAll(
      "[data-gp-registration-form], [data-bb-register-form]"
    );
    forms.forEach(function (form) {
      if (form.getAttribute("data-gp-registration-lifecycle") === "1") return;
      form.setAttribute("data-gp-registration-lifecycle", "1");
      initRegistrationLifecycle(form);
    });
  }

  global.GpRegistrationLifecycle = {
    NAV_ATTR: NAV_ATTR,
    init: initRegistrationLifecycle,
    autoInit: autoInit,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", autoInit);
  } else {
    autoInit();
  }
})(typeof window !== "undefined" ? window : globalThis);
