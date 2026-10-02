(function () {
  function qs(sel, root) {
    return (root || document).querySelector(sel);
  }
  function qsa(sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  }

  function openOverlay(id) {
    var el = document.getElementById(id);
    if (!el) return;
    el.classList.add("is-open");
    el.setAttribute("aria-hidden", "false");
    document.body.classList.add("bb-urp-lock");
    var focus = el.querySelector("select, input, button, textarea, [href]");
    if (focus) focus.focus();
  }

  function closeOverlay(el) {
    if (!el) return;
    el.classList.remove("is-open");
    el.setAttribute("aria-hidden", "true");
    if (!document.querySelector(".bb-urp-overlay.is-open")) {
      document.body.classList.remove("bb-urp-lock");
    }
  }

  document.addEventListener("click", function (ev) {
    var opener = ev.target.closest("[data-bb-urp-open]");
    if (opener) {
      ev.preventDefault();
      openOverlay(opener.getAttribute("data-bb-urp-open"));
      return;
    }
    var closer = ev.target.closest("[data-bb-urp-close]");
    if (closer) {
      ev.preventDefault();
      closeOverlay(closer.closest(".bb-urp-overlay"));
      return;
    }
    if (ev.target.classList.contains("bb-urp-overlay")) {
      closeOverlay(ev.target);
      return;
    }
    var menuBtn = ev.target.closest("[data-bb-urp-menu]");
    if (menuBtn) {
      ev.preventDefault();
      ev.stopPropagation();
      var menu = menuBtn.parentElement && menuBtn.parentElement.querySelector(".bb-urp-menu");
      qsa(".bb-urp-menu.is-open").forEach(function (open) {
        if (open !== menu) open.classList.remove("is-open");
      });
      if (menu) menu.classList.toggle("is-open");
      return;
    }
    qsa(".bb-urp-menu.is-open").forEach(function (open) {
      open.classList.remove("is-open");
    });
  });

  document.addEventListener("keydown", function (ev) {
    if (ev.key !== "Escape") return;
    qsa(".bb-urp-overlay.is-open").forEach(closeOverlay);
    qsa(".bb-urp-menu.is-open").forEach(function (open) {
      open.classList.remove("is-open");
    });
  });

  function syncAssignScope(root) {
    var form = root || qs("[data-bb-urp-assign-form]");
    if (!form) return;
    var mode = form.querySelector('input[name="scope_mode"]:checked');
    var typeEl = form.querySelector('[name="scope_type"]');
    var idEl = form.querySelector('[name="scope_id"]');
    var branchWrap = form.querySelector("[data-bb-urp-branch-wrap]");
    var extraWrap = form.querySelector("[data-bb-urp-extra-scope]");
    var options = {};
    try {
      var jsonEl = document.getElementById("bb-urp-scope-options");
      if (jsonEl) options = JSON.parse(jsonEl.textContent || "{}");
      else options = JSON.parse(form.getAttribute("data-scope-options") || "{}");
    } catch (e) {
      options = {};
    }
    var modeVal = mode ? mode.value : "global";
    if (modeVal === "global") {
      if (typeEl) typeEl.value = "church";
      if (branchWrap) branchWrap.hidden = true;
      if (idEl) {
        idEl.required = false;
        var churchOpts = options.church || [];
        if (churchOpts[0]) idEl.value = churchOpts[0].id;
      }
    } else if (modeVal === "branch") {
      if (typeEl) typeEl.value = "branch";
      if (branchWrap) branchWrap.hidden = false;
      if (idEl) {
        idEl.innerHTML = "";
        (options.branch || []).forEach(function (o) {
          var opt = document.createElement("option");
          opt.value = o.id;
          opt.textContent = o.label || o.key;
          idEl.appendChild(opt);
        });
        idEl.required = true;
      }
    } else if (typeEl) {
      var t = typeEl.value;
      if (branchWrap) branchWrap.hidden = !(t === "branch");
      if (extraWrap) extraWrap.hidden = t === "church" || t === "organisation" || t === "branch";
    }
  }

  document.addEventListener("change", function (ev) {
    if (ev.target.closest("[data-bb-urp-assign-form]")) {
      syncAssignScope(ev.target.closest("[data-bb-urp-assign-form]"));
    }
  });

  qsa("[data-bb-urp-assign-form]").forEach(function (form) {
    syncAssignScope(form);
  });

  var auto = document.body.getAttribute("data-bb-urp-safety");
  if (!auto) {
    var page = qs("[data-bb-urp-safety]");
    auto = page && page.getAttribute("data-bb-urp-safety");
  }
  if (auto === "last_hq_admin") openOverlay("bb-urp-safety-last-admin");
  if (auto === "self_demotion") openOverlay("bb-urp-safety-self");
})();
