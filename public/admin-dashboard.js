/**
 * Applies dynamic chart dimensions from data-* (no inline styles in dashboard.ejs).
 */
(function () {
  document.querySelectorAll("[data-dash-bar-pct]").forEach(function (el) {
    var v = el.getAttribute("data-dash-bar-pct");
    if (v != null && v !== "") el.style.height = v + "%";
  });
  document.querySelectorAll("[data-dash-width-pct]").forEach(function (el) {
    var v = el.getAttribute("data-dash-width-pct");
    if (v != null && v !== "") el.style.width = v + "%";
  });
})();
