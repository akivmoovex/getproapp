/**
 * Shared design-system behaviors (CSP-compatible: external file, no inline handlers).
 * Opt-in via data attributes — does not replace existing shell drawer scripts.
 *
 * - [data-bb-ds-drawer] + [data-bb-ds-drawer-open] / [data-bb-ds-drawer-close]
 * - [data-bb-ds-modal] + [data-bb-ds-modal-open] / [data-bb-ds-modal-close]
 */
(function () {
  "use strict";

  function qs(sel, root) {
    return (root || document).querySelector(sel);
  }

  function qsa(sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  }

  function setOpen(el, open, htmlClass) {
    if (!el) return;
    if (open) {
      el.removeAttribute("hidden");
      el.setAttribute("data-bb-ds-open", "1");
      document.documentElement.classList.add(htmlClass);
    } else {
      el.setAttribute("hidden", "");
      el.removeAttribute("data-bb-ds-open");
      document.documentElement.classList.remove(htmlClass);
    }
  }

  function bindDrawers() {
    qsa("[data-bb-ds-drawer-open]").forEach(function (btn) {
      if (btn.getAttribute("data-bb-ds-bound") === "1") return;
      btn.setAttribute("data-bb-ds-bound", "1");
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("aria-controls") || btn.getAttribute("data-bb-ds-drawer-open");
        var drawer = id ? document.getElementById(id) : null;
        setOpen(drawer, true, "bb-ds-drawer-open");
        btn.setAttribute("aria-expanded", "true");
        var closeBtn = drawer && qs("[data-bb-ds-drawer-close]", drawer);
        if (closeBtn) {
          try {
            closeBtn.focus();
          } catch (_) {
            /* ignore */
          }
        }
      });
    });

    qsa("[data-bb-ds-drawer-close]").forEach(function (btn) {
      if (btn.getAttribute("data-bb-ds-bound") === "1") return;
      btn.setAttribute("data-bb-ds-bound", "1");
      btn.addEventListener("click", function () {
        var drawer = btn.closest("[data-bb-ds-drawer]");
        setOpen(drawer, false, "bb-ds-drawer-open");
        var toggle = drawer && drawer.id ? qs('[aria-controls="' + drawer.id + '"]') : null;
        if (toggle) {
          toggle.setAttribute("aria-expanded", "false");
          try {
            toggle.focus();
          } catch (_) {
            /* ignore */
          }
        }
      });
    });
  }

  function bindModals() {
    qsa("[data-bb-ds-modal-open]").forEach(function (btn) {
      if (btn.getAttribute("data-bb-ds-bound") === "1") return;
      btn.setAttribute("data-bb-ds-bound", "1");
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-bb-ds-modal-open");
        var modal = id ? document.getElementById(id) : null;
        setOpen(modal, true, "bb-ds-modal-open");
        var panel = modal && qs(".bb-ds-modal__panel", modal);
        if (panel) {
          try {
            panel.focus();
          } catch (_) {
            /* ignore */
          }
        }
      });
    });

    qsa("[data-bb-ds-modal-close]").forEach(function (btn) {
      if (btn.getAttribute("data-bb-ds-bound") === "1") return;
      btn.setAttribute("data-bb-ds-bound", "1");
      btn.addEventListener("click", function () {
        var modal = btn.closest("[data-bb-ds-modal]");
        setOpen(modal, false, "bb-ds-modal-open");
      });
    });

    document.addEventListener("keydown", function (ev) {
      if (ev.key !== "Escape") return;
      qsa('[data-bb-ds-modal][data-bb-ds-open="1"]').forEach(function (modal) {
        setOpen(modal, false, "bb-ds-modal-open");
      });
      qsa('[data-bb-ds-drawer][data-bb-ds-open="1"]').forEach(function (drawer) {
        setOpen(drawer, false, "bb-ds-drawer-open");
      });
    });
  }

  function init() {
    bindDrawers();
    bindModals();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
