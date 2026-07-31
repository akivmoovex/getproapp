(function () {
  "use strict";

  function qs(sel, root) {
    return (root || document).querySelector(sel);
  }

  function ready(fn) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn);
    } else {
      fn();
    }
  }

  ready(function () {
    var toggle = qs("[data-bb-features-toggle]");
    var panel = qs("[data-bb-features-panel]");
    if (!toggle || !panel) return;

    function setOpen(open) {
      if (open) {
        panel.hidden = false;
        toggle.setAttribute("aria-expanded", "true");
        document.documentElement.classList.add("bb-tp-features-open");
      } else {
        panel.hidden = true;
        toggle.setAttribute("aria-expanded", "false");
        document.documentElement.classList.remove("bb-tp-features-open");
      }
    }

    toggle.addEventListener("click", function (e) {
      e.preventDefault();
      setOpen(panel.hidden);
    });

    var closeBtn = qs("[data-bb-features-close]", panel);
    if (closeBtn) {
      closeBtn.addEventListener("click", function (e) {
        e.preventDefault();
        setOpen(false);
        toggle.focus();
      });
    }

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !panel.hidden) {
        setOpen(false);
        toggle.focus();
      }
    });
  });
})();
