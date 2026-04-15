(function () {
  var overlay = document.getElementById("faa_drilldown_overlay");
  var overlayBody = document.getElementById("faa_drilldown_overlay_body");
  if (!overlay || !overlayBody) return;
  var closeBtn = overlay.querySelector("[data-faa-close-overlay]");
  var lastFocusedEl = null;
  var lastListRequest = null;
  var lastListHtml = "";
  var lastDetailRequest = null;
  var activeListState = null;
  var pendingFeedback = null;
  var searchDebounce = null;
  var DEBOUNCE_MS = 300;
  var BULK_ENDPOINT = "/admin/field-agent-analytics/drilldown/submissions/bulk-action";
  var PRESET_ENDPOINT = "/admin/field-agent-analytics/presets";
  var BULK_CONFIRM_LARGE_THRESHOLD = 25;

  function getFilterQuery() {
    var p = new URLSearchParams(window.location.search || "");
    var out = new URLSearchParams();
    ["from", "to", "agent", "embed"].forEach(function (k) {
      var v = p.get(k);
      if (v != null && String(v).trim() !== "") out.set(k, v);
    });
    return out;
  }

  function normalizeFilters(raw) {
    var f = raw || {};
    return {
      q: f.q != null ? String(f.q).trim() : "",
      status: f.status != null ? String(f.status).trim() : "",
      from: f.from != null ? String(f.from).trim() : "",
      to: f.to != null ? String(f.to).trim() : "",
      agent: f.agent != null ? String(f.agent).trim() : "",
      page: f.page != null && String(f.page).trim() !== "" ? String(f.page).trim() : "1",
      page_size: f.page_size != null && String(f.page_size).trim() !== "" ? String(f.page_size).trim() : "50",
      embed: f.embed != null ? String(f.embed).trim() : "",
    };
  }
  function kindToRecordType(kind) {
    return kind === "callback-leads" ? "callback_leads" : "submissions";
  }
  function recordTypeToKind(rt) {
    return rt === "callback_leads" ? "callback-leads" : "submissions";
  }

  function renderState(kind, message, opts) {
    var options = opts || {};
    var html = '<div class="faa-state faa-state--' + kind + '"' +
      (kind === "error" ? ' role="alert"' : ' role="status"') +
      '><p class="muted faa-state__msg">' + message + "</p>";
    if (options.retry) {
      html += '<button type="button" class="btn btn--default faa-state__btn" data-faa-retry="' + String(options.retry).replace(/"/g, "&quot;") + '">Retry</button>';
    }
    if (options.backToList && lastListHtml) {
      html += '<button type="button" class="btn btn--default faa-state__btn" data-faa-back-list="1">Back to list</button>';
    }
    html += '<button type="button" class="btn btn--primary faa-state__btn" data-faa-close-overlay="1">Close</button>';
    html += "</div>";
    overlayBody.innerHTML = html;
    overlayBody.setAttribute("aria-busy", "false");
    focusInOverlay();
  }

  function feedbackEl() {
    return overlayBody.querySelector("[data-faa-feedback='1']");
  }

  function clearFeedback() {
    var el = feedbackEl();
    if (!el) return;
    el.hidden = true;
    el.className = "card card--mb-md";
    el.removeAttribute("role");
    el.textContent = "";
  }

  function showFeedback(kind, message) {
    var el = feedbackEl();
    if (!el) return;
    el.hidden = false;
    el.className = "card card--mb-md";
    if (kind === "error") {
      el.classList.add("faa-state", "faa-state--error");
      el.setAttribute("role", "alert");
    } else {
      el.classList.add("faa-state", "faa-state--success");
      el.setAttribute("role", "status");
    }
    el.textContent = message;
  }

  function actionPastTense(action) {
    if (action === "approve") return "approved";
    if (action === "reject") return "rejected";
    if (action === "appeal") return "appealed";
    if (action === "info_needed") return "marked info needed";
    return "updated";
  }

  function openOverlay() {
    if (overlay.hasAttribute("hidden")) {
      lastFocusedEl = document.activeElement;
    }
    overlayBody.setAttribute("aria-busy", "true");
    overlayBody.innerHTML = '<div class="faa-state faa-state--loading" role="status"><p class="muted faa-state__msg">Loading...</p></div>';
    overlay.removeAttribute("hidden");
    overlay.setAttribute("aria-hidden", "false");
    void overlay.offsetWidth;
    overlay.classList.add("m3-modal-overlay--open");
    document.body.style.overflow = "hidden";
    focusInOverlay();
  }

  function focusInOverlay() {
    var preferred = overlayBody.querySelector("[autofocus], #faa_detail_title, #faa_drilldown_list_title, [data-faa-open-detail='1'], [data-faa-retry], [data-faa-back-list]");
    if (preferred && typeof preferred.focus === "function") {
      preferred.focus();
      return;
    }
    if (closeBtn && typeof closeBtn.focus === "function") {
      closeBtn.focus();
    }
  }

  function closeOverlay() {
    overlay.classList.remove("m3-modal-overlay--open");
    window.setTimeout(function () {
      if (!overlay.classList.contains("m3-modal-overlay--open")) {
        overlay.setAttribute("hidden", "hidden");
        overlay.setAttribute("aria-hidden", "true");
        overlayBody.innerHTML = "";
        document.body.style.overflow = "";
        if (lastFocusedEl && typeof lastFocusedEl.focus === "function") {
          lastFocusedEl.focus();
        }
      }
    }, 320);
  }

  function urlFor(kind, bucket) {
    var path = kind === "callback-leads"
      ? "/admin/field-agent-analytics/drilldown/callback-leads"
      : "/admin/field-agent-analytics/drilldown/submissions";
    var qs = new URLSearchParams();
    var base = activeListState && activeListState.filters ? activeListState.filters : null;
    if (!base) {
      base = normalizeFilters({
        from: getFilterQuery().get("from") || "",
        to: getFilterQuery().get("to") || "",
        agent: getFilterQuery().get("agent") || "",
        embed: getFilterQuery().get("embed") || "",
      });
    }
    if (base.q) qs.set("q", base.q);
    if (base.status && kind === "submissions") qs.set("status", base.status);
    if (base.from) qs.set("from", base.from);
    if (base.to) qs.set("to", base.to);
    if (base.agent) qs.set("agent", base.agent);
    if (base.page) qs.set("page", base.page);
    if (base.page_size) qs.set("page_size", base.page_size);
    if (base.embed) qs.set("embed", base.embed);
    qs.set("bucket", bucket);
    return path + "?" + qs.toString();
  }

  function openDrilldown(kind, bucket, nextFilters) {
    var prevFilters = activeListState && activeListState.filters ? activeListState.filters : null;
    var baseFilters =
      nextFilters ||
      prevFilters ||
      normalizeFilters({
        from: getFilterQuery().get("from") || "",
        to: getFilterQuery().get("to") || "",
        agent: getFilterQuery().get("agent") || "",
        embed: getFilterQuery().get("embed") || "",
      });
    activeListState = {
      kind: kind,
      bucket: bucket,
      filters: normalizeFilters(baseFilters),
    };
    lastListRequest = { kind: kind, bucket: bucket };
    openOverlay();
    fetch(urlFor(kind, bucket), {
      credentials: "same-origin",
      headers: { Accept: "text/html" },
    })
      .then(function (r) {
        if (!r.ok) throw new Error("Could not load list.");
        return r.text();
      })
      .then(function (html) {
        lastListHtml = html;
        overlayBody.innerHTML = html;
        overlayBody.setAttribute("aria-busy", "false");
        clearFeedback();
        if (pendingFeedback && pendingFeedback.message) {
          showFeedback(pendingFeedback.kind || "success", pendingFeedback.message);
          pendingFeedback = null;
        }
        syncBulkToolbar();
        focusInOverlay();
      })
      .catch(function () {
        renderState("error", "Could not load list.", { retry: "list" });
      });
  }

  function detailUrlFor(kind, id) {
    if (kind === "callback-leads") {
      return "/admin/field-agent-analytics/drilldown/callback-leads/" + encodeURIComponent(id) + "/panel";
    }
    return "/admin/field-agent-analytics/drilldown/submissions/" + encodeURIComponent(id) + "/panel";
  }

  function openDetail(kind, id) {
    if (!id) return;
    lastDetailRequest = { kind: kind, id: id };
    openOverlay();
    fetch(detailUrlFor(kind, id), {
      credentials: "same-origin",
      headers: { Accept: "text/html" },
    })
      .then(function (r) {
        if (!r.ok) throw new Error("Could not load detail.");
        return r.text();
      })
      .then(function (html) {
        overlayBody.innerHTML = html;
        overlayBody.setAttribute("aria-busy", "false");
        if (pendingFeedback && pendingFeedback.message) {
          showFeedback(pendingFeedback.kind || "success", pendingFeedback.message);
          pendingFeedback = null;
        }
        focusInOverlay();
      })
      .catch(function () {
        renderState("error", "Could not load detail.", { retry: "detail", backToList: true });
      });
  }

  document.querySelectorAll("[data-faa-open-drilldown='1']").forEach(function (card) {
    function launch() {
      var kind = card.getAttribute("data-faa-kind") || "submissions";
      var bucket = card.getAttribute("data-faa-bucket") || "";
      if (!bucket) return;
      // Switching cards resets local search/status while preserving global date/agent context.
      var qs = getFilterQuery();
      openDrilldown(kind, bucket, normalizeFilters({
        from: qs.get("from") || "",
        to: qs.get("to") || "",
        agent: qs.get("agent") || "",
        embed: qs.get("embed") || "",
        q: "",
        status: "",
        page: "1",
        page_size: "50",
      }));
    }
    card.addEventListener("click", function (e) {
      e.preventDefault();
      launch();
    });
    card.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        launch();
      }
    });
  });

  function tryOpenDetailFromTarget(target) {
    if (!target) return false;
    if (target.closest && target.closest("[data-faa-no-detail='1']")) return false;
    if (target.tagName === "INPUT" && String(target.type || "").toLowerCase() === "checkbox") return false;
    var row = target.closest ? target.closest("[data-faa-open-detail='1']") : null;
    if (!row) return false;
    var kind = row.getAttribute("data-faa-kind") || "submissions";
    var id = row.getAttribute("data-faa-id") || "";
    if (!id) return false;
    openDetail(kind, id);
    return true;
  }

  overlayBody.addEventListener("click", function (e) {
    var clearBtn = e.target && e.target.getAttribute ? e.target.getAttribute("data-faa-clear-filters") : null;
    if (clearBtn === "1" && activeListState) {
      e.preventDefault();
      var keep = normalizeFilters({
        from: activeListState.filters.from,
        to: activeListState.filters.to,
        agent: activeListState.filters.agent,
        embed: activeListState.filters.embed,
        q: "",
        status: "",
        page: "1",
      });
      openDrilldown(activeListState.kind, activeListState.bucket, keep);
      return;
    }
    var bulkAction = e.target && e.target.getAttribute ? e.target.getAttribute("data-faa-bulk-action") : null;
    if (bulkAction) {
      e.preventDefault();
      runBulkAction(String(bulkAction), null);
      return;
    }
    var inlineAction = e.target && e.target.getAttribute ? e.target.getAttribute("data-faa-inline-action") : null;
    if (inlineAction) {
      e.preventDefault();
      var inlineId = Number(e.target.getAttribute("data-faa-id") || "0");
      if (!Number.isFinite(inlineId) || inlineId < 1) return;
      runBulkAction(String(inlineAction), [inlineId]);
      return;
    }
    if (e.target && e.target.getAttribute && e.target.getAttribute("data-faa-preset-save") === "1") {
      e.preventDefault();
      saveCurrentPreset();
      return;
    }
    if (e.target && e.target.getAttribute && e.target.getAttribute("data-faa-preset-apply") === "1") {
      e.preventDefault();
      applySelectedPreset();
      return;
    }
    if (e.target && e.target.getAttribute && e.target.getAttribute("data-faa-preset-rename") === "1") {
      e.preventDefault();
      renameSelectedPreset();
      return;
    }
    if (e.target && e.target.getAttribute && e.target.getAttribute("data-faa-preset-delete") === "1") {
      e.preventDefault();
      deleteSelectedPreset();
      return;
    }
    var pageNav = e.target && e.target.getAttribute ? e.target.getAttribute("data-faa-page-nav") : null;
    if (pageNav && activeListState) {
      e.preventDefault();
      var curr = Number(activeListState.filters.page || "1");
      if (!Number.isFinite(curr) || curr < 1) curr = 1;
      var nextPage = pageNav === "prev" ? curr - 1 : curr + 1;
      if (nextPage < 1) nextPage = 1;
      var nextFilters = normalizeFilters(activeListState.filters);
      nextFilters.page = String(nextPage);
      openDrilldown(activeListState.kind, activeListState.bucket, nextFilters);
      return;
    }
    var retry = e.target && e.target.getAttribute ? e.target.getAttribute("data-faa-retry") : null;
    if (retry) {
      e.preventDefault();
      if (retry === "list" && lastListRequest) {
        openDrilldown(lastListRequest.kind, lastListRequest.bucket, activeListState && activeListState.filters);
      }
      if (retry === "detail") {
        if (lastDetailRequest && lastDetailRequest.id) {
          openDetail(lastDetailRequest.kind, lastDetailRequest.id);
        } else if (lastListHtml) {
          overlayBody.innerHTML = lastListHtml;
          syncBulkToolbar();
          focusInOverlay();
        }
      }
      return;
    }
    var back = e.target && e.target.getAttribute ? e.target.getAttribute("data-faa-back-list") : null;
    if (back && lastListHtml) {
      e.preventDefault();
      overlayBody.innerHTML = lastListHtml;
      overlayBody.setAttribute("aria-busy", "false");
      syncBulkToolbar();
      focusInOverlay();
      return;
    }
    if (e.target && e.target.getAttribute && e.target.getAttribute("data-faa-close-overlay") === "1") {
      e.preventDefault();
      closeOverlay();
      return;
    }
    if (tryOpenDetailFromTarget(e.target)) {
      e.preventDefault();
      e.stopPropagation();
    }
  });

  function collectFilterFormState(form) {
    if (!form) return null;
    return normalizeFilters({
      q: (form.querySelector("[name='q']") || {}).value || "",
      status: (form.querySelector("[name='status']") || {}).value || "",
      from: (form.querySelector("[name='from']") || {}).value || "",
      to: (form.querySelector("[name='to']") || {}).value || "",
      agent: (form.querySelector("[name='agent']") || {}).value || "",
      page: "1",
      page_size: (form.querySelector("[name='page_size']") || {}).value || (activeListState && activeListState.filters ? activeListState.filters.page_size : "50"),
      embed: activeListState && activeListState.filters ? activeListState.filters.embed : "",
    });
  }

  function applyFiltersFromForm(form, immediate) {
    if (!activeListState) return;
    var next = collectFilterFormState(form);
    if (!next) return;
    var run = function () {
      openDrilldown(activeListState.kind, activeListState.bucket, next);
    };
    if (immediate) {
      run();
      return;
    }
    window.clearTimeout(searchDebounce);
    searchDebounce = window.setTimeout(run, DEBOUNCE_MS);
  }

  overlayBody.addEventListener("input", function (e) {
    var t = e.target;
    if (!t || t.name !== "q") return;
    var form = t.closest ? t.closest("[data-faa-filter-form='1']") : null;
    applyFiltersFromForm(form, false);
  });

  overlayBody.addEventListener("change", function (e) {
    var t = e.target;
    if (!t) return;
    if (t.getAttribute && t.getAttribute("data-faa-select-all") === "1") {
      var checked = !!t.checked;
      overlayBody.querySelectorAll("[data-faa-select-row='1']").forEach(function (cb) {
        cb.checked = checked;
      });
      syncBulkToolbar();
      return;
    }
    if (t.getAttribute && t.getAttribute("data-faa-select-row") === "1") {
      syncBulkToolbar();
      return;
    }
    if (t.getAttribute && t.getAttribute("data-faa-page-size") === "1") {
      var formForSize = t.closest ? t.closest("[data-faa-filter-form='1']") : null;
      var nextSizeFilters = collectFilterFormState(formForSize) || normalizeFilters(activeListState && activeListState.filters);
      nextSizeFilters.page = "1";
      nextSizeFilters.page_size = String(t.value || "50");
      openDrilldown(activeListState.kind, activeListState.bucket, nextSizeFilters);
      return;
    }
    if (["status", "from", "to", "agent"].indexOf(String(t.name || "")) === -1) return;
    var form = t.closest ? t.closest("[data-faa-filter-form='1']") : null;
    applyFiltersFromForm(form, true);
  });

  overlayBody.addEventListener("submit", function (e) {
    var form = e.target;
    if (form && form.getAttribute && form.getAttribute("data-faa-correction-form") === "1") {
      e.preventDefault();
      var sid = form.getAttribute("data-faa-submission-id") || "";
      var targetEl = form.querySelector("[name='target_status']");
      var reasonEl = form.querySelector("[name='reason']");
      var commEl = form.querySelector("[name='commission_amount']");
      var target = targetEl ? String(targetEl.value || "").trim() : "";
      var reason = reasonEl ? String(reasonEl.value || "").trim() : "";
      if (!target || !reason) {
        showFeedback("error", "Select a target status and enter a reason.");
        return;
      }
      var body = { target_status: target, reason: reason };
      if (commEl && String(commEl.value || "").trim() !== "" && target === "approved") {
        var c = Number(commEl.value);
        if (Number.isFinite(c) && c >= 0) body.commission_amount = c;
      }
      clearFeedback();
      fetch("/admin/field-agent-analytics/drilldown/submissions/" + encodeURIComponent(sid) + "/correct", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body),
      })
        .then(function (r) {
          return r.json().then(function (j) {
            if (!r.ok || !j.ok) throw new Error((j && j.error) || "Correction failed.");
            return j;
          });
        })
        .then(function () {
          pendingFeedback = { kind: "success", message: "Correction applied." };
          openDetail("submissions", sid);
        })
        .catch(function (err) {
          showFeedback("error", err.message || "Correction failed.");
        });
      return;
    }
    if (!form || !form.matches || !form.matches("[data-faa-filter-form='1']")) return;
    e.preventDefault();
    applyFiltersFromForm(form, true);
  });

  function selectedRowCheckboxes() {
    return Array.prototype.slice.call(overlayBody.querySelectorAll("[data-faa-select-row='1']:checked"));
  }

  function syncBulkToolbar() {
    var bar = overlayBody.querySelector("[data-faa-bulk-toolbar='1']");
    if (!bar) return;
    var selected = selectedRowCheckboxes();
    var n = selected.length;
    bar.hidden = n < 1;
    var countEl = overlayBody.querySelector("#faa_bulk_selected_count");
    if (countEl) countEl.textContent = n + " submission" + (n === 1 ? "" : "s") + " selected";
    var selectAll = overlayBody.querySelector("[data-faa-select-all='1']");
    if (selectAll) {
      var rows = overlayBody.querySelectorAll("[data-faa-select-row='1']");
      var total = rows.length;
      selectAll.indeterminate = n > 0 && n < total;
      selectAll.checked = total > 0 && n === total;
    }
    var labels = {
      approve: n > 0 ? "Approve " + n + " submission" + (n === 1 ? "" : "s") : "Approve selected submissions",
      info_needed: n > 0 ? "Mark " + n + " submission" + (n === 1 ? "" : "s") + " info needed" : "Mark info needed",
      reject: n > 0 ? "Reject " + n + " submission" + (n === 1 ? "" : "s") : "Reject selected submissions",
      appeal: n > 0 ? "Appeal " + n + " submission" + (n === 1 ? "" : "s") : "Appeal selected submissions",
    };
    Object.keys(labels).forEach(function (action) {
      var btn = overlayBody.querySelector("[data-faa-bulk-action='" + action + "']");
      if (!btn) return;
      btn.textContent = labels[action];
      btn.setAttribute("aria-label", labels[action]);
    });
  }

  function runBulkAction(action, explicitIds) {
    if (!activeListState || activeListState.kind !== "submissions") return;
    var ids = Array.isArray(explicitIds) && explicitIds.length
      ? explicitIds.slice()
      : selectedRowCheckboxes().map(function (el) { return Number(el.value); });
    ids = ids.filter(function (n) { return Number.isFinite(n) && n > 0; });
    if (!ids.length) return;
    var bar = overlayBody.querySelector("[data-faa-bulk-toolbar='1']");
    var maxIds = bar ? Number(bar.getAttribute("data-faa-bulk-max-ids") || "0") : 0;
    if (Number.isFinite(maxIds) && maxIds > 0 && ids.length > maxIds) {
      showFeedback("error", "Too many selected rows for one bulk action. Select up to " + maxIds + " and try again.");
      return;
    }

    var labels = {
      approve: "Approve",
      reject: "Reject",
      info_needed: "Mark info needed",
      appeal: "Appeal",
    };
    var label = labels[action] || action;
    var reason = "";
    var infoRequest = "";
    if (action === "reject") {
      var targetLabel = ids.length === 1 ? "submission" : "selected submissions";
      reason = window.prompt("Provide a rejection reason for " + targetLabel + ":", "");
      if (reason == null) return;
      reason = String(reason).trim();
      if (!reason) {
        showFeedback("error", "Rejection reason is required.");
        return;
      }
    }
    if (action === "info_needed") {
      var il = ids.length === 1 ? "submission" : "selected submissions";
      infoRequest = window.prompt("What information is needed from the field agent (" + il + ")?", "");
      if (infoRequest == null) return;
      infoRequest = String(infoRequest).trim();
      if (!infoRequest) {
        showFeedback("error", "Info request message is required.");
        return;
      }
    }
    if (ids.length >= BULK_CONFIRM_LARGE_THRESHOLD) {
      var largeOk = window.confirm("Large bulk action: " + ids.length + " submissions selected. Continue?");
      if (!largeOk) return;
    }
    var ok = window.confirm(label + " " + ids.length + " submission" + (ids.length === 1 ? "" : "s") + "?");
    if (!ok) return;

    clearFeedback();
    renderState("loading", "Applying bulk action...");
    fetch(BULK_ENDPOINT, {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        action: action,
        ids: ids,
        reason: reason,
        info_request: infoRequest,
      }),
    })
      .then(function (r) {
        return r.json().catch(function () {
          return { ok: false, error: "Invalid response." };
        }).then(function (j) {
          if (!r.ok) {
            var err = (j && j.error) || "Bulk action failed.";
            throw new Error(err);
          }
          return j;
        });
      })
      .then(function (j) {
        var msg = "";
        if (j.failed === 0) {
          msg = j.succeeded + " submission" + (j.succeeded === 1 ? "" : "s") + " " + actionPastTense(action) + ".";
        } else {
          msg = j.succeeded + " succeeded, " + j.failed + " failed.";
        }
        if (j.failed > 0 && Array.isArray(j.results)) {
          var fails = j.results.filter(function (x) { return !x.ok; }).slice(0, 5);
          if (fails.length) {
            msg += " Failed examples: " + fails.map(function (x) {
              return "#" + x.id + " " + (x.error || "failed");
            }).join(" | ");
          }
        }
        pendingFeedback = { kind: j.failed > 0 ? "error" : "success", message: msg };
        openDrilldown(activeListState.kind, activeListState.bucket, activeListState.filters);
      })
      .catch(function (err) {
        showFeedback("error", err.message || "Bulk action failed.");
        renderState("error", err.message || "Bulk action failed.", { backToList: true });
      });
  }

  function selectedPresetOption() {
    var sel = overlayBody.querySelector("[data-faa-preset-select='1']");
    if (!sel || !sel.value) return null;
    return sel.options[sel.selectedIndex] || null;
  }

  function currentPresetPayload(name) {
    if (!activeListState) return null;
    var payload = {
      name: name,
      record_type: kindToRecordType(activeListState.kind),
      bucket: String(activeListState.bucket || ""),
      filters: normalizeFilters({
        q: activeListState.filters.q,
        status: activeListState.filters.status,
        from: activeListState.filters.from,
        to: activeListState.filters.to,
        agent: activeListState.filters.agent,
        page_size: activeListState.filters.page_size || "50",
      }),
    };
    payload.filters.page = "1";
    return payload;
  }

  function saveCurrentPreset() {
    if (!activeListState) return;
    var name = window.prompt("Save current filters as:", "");
    if (name == null) return;
    name = String(name).trim();
    if (!name) {
      window.alert("Preset name is required.");
      return;
    }
    var payload = currentPresetPayload(name);
    if (!payload) return;
    fetch(PRESET_ENDPOINT, {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
    })
      .then(function (r) {
        return r.json().catch(function () {
          return { ok: false, error: "Invalid response." };
        }).then(function (j) {
          if (!r.ok || !j.ok) throw new Error((j && j.error) || "Could not save preset.");
          return j;
        });
      })
      .then(function () {
        window.alert("Saved view created.");
        openDrilldown(activeListState.kind, activeListState.bucket, activeListState.filters);
      })
      .catch(function (err) {
        window.alert(err.message || "Could not save preset.");
      });
  }

  function applySelectedPreset() {
    var opt = selectedPresetOption();
    if (!opt) {
      window.alert("Select a saved view first.");
      return;
    }
    var bucket = opt.getAttribute("data-faa-preset-bucket") || "";
    var rt = opt.getAttribute("data-faa-preset-record-type") || "submissions";
    var raw = opt.getAttribute("data-faa-preset-filters") || "";
    var decoded = {};
    try {
      decoded = JSON.parse(decodeURIComponent(raw || ""));
    } catch (_) {
      decoded = {};
    }
    var next = normalizeFilters(decoded || {});
    next.page = "1";
    var kind = recordTypeToKind(rt);
    openDrilldown(kind, bucket, next);
  }

  function renameSelectedPreset() {
    var opt = selectedPresetOption();
    if (!opt) {
      window.alert("Select a saved view first.");
      return;
    }
    var id = Number(opt.getAttribute("data-faa-preset-id") || "0");
    if (!Number.isFinite(id) || id < 1) return;
    var oldName = opt.getAttribute("data-faa-preset-name") || "";
    var name = window.prompt("Rename saved view:", oldName);
    if (name == null) return;
    name = String(name).trim();
    if (!name) {
      window.alert("Preset name is required.");
      return;
    }
    fetch(PRESET_ENDPOINT + "/" + encodeURIComponent(String(id)), {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ name: name }),
    })
      .then(function (r) {
        return r.json().catch(function () {
          return { ok: false, error: "Invalid response." };
        }).then(function (j) {
          if (!r.ok || !j.ok) throw new Error((j && j.error) || "Could not rename preset.");
          return j;
        });
      })
      .then(function () {
        openDrilldown(activeListState.kind, activeListState.bucket, activeListState.filters);
      })
      .catch(function (err) {
        window.alert(err.message || "Could not rename preset.");
      });
  }

  function deleteSelectedPreset() {
    var opt = selectedPresetOption();
    if (!opt) {
      window.alert("Select a saved view first.");
      return;
    }
    var id = Number(opt.getAttribute("data-faa-preset-id") || "0");
    if (!Number.isFinite(id) || id < 1) return;
    var name = opt.getAttribute("data-faa-preset-name") || "this saved view";
    if (!window.confirm('Delete "' + name + '"?')) return;
    fetch(PRESET_ENDPOINT + "/" + encodeURIComponent(String(id)) + "/delete", {
      method: "POST",
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    })
      .then(function (r) {
        return r.json().catch(function () {
          return { ok: false, error: "Invalid response." };
        }).then(function (j) {
          if (!r.ok || !j.ok) throw new Error((j && j.error) || "Could not delete preset.");
          return j;
        });
      })
      .then(function () {
        openDrilldown(activeListState.kind, activeListState.bucket, activeListState.filters);
      })
      .catch(function (err) {
        window.alert(err.message || "Could not delete preset.");
      });
  }

  overlayBody.addEventListener("keydown", function (e) {
    if (e.key !== "Enter" && e.key !== " ") return;
    if (tryOpenDetailFromTarget(e.target)) {
      e.preventDefault();
      e.stopPropagation();
    }
  });

  document.querySelectorAll("[data-faa-close-overlay]").forEach(function (el) {
    el.addEventListener("click", function (e) {
      e.preventDefault();
      closeOverlay();
    });
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !overlay.hasAttribute("hidden")) {
      closeOverlay();
    }
  });
})();
