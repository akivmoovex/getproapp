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
      desktopMediaQuery: "(min-width: 900px)",
      openLabel: "Open navigation",
      closeLabel: "Close navigation",
      closeOnNavigate: true,
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initDrawer);
  } else {
    initDrawer();
  }
})();
