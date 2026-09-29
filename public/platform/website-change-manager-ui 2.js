/**
 * V2.01 Change Manager — toolbar save status + friendly publishing reminder.
 * Pending count = distinct unpublished fields (server-provided). Preview never publishes.
 */
(function () {
  "use strict";

  var THRESHOLD_DEFAULT = 5;

  function $(sel, root) {
    return (root || document).querySelector(sel);
  }

  function storageGet(key) {
    try {
      return window.localStorage.getItem(key);
    } catch (_e) {
      return null;
    }
  }

  function storageSet(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch (_e) {}
  }

  function storageRemove(key) {
    try {
      window.localStorage.removeItem(key);
    } catch (_e) {}
  }

  function pendingPillLabel(n) {
    var count = Number(n) || 0;
    if (count === 1) return "1 unpublished change";
    return count + " unpublished changes";
  }

  function publishLabel(n, canPublish) {
    if (!canPublish) return null;
    var count = Number(n) || 0;
    return count > 0 ? "Publish (" + count + ")" : "Publish";
  }

  function setSaveStatus(status, labelOverride) {
    var row = $("[data-website-save-status]");
    var labelEl = $("[data-website-save-status-label]");
    var iconEl = $("[data-website-save-icon]");
    var live = $("[data-website-engine-save-state]");
    var labels = {
      idle: "",
      saving: "Saving…",
      uploading: "Uploading…",
      saved: "Drafts saved",
      failed: "Save failed",
    };
    var statusKey = String(status || "idle");
    // Never show "Drafts saved" while saving/uploading/failed.
    if (statusKey === "saved" && (window.__gpCmBusy === true)) {
      statusKey = "saving";
    }
    var text =
      labelOverride != null ? String(labelOverride) : labels[statusKey] != null ? labels[statusKey] : "";
    if (row) {
      row.setAttribute("data-save-status", statusKey);
      row.classList.toggle("is-saving", statusKey === "saving" || statusKey === "uploading");
      row.classList.toggle("is-saved", statusKey === "saved");
      row.classList.toggle("is-failed", statusKey === "failed");
      row.hidden = !text;
    }
    if (labelEl) labelEl.textContent = text;
    if (iconEl) {
      iconEl.textContent =
        statusKey === "failed"
          ? "error"
          : statusKey === "saving" || statusKey === "uploading"
            ? "sync"
            : "check_circle";
    }
    if (live) live.textContent = text;
  }

  function updatePendingCount(count) {
    var n = Math.max(0, Math.floor(Number(count) || 0));
    var toolbar = $("[data-website-engine-toolbar]");
    var editor = $("[data-gp-website-editor]");
    var pill = $("[data-website-pending-pill]");
    var pillLabel = $("[data-website-pending-pill-label]");
    var publishBtn = $("[data-website-publish-label]");
    var draft = $("[data-website-engine-draft]");
    var draftShort = $("[data-website-engine-draft-short]");
    var reminder = $("[data-website-publishing-reminder]");
    var badge = $("[data-website-reminder-pending-badge]");
    var canPublish =
      (toolbar && toolbar.getAttribute("data-website-can-publish") === "1") ||
      (editor && editor.getAttribute("data-website-can-publish") === "1");

    if (toolbar) toolbar.setAttribute("data-website-pending-count", String(n));
    if (editor) {
      editor.setAttribute("data-website-pending-count", String(n));
      editor.setAttribute("data-draft", n > 0 ? "1" : "0");
    }
    if (reminder) reminder.setAttribute("data-website-pending-count", String(n));
    if (pill) {
      pill.setAttribute("data-website-pending-count", String(n));
      pill.hidden = n < 1;
      pill.classList.toggle("is-empty", n < 1);
    }
    if (pillLabel) pillLabel.textContent = pendingPillLabel(n);
    if (publishBtn) {
      var next = publishLabel(n, canPublish || Boolean(publishBtn.closest("form")));
      if (next) publishBtn.textContent = next;
    }
    if (draft) {
      draft.innerHTML =
        '<span class="gp-website-editor__draft-dot" aria-hidden="true"></span>Draft • ' +
        n +
        " unpublished changes";
    }
    if (draftShort) draftShort.textContent = "Draft • " + n + " changes";
    if (badge) badge.textContent = n + " pending edits";

    var body = $("[data-website-reminder-body]");
    if (body) {
      body.textContent =
        "You have " +
        n +
        " saved change" +
        (n === 1 ? "" : "s") +
        " waiting to go live. Your visitors are still seeing the previous version. Would you like to preview your updates?";
    }
    return n;
  }

  function reminderEls() {
    return $("[data-website-publishing-reminder]");
  }

  function isBusy() {
    return window.__gpCmBusy === true;
  }

  function dismissedToday(root) {
    var key = root && root.getAttribute("data-website-reminder-dismiss-key");
    return Boolean(key && storageGet(key) === "1");
  }

  function suppressedCount(root) {
    var key = root && root.getAttribute("data-website-reminder-suppress-key");
    if (!key) return null;
    var raw = storageGet(key);
    if (raw == null || raw === "") return null;
    var n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }

  function openReminder(force) {
    var root = reminderEls();
    if (!root) return false;
    var threshold = Number(root.getAttribute("data-website-reminder-threshold")) || THRESHOLD_DEFAULT;
    var count = Number(root.getAttribute("data-website-pending-count")) || 0;
    if (!force) {
      if (isBusy()) return false;
      if (count < threshold) return false;
      if (dismissedToday(root)) return false;
      var suppressed = suppressedCount(root);
      if (suppressed != null && suppressed === count) return false;
    }
    root.hidden = false;
    document.documentElement.classList.add("gp-cm-reminder-open");
    return true;
  }

  function closeReminder(opts) {
    var root = reminderEls();
    if (!root) return;
    var count = Number(root.getAttribute("data-website-pending-count")) || 0;
    var dont = $("[data-website-reminder-dont-today]", root);
    if (opts && opts.dismissToday && dont && dont.checked) {
      var dayKey = root.getAttribute("data-website-reminder-dismiss-key");
      if (dayKey) storageSet(dayKey, "1");
    }
    if (opts && opts.suppress) {
      var suppressKey = root.getAttribute("data-website-reminder-suppress-key");
      if (suppressKey) storageSet(suppressKey, String(count));
    }
    root.hidden = true;
    document.documentElement.classList.remove("gp-cm-reminder-open");
  }

  function showNavReminder() {
    var bar = $("[data-website-nav-reminder]");
    var root = reminderEls();
    if (!bar || !root) return;
    if (isBusy()) return;
    var threshold = Number(root.getAttribute("data-website-reminder-threshold")) || THRESHOLD_DEFAULT;
    var count = Number(root.getAttribute("data-website-pending-count")) || 0;
    if (count < threshold) return;
    if (dismissedToday(root)) return;
    var label = $("[data-website-nav-reminder-label]", bar);
    if (label) {
      label.textContent =
        count +
        " unpublished changes — preview when you are ready. Publishing is never automatic.";
    }
    bar.hidden = false;
  }

  function hideNavReminder() {
    var bar = $("[data-website-nav-reminder]");
    if (bar) bar.hidden = true;
  }

  function onMeaningfulSave(detail) {
    var count =
      detail && detail.pendingChangeCount != null
        ? Number(detail.pendingChangeCount)
        : Number(($("[data-gp-website-editor]") || {}).getAttribute &&
            $("[data-gp-website-editor]").getAttribute("data-website-pending-count")) || 0;
    if (detail && detail.pendingChangeCount != null) {
      count = updatePendingCount(detail.pendingChangeCount);
    }
    setSaveStatus("saved");
    window.__gpCmBusy = false;
    var threshold =
      Number(($("[data-website-engine-toolbar]") || document.body).getAttribute &&
        ($("[data-website-engine-toolbar]") || document.body).getAttribute(
          "data-website-reminder-threshold"
        )) || THRESHOLD_DEFAULT;
    if (count >= threshold) {
      openReminder(false);
    }
  }

  function bindReminder() {
    var root = reminderEls();
    if (!root || root.getAttribute("data-bound") === "1") return;
    root.setAttribute("data-bound", "1");
    var keep = $("[data-website-reminder-keep]", root);
    var dismiss = $("[data-website-reminder-dismiss]", root);
    var backdrop = $("[data-website-reminder-backdrop]", root);
    var preview = $("[data-website-reminder-preview]", root);
    function dismissSoft() {
      closeReminder({ suppress: true, dismissToday: true });
    }
    if (keep) keep.addEventListener("click", dismissSoft);
    if (dismiss) dismiss.addEventListener("click", dismissSoft);
    if (backdrop) backdrop.addEventListener("click", dismissSoft);
    if (preview) {
      preview.addEventListener("click", function () {
        // Preview only — never submit publish.
        closeReminder({ suppress: true, dismissToday: true });
      });
    }
  }

  function bindNavReminder() {
    var dismiss = $("[data-website-nav-reminder-dismiss]");
    if (dismiss) {
      dismiss.addEventListener("click", hideNavReminder);
    }
    document.addEventListener(
      "click",
      function (ev) {
        var link = ev.target && ev.target.closest
          ? ev.target.closest("[data-website-page-key], .gp-website-editor__rail-link, .gp-website-editor__sheet-link, .gp-website-editor__mobile-item")
          : null;
        if (!link) return;
        // Compact reminder on page navigation — never interrupt saves.
        window.setTimeout(showNavReminder, 0);
      },
      true
    );
  }

  function panelRoot() {
    return $("[data-website-unpublished-panel]");
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderMediaPair(item) {
    var liveSrc = item.live && item.live.src ? item.live.src : "";
    var draftSrc = item.draft && item.draft.src ? item.draft.src : "";
    return (
      '<div class="gp-cm-panel__media-diff">' +
      '<div class="gp-cm-panel__thumb">' +
      (liveSrc
        ? '<img src="' + escapeHtml(liveSrc) + '" alt="' + escapeHtml((item.live && item.live.alt) || "Live") + '"/>'
        : '<span class="gp-cm-panel__thumb-empty">No image</span>') +
      '<span class="gp-cm-panel__thumb-tag">Live</span></div>' +
      '<span class="material-symbols-outlined" aria-hidden="true">arrow_forward</span>' +
      '<div class="gp-cm-panel__thumb gp-cm-panel__thumb--new">' +
      (draftSrc
        ? '<img src="' + escapeHtml(draftSrc) + '" alt="' + escapeHtml((item.draft && item.draft.alt) || "Draft") + '"/>'
        : '<span class="gp-cm-panel__thumb-empty">No image</span>') +
      '<span class="gp-cm-panel__thumb-tag gp-cm-panel__thumb-tag--new">New</span></div></div>'
    );
  }

  function renderTextDiff(item) {
    return (
      '<div class="gp-cm-panel__diff">' +
      '<div class="gp-cm-panel__diff-row"><span class="gp-cm-panel__live-tag">Live</span>' +
      '<p class="gp-cm-panel__live-text">' +
      escapeHtml(item.liveText || "(empty)") +
      "</p></div>" +
      '<div class="gp-cm-panel__diff-row"><span class="gp-cm-panel__draft-tag">Draft</span>' +
      '<p class="gp-cm-panel__draft-text">' +
      escapeHtml(item.draftText || "(empty)") +
      "</p></div></div>"
    );
  }

  function renderPanel(panel) {
    var root = panelRoot();
    if (!root || !panel) return;
    var title = $("[data-website-panel-title]", root);
    var groupsEl = $("[data-website-panel-groups]", root);
    var emptyEl = $("[data-website-panel-empty]", root);
    var loading = $("[data-website-panel-loading]", root);
    var publishBtn = $("[data-website-panel-publish]", root);
    var preview = $("[data-website-panel-preview]", root);
    var footer = $("[data-website-panel-footer]", root);
    var statusEl = $("[data-website-panel-status]", root);
    var statusReady = $("[data-website-panel-status-ready]", root);
    var statusPending = $("[data-website-panel-status-pending]", root);
    if (loading) loading.hidden = true;
    if (title) title.textContent = panel.title || "Unpublished Changes";
    if (preview) {
      if (panel.previewHref) {
        preview.href = panel.previewHref;
        preview.hidden = false;
      } else {
        preview.hidden = true;
      }
    }
    if (publishBtn) {
      publishBtn.textContent = panel.publishLabel || "Publish All Changes";
      publishBtn.disabled = !panel.showPublish;
      var form = publishBtn.closest("form");
      if (form && panel.publishPath) form.setAttribute("action", panel.publishPath);
      if (form) form.hidden = !panel.showPublish;
    }
    if (footer) footer.hidden = panel.empty && !panel.showPreview;
    if (statusEl) {
      statusEl.hidden = Boolean(panel.empty);
      if (!panel.empty) {
        if (statusReady && panel.statusReadyLabel) statusReady.textContent = panel.statusReadyLabel;
        if (statusPending && panel.statusPendingLabel) statusPending.textContent = panel.statusPendingLabel;
      }
    }
    if (emptyEl) {
      emptyEl.hidden = !panel.empty;
      if (panel.empty) {
        var emptyTitle = emptyEl.querySelector("h2");
        var emptyBody = emptyEl.querySelector("p");
        if (emptyTitle && panel.emptyTitle) emptyTitle.textContent = panel.emptyTitle;
        if (emptyBody && panel.emptyBody) emptyBody.textContent = panel.emptyBody;
      }
    }
    if (!groupsEl) return;
    if (panel.empty) {
      groupsEl.innerHTML = "";
      return;
    }
    var html = "";
    (panel.groups || []).forEach(function (group) {
      html +=
        '<section class="gp-cm-panel__group" data-website-panel-page="' +
        escapeHtml(group.pageKey) +
        '">' +
        '<div class="gp-cm-panel__group-head">' +
        '<div class="gp-cm-panel__group-title"><span class="material-symbols-outlined" aria-hidden="true">' +
        escapeHtml(group.pageIcon || "description") +
        "</span><h2>" +
        escapeHtml(group.pageLabel) +
        '</h2></div><span class="gp-cm-panel__group-count">' +
        escapeHtml(group.changeCountLabel) +
        "</span></div><div class=\"gp-cm-panel__items\">";
      (group.items || []).forEach(function (item) {
        html +=
          '<article class="gp-cm-panel__item" data-website-panel-item="1" data-website-content-key="' +
          escapeHtml(item.contentKey) +
          '" data-website-page-key="' +
          escapeHtml(item.pageKey) +
          '">' +
          '<div class="gp-cm-panel__item-top">' +
          "<div><div class=\"gp-cm-panel__item-meta\">" +
          '<span class="gp-cm-panel__type">' +
          escapeHtml(item.typeLabel) +
          "</span>" +
          '<span class="gp-cm-panel__saved"><span class="material-symbols-outlined" aria-hidden="true">schedule</span> ' +
          escapeHtml(item.saveStatusLabel) +
          "</span></div>" +
          "<h3>" +
          escapeHtml(item.fieldLabel) +
          "</h3></div>";
        if (panel.showRevert && item.canRevert) {
          html +=
            '<button type="button" class="gp-cm-panel__revert" data-website-panel-revert="1" data-website-content-key="' +
            escapeHtml(item.contentKey) +
            '" title="Revert this field to live"><span class="material-symbols-outlined" aria-hidden="true">undo</span> Revert</button>';
        }
        html += "</div>";
        html += item.isMedia ? renderMediaPair(item) : renderTextDiff(item);
        html +=
          '<div class="gp-cm-panel__item-actions">' +
          '<button type="button" class="gp-cm-panel__context" data-website-panel-open-field="1" data-website-content-key="' +
          escapeHtml(item.contentKey) +
          '" data-website-edit-href="' +
          escapeHtml(item.editHref || "") +
          '"><span class="material-symbols-outlined" aria-hidden="true">compare</span> Preview Full Context</button></div></article>';
      });
      html += "</div></section>";
    });
    groupsEl.innerHTML = html;
  }

  function closePanel() {
    var root = panelRoot();
    if (!root) return;
    root.hidden = true;
    document.documentElement.classList.remove("gp-cm-panel-open");
  }

  function openFieldEditor(contentKey, editHref) {
    closePanel();
    var field = document.querySelector('[data-website-key="' + contentKey + '"]');
    if (field) {
      var start = field.querySelector("[data-website-start]");
      if (start) {
        start.click();
        return;
      }
      field.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    if (editHref) {
      var url = editHref;
      try {
        var u = new URL(editHref, window.location.origin);
        u.searchParams.set("website_edit", "1");
        u.hash = "field-" + encodeURIComponent(contentKey);
        url = u.pathname + u.search + u.hash;
      } catch (_e) {}
      window.location.href = url;
    }
  }

  function revertField(contentKey) {
    var root = panelRoot();
    if (!root || !contentKey) return;
    if (root.getAttribute("data-website-can-revert") !== "1") return;
    var discardUrl = root.getAttribute("data-website-discard-url");
    if (!discardUrl) return;
    var field = root.getAttribute("data-website-csrf-field") || "_csrf";
    var token = root.getAttribute("data-website-csrf-token") || "";
    var body = {};
    body[field] = token;
    body.contentKey = contentKey;
    fetch(discardUrl, {
      method: "POST",
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-CSRF-Token": token,
      },
      body: JSON.stringify(body),
    })
      .then(function (r) {
        return r.json().catch(function () {
          return { ok: false };
        });
      })
      .then(function (out) {
        if (out && out.ok) {
          if (out.pendingChangeCount != null) updatePendingCount(out.pendingChangeCount);
          openPanel(true);
          document.dispatchEvent(
            new CustomEvent("gp:website-pending-count", {
              detail: { pendingChangeCount: out.pendingChangeCount },
            })
          );
        } else {
          setSaveStatus("failed", (out && out.code) || "Revert failed");
        }
      })
      .catch(function () {
        setSaveStatus("failed", "Revert failed");
      });
  }

  function openPanel(forceReload) {
    var root = panelRoot();
    if (!root) return false;
    var url = root.getAttribute("data-website-changes-url");
    root.hidden = false;
    document.documentElement.classList.add("gp-cm-panel-open");
    var loading = $("[data-website-panel-loading]", root);
    if (loading) loading.hidden = false;
    if (!url) {
      if (loading) loading.hidden = true;
      renderPanel({
        empty: true,
        title: "Unpublished Changes",
        groups: [],
        showPreview: false,
        showPublish: false,
      });
      return true;
    }
    fetch(url, { credentials: "same-origin", headers: { Accept: "application/json" } })
      .then(function (r) {
        return r.json().catch(function () {
          return { ok: false };
        });
      })
      .then(function (out) {
        if (loading) loading.hidden = true;
        if (out && out.ok && out.panel) {
          updatePendingCount(out.pendingChangeCount);
          renderPanel(out.panel);
        } else {
          renderPanel({
            empty: true,
            title: "Unpublished Changes",
            groups: [],
            showPreview: Boolean(root.getAttribute("data-website-preview-href")),
            showPublish: false,
            previewHref: root.getAttribute("data-website-preview-href"),
          });
        }
      })
      .catch(function () {
        if (loading) loading.hidden = true;
      });
    return true;
  }

  function bindPanel() {
    var root = panelRoot();
    if (!root || root.getAttribute("data-bound") === "1") return;
    root.setAttribute("data-bound", "1");
    var closeBtn = $("[data-website-panel-close]", root);
    var backdrop = $("[data-website-panel-backdrop]", root);
    if (closeBtn) closeBtn.addEventListener("click", closePanel);
    if (backdrop) backdrop.addEventListener("click", closePanel);
    root.addEventListener("click", function (ev) {
      var revert = ev.target.closest && ev.target.closest("[data-website-panel-revert]");
      if (revert) {
        ev.preventDefault();
        revertField(revert.getAttribute("data-website-content-key"));
        return;
      }
      var openField = ev.target.closest && ev.target.closest("[data-website-panel-open-field]");
      if (openField) {
        ev.preventDefault();
        openFieldEditor(
          openField.getAttribute("data-website-content-key"),
          openField.getAttribute("data-website-edit-href")
        );
      }
    });
    var pill = $("[data-website-pending-pill]");
    if (pill) {
      pill.addEventListener("click", function (ev) {
        ev.preventDefault();
        openPanel(true);
      });
      pill.setAttribute("type", "button");
      pill.setAttribute("aria-haspopup", "dialog");
    }
  }

  function bindEvents() {
    document.addEventListener("gp:website-save-start", function () {
      window.__gpCmBusy = true;
      setSaveStatus("saving");
      closeReminder({ suppress: false });
      hideNavReminder();
    });
    document.addEventListener("gp:website-upload-start", function () {
      window.__gpCmBusy = true;
      setSaveStatus("uploading");
      closeReminder({ suppress: false });
      hideNavReminder();
    });
    document.addEventListener("gp:website-save-success", function (ev) {
      onMeaningfulSave((ev && ev.detail) || {});
    });
    document.addEventListener("gp:website-save-error", function (ev) {
      window.__gpCmBusy = false;
      var reason = ev && ev.detail && ev.detail.reason ? String(ev.detail.reason) : "Save failed";
      setSaveStatus("failed", reason.slice(0, 80));
    });
    document.addEventListener("gp:website-pending-count", function (ev) {
      var n = ev && ev.detail && ev.detail.pendingChangeCount;
      if (n != null) updatePendingCount(n);
    });
  }

  var historyState = { contentKey: null, selectedId: null, panel: null };

  function historyRoot() {
    return $("[data-website-field-history]");
  }

  function closeFieldHistory() {
    var root = historyRoot();
    if (!root) return;
    root.hidden = true;
    document.documentElement.classList.remove("gp-cm-history-open");
    historyState = { contentKey: null, selectedId: null, panel: null };
  }

  function renderHistoryChoices(panel) {
    var root = historyRoot();
    if (!root || !panel) return;
    var choicesEl = $("[data-website-history-choices]", root);
    var emptyEl = $("[data-website-history-empty]", root);
    var compare = $("[data-website-history-compare]", root);
    var title = $("[data-website-history-title]", root);
    var confirm = $("[data-website-history-confirm]", root);
    var loading = $("[data-website-history-loading]", root);
    if (loading) loading.hidden = true;
    if (title) {
      title.textContent =
        panel.title ||
        (panel.fieldLabel ? "Field History: " + panel.fieldLabel : "Field History");
    }
    if (confirm) {
      confirm.disabled = true;
      confirm.textContent = panel.confirmLabel || "Restore This Version to Draft (Does Not Publish)";
    }
    if (compare) {
      if (panel.hasPendingChanges && panel.draftPreview && panel.publishedPreview) {
        compare.hidden = false;
        if (panel.draftPreview.isMedia || panel.publishedPreview.isMedia) {
          compare.innerHTML =
            '<div class="gp-cm-history__compare-label">' +
            escapeHtml(panel.compareLabel || "Draft vs Live") +
            '</div><div class="gp-cm-panel__media-diff">' +
            '<div class="gp-cm-panel__thumb">' +
            (panel.publishedPreview.src
              ? '<img src="' + escapeHtml(panel.publishedPreview.src) + '" alt="Live"/>'
              : '<span class="gp-cm-panel__thumb-empty">No image</span>') +
            '<span class="gp-cm-panel__thumb-tag">Live</span></div>' +
            '<span class="material-symbols-outlined" aria-hidden="true">arrow_forward</span>' +
            '<div class="gp-cm-panel__thumb gp-cm-panel__thumb--new">' +
            (panel.draftPreview.src
              ? '<img src="' + escapeHtml(panel.draftPreview.src) + '" alt="Draft"/>'
              : '<span class="gp-cm-panel__thumb-empty">No image</span>') +
            '<span class="gp-cm-panel__thumb-tag gp-cm-panel__thumb-tag--new">Draft</span></div></div>';
        } else {
          compare.innerHTML =
            '<div class="gp-cm-history__compare-label">' +
            escapeHtml(panel.compareLabel || "Draft vs Live") +
            '</div><div class="gp-cm-panel__diff">' +
            '<div class="gp-cm-panel__diff-row"><span class="gp-cm-panel__live-tag">Live</span><p class="gp-cm-panel__live-text">' +
            escapeHtml(panel.publishedPreview.text || "(empty)") +
            '</p></div><div class="gp-cm-panel__diff-row"><span class="gp-cm-panel__draft-tag">Draft</span><p class="gp-cm-panel__draft-text">' +
            escapeHtml(panel.draftPreview.text || "(empty)") +
            "</p></div></div>";
        }
      } else {
        compare.hidden = true;
        compare.innerHTML = "";
      }
    }
    if (emptyEl) {
      emptyEl.hidden = !panel.emptyHistory;
      emptyEl.textContent = panel.emptyHistoryMessage || "";
    }
    if (!choicesEl) return;
    var html = "";
    (panel.choices || []).forEach(function (choice) {
      var disabled = !choice.available || choice.restorable === false && choice.choice !== "current_draft";
      var selectable = choice.restorable === true;
      html +=
        '<button type="button" class="gp-cm-history__choice' +
        (choice.active ? " is-active" : "") +
        (selectable ? "" : " is-muted") +
        (!choice.available ? " is-unavailable" : "") +
        '" data-website-history-choice="' +
        escapeHtml(choice.id) +
        '" data-website-history-restorable="' +
        (selectable ? "1" : "0") +
        '"' +
        (selectable ? "" : " disabled") +
        ">" +
        '<div class="gp-cm-history__choice-copy"><strong>' +
        escapeHtml(choice.label) +
        "</strong><span>" +
        escapeHtml(choice.subtitle || "") +
        "</span><em>" +
        escapeHtml(choice.detail || choice.unavailableReason || "") +
        "</em>" +
        (choice.previewQuote
          ? '<blockquote class="gp-cm-history__choice-preview">' +
            escapeHtml(choice.previewQuote) +
            "</blockquote>"
          : "") +
        "</div></button>";
    });
    choicesEl.innerHTML = html;
  }

  function selectHistoryChoice(choiceId) {
    var root = historyRoot();
    if (!root || !historyState.panel) return;
    historyState.selectedId = choiceId;
    var confirm = $("[data-website-history-confirm]", root);
    var choice = (historyState.panel.choices || []).find(function (c) {
      return c.id === choiceId;
    });
    root.querySelectorAll("[data-website-history-choice]").forEach(function (btn) {
      btn.classList.toggle("is-selected", btn.getAttribute("data-website-history-choice") === choiceId);
    });
    if (confirm) confirm.disabled = !(choice && choice.restorable);
  }

  function confirmHistoryRestore() {
    var root = historyRoot();
    if (!root || !historyState.selectedId || !historyState.panel) return;
    if (root.getAttribute("data-website-can-edit") !== "1") return;
    var choice = (historyState.panel.choices || []).find(function (c) {
      return c.id === historyState.selectedId;
    });
    if (!choice || !choice.restorable) return;
    var url = root.getAttribute("data-website-field-restore-url");
    if (!url) return;
    var field = root.getAttribute("data-website-csrf-field") || "_csrf";
    var token = root.getAttribute("data-website-csrf-token") || "";
    var body = {};
    body[field] = token;
    body.contentKey = historyState.contentKey;
    body.choice = choice.choice;
    if (choice.versionId) body.versionId = choice.versionId;
    if (historyState.panel.expectedUpdatedAt) {
      body.expectedUpdatedAt = historyState.panel.expectedUpdatedAt;
    }
    fetch(url, {
      method: "POST",
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-CSRF-Token": token,
      },
      body: JSON.stringify(body),
    })
      .then(function (r) {
        return r.json().then(function (out) {
          out = out || {};
          out.httpStatus = r.status;
          return out;
        });
      })
      .then(function (out) {
        if (out && out.ok && out.published !== true) {
          if (out.pendingChangeCount != null) updatePendingCount(out.pendingChangeCount);
          var fieldEl = document.querySelector(
            '[data-website-key="' + historyState.contentKey + '"]'
          );
          if (fieldEl && out.content && out.content.updatedAt) {
            fieldEl.setAttribute("data-website-updated-at", String(out.content.updatedAt));
          }
          closeFieldHistory();
          setSaveStatus("saved");
          document.dispatchEvent(
            new CustomEvent("gp:website-pending-count", {
              detail: { pendingChangeCount: out.pendingChangeCount },
            })
          );
        } else if (out && out.code === "conflict") {
          setSaveStatus("failed", "Newer draft exists — reload history");
        } else {
          setSaveStatus(
            "failed",
            (out && (out.reason || out.code)) || "Restore failed"
          );
        }
      })
      .catch(function () {
        setSaveStatus("failed", "Restore failed");
      });
  }

  function openFieldHistory(contentKey) {
    var root = historyRoot();
    if (!root || !contentKey) return false;
    var base = root.getAttribute("data-website-field-history-url");
    if (!base) return false;
    historyState.contentKey = contentKey;
    historyState.selectedId = null;
    root.hidden = false;
    document.documentElement.classList.add("gp-cm-history-open");
    var loading = $("[data-website-history-loading]", root);
    if (loading) loading.hidden = false;
    var url = base + (base.indexOf("?") >= 0 ? "&" : "?") + "contentKey=" + encodeURIComponent(contentKey);
    fetch(url, { credentials: "same-origin", headers: { Accept: "application/json" } })
      .then(function (r) {
        return r.json().catch(function () {
          return { ok: false };
        });
      })
      .then(function (out) {
        if (loading) loading.hidden = true;
        if (out && out.ok && out.panel) {
          historyState.panel = out.panel;
          if (out.pendingChangeCount != null) updatePendingCount(out.pendingChangeCount);
          renderHistoryChoices(out.panel);
        } else {
          renderHistoryChoices({
            emptyHistory: true,
            emptyHistoryMessage: "Field history is unavailable for this field.",
            choices: [],
            contentKey: contentKey,
          });
        }
      })
      .catch(function () {
        if (loading) loading.hidden = true;
      });
    return true;
  }

  function bindFieldHistory() {
    var root = historyRoot();
    if (!root || root.getAttribute("data-bound") === "1") return;
    root.setAttribute("data-bound", "1");
    var closeBtn = $("[data-website-history-close]", root);
    var backdrop = $("[data-website-history-backdrop]", root);
    var confirm = $("[data-website-history-confirm]", root);
    if (closeBtn) closeBtn.addEventListener("click", closeFieldHistory);
    if (backdrop) backdrop.addEventListener("click", closeFieldHistory);
    if (confirm) confirm.addEventListener("click", confirmHistoryRestore);
    root.addEventListener("click", function (ev) {
      var btn = ev.target.closest && ev.target.closest("[data-website-history-choice]");
      if (!btn || btn.disabled) return;
      selectHistoryChoice(btn.getAttribute("data-website-history-choice"));
    });
    document.addEventListener("click", function (ev) {
      var open = ev.target.closest && ev.target.closest("[data-website-field-history-open]");
      if (!open) return;
      ev.preventDefault();
      ev.stopPropagation();
      var wrap = open.closest("[data-website-key]");
      var key = wrap && wrap.getAttribute("data-website-key");
      if (key) openFieldHistory(key);
    });
  }

  function init() {
    if (!$("[data-gp-website-editor]") && !$("[data-website-engine-toolbar]")) return;
    bindReminder();
    bindNavReminder();
    bindPanel();
    bindFieldHistory();
    bindEvents();
    var initial =
      Number(($("[data-website-engine-toolbar]") || {}).getAttribute &&
        $("[data-website-engine-toolbar]").getAttribute("data-website-pending-count")) || 0;
    updatePendingCount(initial);
    if (initial > 0) setSaveStatus("saved");
    else setSaveStatus("idle", "Up to date");
    // Offer friendly reminder when the editor loads already at/above threshold
    // (dismiss / suppress / busy gates still apply). Never auto-publish.
    if (initial >= THRESHOLD_DEFAULT) {
      window.setTimeout(function () {
        openReminder(false);
        showNavReminder();
      }, 450);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  window.GetProChangeManagerUi = {
    updatePendingCount: updatePendingCount,
    setSaveStatus: setSaveStatus,
    openReminder: openReminder,
    closeReminder: closeReminder,
    showNavReminder: showNavReminder,
    openUnpublishedPanel: openPanel,
    closeUnpublishedPanel: closePanel,
    openFieldHistory: openFieldHistory,
    closeFieldHistory: closeFieldHistory,
  };
})();
