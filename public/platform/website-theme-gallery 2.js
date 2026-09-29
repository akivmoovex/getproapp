(function () {
  "use strict";

  function $(root, sel) {
    return root.querySelector(sel);
  }

  function setMessage(el, text, show) {
    if (!el) return;
    if (!show || !text) {
      el.hidden = true;
      el.textContent = "";
      return;
    }
    el.hidden = false;
    el.textContent = text;
  }

  function renderCompat(root, compatibility) {
    var panel = $(root, "[data-theme-compat]");
    var list = $(root, "[data-theme-compat-list]");
    if (!panel || !list) return;
    list.innerHTML = "";
    var rows = [];
    var unsupported = (compatibility && compatibility.unsupportedSections) || [];
    unsupported.forEach(function (row) {
      rows.push(
        "Section “" +
          (row.type || "unknown") +
          "” is not styled by this theme — content is preserved for review."
      );
    });
    var imageFlags = (compatibility && compatibility.imageFlags) || [];
    var editHref = root.getAttribute("data-edit-href") || "";
    imageFlags.forEach(function (row) {
      if (!row || !row.review) return;
      var line =
        "Image slot “" +
        (row.contentKey || "image") +
        "” may need framing adjustment.";
      if (editHref) {
        line +=
          ' <a href="' +
          editHref.replace(/"/g, "&quot;") +
          '">Open editor to Adjust Picture</a>';
      }
      rows.push(line);
    });
    if (!rows.length) {
      panel.hidden = true;
      return;
    }
    rows.forEach(function (html) {
      var li = document.createElement("li");
      li.innerHTML = html;
      list.appendChild(li);
    });
    panel.hidden = false;
  }

  function markSelected(root, themeId) {
    root.querySelectorAll("[data-theme-card]").forEach(function (card) {
      var id = card.getAttribute("data-theme-id");
      var isDraft = id === themeId;
      card.classList.toggle("gp-we-theme-card--draft", isDraft);
      card.setAttribute("data-theme-draft", isDraft ? "1" : "0");
      var btn = card.querySelector("[data-theme-select]");
      if (!btn) return;
      if (isDraft) {
        btn.disabled = true;
        btn.setAttribute("aria-disabled", "true");
        btn.textContent = "Selected in draft";
      } else {
        btn.disabled = false;
        btn.removeAttribute("aria-disabled");
        btn.textContent = "Select Theme";
      }
      var badges = card.querySelector(".gp-we-theme-card__labels");
      if (!badges) return;
      var draftBadge = badges.querySelector(".gp-we-theme-card__badge--draft");
      if (isDraft && !draftBadge) {
        var span = document.createElement("span");
        span.className = "gp-we-theme-card__badge gp-we-theme-card__badge--draft";
        span.textContent = "Draft";
        badges.appendChild(span);
      } else if (!isDraft && draftBadge) {
        draftBadge.remove();
      }
    });
  }

  function csrfPayload(root) {
    var field = root.getAttribute("data-csrf-field") || "_csrf";
    var token = root.getAttribute("data-csrf-token") || "";
    var out = {};
    out[field] = token;
    return out;
  }

  async function selectTheme(root, themeId, button) {
    var api = root.getAttribute("data-theme-api") || "";
    var notice = $(root, "[data-theme-gallery-notice]");
    var error = $(root, "[data-theme-gallery-error]");
    if (!api) {
      setMessage(error, "Theme API is unavailable.", true);
      return;
    }
    if (button) button.disabled = true;
    setMessage(error, "", false);
    try {
      var body = Object.assign(csrfPayload(root), { themeId: themeId });
      var res = await fetch(api, {
        method: "POST",
        credentials: "same-origin",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "X-CSRF-Token": root.getAttribute("data-csrf-token") || "",
        },
        body: JSON.stringify(body),
      });
      var data = {};
      try {
        data = await res.json();
      } catch (_) {
        data = {};
      }
      if (!res.ok || !data.ok) {
        setMessage(
          error,
          (data && data.code ? String(data.code).replace(/_/g, " ") : null) ||
            "Could not save theme draft.",
          true
        );
        if (button) button.disabled = false;
        return;
      }
      markSelected(root, data.themeId || themeId);
      renderCompat(root, data.compatibility || null);
      setMessage(
        notice,
        "Theme saved to draft. Live site is unchanged until you publish.",
        true
      );
    } catch (_) {
      setMessage(error, "Could not save theme draft.", true);
      if (button) button.disabled = false;
    }
  }

  function bind(root) {
    root.addEventListener("click", function (ev) {
      var btn = ev.target && ev.target.closest ? ev.target.closest("[data-theme-select]") : null;
      if (!btn || !root.contains(btn) || btn.disabled) return;
      var themeId = btn.getAttribute("data-theme-id");
      if (!themeId) return;
      selectTheme(root, themeId, btn);
    });
  }

  document.querySelectorAll("[data-gp-website-theme-gallery]").forEach(bind);
})();
