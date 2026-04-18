(function () {
  var cfgEl = document.getElementById("db-tools-config");
  var feedback = document.getElementById("db_tools_feedback");
  var summary = document.getElementById("db_tools_summary");
  var btnSeed = document.getElementById("db_tools_btn_seed");
  var chkFaDashboard = document.getElementById("db_tools_fa_dashboard_fixtures");
  var btnClearOpen = document.getElementById("db_tools_btn_clear_open");
  var btnClearConfirm = document.getElementById("db_tools_btn_clear_confirm");
  var slugInput = document.getElementById("db_tools_clear_slug");
  var modal = document.getElementById("db_tools_clear_modal");
  var btnDemoResetOpen = document.getElementById("db_tools_btn_demo_reset_open");
  var btnDemoResetConfirm = document.getElementById("db_tools_btn_demo_reset_confirm");
  var demoSlugInput = document.getElementById("db_tools_demo_reset_slug");
  var demoModal = document.getElementById("db_tools_demo_reset_modal");

  if (!cfgEl || !summary) return;

  var cfg;
  try {
    cfg = JSON.parse(cfgEl.textContent || "{}");
  } catch (e) {
    cfg = { confirmSlug: "", demoResetConfirmSlug: "demo", disabled: true };
  }

  var expectedSlug = String(cfg.confirmSlug || "").trim();
  var demoExpectedSlug = String(cfg.demoResetConfirmSlug || "demo").trim();
  var busy = false;

  function setBusy(on) {
    busy = !!on;
    if (btnSeed) {
      btnSeed.disabled = busy || cfg.disabled;
      btnSeed.setAttribute("aria-busy", busy ? "true" : "false");
    }
    if (chkFaDashboard) chkFaDashboard.disabled = busy || cfg.disabled;
    if (btnClearOpen) btnClearOpen.disabled = busy || cfg.disabled;
    if (btnClearConfirm)
      btnClearConfirm.disabled = busy || cfg.disabled || !slugInput || String(slugInput.value || "").trim() !== expectedSlug;
    if (btnDemoResetOpen) btnDemoResetOpen.disabled = busy || cfg.disabled;
    if (btnDemoResetConfirm)
      btnDemoResetConfirm.disabled =
        busy || cfg.disabled || !demoSlugInput || String(demoSlugInput.value || "").trim() !== demoExpectedSlug;
  }

  function showFeedback(kind, message) {
    if (!feedback) return;
    feedback.innerHTML = "";
    if (!message) return;
    var div = document.createElement("div");
    if (kind === "ok") {
      div.className = "flash flash--success";
      div.setAttribute("role", "status");
    } else if (kind === "loading") {
      div.className = "flash flash--info";
      div.setAttribute("role", "status");
    } else {
      div.className = "flash";
      div.setAttribute("role", "alert");
    }
    div.textContent = message;
    feedback.appendChild(div);
  }

  function humanSummary(data) {
    if (!data || !data.ok || !data.counts) return "";
    var c = data.counts;
    if (c.created && typeof c.created === "object") {
      var cr = c.created;
      var parts = [];
      if (cr.companies) parts.push(cr.companies + " provider(s) (companies)");
      if (cr.reviews) parts.push(cr.reviews + " review(s)");
      if (cr.leads) parts.push(cr.leads + " lead(s)");
      if (cr.field_agents) parts.push(cr.field_agents + " field agent(s)");
      if (cr.field_agent_provider_submissions) {
        parts.push(cr.field_agent_provider_submissions + " provider submission(s)");
      }
      if (cr.field_agent_callback_leads) parts.push(cr.field_agent_callback_leads + " callback lead(s)");
      if (cr.intake_clients) parts.push(cr.intake_clients + " intake client(s)");
      if (cr.intake_client_projects) parts.push(cr.intake_client_projects + " intake project(s)");
      if (cr.intake_project_assignments) parts.push(cr.intake_project_assignments + " intake assignment(s)");
      if (cr.intake_deal_reviews) parts.push(cr.intake_deal_reviews + " intake deal review(s)");
      if (cr.field_agent_submission_fixture_updates) {
        parts.push(cr.field_agent_submission_fixture_updates + " submission status/commission tweak(s)");
      }
      if (parts.length) return "Summary: Created " + parts.join(", ") + ".";
    }
    if (c.deleted && typeof c.deleted === "object") {
      var d = c.deleted;
      if (
        typeof d.crm_tasks === "number" &&
        typeof d.crm_csr_fifo_state === "number" &&
        typeof d.leads === "number" &&
        typeof d.reviews === "number" &&
        typeof d.callback_interests === "number" &&
        typeof d.professional_signups === "number" &&
        typeof d.field_agent_provider_submissions === "number" &&
        typeof d.field_agent_callback_leads === "number"
      ) {
        return (
          "Summary: Removed " +
          d.crm_tasks +
          " CRM task(s), " +
          d.crm_csr_fifo_state +
          " CSR FIFO row(s), " +
          d.leads +
          " lead(s), " +
          d.reviews +
          " review(s) (demo companies), " +
          d.callback_interests +
          " callback interest(s), " +
          d.professional_signups +
          " signup(s), " +
          d.field_agent_provider_submissions +
          " field agent submission(s), " +
          d.field_agent_callback_leads +
          " field-agent callback lead(s) (lead/CRM comments/audit not counted separately; field agent accounts preserved)."
        );
      }
      var parts2 = [];
      if (d.intake_deal_reviews) parts2.push(d.intake_deal_reviews + " intake deal review(s)");
      if (d.intake_project_assignments) parts2.push(d.intake_project_assignments + " intake assignment(s)");
      if (d.intake_client_projects) parts2.push(d.intake_client_projects + " intake project(s)");
      if (d.intake_clients) parts2.push(d.intake_clients + " intake client(s)");
      if (d.leads) parts2.push(d.leads + " lead(s)");
      if (d.field_agent_callback_leads) parts2.push(d.field_agent_callback_leads + " callback lead(s)");
      if (d.field_agent_provider_submissions) parts2.push(d.field_agent_provider_submissions + " submission(s)");
      if (d.field_agents) parts2.push(d.field_agents + " field agent(s)");
      if (d.companies) parts2.push(d.companies + " provider(s) (companies)");
      if (d.seed_runs) parts2.push(d.seed_runs + " seed batch row(s) in registry");
      if (parts2.length) {
        var line = "Summary: Removed " + parts2.join(", ") + ".";
        if ((d.companies || 0) > 0) {
          line += " Reviews removed with companies (cascade; not a separate count).";
        }
        return line;
      }
    }
    return "";
  }

  function renderSummary(obj) {
    if (!summary) return;
    summary.innerHTML = "";
    if (!obj || typeof obj !== "object") {
      summary.textContent = "—";
      return;
    }
    var human = humanSummary(obj);
    if (human) {
      var p = document.createElement("p");
      p.className = "muted";
      p.style.marginTop = "0";
      p.style.marginBottom = "0.75rem";
      p.textContent = human;
      summary.appendChild(p);
    }
    var pre = document.createElement("pre");
    pre.style.whiteSpace = "pre-wrap";
    pre.style.wordBreak = "break-word";
    pre.style.fontSize = "0.9rem";
    pre.style.margin = "0";
    pre.textContent = JSON.stringify(obj, null, 2);
    summary.appendChild(pre);
  }

  function parseJsonSafe(text) {
    try {
      return JSON.parse(text);
    } catch (e) {
      return null;
    }
  }

  async function postJson(url, body) {
    var resp = await fetch(url, {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body || {}),
      redirect: "manual",
    });
    if (resp.status === 302 || resp.status === 301 || resp.status === 303 || resp.status === 307 || resp.status === 308) {
      return {
        ok: false,
        error: "auth",
        message: "Session expired or login required. Reload the page and sign in again.",
      };
    }
    var text = await resp.text();
    var data = parseJsonSafe(text);
    if (!data) {
      var looksHtml = /^\s*</.test(text || "");
      return {
        ok: false,
        error: "parse",
        message: looksHtml
          ? "Unexpected HTML response (try reloading the page)."
          : (text ? text.slice(0, 200) : "Invalid response."),
      };
    }
    if (!resp.ok && data.ok !== false) {
      data.ok = false;
    }
    return data;
  }

  if (btnSeed) {
    btnSeed.addEventListener("click", async function () {
      if (busy || cfg.disabled) return;
      showFeedback("", "");
      setBusy(true);
      showFeedback("loading", "Working…");
      var data;
      try {
        data = await postJson("/admin/db/seed", {
          includeFaDashboardFixtures: !!(chkFaDashboard && chkFaDashboard.checked),
        });
      } catch (e) {
        data = { ok: false, message: e && e.message ? String(e.message) : "Network error." };
      }
      setBusy(false);
      if (data.ok) {
        showFeedback("ok", "Test data created.");
        renderSummary(data);
      } else {
        var msg = data.message || data.error || "Request failed.";
        showFeedback("err", msg);
        renderSummary(data);
      }
    });
  }

  function openModal() {
    if (!modal || cfg.disabled) return;
    if (slugInput) slugInput.value = "";
    if (btnClearConfirm) btnClearConfirm.disabled = true;
    modal.removeAttribute("hidden");
    modal.setAttribute("aria-hidden", "false");
    void modal.offsetWidth;
    modal.classList.add("m3-modal-overlay--open");
    document.body.style.overflow = "hidden";
    if (slugInput) slugInput.focus();
  }

  function closeModal() {
    if (!modal) return;
    modal.classList.remove("m3-modal-overlay--open");
    window.setTimeout(function () {
      modal.setAttribute("hidden", "hidden");
      modal.setAttribute("aria-hidden", "true");
      document.body.style.overflow = "";
    }, 320);
  }

  function openDemoModal() {
    if (!demoModal || cfg.disabled) return;
    if (demoSlugInput) demoSlugInput.value = "";
    if (btnDemoResetConfirm) btnDemoResetConfirm.disabled = true;
    demoModal.removeAttribute("hidden");
    demoModal.setAttribute("aria-hidden", "false");
    void demoModal.offsetWidth;
    demoModal.classList.add("m3-modal-overlay--open");
    document.body.style.overflow = "hidden";
    if (demoSlugInput) demoSlugInput.focus();
  }

  function closeDemoModal() {
    if (!demoModal) return;
    demoModal.classList.remove("m3-modal-overlay--open");
    window.setTimeout(function () {
      demoModal.setAttribute("hidden", "hidden");
      demoModal.setAttribute("aria-hidden", "true");
      document.body.style.overflow = "";
    }, 320);
  }

  if (btnClearOpen) {
    btnClearOpen.addEventListener("click", function () {
      if (busy || cfg.disabled) return;
      openModal();
    });
  }

  if (slugInput && btnClearConfirm) {
    slugInput.addEventListener("input", function () {
      var ok = String(slugInput.value || "").trim() === expectedSlug;
      btnClearConfirm.disabled = busy || cfg.disabled || !ok;
    });
  }

  if (modal) {
    modal.addEventListener("click", function (e) {
      if (e.target.closest("[data-db-tools-modal-close]") || e.target.closest(".m3-modal-overlay__backdrop")) {
        closeModal();
      }
    });
  }

  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    if (modal && !modal.hasAttribute("hidden")) closeModal();
    if (demoModal && !demoModal.hasAttribute("hidden")) closeDemoModal();
  });

  if (btnClearConfirm) {
    btnClearConfirm.addEventListener("click", async function () {
      if (busy || cfg.disabled) return;
      if (String(slugInput && slugInput.value).trim() !== expectedSlug) return;
      showFeedback("", "");
      setBusy(true);
      showFeedback("loading", "Working…");
      var data;
      try {
        data = await postJson("/admin/db/clear", { confirmSlug: expectedSlug });
      } catch (e) {
        data = { ok: false, message: e && e.message ? String(e.message) : "Network error." };
      }
      setBusy(false);
      closeModal();
      if (data.ok) {
        showFeedback("ok", "Seeded data cleared.");
        renderSummary(data);
      } else {
        var msg = data.message || data.error || "Request failed.";
        showFeedback("err", msg);
        renderSummary(data);
      }
    });
  }

  if (btnDemoResetOpen) {
    btnDemoResetOpen.addEventListener("click", function () {
      if (busy || cfg.disabled) return;
      openDemoModal();
    });
  }

  if (demoSlugInput && btnDemoResetConfirm) {
    demoSlugInput.addEventListener("input", function () {
      var ok = String(demoSlugInput.value || "").trim() === demoExpectedSlug;
      btnDemoResetConfirm.disabled = busy || cfg.disabled || !ok;
    });
  }

  if (demoModal) {
    demoModal.addEventListener("click", function (e) {
      if (e.target.closest("[data-db-tools-demo-modal-close]") || e.target.closest(".m3-modal-overlay__backdrop")) {
        closeDemoModal();
      }
    });
  }

  if (btnDemoResetConfirm) {
    btnDemoResetConfirm.addEventListener("click", async function () {
      if (busy || cfg.disabled) return;
      if (String(demoSlugInput && demoSlugInput.value).trim() !== demoExpectedSlug) return;
      showFeedback("", "");
      setBusy(true);
      showFeedback("loading", "Working…");
      var data;
      try {
        data = await postJson("/admin/db/reset-demo-leads-crm", { confirmSlug: demoExpectedSlug });
      } catch (e) {
        data = { ok: false, message: e && e.message ? String(e.message) : "Network error." };
      }
      setBusy(false);
      closeDemoModal();
      if (data.ok) {
        showFeedback("ok", "Demo directory activity reset.");
        renderSummary(data);
      } else {
        var msg2 = data.message || data.error || "Request failed.";
        showFeedback("err", msg2);
        renderSummary(data);
      }
    });
  }
})();
