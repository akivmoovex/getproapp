/**
 * Shared website editor lifecycle (Wave 3) — preview publish confirm, discard,
 * unpublish, and local unsaved-changes guard. BlessBoard + ActiveClinic.
 */
(function () {
  "use strict";

  var host = document.querySelector("[data-website-lifecycle-host]");
  var chrome = document.querySelector("[data-website-chrome]");
  var pendingNavigate = null;
  var pendingPublishForm = null;
  var allowPublishSubmit = false;
  var localDirtyController = null;
  var openPanel = null;

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

  function discardUrl() {
    return (chrome && chrome.getAttribute("data-website-discard-url")) || "";
  }

  function unpublishUrl() {
    return (chrome && chrome.getAttribute("data-website-unpublish-url")) || "";
  }

  function setStatus(kind, message, isError) {
    if (!host) return;
    var el = host.querySelector('[data-website-lifecycle-status="' + kind + '"]');
    if (!el) return;
    el.textContent = message || "";
    el.classList.toggle("is-error", Boolean(isError));
  }

  function panelEl(kind) {
    return host ? host.querySelector('[data-website-lifecycle-panel="' + kind + '"]') : null;
  }

  function closeDialog() {
    if (!host) return;
    host.hidden = true;
    var overlay = host.querySelector("[data-website-lifecycle-overlay]");
    if (overlay) overlay.hidden = true;
    if (openPanel) openPanel.hidden = true;
    openPanel = null;
    pendingPublishForm = null;
    document.body.classList.remove("gp-website-lifecycle-open");
  }

  function openDialog(kind) {
    if (!host) return false;
    var panel = panelEl(kind);
    if (!panel) return false;
    host.hidden = false;
    var overlay = host.querySelector("[data-website-lifecycle-overlay]");
    if (overlay) overlay.hidden = false;
    panel.hidden = false;
    openPanel = panel;
    document.body.classList.add("gp-website-lifecycle-open");
    var focusable = panel.querySelector("button, [href], input, textarea");
    if (focusable && focusable.focus) focusable.focus();
    return true;
  }

  function postForm(url, extraFields) {
    return fetch(url, {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json, text/html",
        "X-CSRF-Token": csrfToken(),
      },
      body: new URLSearchParams(
        Object.assign(
          {},
          extraFields || {},
          (function () {
            var o = {};
            o[csrfField()] = csrfToken();
            return o;
          })()
        )
      ).toString(),
    }).then(function (res) {
      return res
        .text()
        .then(function (text) {
          var json = null;
          try {
            json = JSON.parse(text);
          } catch (err) {
            json = null;
          }
          return { res: res, json: json, text: text };
        })
        .catch(function () {
          return { res: res, json: null, text: "" };
        });
    });
  }

  function showToast(message) {
    var live = document.querySelector("[data-website-engine-save-state]");
    if (live) {
      live.textContent = message;
      return;
    }
    var status = document.querySelector("[data-website-field-editor-status]");
    if (status) status.textContent = message;
  }

  function hasLocalUnsaved() {
    if (localDirtyController && typeof localDirtyController.isDirty === "function") {
      return Boolean(localDirtyController.isDirty());
    }
    if (window.BbWebsiteUnsavedGuard && window.BbWebsiteUnsavedGuard.hasActiveUnsaved) {
      return window.BbWebsiteUnsavedGuard.hasActiveUnsaved();
    }
    return false;
  }

  function discardLocal() {
    if (localDirtyController && typeof localDirtyController.discard === "function") {
      localDirtyController.discard();
    }
    if (window.BbWebsiteUnsavedGuard && window.BbWebsiteUnsavedGuard.clearActiveController) {
      window.BbWebsiteUnsavedGuard.clearActiveController(localDirtyController);
    }
    localDirtyController = null;
  }

  function guardNavigation(navigateFn) {
    if (!hasLocalUnsaved()) {
      if (typeof navigateFn === "function") navigateFn();
      return;
    }
    pendingNavigate = navigateFn || null;
    openDialog("unsaved");
  }

  function submitPublishForm(form) {
    if (!form) return;
    var btn = form.querySelector('[type="submit"]');
    if (btn) btn.disabled = true;
    allowPublishSubmit = true;
    if (typeof form.requestSubmit === "function") {
      form.requestSubmit();
      return;
    }
    form.submit();
  }

  function confirmPublish(form) {
    pendingPublishForm = form || null;
    if (openDialog("publish")) return;
    submitPublishForm(form);
  }

  function runDiscardDraft() {
    var url = discardUrl();
    if (!url) return Promise.resolve({ ok: false });
    setStatus("discard", "Discarding…", false);
    var btn = host.querySelector('[data-website-lifecycle-confirm="discard"]');
    if (btn) btn.disabled = true;
    return postForm(url, { confirm_discard: "1", discard_all: "1" }).then(function (out) {
      if (btn) btn.disabled = false;
      if (out.res.ok || (out.res.status >= 300 && out.res.status < 400)) {
        closeDialog();
        showToast("Draft changes discarded");
        window.location.reload();
        return { ok: true };
      }
      setStatus("discard", (out.json && (out.json.reason || out.json.code)) || "Could not discard", true);
      return { ok: false };
    });
  }

  function runUnpublish() {
    var url = unpublishUrl();
    if (!url) return Promise.resolve({ ok: false });
    setStatus("unpublish", "Unpublishing…", false);
    var btn = host.querySelector('[data-website-lifecycle-confirm="unpublish"]');
    if (btn) btn.disabled = true;
    return postForm(url, { confirm_unpublish: "1" }).then(function (out) {
      if (btn) btn.disabled = false;
      if (out.res.ok || (out.res.status >= 300 && out.res.status < 400)) {
        closeDialog();
        showToast("Website unpublished");
        window.location.reload();
        return { ok: true };
      }
      setStatus("unpublish", (out.json && (out.json.reason || out.json.code)) || "Could not unpublish", true);
      return { ok: false };
    });
  }

  if (host) {
    host.querySelectorAll("[data-website-lifecycle-dismiss], [data-website-lifecycle-cancel]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        closeDialog();
      });
    });
    host.querySelectorAll("[data-website-lifecycle-overlay]").forEach(function (overlay) {
      overlay.addEventListener("click", closeDialog);
    });
    host.querySelectorAll("[data-website-lifecycle-confirm]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var kind = btn.getAttribute("data-website-lifecycle-confirm");
        if (kind === "publish") {
          var publishForm = pendingPublishForm;
          closeDialog();
          submitPublishForm(publishForm);
          return;
        }
        if (kind === "discard") {
          runDiscardDraft();
          return;
        }
        if (kind === "unpublish") {
          runUnpublish();
          return;
        }
        if (kind === "keep-editing") {
          pendingNavigate = null;
          closeDialog();
          return;
        }
        if (kind === "discard-local") {
          discardLocal();
          var go = pendingNavigate;
          pendingNavigate = null;
          closeDialog();
          if (typeof go === "function") go();
        }
      });
    });
    document.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape" && openPanel) {
        ev.preventDefault();
        closeDialog();
      }
    });
  }

  document.querySelectorAll("[data-website-publish-confirm='1']").forEach(function (form) {
    form.addEventListener("submit", function (ev) {
      if (allowPublishSubmit) {
        allowPublishSubmit = false;
        return;
      }
      ev.preventDefault();
      confirmPublish(form);
    });
  });

  document.querySelectorAll("[data-website-lifecycle-action]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var action = btn.getAttribute("data-website-lifecycle-action");
      if (action === "discard") openDialog("discard");
      if (action === "unpublish") openDialog("unpublish");
    });
  });

  document.addEventListener("click", function (ev) {
    var exit =
      ev.target &&
      ev.target.closest &&
      ev.target.closest("[data-website-engine-exit], [data-bb-exit-editing]");
    if (!exit) return;
    if (!hasLocalUnsaved()) return;
    ev.preventDefault();
    ev.stopPropagation();
    var href = exit.getAttribute("href");
    var form = exit.closest("form");
    guardNavigation(function () {
      if (form) {
        if (typeof form.requestSubmit === "function") form.requestSubmit();
        else form.submit();
        return;
      }
      if (href) window.location.href = href;
    });
  }, true);

  document.addEventListener("click", function (ev) {
    var link = ev.target.closest("a[href]");
    if (!link) return;
    if (link.hasAttribute("data-website-unsaved-ignore")) return;
    if (link.closest("[data-website-lifecycle-host]")) return;
    if (!hasLocalUnsaved()) return;
    var href = link.getAttribute("href");
    if (!href || href.charAt(0) === "#" || /^javascript:/i.test(href)) return;
    ev.preventDefault();
    guardNavigation(function () {
      window.location.href = link.href;
    });
  }, true);

  window.addEventListener("beforeunload", function (ev) {
    if (!hasLocalUnsaved()) return;
    ev.preventDefault();
    ev.returnValue = "";
  });

  window.GpWebsiteLifecycle = {
    setLocalDirtyController: function (controller) {
      localDirtyController = controller || null;
    },
    clearLocalDirtyController: function (controller) {
      if (!controller || localDirtyController === controller) localDirtyController = null;
    },
    hasLocalUnsaved: hasLocalUnsaved,
    guardNavigation: guardNavigation,
    confirmPublish: confirmPublish,
    openDiscardDialog: function () {
      openDialog("discard");
    },
    openUnpublishDialog: function () {
      openDialog("unpublish");
    },
  };

  if (window.BbWebsiteUnsavedGuard) {
    var legacy = window.BbWebsiteUnsavedGuard;
    window.BbWebsiteUnsavedGuard.setActiveController = function (c) {
      localDirtyController = c || null;
      if (legacy.setActiveController) legacy.setActiveController(c);
    };
    window.BbWebsiteUnsavedGuard.guardNavigation = guardNavigation;
    window.BbWebsiteUnsavedGuard.hasActiveUnsaved = hasLocalUnsaved;
  }
})();
