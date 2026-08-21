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

  function trapTab(ev, root) {
    if (window.acA11y && typeof window.acA11y.trapTab === "function") {
      window.acA11y.trapTab(ev, root);
      return;
    }
    if (ev.key !== "Tab" || !root) return;
    var items = root.querySelectorAll(
      'a[href], button:not([disabled]), input:not([type="hidden"]), [tabindex]:not([tabindex="-1"])'
    );
    if (!items.length) return;
    var first = items[0];
    var last = items[items.length - 1];
    if (ev.shiftKey && document.activeElement === first) {
      ev.preventDefault();
      last.focus();
    } else if (!ev.shiftKey && document.activeElement === last) {
      ev.preventDefault();
      first.focus();
    }
  }

  function openDrawer() {
    if (!drawer) return;
    lastFocus = document.activeElement;
    drawer.hidden = false;
    document.body.classList.add("ac-public-nav-open");
    if (openBtn) openBtn.setAttribute("aria-expanded", "true");
    var panel = drawer.querySelector(".ac-public-drawer__panel");
    var focusable = panel && panel.querySelector("button, a[href], input");
    if (focusable) focusable.focus();
    announce("Menu opened");
  }

  function closeDrawer() {
    if (!drawer) return;
    drawer.hidden = true;
    document.body.classList.remove("ac-public-nav-open");
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
    document.body.classList.add("ac-public-nav-open");
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
    if (!drawer || drawer.hidden) {
      document.body.classList.remove("ac-public-nav-open");
    }
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
      return;
    }
    if (ev.key === "Tab") {
      if (drawer && !drawer.hidden) {
        trapTab(ev, drawer.querySelector(".ac-public-drawer__panel") || drawer);
      } else if (filterDrawer && !filterDrawer.hidden) {
        trapTab(ev, filterDrawer.querySelector(".ac-directory-filter-drawer__panel") || filterDrawer);
      }
    }
  });

  var procRoot = document.querySelector("[data-ac-proc-filter]");
  if (procRoot) {
    var chips = procRoot.querySelectorAll("[data-ac-proc-cat]");
    var search = procRoot.querySelector("[data-ac-proc-search]");
    var items = document.querySelectorAll("[data-ac-proc-item]");
    var empty = document.querySelector("[data-ac-proc-empty]");
    var activeCat = "all";

    function applyProcFilter() {
      var q = search && search.value ? search.value.trim().toLowerCase() : "";
      var shown = 0;
      items.forEach(function (item) {
        var cat = (item.getAttribute("data-ac-proc-category") || "").toLowerCase();
        var name = (item.getAttribute("data-ac-proc-name") || "").toLowerCase();
        var catOk = activeCat === "all" || cat === activeCat.toLowerCase();
        var qOk = !q || name.indexOf(q) !== -1 || cat.indexOf(q) !== -1;
        var match = catOk && qOk;
        item.hidden = !match;
        if (match) shown += 1;
      });
      if (empty) empty.hidden = shown !== 0;
    }

    chips.forEach(function (chip) {
      chip.addEventListener("click", function () {
        activeCat = chip.getAttribute("data-ac-proc-cat") || "all";
        chips.forEach(function (c) {
          var on = c === chip;
          c.classList.toggle("is-active", on);
          c.setAttribute("aria-pressed", on ? "true" : "false");
        });
        applyProcFilter();
      });
    });
    if (search) search.addEventListener("input", applyProcFilter);
  }

  document.addEventListener("click", function (e) {
    var btn = e.target && e.target.closest("[data-ac-toggle-password]");
    if (!btn) return;
    e.preventDefault();
    var id = btn.getAttribute("data-ac-toggle-password");
    var input = id ? document.getElementById(id) : null;
    if (!input) return;
    var showing = input.type === "text";
    input.type = showing ? "password" : "text";
    btn.setAttribute("aria-pressed", showing ? "false" : "true");
    btn.setAttribute("aria-label", showing ? "Show password" : "Hide password");
    var icon = btn.querySelector(".material-symbols-outlined");
    if (icon) icon.textContent = showing ? "visibility_off" : "visibility";
  });

  document.addEventListener("submit", function (e) {
    var form = e.target;
    if (!form || !form.matches || !form.matches("[data-ac-register-confirm]")) return;
    var others = document.querySelectorAll(".acw-register button[type='submit']");
    others.forEach(function (el) {
      el.disabled = true;
    });
  });
})();
