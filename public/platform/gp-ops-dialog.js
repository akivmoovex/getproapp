/**
 * Shared ops confirmation dialog open/close (product-neutral).
 * Mirrors structural behavior used by product shells without product copy.
 *
 * Markup:
 *   [data-gp-ops-dialog] + [data-gp-ops-dialog-open] / [data-gp-ops-dialog-close]
 */
(function (global) {
  "use strict";

  function qs(sel, root) {
    return (root || document).querySelector(sel);
  }

  function qsa(sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  }

  function setOpen(dialog, open) {
    if (!dialog) return;
    if (open) {
      dialog.removeAttribute("hidden");
      dialog.setAttribute("data-gp-ops-open", "1");
      document.documentElement.classList.add("gp-ops-dialog-open");
    } else {
      dialog.setAttribute("hidden", "");
      dialog.removeAttribute("data-gp-ops-open");
      if (!qs('[data-gp-ops-dialog][data-gp-ops-open="1"]')) {
        document.documentElement.classList.remove("gp-ops-dialog-open");
      }
    }
  }

  function bind() {
    qsa("[data-gp-ops-dialog-open]").forEach(function (btn) {
      if (btn.getAttribute("data-gp-ops-bound") === "1") return;
      btn.setAttribute("data-gp-ops-bound", "1");
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-gp-ops-dialog-open");
        var dialog = id ? document.getElementById(id) : null;
        btn.setAttribute("data-gp-ops-dialog-return", "1");
        setOpen(dialog, true);
        var panel = dialog && qs(".gp-ops-dialog__panel", dialog);
        if (panel && typeof panel.focus === "function") panel.focus();
      });
    });

    qsa("[data-gp-ops-dialog-close]").forEach(function (btn) {
      if (btn.getAttribute("data-gp-ops-bound") === "1") return;
      btn.setAttribute("data-gp-ops-bound", "1");
      btn.addEventListener("click", function () {
        var dialog = btn.closest("[data-gp-ops-dialog]");
        setOpen(dialog, false);
        var opener = qs('[data-gp-ops-dialog-open][data-gp-ops-dialog-return="1"]');
        if (opener) {
          opener.removeAttribute("data-gp-ops-dialog-return");
          if (typeof opener.focus === "function") opener.focus();
        }
      });
    });

    if (!document.documentElement.getAttribute("data-gp-ops-dialog-esc")) {
      document.documentElement.setAttribute("data-gp-ops-dialog-esc", "1");
      document.addEventListener("keydown", function (ev) {
        if (ev.key !== "Escape") return;
        qsa('[data-gp-ops-dialog][data-gp-ops-open="1"]').forEach(function (dialog) {
          setOpen(dialog, false);
        });
      });
    }
  }

  var api = {
    bind: bind,
    open: function (id) {
      setOpen(document.getElementById(id), true);
    },
    close: function (id) {
      setOpen(document.getElementById(id), false);
    },
  };

  global.GpOpsDialog = api;
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bind);
  } else {
    bind();
  }
})(typeof window !== "undefined" ? window : globalThis);
