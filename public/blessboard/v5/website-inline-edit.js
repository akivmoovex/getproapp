/**
 * Phase 7 Stage 4 — inline text field editor (no framework).
 * Requires editing toolbar with data-bb-save-url + data-bb-csrf.
 * Optional data-bb-publish-url enables Save and Publish.
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

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function nl2brEscaped(value) {
    return escapeHtml(value).replace(/\r\n|\r|\n/g, "<br />");
  }

  function updateProposedPreview(root) {
    var input = qs(root, "[data-bb-inline-input='1']");
    var proposed = qs(root, "[data-bb-inline-proposed-text='1']");
    if (!input || !proposed) return;
    var published = root.getAttribute("data-bb-published-value") || "";
    var next = String(input.value);
    if (next === published) {
      proposed.textContent = "No change";
      proposed.classList.add("bb-tp-inline-edit__compare-body--unchanged");
      return;
    }
    proposed.classList.remove("bb-tp-inline-edit__compare-body--unchanged");
    proposed.innerHTML = nl2brEscaped(next);
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
    updateProposedPreview(root);
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
    updateProposedPreview(root);
    editor.hidden = true;
    display.hidden = false;
    setStatus(root, "", "");
    var pencil = qs(root, "[data-bb-inline-start='1']");
    if (pencil) pencil.focus();
    if (window.BbWebsiteUnsavedGuard) {
      window.BbWebsiteUnsavedGuard.clearActiveController();
    }
  }

  function applySaved(root, value, opts) {
    var options = opts || {};
    var display = qs(root, "[data-bb-inline-display='1']");
    var input = qs(root, "[data-bb-inline-input='1']");
    if (input) input.value = value;
    if (display) {
      var textHost = display.querySelector("h1, h2, h3, p, span, a");
      if (textHost) textHost.textContent = value;
    }
    root.setAttribute("data-bb-value", value);
    if (options.published) {
      root.setAttribute("data-bb-published-value", value);
      var publishedText = qs(root, "[data-bb-inline-published-text='1']");
      if (publishedText) {
        if (String(value || "").trim()) {
          publishedText.classList.remove("bb-tp-inline-edit__compare-body--empty");
          publishedText.innerHTML = nl2brEscaped(value);
        } else {
          publishedText.classList.add("bb-tp-inline-edit__compare-body--empty");
          publishedText.textContent = "No published text";
        }
      }
    }
    exitEdit(root, null);
    var okMessage = options.published
      ? "Changes published successfully."
      : "Changes saved as a draft";
    setStatus(root, okMessage, "ok");
    var status = qs(root, "[data-bb-inline-status='1']");
    if (status) {
      status.hidden = false;
      window.setTimeout(function () {
        if (status.textContent === okMessage) status.textContent = "";
      }, 2200);
    }
    var displayEl = qs(root, "[data-bb-inline-display='1']");
    var editorEl = qs(root, "[data-bb-inline-editor='1']");
    if (displayEl) displayEl.hidden = false;
    if (editorEl) editorEl.hidden = true;
  }

  function setButtonsDisabled(root, disabled) {
    var checkBtn = qs(root, "[data-bb-inline-save='1']");
    var publishBtn = qs(root, "[data-bb-inline-save-publish='1']");
    var cancelBtn = qs(root, "[data-bb-inline-cancel='1']");
    if (checkBtn) checkBtn.disabled = disabled;
    if (publishBtn) publishBtn.disabled = disabled;
    if (cancelBtn) cancelBtn.disabled = disabled;
  }

  function postField(url, root, csrf, value) {
    return fetch(url, {
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
    }).then(parseSaveResponse);
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
    setButtonsDisabled(root, true);
    saveInFlight = root;

    var request = postField(saveUrl, root, csrf, value)
      .then(function (result) {
        saveInFlight = null;
        setButtonsDisabled(root, false);
        if (!result.okHttp || !result.data.ok) {
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
        setButtonsDisabled(root, false);
        setStatus(root, "Could not save this change. Please try again.", "error");
        input.focus();
        return false;
      });

    return options.fromGuard ? request : undefined;
  }

  function saveAndPublishField(root) {
    var bar = toolbar();
    if (!bar) return;
    var publishUrl = bar.getAttribute("data-bb-publish-url") || "";
    var csrf = bar.getAttribute("data-bb-csrf") || "";
    var input = qs(root, "[data-bb-inline-input='1']");
    if (!publishUrl || !input) {
      setStatus(
        root,
        "We could not publish these changes. Please try again.",
        "error"
      );
      return;
    }
    if (saveInFlight === root) return;

    var value = input.value;
    setStatus(root, "Saving and publishing…", "pending");
    setButtonsDisabled(root, true);
    saveInFlight = root;

    postField(publishUrl, root, csrf, value)
      .then(function (result) {
        saveInFlight = null;
        setButtonsDisabled(root, false);
        if (!result.okHttp || !result.data.ok) {
          setStatus(
            root,
            errorMessageFromResult(result) ||
              "We could not publish these changes. Please try again.",
            "error"
          );
          input.focus();
          return;
        }
        applySaved(root, result.data.value != null ? String(result.data.value) : value, {
          published: true,
        });
      })
      .catch(function () {
        saveInFlight = null;
        setButtonsDisabled(root, false);
        setStatus(
          root,
          "We could not publish these changes. Please try again.",
          "error"
        );
        input.focus();
      });
  }

  function onClick(event) {
    var start = event.target.closest("[data-bb-inline-start='1']");
    if (start) {
      event.preventDefault();
      var root = start.closest("[data-bb-inline-edit='1']");
      if (root) enterEdit(root);
      return;
    }
    var savePublish = event.target.closest("[data-bb-inline-save-publish='1']");
    if (savePublish) {
      event.preventDefault();
      var publishRoot = savePublish.closest("[data-bb-inline-edit='1']");
      if (publishRoot) saveAndPublishField(publishRoot);
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

  function onInput(event) {
    var root = event.target.closest("[data-bb-inline-edit='1']");
    if (!root) return;
    if (!event.target.matches("[data-bb-inline-input='1']")) return;
    updateProposedPreview(root);
  }

  document.addEventListener("click", onClick);
  document.addEventListener("keydown", onKeydown);
  document.addEventListener("input", onInput);
})();
