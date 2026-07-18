/**
 * Member portal shell helpers — drawer toggle only (no network).
 */
(function () {
  "use strict";

  function initDrawer() {
    if (!window.BlessBoardShellNav) return;
    window.BlessBoardShellNav.bindShellDrawer({
      drawerId: "bb-mp-drawer",
      bodyOpenClass: "bb-mp-drawer-open",
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initDrawer);
  } else {
    initDrawer();
  }
})();
