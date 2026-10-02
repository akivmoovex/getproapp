"use strict";

/**
 * Shared platform town/city autocomplete (BlessBoard + ActiveClinic).
 * Uses GET /api/locations/autocomplete backed by platform.geographic_locations.
 */

(function (global) {
  function qs(sel, root) {
    return (root || document).querySelector(sel);
  }

  function debounce(fn, ms) {
    var timer = null;
    return function () {
      var args = arguments;
      clearTimeout(timer);
      timer = setTimeout(function () {
        fn.apply(null, args);
      }, ms);
    };
  }

  function normalizeQuery(value) {
    return String(value || "").trim();
  }

  /**
   * @param {{
   *   countryInput?: string|HTMLElement,
   *   cityInput?: string|HTMLElement,
   *   locationIdInput?: string|HTMLElement|null,
   *   listbox?: string|HTMLElement,
   *   allowCustom?: boolean,
   *   debounceMs?: number,
   * }} config
   */
  function initLocationAutocomplete(config) {
    config = config || {};
    var country =
      typeof config.countryInput === "string"
        ? qs(config.countryInput)
        : config.countryInput;
    var cityInput =
      typeof config.cityInput === "string" ? qs(config.cityInput) : config.cityInput;
    var locationId =
      config.locationIdInput == null
        ? null
        : typeof config.locationIdInput === "string"
          ? qs(config.locationIdInput)
          : config.locationIdInput;
    var listbox =
      typeof config.listbox === "string" ? qs(config.listbox) : config.listbox;
    var allowCustom = config.allowCustom !== false;
    var debounceMs = Number(config.debounceMs) > 0 ? Number(config.debounceMs) : 180;

    if (!country || !cityInput || !listbox) return null;

    var activeIndex = -1;
    var results = [];
    var open = false;

    function closeList() {
      open = false;
      activeIndex = -1;
      listbox.hidden = true;
      listbox.innerHTML = "";
      cityInput.setAttribute("aria-expanded", "false");
    }

    function setLocationId(value) {
      if (!locationId) return;
      locationId.value = value || "";
    }

    function renderResults(items, query) {
      listbox.innerHTML = "";
      results = items.slice();
      if (!results.length && allowCustom && query.length >= 1) {
        var add = document.createElement("button");
        add.type = "button";
        add.className = "gp-location-option gp-location-option--add acw-location-option acw-location-option--add";
        add.setAttribute("role", "option");
        add.dataset.addName = query;
        add.textContent = 'Add "' + query + '"';
        listbox.appendChild(add);
      } else {
        results.forEach(function (item, idx) {
          var btn = document.createElement("button");
          btn.type = "button";
          btn.className = "gp-location-option acw-location-option";
          btn.setAttribute("role", "option");
          btn.dataset.index = String(idx);
          btn.dataset.id = item.id || "";
          btn.dataset.name = item.name || "";
          btn.textContent = item.name;
          listbox.appendChild(btn);
        });
        if (allowCustom && query.length >= 1) {
          var exact = results.some(function (item) {
            return String(item.name || "").toLowerCase() === query.toLowerCase();
          });
          if (!exact) {
            var addBtn = document.createElement("button");
            addBtn.type = "button";
            addBtn.className = "gp-location-option gp-location-option--add";
            addBtn.setAttribute("role", "option");
            addBtn.dataset.addName = query;
            addBtn.textContent = 'Add "' + query + '"';
            listbox.appendChild(addBtn);
          }
        }
      }
      listbox.hidden = false;
      open = true;
      cityInput.setAttribute("aria-expanded", "true");
    }

    function selectOption(option) {
      if (!option) return;
      if (option.dataset.addName) {
        cityInput.value = option.dataset.addName;
        setLocationId("");
      } else {
        cityInput.value = option.dataset.name || "";
        setLocationId(option.dataset.id || "");
      }
      closeList();
    }

    var fetchResults = debounce(function () {
      var q = normalizeQuery(cityInput.value);
      setLocationId("");
      if (!q) {
        closeList();
        return;
      }
      var countryCode = String(country.value || "ZM").toUpperCase();
      fetch(
        "/api/locations/autocomplete?country=" +
          encodeURIComponent(countryCode) +
          "&q=" +
          encodeURIComponent(q),
        { credentials: "same-origin", headers: { Accept: "application/json" } }
      )
        .then(function (res) {
          return res.json();
        })
        .then(function (payload) {
          renderResults((payload && payload.results) || [], q);
        })
        .catch(function () {
          closeList();
        });
    }, debounceMs);

    cityInput.addEventListener("input", fetchResults);
    cityInput.addEventListener("focus", fetchResults);
    cityInput.addEventListener("keydown", function (ev) {
      var options = listbox.querySelectorAll("[role='option']");
      if (!open || !options.length) return;
      if (ev.key === "ArrowDown") {
        ev.preventDefault();
        activeIndex = Math.min(activeIndex + 1, options.length - 1);
        options[activeIndex].focus();
      } else if (ev.key === "ArrowUp") {
        ev.preventDefault();
        activeIndex = Math.max(activeIndex - 1, 0);
        options[activeIndex].focus();
      } else if (ev.key === "Enter" && activeIndex >= 0) {
        ev.preventDefault();
        selectOption(options[activeIndex]);
      } else if (ev.key === "Escape") {
        closeList();
      }
    });
    cityInput.addEventListener("blur", function () {
      window.setTimeout(closeList, 150);
    });
    listbox.addEventListener("mousedown", function (ev) {
      var option = ev.target.closest("[role='option']");
      if (!option) return;
      ev.preventDefault();
      selectOption(option);
    });

    return { closeList: closeList };
  }

  global.GpLocationAutocomplete = {
    init: initLocationAutocomplete,
  };
})(typeof window !== "undefined" ? window : globalThis);
