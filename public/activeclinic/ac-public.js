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

  var filterDrawer = document.querySelector("[data-ac-filter-drawer]");
  var filterOpenBtns = document.querySelectorAll("[data-ac-filter-open]");
  var filterCloseBtns = document.querySelectorAll("[data-ac-filter-close]");
  var filterLastFocus = null;

  function openFilterDrawer() {
    if (!filterDrawer) return;
    filterLastFocus = document.activeElement;
    filterDrawer.hidden = false;
    filterOpenBtns.forEach(function (btn) {
      btn.setAttribute("aria-expanded", "true");
    });
    var panel = filterDrawer.querySelector(".ac-directory-filter-drawer__panel");
    var focusable = panel && panel.querySelector("button, a[href], input");
    if (focusable) focusable.focus();
    announce("Filters opened");
  }

  function closeFilterDrawer() {
    if (!filterDrawer) return;
    filterDrawer.hidden = true;
    filterOpenBtns.forEach(function (btn) {
      btn.setAttribute("aria-expanded", "false");
    });
    if (filterLastFocus && filterLastFocus.focus) filterLastFocus.focus();
    announce("Filters closed");
  }

  filterOpenBtns.forEach(function (btn) {
    btn.addEventListener("click", openFilterDrawer);
  });
  filterCloseBtns.forEach(function (btn) {
    btn.addEventListener("click", closeFilterDrawer);
  });
  if (filterDrawer) {
    filterDrawer.addEventListener("click", function (ev) {
      if (ev.target && ev.target.hasAttribute && ev.target.hasAttribute("data-ac-filter-close")) {
        closeFilterDrawer();
      }
    });
  }

  document.addEventListener("keydown", function (ev) {
    if (ev.key === "Escape") {
      if (drawer && !drawer.hidden) closeDrawer();
      if (filterDrawer && !filterDrawer.hidden) closeFilterDrawer();
    }
  });
})();
