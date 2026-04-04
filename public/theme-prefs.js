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
})();
