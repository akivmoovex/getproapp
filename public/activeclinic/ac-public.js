(function () {
  "use strict";

  var drawer = document.querySelector("[data-ac-nav-drawer]");
  var openBtn = document.querySelector("[data-ac-nav-open]");
  var closeBtn = document.querySelector("[data-ac-nav-close]");
  var live = document.getElementById("ac-public-live");
  var lastFocus = null;

  function announce(msg) {
    if (live) live.textContent = msg;
  }

  function openDrawer() {
    if (!drawer) return;
    lastFocus = document.activeElement;
    drawer.hidden = false;
    if (openBtn) openBtn.setAttribute("aria-expanded", "true");
    var panel = drawer.querySelector(".ac-public-drawer__panel");
    var focusable = panel && panel.querySelector("button, a[href], input");
    if (focusable) focusable.focus();
    announce("Menu opened");
  }

  function closeDrawer() {
    if (!drawer) return;
    drawer.hidden = true;
    if (openBtn) openBtn.setAttribute("aria-expanded", "false");
    if (lastFocus && lastFocus.focus) lastFocus.focus();
    announce("Menu closed");
  }

  if (openBtn) openBtn.addEventListener("click", openDrawer);
  if (closeBtn) closeBtn.addEventListener("click", closeDrawer);
  if (drawer) {
    drawer.addEventListener("click", function (ev) {
      if (ev.target === drawer) closeDrawer();
    });
  }
  document.addEventListener("keydown", function (ev) {
    if (ev.key === "Escape" && drawer && !drawer.hidden) closeDrawer();
  });
})();
