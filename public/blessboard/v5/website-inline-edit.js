/**
 * Phase 7 Stage 4 — inline text field editor (no framework).
 * Requires editing toolbar with data-bb-save-url + data-bb-csrf.
 */
(function () {
  "use strict";

  var saveInFlight = null;

  function qs(root, sel) {
    return root.querySelector(sel);
  }

  function toolbar() {
    return document.querySelector("[data-bb-edit-toolbar='1']");
  }

  function setStatus(root, message, kind) {
    var el = qs(root, "[data-bb-inline-status='1']");
    if (!el) return;
    el.hidden = false;
    el.textContent = message || "";
    el.setAttribute("data-bb-status-kind", kind || "");
  }

  function parseSaveResponse(res) {
    var contentType = String(res.headers.get("content-type") || "").toLowerCase();
    if (contentType.indexOf("application/json") === -1) {
      var authFailure = res.status === 401 || res.status === 403 || res.redirected;
      return res.text().then(function (text) {
        var looksLikeLogin =
          /sign[\s-]?in|log[\s-]?in|session/i.test(text || "") ||
          (typeof res.url === "string" && /\/login/i.test(res.url));
        return {
          okHttp: false,
          status: res.status,
          data: {
            ok: false,
            code: authFailure || looksLikeLogin ? "not_authenticated" : "save_failed",
            error:
              authFailure || looksLikeLogin
                ? "Your session expired. Sign in again, then retry."
                : "Could not save this change. Please try again.",
          },
        };
      });
    }
    return res.json().then(
      function (data) {
        return { okHttp: res.ok, status: res.status, data: data || {} };
      },
      function () {
        return {
          okHttp: false,
          status: res.status,
          data: {
            ok: false,
            code: "save_failed",
            error: "Could not save this change. Please try again.",
          },
        };
      }
    );
  }

  function errorMessageFromResult(result) {
    var data = (result && result.data) || {};
    return (
      data.message ||
      data.error ||
      "Could not save this change. Please try again."
    );
  }

  function enterEdit(root) {
    var display = qs(root, "[data-bb-inline-display='1']");
    var editor = qs(root, "[data-bb-inline-editor='1']");
    var input = qs(root, "[data-bb-inline-input='1']");
    if (!display || !editor || !input) return;
    display.hidden = true;
    editor.hidden = false;
    setStatus(root, "", "");
    input.focus();
    if (typeof input.select === "function") input.select();
    try {
      root.scrollIntoView({ block: "center", behavior: "smooth" });
    } catch (e) {
      /* ignore */
    }
    if (window.BbWebsiteUnsavedGuard) {
      window.BbWebsiteUnsavedGuard.setActiveController({
        isDirty: function () {
          var ed = qs(root, "[data-bb-inline-editor='1']");
          if (!ed || ed.hidden) return false;
          var cur = qs(root, "[data-bb-inline-input='1']");
          if (!cur) return false;
          return String(cur.value) !== String(root.getAttribute("data-bb-value") || "");
        },
        discard: function () {
          exitEdit(root, root.getAttribute("data-bb-value") || "");
        },
        save: function () {
          return saveField(root, { fromGuard: true });
        },
      });
    }
  }

  function exitEdit(root, restoreValue) {
    var display = qs(root, "[data-bb-inline-display='1']");
    var editor = qs(root, "[data-bb-inline-editor='1']");
    var input = qs(root, "[data-bb-inline-input='1']");
    if (!display || !editor || !input) return;
    if (restoreValue != null) {
      input.value = restoreValue;
      var textHost = display.querySelector("h1, h2, h3, p, span, a");
      if (textHost) textHost.textContent = restoreValue;
      root.setAttribute("data-bb-value", restoreValue);
    }
    editor.hidden = true;
    display.hidden = false;
    setStatus(root, "", "");
    var pencil = qs(root, "[data-bb-inline-start='1']");
    if (pencil) pencil.focus();
    if (window.BbWebsiteUnsavedGuard) {
      window.BbWebsiteUnsavedGuard.clearActiveController();
    }
  }

  function applySaved(root, value) {
    var display = qs(root, "[data-bb-inline-display='1']");
    var input = qs(root, "[data-bb-inline-input='1']");
    if (input) input.value = value;
    if (display) {
      var textHost = display.querySelector("h1, h2, h3, p, span, a");
      if (textHost) textHost.textContent = value;
    }
    root.setAttribute("data-bb-value", value);
    exitEdit(root, null);
    setStatus(root, "Changes saved as a draft", "ok");
    var status = qs(root, "[data-bb-inline-status='1']");
    if (status) {
      status.hidden = false;
      window.setTimeout(function () {
        if (status.textContent === "Changes saved as a draft") status.textContent = "";
      }, 1800);
    }
    var displayEl = qs(root, "[data-bb-inline-display='1']");
    var editorEl = qs(root, "[data-bb-inline-editor='1']");
    if (displayEl) displayEl.hidden = false;
    if (editorEl) editorEl.hidden = true;
  }

  function saveField(root, opts) {
    var options = opts || {};
    var bar = toolbar();
    if (!bar) {
      return options.fromGuard ? Promise.resolve(false) : undefined;
    }
    var saveUrl = bar.getAttribute("data-bb-save-url") || "";
    var csrf = bar.getAttribute("data-bb-csrf") || "";
    var input = qs(root, "[data-bb-inline-input='1']");
    if (!saveUrl || !input) {
      return options.fromGuard ? Promise.resolve(false) : undefined;
    }
    if (saveInFlight === root) {
      return options.fromGuard ? Promise.resolve(false) : undefined;
    }

    var value = input.value;
    setStatus(root, "Saving…", "pending");
    var checkBtn = qs(root, "[data-bb-inline-save='1']");
    var cancelBtn = qs(root, "[data-bb-inline-cancel='1']");
    if (checkBtn) checkBtn.disabled = true;
    if (cancelBtn) cancelBtn.disabled = true;
    saveInFlight = root;

    var request = fetch(saveUrl, {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-CSRF-Token": csrf,
      },
      body: JSON.stringify({
        _csrf: csrf,
        pageKey: root.getAttribute("data-bb-page"),
        sectionKey: root.getAttribute("data-bb-section"),
        fieldKey: root.getAttribute("data-bb-field"),
        value: value,
      }),
    })
      .then(parseSaveResponse)
      .then(function (result) {
        saveInFlight = null;
        if (checkBtn) checkBtn.disabled = false;
        if (cancelBtn) cancelBtn.disabled = false;
        if (!result.okHttp || !result.data.ok) {
          // Keep editor open and preserve the user's unsaved text for retry.
          setStatus(root, errorMessageFromResult(result), "error");
          input.focus();
          return false;
        }
        if (result.data.published) {
          setStatus(root, "Unexpected publish response blocked.", "error");
          input.focus();
          return false;
        }
        applySaved(root, result.data.value != null ? String(result.data.value) : value);
        return true;
      })
      .catch(function () {
        saveInFlight = null;
        if (checkBtn) checkBtn.disabled = false;
        if (cancelBtn) cancelBtn.disabled = false;
        setStatus(root, "Could not save this change. Please try again.", "error");
        input.focus();
        return false;
      });

    return options.fromGuard ? request : undefined;
  }

  function onClick(event) {
    var start = event.target.closest("[data-bb-inline-start='1']");
    if (start) {
      event.preventDefault();
      var root = start.closest("[data-bb-inline-edit='1']");
      if (root) enterEdit(root);
      return;
    }
    var save = event.target.closest("[data-bb-inline-save='1']");
    if (save) {
      event.preventDefault();
      var saveRoot = save.closest("[data-bb-inline-edit='1']");
      if (saveRoot) saveField(saveRoot);
      return;
    }
    var cancel = event.target.closest("[data-bb-inline-cancel='1']");
    if (cancel) {
      event.preventDefault();
      var cancelRoot = cancel.closest("[data-bb-inline-edit='1']");
      if (cancelRoot) {
        var prior = cancelRoot.getAttribute("data-bb-value") || "";
        exitEdit(cancelRoot, prior);
      }
    }
  }

  function onKeydown(event) {
    var root = event.target.closest("[data-bb-inline-edit='1']");
    if (!root) return;
    var editor = qs(root, "[data-bb-inline-editor='1']");
    if (!editor || editor.hidden) return;
    if (event.key === "Escape") {
      event.preventDefault();
      exitEdit(root, root.getAttribute("data-bb-value") || "");
      return;
    }
    if (event.key === "Enter" && root.getAttribute("data-bb-multiline") !== "1") {
      event.preventDefault();
      saveField(root);
    }
  }

  document.addEventListener("click", onClick);
  document.addEventListener("keydown", onKeydown);
})();
