"use strict";

/**
 * Branch-admin shell interactions (mobile drawer).
 */
(function () {
  function ready(fn) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn);
    } else {
      fn();
    }
  }

  ready(function () {
    if (!window.BlessBoardShellNav) return;
    window.BlessBoardShellNav.bindShellDrawer({
      drawerId: "bb-ba-drawer",
      bodyOpenClass: "bb-ba-drawer-open",
    });
  });
})();
