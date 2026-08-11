/**
 * ActiveClinic PhoneField — searchable country picker + national number.
 * Progressive enhancement; server always re-normalizes.
 */
(function () {
  "use strict";

  function closestPhoneField(el) {
    return el && el.closest ? el.closest("[data-ac-phone-field]") : null;
  }

  function setCountry(root, iso, callingCode, countryName) {
    var valueInput = root.querySelector("[data-ac-phone-country-value]");
    var flag = root.querySelector("[data-ac-phone-flag]");
    var code = root.querySelector("[data-ac-phone-code]");
    var btn = root.querySelector("[data-ac-phone-country-btn]");
    if (valueInput) valueInput.value = iso;
    if (flag) flag.textContent = iso;
    if (code) {
      if (root.classList.contains("ac-country-picker") && countryName) {
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
    if (btn) btn.setAttribute("aria-expanded", "false");
    var pop = root.querySelector("[data-ac-phone-popover]");
    if (pop) pop.hidden = true;
    syncLegacy(root);
  }

  function syncLegacy(root) {
    var legacy = root.querySelector("[data-ac-phone-legacy]");
    if (!legacy) return;
    var country = root.querySelector("[data-ac-phone-country-value]");
    var national = root.querySelector("[data-ac-phone-national]");
    var n = national ? String(national.value || "").trim() : "";
    if (!n) {
      legacy.value = "";
      return;
    }
    // Leave empty when national looks like email (login) — server handles.
    if (n.indexOf("@") !== -1) {
      legacy.value = "";
      return;
    }
    // Prefer sending structured fields; legacy left blank so server uses phone_national.
    legacy.value = "";
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
    if (!pop) return;
    document.querySelectorAll("[data-ac-phone-popover]").forEach(function (other) {
      if (other !== pop) other.hidden = true;
    });
    pop.hidden = false;
    if (btn) btn.setAttribute("aria-expanded", "true");
    var search = root.querySelector("[data-ac-phone-search]");
    if (search) {
      search.value = "";
      filterOptions(root, "");
      search.focus();
    }
  }

  function closePopover(root) {
    var pop = root.querySelector("[data-ac-phone-popover]");
    var btn = root.querySelector("[data-ac-phone-country-btn]");
    if (pop) pop.hidden = true;
    if (btn) btn.setAttribute("aria-expanded", "false");
  }

  function onDocClick(ev) {
    var root = closestPhoneField(ev.target);
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
        syncLegacy(root);
      });
    }

    syncLegacy(root);
  }

  function boot() {
    document.querySelectorAll("[data-ac-phone-field]").forEach(initField);
  }

  document.addEventListener("click", onDocClick);
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
