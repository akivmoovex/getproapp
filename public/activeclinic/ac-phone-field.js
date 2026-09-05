/**
 * ActiveClinic PhoneField — searchable country picker + national number.
 * Progressive enhancement; server always re-normalizes.
 */
(function () {
  "use strict";

  var openCount = 0;

  function closestPhoneField(el) {
    return el && el.closest ? el.closest("[data-ac-phone-field]") : null;
  }

  function syncKeyboardInset() {
    var vv = window.visualViewport;
    var inset = 0;
    if (vv) {
      inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    }
    document.documentElement.style.setProperty("--ac-keyboard-inset", inset + "px");
  }

  function lockBody(on) {
    document.body.classList.toggle("ac-phone-sheet-open", on);
  }

  function setCountry(root, iso, callingCode, countryName) {
    var valueInput = root.querySelector("[data-ac-phone-country-value]");
    var flag = root.querySelector("[data-ac-phone-flag]");
    var code = root.querySelector("[data-ac-phone-code]");
    var btn = root.querySelector("[data-ac-phone-country-btn]");
    if (valueInput) valueInput.value = iso;
    if (flag) flag.textContent = iso;
    if (code) {
      if (root.getAttribute("data-ac-phone-named") === "1" && countryName) {
        code.textContent = countryName + (callingCode ? " (" + callingCode + ")" : "");
      } else if (root.classList.contains("ac-country-picker") && countryName) {
        code.textContent = countryName + (callingCode ? " " + callingCode : "");
      } else {
        code.textContent = callingCode || iso;
      }
    }
    root.querySelectorAll("[data-ac-phone-options] [data-iso]").forEach(function (opt) {
      var selected = opt.getAttribute("data-iso") === iso;
      opt.classList.toggle("is-selected", selected);
      opt.setAttribute("aria-selected", selected ? "true" : "false");
    });
    if (btn) {
      var label = "Country calling code, currently " + (callingCode || iso);
      if (root.getAttribute("data-ac-phone-named") === "1" && countryName) {
        label =
          "Country calling code, currently " +
          countryName +
          (callingCode ? " (" + callingCode + ")" : "");
      } else if (root.classList.contains("ac-country-picker") && countryName) {
        label = "Country, currently " + countryName + (callingCode ? " " + callingCode : "");
      }
      btn.setAttribute("aria-label", label);
      btn.setAttribute("aria-expanded", "false");
    }
    closePopover(root);
  }

  function filterOptions(root, query) {
    var q = String(query || "")
      .trim()
      .toLowerCase();
    root.querySelectorAll("[data-ac-phone-options] li").forEach(function (li) {
      var btn = li.querySelector("[data-search]");
      if (!btn) return;
      var hay = btn.getAttribute("data-search") || "";
      li.hidden = q !== "" && hay.indexOf(q) === -1;
    });
  }

  function openPopover(root) {
    var pop = root.querySelector("[data-ac-phone-popover]");
    var btn = root.querySelector("[data-ac-phone-country-btn]");
    var backdrop = root.querySelector("[data-ac-phone-backdrop]");
    if (!pop) return;
    document.querySelectorAll("[data-ac-phone-field]").forEach(function (other) {
      if (other !== root) closePopover(other);
    });
    var wasHidden = pop.hidden;
    pop.hidden = false;
    if (backdrop) backdrop.hidden = false;
    if (btn) btn.setAttribute("aria-expanded", "true");
    if (wasHidden) {
      openCount += 1;
      lockBody(true);
    }
    syncKeyboardInset();
    var search = root.querySelector("[data-ac-phone-search]");
    if (search) {
      search.value = "";
      filterOptions(root, "");
      search.focus();
    }
  }

  function trapOpenPopover(ev) {
    if (ev.key !== "Tab") return;
    var open = document.querySelector("[data-ac-phone-popover]:not([hidden])");
    if (!open) return;
    if (window.acA11y && typeof window.acA11y.trapTab === "function") {
      window.acA11y.trapTab(ev, open);
    }
  }

  function closePopover(root) {
    var pop = root.querySelector("[data-ac-phone-popover]");
    var btn = root.querySelector("[data-ac-phone-country-btn]");
    var backdrop = root.querySelector("[data-ac-phone-backdrop]");
    var wasOpen = pop && !pop.hidden;
    if (pop) pop.hidden = true;
    if (backdrop) backdrop.hidden = true;
    if (btn) btn.setAttribute("aria-expanded", "false");
    if (wasOpen) {
      openCount = Math.max(0, openCount - 1);
      if (openCount === 0) lockBody(false);
    }
  }

  function onDocClick(ev) {
    var target = ev.target;
    if (target && target.closest && target.closest("[data-ac-phone-backdrop]")) {
      var field = closestPhoneField(target);
      if (field) closePopover(field);
      return;
    }
    var root = closestPhoneField(target);
    document.querySelectorAll("[data-ac-phone-field]").forEach(function (field) {
      if (field !== root) closePopover(field);
    });
  }

  function initField(root) {
    if (root.getAttribute("data-ac-phone-ready") === "1") return;
    root.setAttribute("data-ac-phone-ready", "1");

    var btn = root.querySelector("[data-ac-phone-country-btn]");
    var search = root.querySelector("[data-ac-phone-search]");
    var national = root.querySelector("[data-ac-phone-national]");

    if (btn) {
      btn.addEventListener("click", function (ev) {
        ev.preventDefault();
        var pop = root.querySelector("[data-ac-phone-popover]");
        if (pop && !pop.hidden) closePopover(root);
        else openPopover(root);
      });
    }

    if (search) {
      search.addEventListener("input", function () {
        filterOptions(root, search.value);
      });
      search.addEventListener("keydown", function (ev) {
        if (ev.key === "Escape") {
          closePopover(root);
          if (btn) btn.focus();
        }
      });
    }

    root.querySelectorAll("[data-ac-phone-options] [data-iso]").forEach(function (opt) {
      opt.addEventListener("click", function (ev) {
        ev.preventDefault();
        setCountry(
          root,
          opt.getAttribute("data-iso"),
          opt.getAttribute("data-code"),
          opt.getAttribute("data-name")
        );
        if (national) national.focus();
      });
    });

    if (national) {
      national.addEventListener("input", function () {
          });
      national.addEventListener("focus", syncKeyboardInset);
    }

  }

  function boot() {
    document.querySelectorAll("[data-ac-phone-field]").forEach(initField);
    syncKeyboardInset();
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", syncKeyboardInset);
      window.visualViewport.addEventListener("scroll", syncKeyboardInset);
    }
    window.addEventListener("resize", syncKeyboardInset);
  }

  document.addEventListener("click", onDocClick);
  document.addEventListener("keydown", function (ev) {
    if (ev.key === "Tab") trapOpenPopover(ev);
    if (ev.key !== "Escape") return;
    document.querySelectorAll("[data-ac-phone-field]").forEach(function (field) {
      var pop = field.querySelector("[data-ac-phone-popover]");
      var wasOpen = pop && !pop.hidden;
      closePopover(field);
      if (wasOpen) {
        var btn = field.querySelector("[data-ac-phone-country-btn]");
        if (btn) btn.focus();
      }
    });
  });
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
