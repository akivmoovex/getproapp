/**
 * Theme + brand preferences (localStorage). Exposes window.getProThemePrefs.
 * Keys: gp-theme ("dark" | "light" | unset), gp-brand ("getpro" | "proonline" | unset)
 */
(function () {
  var K_THEME = "gp-theme";
  var K_BRAND = "gp-brand";

  function applyFromStorage() {
    var d = document.documentElement;
    try {
      var th = localStorage.getItem(K_THEME);
      var br = localStorage.getItem(K_BRAND);
      if (th === "dark") d.setAttribute("data-theme", "dark");
      else if (th === "light") d.setAttribute("data-theme", "light");
      else d.removeAttribute("data-theme");

      if (br === "getpro") d.setAttribute("data-brand", "getpro");
      else if (br === "proonline") d.setAttribute("data-brand", "proonline");
      else d.removeAttribute("data-brand");
    } catch (e) {
      /* private mode */
    }
  }

  window.getProThemePrefs = {
    apply: applyFromStorage,
    /** @param {"light"|"dark"|"system"} mode */
    setTheme: function (mode) {
      try {
        if (mode === "dark") localStorage.setItem(K_THEME, "dark");
        else if (mode === "light") localStorage.setItem(K_THEME, "light");
        else localStorage.removeItem(K_THEME);
      } catch (e) {}
      applyFromStorage();
    },
    /** @param {"proonline"|"getpro"|"default"} brand */
    setBrand: function (brand) {
      try {
        if (brand === "getpro") localStorage.setItem(K_BRAND, "getpro");
        else if (brand === "proonline") localStorage.setItem(K_BRAND, "proonline");
        else localStorage.removeItem(K_BRAND);
      } catch (e) {}
      applyFromStorage();
    },
    getTheme: function () {
      try {
        return localStorage.getItem(K_THEME) || "";
      } catch (e) {
        return "";
      }
    },
    getBrand: function () {
      try {
        return localStorage.getItem(K_BRAND) || "";
      } catch (e) {
        return "";
      }
    },
  };

  applyFromStorage();

  function initHeaderThemeControls() {
    var prefs = window.getProThemePrefs;
    if (!prefs) return;
    var btn = document.getElementById("gp-theme-toggle");
    var sel = document.getElementById("gp-brand-switch");
    if (!btn && !sel) return;

    function syncChrome() {
      var dark = document.documentElement.getAttribute("data-theme") === "dark";
      if (btn) {
        btn.classList.toggle("gp-theme-switchers__theme--dark", dark);
        btn.setAttribute("aria-pressed", dark ? "true" : "false");
        btn.setAttribute("aria-label", dark ? "Switch to light theme" : "Switch to dark theme");
      }
      if (sel) {
        var br = prefs.getBrand();
        if (br === "getpro") sel.value = "getpro";
        else if (br === "proonline") sel.value = "proonline";
        else sel.value = "";
      }
    }

    if (btn) {
      btn.addEventListener("click", function () {
        var isDark = document.documentElement.getAttribute("data-theme") === "dark";
        prefs.setTheme(isDark ? "light" : "dark");
        syncChrome();
      });
    }
    if (sel) {
      sel.addEventListener("change", function () {
        var v = sel.value;
        if (!v) prefs.setBrand("default");
        else if (v === "getpro") prefs.setBrand("getpro");
        else prefs.setBrand("proonline");
        syncChrome();
      });
    }

    syncChrome();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initHeaderThemeControls);
  } else {
    initHeaderThemeControls();
  }
})();
