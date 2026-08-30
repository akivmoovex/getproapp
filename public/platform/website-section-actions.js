/**
 * Shared website editor section actions (Wave 4A / Stitch WE01-06).
 * BlessBoard + ActiveClinic — capability-driven menu, draft-only mutations.
 */
(function () {
  "use strict";

  var chrome = document.querySelector("[data-website-chrome]");
  var host = document.querySelector("[data-website-section-menu-host]");
  if (!chrome || !host) return;

  var manifest = null;
  var activeSection = null;
  var activeTrigger = null;
  var busy = false;

  function parseManifest() {
    var raw = chrome.getAttribute("data-website-section-manifest");
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (err) {
      return null;
    }
  }

  function csrfToken() {
    var meta = document.querySelector('meta[name="csrf-token"]');
    if (meta && meta.getAttribute("content")) return meta.getAttribute("content");
    var input = document.querySelector('input[name="_csrf"]');
    return input ? input.value : "";
  }

  function csrfField() {
    var input = document.querySelector('input[name="_csrf"]');
    return input ? input.name : "_csrf";
  }

  function endpoint() {
    return chrome.getAttribute("data-website-section-actions-url") || "";
  }

  function labels() {
    return (manifest && manifest.labels) || {};
  }

  function sectionByKey(key) {
    if (!manifest || !Array.isArray(manifest.sections)) return null;
    return manifest.sections.find(function (s) {
      return String(s.sectionKey) === String(key);
    });
  }

  function closeMenu() {
    host.hidden = true;
    host.querySelectorAll("[data-website-section-menu-panel]").forEach(function (panel) {
      panel.hidden = true;
    });
    var overlay = host.querySelector("[data-website-section-menu-overlay]");
    if (overlay) overlay.hidden = true;
    document.body.classList.remove("gp-website-section-menu-open");
    var reorderSub = host.querySelector('[data-website-section-submenu="reorder"]');
    if (reorderSub) reorderSub.hidden = true;
    if (activeTrigger && activeTrigger.focus) {
      try {
        activeTrigger.focus();
      } catch (err) {
        /* ignore */
      }
    }
  }

  function openPanel(name) {
    host.hidden = false;
    var overlay = host.querySelector("[data-website-section-menu-overlay]");
    if (overlay) overlay.hidden = false;
    host.querySelectorAll("[data-website-section-menu-panel]").forEach(function (panel) {
      panel.hidden = panel.getAttribute("data-website-section-menu-panel") !== name;
    });
    document.body.classList.add("gp-website-section-menu-open");
    var panel = host.querySelector('[data-website-section-menu-panel="' + name + '"]');
    var focusable = panel && panel.querySelector("button:not([disabled])");
    if (focusable && focusable.focus) focusable.focus();
  }

  function setMenuCapabilities(section) {
    host.querySelectorAll("[data-website-section-action]").forEach(function (btn) {
      var action = btn.getAttribute("data-website-section-action");
      var enabled = true;
      if (action === "edit") enabled = section.canEdit;
      if (action === "reorder" || action === "move_up" || action === "move_down") enabled = section.canReorder;
      if (action === "hide") enabled = section.canHide;
      if (action === "restore_default") enabled = section.canRestoreDefault;
      btn.disabled = !enabled;
      btn.hidden = !enabled && action !== "hide";
    });
    var hideBtn = host.querySelector('[data-website-section-action="hide"]');
    var hideLabel = host.querySelector("[data-website-section-hide-label]");
    if (hideBtn && hideLabel) {
      if (section.isHidden) {
        hideBtn.setAttribute("data-website-section-action", "show");
        hideLabel.textContent = labels().show || "Show section";
        var icon = hideBtn.querySelector(".material-symbols-outlined");
        if (icon) icon.textContent = "visibility";
      } else {
        hideBtn.setAttribute("data-website-section-action", "hide");
        hideLabel.textContent = labels().hide || "Hide section";
        var icon2 = hideBtn.querySelector(".material-symbols-outlined");
        if (icon2) icon2.textContent = "visibility_off";
      }
    }
  }

  function openMenu(section, trigger) {
    activeSection = section;
    activeTrigger = trigger;
    setMenuCapabilities(section);
    openPanel("1");
  }

  function postAction(action) {
    if (!activeSection || busy) return Promise.resolve();
    var url = endpoint();
    if (!url) return Promise.resolve();
    busy = true;
    var body = {
      action: action,
      pageKey: manifest.pageKey,
      sectionKey: activeSection.sectionKey,
      sectionId: activeSection.sectionId,
    };
    body[csrfField()] = csrfToken();
    return fetch(url, {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-CSRF-Token": csrfToken(),
      },
      body: JSON.stringify(body),
    })
      .then(function (res) {
        return res.json().catch(function () {
          return { ok: false };
        }).then(function (json) {
          return { res: res, json: json };
        });
      })
      .then(function (out) {
        busy = false;
        if (out.res.ok && out.json && out.json.ok) {
          closeMenu();
          window.location.reload();
          return;
        }
        var live = document.querySelector("[data-website-engine-save-state]");
        if (live) live.textContent = (out.json && (out.json.reason || out.json.code)) || "Could not update section";
      })
      .catch(function () {
        busy = false;
      });
  }

  function focusSectionEdit(section) {
    var el = null;
    if (section.selector) {
      el = document.querySelector(section.selector);
    }
    if (!el) {
      el = document.querySelector(
        '[data-section="' + section.sectionKey + '"], [data-ac-home-section="' + section.sectionKey + '"]'
      );
    }
    if (!el) return;
    closeMenu();
    var pencil = el.querySelector("[data-website-start], .gp-website-editable__pencil");
    if (pencil && pencil.click) {
      pencil.click();
      return;
    }
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("gp-website-section--focus");
    window.setTimeout(function () {
      el.classList.remove("gp-website-section--focus");
    }, 1200);
  }

  function ensureTriggers() {
    manifest = parseManifest();
    if (!manifest || !Array.isArray(manifest.sections)) return;
    manifest.sections.forEach(function (section) {
      var target = null;
      if (section.selector) target = document.querySelector(section.selector);
      if (!target) {
        target = document.querySelector(
          '[data-section="' + section.sectionKey + '"], [data-ac-home-section="' + section.sectionKey + '"]'
        );
      }
      if (!target) return;
      if (target.querySelector("[data-website-section-trigger]")) return;
      target.classList.add("gp-website-section");
      if (section.isHidden) target.classList.add("gp-website-section--hidden-draft");
      target.setAttribute("data-website-section-key", section.sectionKey);
      var wrap = document.createElement("div");
      wrap.className = "gp-website-section__chrome";
      var badge = document.createElement("span");
      badge.className = "gp-website-section__hidden-badge";
      badge.textContent = labels().hiddenBadge || "Hidden in draft";
      badge.hidden = !section.isHidden;
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "gp-website-section__trigger";
      btn.setAttribute("data-website-section-trigger", "1");
      btn.setAttribute("data-stitch-edit", "WE01-06");
      btn.setAttribute("aria-label", labels().triggerAria || "Section actions");
      btn.setAttribute("aria-haspopup", "menu");
      btn.innerHTML = '<span class="material-symbols-outlined" aria-hidden="true">more_horiz</span>';
      btn.addEventListener("click", function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        openMenu(section, btn);
      });
      wrap.appendChild(badge);
      wrap.appendChild(btn);
      if (getComputedStyle(target).position === "static") {
        target.style.position = "relative";
      }
      target.appendChild(wrap);
    });
  }

  host.querySelectorAll("[data-website-section-menu-dismiss], [data-website-section-menu-overlay]").forEach(function (el) {
    el.addEventListener("click", closeMenu);
  });

  host.querySelectorAll("[data-website-section-action]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var action = btn.getAttribute("data-website-section-action");
      if (!action || btn.disabled) return;
      if (action === "edit") {
        focusSectionEdit(activeSection);
        return;
      }
      if (action === "reorder") {
        var sub = host.querySelector('[data-website-section-submenu="reorder"]');
        if (sub) sub.hidden = !sub.hidden;
        return;
      }
      if (action === "restore_default") {
        openPanel("restore");
        return;
      }
      postAction(action);
    });
  });

  var restoreBtn = host.querySelector("[data-website-section-confirm-restore]");
  if (restoreBtn) {
    restoreBtn.addEventListener("click", function () {
      postAction("restore_default");
    });
  }

  document.addEventListener("keydown", function (ev) {
    if (ev.key === "Escape" && !host.hidden) {
      ev.preventDefault();
      closeMenu();
    }
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ensureTriggers);
  } else {
    ensureTriggers();
  }

  window.GpWebsiteSectionActions = {
    refresh: ensureTriggers,
    openForSectionKey: function (key) {
      manifest = parseManifest();
      var section = sectionByKey(key);
      if (!section) return;
      var trigger = document.querySelector(
        '[data-website-section-key="' + key + '"] [data-website-section-trigger]'
      );
      openMenu(section, trigger || null);
    },
  };
})();
