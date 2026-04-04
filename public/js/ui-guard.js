/**
 * Dev-only guard (NODE_ENV !== production via showUiGuard):
 * - warn on .btn-styled <button> missing .c-button (system Button partial)
 * - compare #site-search-bar live vs an off-DOM clone to detect page-level CSS altering SearchBar
 */
(function () {
  function warn(msg) {
    console.warn("[getpro/ui-guard] " + msg);
  }

  function num(cs, prop) {
    var v = parseFloat(cs.getPropertyValue(prop));
    return Number.isFinite(v) ? v : 0;
  }

  function warnIfSearchBarProbeDiffers() {
    var shell = document.getElementById("site-search-bar");
    if (!shell) return;
    var form = shell.querySelector("form.c-search-bar");
    if (!form) return;

    var realInput = form.querySelector(".pro-ac-input");
    if (!realInput) return;

    var w = Math.max(320, Math.ceil(shell.getBoundingClientRect().width));
    var host = document.createElement("div");
    host.setAttribute("aria-hidden", "true");
    host.style.cssText =
      "position:fixed;left:-10000px;top:0;width:" + w + "px;pointer-events:none;visibility:hidden;";

    var clone = shell.cloneNode(true);
    clone.removeAttribute("id");
    clone.querySelectorAll("[id]").forEach(function (el) {
      el.removeAttribute("id");
    });
    host.appendChild(clone);
    document.body.appendChild(host);

    var probeInput = clone.querySelector(".pro-ac-input");
    if (!probeInput) {
      document.body.removeChild(host);
      return;
    }

    var tol = 1.5;
    var a = getComputedStyle(realInput);
    var b = getComputedStyle(probeInput);
    var props = ["height", "padding-top", "padding-bottom", "font-size", "border-top-width"];
    for (var i = 0; i < props.length; i++) {
      var p = props[i];
      if (Math.abs(num(a, p) - num(b, p)) > tol) {
        warn(
          "External CSS is modifying a system component: #site-search-bar .pro-ac-input differs from isolated probe on " +
            p +
            " (live " +
            a.getPropertyValue(p) +
            " vs probe " +
            b.getPropertyValue(p) +
            ")."
        );
        document.body.removeChild(host);
        return;
      }
    }

    var realBtn = form.querySelector(".pro-search-form__submit.btn");
    var probeBtn = clone.querySelector(".pro-search-form__submit.btn");
    if (realBtn && probeBtn) {
      var ca = getComputedStyle(realBtn);
      var cb = getComputedStyle(probeBtn);
      if (Math.abs(num(ca, "height") - num(cb, "height")) > tol) {
        warn(
          "External CSS is modifying a system component: search submit height differs from probe (live " +
            ca.getPropertyValue("height") +
            " vs " +
            cb.getPropertyValue("height") +
            ")."
        );
      }
    }

    document.body.removeChild(host);
  }

  document.addEventListener("DOMContentLoaded", function () {
    document.querySelectorAll("button").forEach(function (el) {
      var cls = el.className && String(el.className);
      if (!cls) return;
      var tokens = cls.split(/\s+/);
      var usesBtn = tokens.indexOf("btn") !== -1 || tokens.some(function (t) { return t.indexOf("btn--") === 0; });
      if (usesBtn && !el.classList.contains("c-button")) {
        warn("Use system component: Button (expected .c-button from partials/components/button.ejs).");
      }
    });

    function runProbe() {
      if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(function () {
          requestAnimationFrame(function () {
            requestAnimationFrame(warnIfSearchBarProbeDiffers);
          });
        });
      } else {
        requestAnimationFrame(function () {
          requestAnimationFrame(warnIfSearchBarProbeDiffers);
        });
      }
    }

    runProbe();
  });
})();
