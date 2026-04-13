(function () {
  var STATUS_LABEL = {
    pending: "Pending",
    info_needed: "Info needed",
    approved: "Approved",
    rejected: "Rejected",
    appealed: "Appealed",
  };

  function tenantPrefix() {
    var b = document.body;
    return (b && b.getAttribute("data-tenant-prefix")) || "";
  }

  function apiUrl(path) {
    var p = tenantPrefix();
    return (p || "") + path;
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatWhen(iso) {
    if (!iso) return "—";
    try {
      var d = new Date(iso);
      if (Number.isNaN(d.getTime())) return escapeHtml(String(iso));
      return escapeHtml(d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }));
    } catch (e) {
      return escapeHtml(String(iso));
    }
  }

  function formatDealPrice(amount, sym, code) {
    var n = Number(amount);
    if (!Number.isFinite(n)) n = 0;
    var rounded = Math.round(n * 100) / 100;
    var prefix = (sym && String(sym).trim()) || (code && String(code).trim()) || "";
    return (prefix ? prefix + " " : "") + String(rounded);
  }

  var listRoot = document.getElementById("fa-dash-modal-list");
  var detailRoot = document.getElementById("fa-dash-modal-detail");
  var listBody = document.getElementById("fa-dash-list-body");
  var listTitle = document.getElementById("fa-dash-list-title");
  var detailBody = document.getElementById("fa-dash-detail-body");
  var detailTitle = document.getElementById("fa-dash-detail-title");

  if (!listRoot || !detailRoot || !listBody || !detailBody) return;

  function setOpen(overlay, open) {
    if (!overlay) return;
    if (open) {
      overlay.removeAttribute("hidden");
      overlay.setAttribute("aria-hidden", "false");
      void overlay.offsetWidth;
      overlay.classList.add("m3-modal-overlay--open");
      document.body.classList.add("join-modal-open");
    } else {
      overlay.classList.remove("m3-modal-overlay--open");
      document.body.classList.remove("join-modal-open");
      overlay.setAttribute("aria-hidden", "true");
      overlay.setAttribute("hidden", "");
    }
  }

  function closeAll() {
    setOpen(listRoot, false);
    setOpen(detailRoot, false);
  }

  function bindDismiss() {
    document.querySelectorAll("[data-fa-dash-dismiss]").forEach(function (el) {
      el.addEventListener("click", function (e) {
        e.preventDefault();
        closeAll();
      });
    });
  }

  function renderListEmpty(msg) {
    listBody.innerHTML =
      '<div class="field-agent-dash-empty">' + '<p class="muted" style="margin:0;">' + escapeHtml(msg) + "</p>" + "</div>";
  }

  function renderLinkedCompaniesList(items) {
    if (!items || !items.length) {
      renderListEmpty("No service providers are linked to your account yet.");
      return;
    }
    var html =
      '<ul class="field-agent-dash-list" role="list">' +
      items
        .map(function (c) {
          var trade = c.category_name || (c.services && String(c.services).trim()) || "";
          var sub = [trade, c.location].filter(Boolean).join(" · ");
          var phone = c.phone ? "Phone: " + c.phone : "";
          var email = c.email ? "Email: " + c.email : "";
          var mini = c.subdomain ? "Mini-site: " + c.subdomain : "";
          var contact = [phone, email, mini].filter(Boolean).join(" · ");
          var flags = [];
          if (c.directory_featured) flags.push("Featured");
          if (c.is_premium) flags.push("Premium");
          var flagStr =
            flags.length > 0
              ? '<div class="muted field-agent-dash-list-card__contact">' + escapeHtml(flags.join(" · ")) + "</div>"
              : "";
          var srcSub =
            c.source_field_agent_submission_id != null
              ? '<div class="muted field-agent-dash-list-card__contact">Source submission: #' +
                escapeHtml(String(c.source_field_agent_submission_id)) +
                "</div>"
              : "";
          return (
            '<li class="field-agent-dash-list__item">' +
            '<div class="field-agent-dash-list-card field-agent-dash-list-card--static">' +
            '<div class="field-agent-dash-list-card__title">' +
            escapeHtml(c.name || "—") +
            "</div>" +
            (sub ? '<div class="muted field-agent-dash-list-card__sub">' + escapeHtml(sub) + "</div>" : "") +
            (contact ? '<div class="muted field-agent-dash-list-card__contact">' + escapeHtml(contact) + "</div>" : "") +
            srcSub +
            flagStr +
            '<div class="muted field-agent-dash-list-card__date">' +
            formatWhen(c.created_at) +
            "</div>" +
            "</div>" +
            "</li>"
          );
        })
        .join("") +
      "</ul>";
    listBody.innerHTML = html;
  }

  function renderSpCommissionChargesList(payload) {
    var items = payload && payload.items ? payload.items : [];
    var sym = payload && payload.currency_symbol ? String(payload.currency_symbol).trim() : "";
    var code = payload && payload.currency_code ? String(payload.currency_code).trim() : "";
    if (!items.length) {
      renderListEmpty("No commission events in the last 30 days.");
      return;
    }
    var html =
      '<ul class="field-agent-dash-list" role="list">' +
      items
        .map(function (row) {
          var trade = row.category_name || row.location || "";
          var sub = trade
            ? '<div class="muted field-agent-dash-list-card__sub">' + escapeHtml(String(trade)) + "</div>"
            : "";
          var priceLine =
            '<div class="field-agent-dash-list-card__contact"><strong>' +
            escapeHtml(formatDealPrice(row.deal_price, sym, code)) +
            "</strong> <span class=\"muted\">lead fee</span></div>";
          var mini = row.subdomain
            ? '<div class="muted field-agent-dash-list-card__contact">Mini-site: <span class="kbd">' +
              escapeHtml(row.subdomain) +
              "</span></div>"
            : "";
          return (
            '<li class="field-agent-dash-list__item">' +
            '<div class="field-agent-dash-list-card field-agent-dash-list-card--static">' +
            '<div class="field-agent-dash-list-card__title">' +
            escapeHtml(row.company_name || "—") +
            "</div>" +
            sub +
            priceLine +
            mini +
            '<div class="muted field-agent-dash-list-card__date">' +
            formatWhen(row.charge_timestamp) +
            "</div>" +
            "</div>" +
            "</li>"
          );
        })
        .join("") +
      "</ul>";
    listBody.innerHTML = html;
  }

  function renderEcCommissionProjectsList(payload) {
    var items = payload && payload.items ? payload.items : [];
    var sym = payload && payload.currency_symbol ? String(payload.currency_symbol).trim() : "";
    var code = payload && payload.currency_code ? String(payload.currency_code).trim() : "";
    if (!items.length) {
      renderListEmpty("No qualifying projects in the last 30 days.");
      return;
    }
    var html =
      '<ul class="field-agent-dash-list" role="list">' +
      items
        .map(function (row) {
          var codeLine =
            row.project_code && String(row.project_code).trim()
              ? '<div class="muted field-agent-dash-list-card__contact">Project code: ' +
                escapeHtml(String(row.project_code)) +
                "</div>"
              : "";
          var ac =
            row.assignment_count != null && Number(row.assignment_count) > 0
              ? '<div class="muted field-agent-dash-list-card__contact">' +
                escapeHtml(String(row.assignment_count)) +
                " linked assignment" +
                (Number(row.assignment_count) === 1 ? "" : "s") +
                "</div>"
              : "";
          return (
            '<li class="field-agent-dash-list__item">' +
            '<div class="field-agent-dash-list-card field-agent-dash-list-card--static">' +
            '<div class="field-agent-dash-list-card__title">Project #' +
            escapeHtml(String(row.project_id)) +
            "</div>" +
            codeLine +
            '<div class="field-agent-dash-list-card__contact"><strong>' +
            escapeHtml(formatDealPrice(row.deal_price, sym, code)) +
            "</strong> <span class=\"muted\">deal value (EC base)</span></div>" +
            ac +
            '<div class="muted field-agent-dash-list-card__date">' +
            formatWhen(row.created_at) +
            "</div>" +
            "</div>" +
            "</li>"
          );
        })
        .join("") +
      "</ul>";
    listBody.innerHTML = html;
  }

  function openListEcCommissionProjects() {
    if (listTitle) listTitle.textContent = "EC_Commission (30d) — qualifying projects";
    listBody.innerHTML = '<p class="muted field-agent-dash-modal__loading">Loading…</p>';

    setOpen(detailRoot, false);
    setOpen(listRoot, true);

    fetch(apiUrl("/field-agent/api/ec-commission-projects"), {
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    })
      .then(function (r) {
        if (!r.ok) throw new Error("Request failed");
        return r.json();
      })
      .then(function (data) {
        if (!data || data.ok !== true) throw new Error("Bad response");
        renderEcCommissionProjectsList(data);
      })
      .catch(function () {
        renderListEmpty("Could not load projects. Try again.");
      });
  }

  function openListSpCommissionCharges() {
    if (listTitle) listTitle.textContent = "SP_Commission (30d) — charges";
    listBody.innerHTML = '<p class="muted field-agent-dash-modal__loading">Loading…</p>';

    setOpen(detailRoot, false);
    setOpen(listRoot, true);

    fetch(apiUrl("/field-agent/api/sp-commission-charges"), {
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    })
      .then(function (r) {
        if (!r.ok) throw new Error("Request failed");
        return r.json();
      })
      .then(function (data) {
        if (!data || data.ok !== true) throw new Error("Bad response");
        renderSpCommissionChargesList(data);
      })
      .catch(function () {
        renderListEmpty("Could not load commission events. Try again.");
      });
  }

  function openListLinkedCompanies() {
    if (listTitle) listTitle.textContent = "My service providers";
    listBody.innerHTML = '<p class="muted field-agent-dash-modal__loading">Loading…</p>';

    setOpen(detailRoot, false);
    setOpen(listRoot, true);

    fetch(apiUrl("/field-agent/api/linked-companies"), {
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    })
      .then(function (r) {
        if (!r.ok) throw new Error("Request failed");
        return r.json();
      })
      .then(function (data) {
        var items = data && data.items ? data.items : [];
        renderLinkedCompaniesList(items);
      })
      .catch(function () {
        renderListEmpty("Could not load service providers. Try again.");
      });
  }

  function renderListCards(items, status) {
    if (!items || !items.length) {
      renderListEmpty("No submissions in this status.");
      return;
    }
    var html =
      '<ul class="field-agent-dash-list" role="list">' +
      items
        .map(function (row) {
          var name = [row.first_name, row.last_name].filter(Boolean).join(" ").trim() || "—";
          var sub = [row.profession, row.city].filter(Boolean).join(" · ");
          var phone = row.phone_raw ? "Phone: " + row.phone_raw : "";
          var wa = row.whatsapp_raw ? "WhatsApp: " + row.whatsapp_raw : "";
          var contact = [phone, wa].filter(Boolean).join(" · ");
          var reason =
            row.rejection_reason && String(row.rejection_reason).trim()
              ? '<p class="muted field-agent-dash-list-card__reason">' + escapeHtml(row.rejection_reason) + "</p>"
              : "";
          return (
            '<li class="field-agent-dash-list__item">' +
            '<button type="button" class="field-agent-dash-list-card" data-submission-id="' +
            Number(row.id) +
            '" data-status="' +
            escapeHtml(status) +
            '">' +
            "<div class=\"field-agent-dash-list-card__title\">" +
            escapeHtml(name) +
            "</div>" +
            (sub ? '<div class="muted field-agent-dash-list-card__sub">' + escapeHtml(sub) + "</div>" : "") +
            (contact ? '<div class="muted field-agent-dash-list-card__contact">' + escapeHtml(contact) + "</div>" : "") +
            '<div class="muted field-agent-dash-list-card__date">' +
            formatWhen(row.created_at) +
            "</div>" +
            '<div class="field-agent-dash-list-card__status">' +
            escapeHtml(STATUS_LABEL[row.status] || row.status) +
            "</div>" +
            reason +
            "</button>" +
            "</li>"
          );
        })
        .join("") +
      "</ul>";
    listBody.innerHTML = html;
    listBody.querySelectorAll(".field-agent-dash-list-card").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var sid = btn.getAttribute("data-submission-id");
        if (!sid) return;
        openDetail(Number(sid));
      });
    });
  }

  function renderDetail(sub) {
    if (!sub) {
      detailBody.innerHTML = '<p class="muted">Could not load submission.</p>';
      return;
    }
    var rows = [
      ["Status", STATUS_LABEL[sub.status] || sub.status],
      ["Name", [sub.first_name, sub.last_name].filter(Boolean).join(" ")],
      ["Profession", sub.profession],
      ["City (listing)", sub.city],
      ["Phone", sub.phone_raw],
      ["WhatsApp", sub.whatsapp_raw],
      ["PACRA", sub.pacra],
      ["Address", [sub.address_street, sub.address_landmarks, sub.address_neighbourhood, sub.address_city].filter(Boolean).join(", ")],
      ["NRC", sub.nrc_number],
      ["Rejection reason", sub.rejection_reason],
      ["Commission", sub.commission_amount != null ? String(sub.commission_amount) : "—"],
      ["Submitted", sub.created_at],
      ["Updated", sub.updated_at],
    ];
    var dl =
      '<dl class="field-agent-dash-detail">' +
      rows
        .map(function (pair) {
          var v = pair[1];
          if (v === "" || v == null) return "";
          return (
            "<div class=\"field-agent-dash-detail__row\"><dt>" +
            escapeHtml(pair[0]) +
            "</dt><dd>" +
            (pair[0] === "Submitted" || pair[0] === "Updated"
              ? formatWhen(v)
              : escapeHtml(String(v))) +
            "</dd></div>"
          );
        })
        .join("") +
      "</dl>";
    var photos = "";
    if (sub.photo_profile_url && String(sub.photo_profile_url).trim()) {
      photos +=
        '<p class="field-agent-dash-detail__photo"><a href="' +
        escapeHtml(sub.photo_profile_url) +
        '" target="_blank" rel="noopener noreferrer">Profile photo</a></p>';
    }
    var works = "";
    try {
      var w = JSON.parse(sub.work_photos_json || "[]");
      if (Array.isArray(w) && w.length) {
        works += '<div class="field-agent-dash-detail__works"><div class="muted">Work photos</div><ul>';
        w.forEach(function (url) {
          if (!url) return;
          works +=
            '<li><a href="' + escapeHtml(url) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(url) + "</a></li>";
        });
        works += "</ul></div>";
      }
    } catch (e) {
      /* ignore */
    }
    detailBody.innerHTML = dl + photos + works;
  }

  function openList(status) {
    var label = STATUS_LABEL[status] || status;
    if (listTitle) listTitle.textContent = label;
    listBody.innerHTML = '<p class="muted field-agent-dash-modal__loading">Loading…</p>';

    setOpen(detailRoot, false);
    setOpen(listRoot, true);

    fetch(apiUrl("/field-agent/api/submissions?status=" + encodeURIComponent(status)), {
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    })
      .then(function (r) {
        if (!r.ok) throw new Error("Request failed");
        return r.json();
      })
      .then(function (data) {
        var items = data && data.items ? data.items : [];
        renderListCards(items, status);
      })
      .catch(function () {
        renderListEmpty("Could not load submissions. Try again.");
      });
  }

  function openDetail(submissionId) {
    if (detailTitle) detailTitle.textContent = "Submission #" + submissionId;
    detailBody.innerHTML = '<p class="muted field-agent-dash-modal__loading">Loading…</p>';

    setOpen(listRoot, false);
    setOpen(detailRoot, true);

    fetch(apiUrl("/field-agent/api/submissions/" + encodeURIComponent(String(submissionId))), {
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    })
      .then(function (r) {
        if (r.status === 404) {
          detailBody.innerHTML = '<p class="muted">Submission not found.</p>';
          return null;
        }
        if (!r.ok) throw new Error("Request failed");
        return r.json();
      })
      .then(function (data) {
        if (!data) return;
        if (data.submission) renderDetail(data.submission);
        else detailBody.innerHTML = '<p class="muted">Could not load submission.</p>';
      })
      .catch(function () {
        detailBody.innerHTML = '<p class="muted">Could not load submission. Try again.</p>';
      });
  }

  document.querySelectorAll(".field-agent-metric-card[data-status]").forEach(function (tile) {
    tile.addEventListener("click", function () {
      var st = tile.getAttribute("data-status");
      if (!st) return;
      openList(st);
    });
    tile.addEventListener("keydown", function (e) {
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      var st = tile.getAttribute("data-status");
      if (st) openList(st);
    });
  });

  document.querySelectorAll(".field-agent-metric-card[data-status]").forEach(function (el) {
    el.setAttribute("role", "button");
    el.setAttribute("tabindex", "0");
  });

  function renderSpRatingReviewsList(payload) {
    var items = payload && payload.items ? payload.items : [];
    if (!items.length) {
      renderListEmpty("No client reviews in the last 30 days.");
      return;
    }
    var html =
      '<ul class="field-agent-dash-list" role="list">' +
      items
        .map(function (row) {
          var code =
            row.project_code && String(row.project_code).trim()
              ? '<div class="muted field-agent-dash-list-card__contact">Project: ' + escapeHtml(String(row.project_code)) + "</div>"
              : "";
          return (
            '<li class="field-agent-dash-list__item">' +
            '<div class="field-agent-dash-list-card field-agent-dash-list-card--static">' +
            '<div class="field-agent-dash-list-card__title">' +
            escapeHtml(row.company_name || "—") +
            "</div>" +
            '<div class="field-agent-dash-list-card__contact"><strong>' +
            escapeHtml(String(row.rating)) +
            "</strong> / 5</div>" +
            code +
            '<div class="muted field-agent-dash-list-card__date">' +
            formatWhen(row.created_at) +
            "</div>" +
            "</div>" +
            "</li>"
          );
        })
        .join("") +
      "</ul>";
    listBody.innerHTML = html;
  }

  function renderSpPayableBreakdownHtml(p) {
    if (!p) {
      return '<p class="muted">Breakdown is not available.</p>';
    }
    var sym = p.faCurrencyCode ? " (" + escapeHtml(p.faCurrencyCode) + ")" : "";
    var statusCard =
      '<div class="field-agent-dash-list-card field-agent-dash-list-card--static" style="margin-bottom:1rem;">' +
      '<div class="field-agent-dash-list-card__title">Current status</div>' +
      '<div class="field-agent-dash-list-card__contact"><strong>' +
      escapeHtml(String(p.qualityEligibilityLabel || "—")) +
      "</strong>" +
      sym +
      "</div>" +
      "</div>";
    var withheldRow = "";
    if (Number(p.withheldSpCommission30) > 0) {
      withheldRow =
        '<div class="field-agent-dash-detail__row"><dt>Withheld pending quality</dt><dd>' +
        escapeHtml(String(p.withheldDisplay || "—")) +
        "</dd></div>";
    }
    var bonusNote =
      Number(p.highRatingBonusSpCommission30) > 0
        ? '<p class="muted" style="margin:0.75rem 0 0;font-size:0.875rem;">High-rating bonus applied for this view.</p>'
        : "";
    var noRatingNote =
      p.spRatingDisplay === "—"
        ? '<p class="muted" style="margin:0 0 0.75rem;font-size:0.875rem;">No SP_Rating (30d) yet (no reviews in the rolling window). Thresholds below are tenant-configured for reference.</p>'
        : "";
    var dl =
      '<dl class="field-agent-dash-detail">' +
      '<div class="field-agent-dash-detail__row"><dt>SP_Rating (30d)</dt><dd>' +
      escapeHtml(String(p.spRatingDisplay || "—")) +
      "</dd></div>" +
      '<div class="field-agent-dash-detail__row"><dt>High threshold</dt><dd>' +
      escapeHtml(String(p.highThresholdDisplay || "—")) +
      "</dd></div>" +
      '<div class="field-agent-dash-detail__row"><dt>Low threshold</dt><dd>' +
      escapeHtml(String(p.lowThresholdDisplay || "—")) +
      "</dd></div>" +
      '<div class="field-agent-dash-detail__row"><dt>Earned SP commission (30d)</dt><dd>' +
      escapeHtml(String(p.earnedDisplay || "—")) +
      "</dd></div>" +
      '<div class="field-agent-dash-detail__row"><dt>High-rating bonus (est.)</dt><dd>' +
      escapeHtml(String(p.bonusDisplay || "—")) +
      "</dd></div>" +
      '<div class="field-agent-dash-detail__row"><dt>Quality adjustment</dt><dd>' +
      escapeHtml(String(p.adjustmentDisplay || "—")) +
      "</dd></div>" +
      withheldRow +
      '<div class="field-agent-dash-detail__row"><dt>Payable SP commission (30d)</dt><dd><strong>' +
      escapeHtml(String(p.payableDisplay || "—")) +
      "</strong></dd></div>" +
      '<div class="field-agent-dash-detail__row"><dt>Status / eligibility</dt><dd>' +
      escapeHtml(String(p.qualityEligibilityLabel || "—")) +
      "</dd></div>" +
      "</dl>";
    var rules =
      '<div class="field-agent-dash-list-card field-agent-dash-list-card--static" style="margin-top:1rem;">' +
      '<div class="field-agent-dash-list-card__title">How this estimate works</div>' +
      '<ul class="muted" style="margin:0.5rem 0 0;padding-left:1.25rem;font-size:0.875rem;line-height:1.45;">' +
      "<li>If SP_Rating (30d) is below the low threshold, payable SP commission is withheld for this rolling 30-day view.</li>" +
      "<li>If SP_Rating (30d) is at or above the high threshold, the configured high-rating bonus is included.</li>" +
      "</ul>" +
      "</div>";
    var disclaimer =
      '<p class="muted" style="margin:1rem 0 0;font-size:0.8125rem;line-height:1.45;">Reporting estimate only — not payroll, settlement, or a payment promise.</p>';
    return statusCard + noRatingNote + dl + bonusNote + rules + disclaimer;
  }

  function openSpPayableBreakdownModal() {
    var el = document.getElementById("fa-sp-payable-breakdown-data");
    var payload = null;
    if (el && el.textContent) {
      try {
        payload = JSON.parse(el.textContent);
      } catch (e) {
        payload = null;
      }
    }
    if (listTitle) listTitle.textContent = "Payable SP commission breakdown (30d)";
    listBody.innerHTML = renderSpPayableBreakdownHtml(payload);
    setOpen(detailRoot, false);
    setOpen(listRoot, true);
  }

  function renderEcPayableBreakdownHtml(p) {
    if (!p) {
      return '<p class="muted">Breakdown is not available.</p>';
    }
    var sym = p.faCurrencyCode ? " (" + escapeHtml(p.faCurrencyCode) + ")" : "";
    var statusCard =
      '<div class="field-agent-dash-list-card field-agent-dash-list-card--static" style="margin-bottom:1rem;">' +
      '<div class="field-agent-dash-list-card__title">Current status</div>' +
      '<div class="field-agent-dash-list-card__contact"><strong>' +
      escapeHtml(String(p.qualityEligibilityLabel || "—")) +
      "</strong>" +
      sym +
      "</div>" +
      "</div>";
    var withheldRow = "";
    if (Number(p.withheldEcCommission30) > 0) {
      withheldRow =
        '<div class="field-agent-dash-detail__row"><dt>Withheld pending quality</dt><dd>' +
        escapeHtml(String(p.withheldDisplay || "—")) +
        "</dd></div>";
    }
    var noRatingNote =
      p.spRatingDisplay === "—"
        ? '<p class="muted" style="margin:0 0 0.75rem;font-size:0.875rem;">No SP_Rating (30d) yet (no reviews in the rolling window). Thresholds below are tenant-configured for reference.</p>'
        : "";
    var dl =
      '<dl class="field-agent-dash-detail">' +
      '<div class="field-agent-dash-detail__row"><dt>SP_Rating (30d)</dt><dd>' +
      escapeHtml(String(p.spRatingDisplay || "—")) +
      "</dd></div>" +
      '<div class="field-agent-dash-detail__row"><dt>High threshold</dt><dd>' +
      escapeHtml(String(p.highThresholdDisplay || "—")) +
      "</dd></div>" +
      '<div class="field-agent-dash-detail__row"><dt>Low threshold</dt><dd>' +
      escapeHtml(String(p.lowThresholdDisplay || "—")) +
      "</dd></div>" +
      '<div class="field-agent-dash-detail__row"><dt>Earned EC commission (30d)</dt><dd>' +
      escapeHtml(String(p.earnedDisplay || "—")) +
      "</dd></div>" +
      withheldRow +
      '<div class="field-agent-dash-detail__row"><dt>Payable EC commission (30d)</dt><dd><strong>' +
      escapeHtml(String(p.payableDisplay || "—")) +
      "</strong></dd></div>" +
      '<div class="field-agent-dash-detail__row"><dt>Status / eligibility</dt><dd>' +
      escapeHtml(String(p.qualityEligibilityLabel || "—")) +
      "</dd></div>" +
      "</dl>";
    var rules =
      '<div class="field-agent-dash-list-card field-agent-dash-list-card--static" style="margin-top:1rem;">' +
      '<div class="field-agent-dash-list-card__title">How this estimate works</div>' +
      '<ul class="muted" style="margin:0.5rem 0 0;padding-left:1.25rem;font-size:0.875rem;line-height:1.45;">' +
      "<li>If SP_Rating (30d) is below the low threshold, EC commission is withheld for this rolling 30-day view.</li>" +
      "<li>EC commission payable does not include a high-rating bonus (holdback only).</li>" +
      "</ul>" +
      "</div>";
    var disclaimer =
      '<p class="muted" style="margin:1rem 0 0;font-size:0.8125rem;line-height:1.45;">Reporting estimate only — not payroll, settlement, or a payment promise.</p>';
    return statusCard + noRatingNote + dl + rules + disclaimer;
  }

  function openEcPayableBreakdownModal() {
    var el = document.getElementById("fa-ec-payable-breakdown-data");
    var payload = null;
    if (el && el.textContent) {
      try {
        payload = JSON.parse(el.textContent);
      } catch (e) {
        payload = null;
      }
    }
    if (listTitle) listTitle.textContent = "Payable EC commission breakdown (30d)";
    listBody.innerHTML = renderEcPayableBreakdownHtml(payload);
    setOpen(detailRoot, false);
    setOpen(listRoot, true);
  }

  function openListSpRatingReviews() {
    if (listTitle) listTitle.textContent = "SP_Rating (30d) — client reviews";
    listBody.innerHTML = '<p class="muted field-agent-dash-modal__loading">Loading…</p>';

    setOpen(detailRoot, false);
    setOpen(listRoot, true);

    fetch(apiUrl("/field-agent/api/sp-rating-reviews"), {
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    })
      .then(function (r) {
        if (!r.ok) throw new Error("Request failed");
        return r.json();
      })
      .then(function (data) {
        if (!data || data.ok !== true) throw new Error("Bad response");
        renderSpRatingReviewsList(data);
      })
      .catch(function () {
        renderListEmpty("Could not load reviews. Try again.");
      });
  }

  document.querySelectorAll('.field-agent-metric-card[data-metric="sp_rating_30d"]').forEach(function (tile) {
    tile.addEventListener("click", function () {
      openListSpRatingReviews();
    });
    tile.addEventListener("keydown", function (e) {
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      openListSpRatingReviews();
    });
    tile.setAttribute("role", "button");
    tile.setAttribute("tabindex", "0");
  });

  document.querySelectorAll('.field-agent-metric-card[data-metric="ec_commission_30d"]').forEach(function (tile) {
    tile.addEventListener("click", function () {
      openListEcCommissionProjects();
    });
    tile.addEventListener("keydown", function (e) {
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      openListEcCommissionProjects();
    });
    tile.setAttribute("role", "button");
    tile.setAttribute("tabindex", "0");
  });

  document.querySelectorAll('.field-agent-metric-card[data-metric="sp_commission_30d"]').forEach(function (tile) {
    tile.addEventListener("click", function () {
      openListSpCommissionCharges();
    });
    tile.addEventListener("keydown", function (e) {
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      openListSpCommissionCharges();
    });
    tile.setAttribute("role", "button");
    tile.setAttribute("tabindex", "0");
  });

  document.querySelectorAll('.field-agent-metric-card[data-metric="linked_service_providers"]').forEach(function (tile) {
    tile.addEventListener("click", function () {
      openListLinkedCompanies();
    });
    tile.addEventListener("keydown", function (e) {
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      openListLinkedCompanies();
    });
    tile.setAttribute("role", "button");
    tile.setAttribute("tabindex", "0");
  });

  document.querySelectorAll(".field-agent-sp-payable-summary--clickable").forEach(function (card) {
    card.addEventListener("click", function () {
      openSpPayableBreakdownModal();
    });
    card.addEventListener("keydown", function (e) {
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      openSpPayableBreakdownModal();
    });
    card.setAttribute("role", "button");
    card.setAttribute("tabindex", "0");
  });

  document.querySelectorAll(".field-agent-ec-payable-summary--clickable").forEach(function (card) {
    card.addEventListener("click", function () {
      openEcPayableBreakdownModal();
    });
    card.addEventListener("keydown", function (e) {
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      openEcPayableBreakdownModal();
    });
    card.setAttribute("role", "button");
    card.setAttribute("tabindex", "0");
  });

  bindDismiss();

  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    var open =
      (listRoot && listRoot.classList.contains("m3-modal-overlay--open")) ||
      (detailRoot && detailRoot.classList.contains("m3-modal-overlay--open"));
    if (open) {
      e.preventDefault();
      closeAll();
    }
  });

  var drawerCheck = document.getElementById("field-agent-console-nav");
  if (drawerCheck) {
    drawerCheck.addEventListener("change", function () {
      if (drawerCheck.checked) closeAll();
    });
  }
})();

