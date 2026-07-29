/**
 * Phase 7 Stage 5 — shared structured editor (image, video, service times, collections).
 */
(function () {
  "use strict";

  var host = null;
  var current = null;
  var lastFocus = null;
  var trapHandler = null;

  function $(sel, root) {
    return (root || document).querySelector(sel);
  }

  function focusableIn(panel) {
    if (!panel) return [];
    return Array.prototype.slice.call(
      panel.querySelectorAll(
        'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
    ).filter(function (el) {
      return !el.hidden && el.offsetParent !== null;
    });
  }

  function installFocusTrap() {
    removeFocusTrap();
    var panel = host && $("[data-bb-structured-panel='1']", host);
    if (!panel) return;
    trapHandler = function (event) {
      if (!host || host.hidden || event.key !== "Tab") return;
      var nodes = focusableIn(panel);
      if (!nodes.length) return;
      var first = nodes[0];
      var last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", trapHandler, true);
  }

  function removeFocusTrap() {
    if (trapHandler) {
      document.removeEventListener("keydown", trapHandler, true);
      trapHandler = null;
    }
  }

  function setStatus(message, kind) {
    var el = $("[data-bb-structured-status='1']", host);
    if (!el) return;
    el.textContent = message || "";
    el.setAttribute("data-bb-status-kind", kind || "");
  }

  function demoImages() {
    var node = document.getElementById("bb-tp-demo-images-json");
    if (!node) return [];
    try {
      return JSON.parse(node.textContent || "[]");
    } catch (e) {
      return [];
    }
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function field(label, name, value, opts) {
    opts = opts || {};
    var type = opts.type || "text";
    var id = "bb-se-" + name;
    if (type === "textarea") {
      return (
        '<label class="bb-tp-se-field" for="' +
        id +
        '"><span>' +
        esc(label) +
        "</span><textarea id=\"" +
        id +
        '" name="' +
        esc(name) +
        '" rows="' +
        (opts.rows || 3) +
        '">' +
        esc(value) +
        "</textarea></label>"
      );
    }
    if (type === "select") {
      var options = (opts.options || [])
        .map(function (o) {
          var sel = String(o.value) === String(value) ? " selected" : "";
          return "<option value=\"" + esc(o.value) + "\"" + sel + ">" + esc(o.label) + "</option>";
        })
        .join("");
      return (
        '<label class="bb-tp-se-field" for="' +
        id +
        '"><span>' +
        esc(label) +
        '</span><select id="' +
        id +
        '" name="' +
        esc(name) +
        '">' +
        options +
        "</select></label>"
      );
    }
    if (type === "checkbox") {
      return (
        '<label class="bb-tp-se-check"><input type="checkbox" name="' +
        esc(name) +
        '" value="1"' +
        (value ? " checked" : "") +
        " /> <span>" +
        esc(label) +
        "</span></label>"
      );
    }
    return (
      '<label class="bb-tp-se-field" for="' +
      id +
      '"><span>' +
      esc(label) +
      '</span><input id="' +
      id +
      '" name="' +
      esc(name) +
      '" type="' +
      esc(type) +
      '" value="' +
      esc(value) +
      '" /></label>'
    );
  }

  function buildImageForm(p) {
    var demos = demoImages()
      .map(function (d) {
        return (
          '<button type="button" class="bb-tp-se-demo" data-bb-demo-url="' +
          esc(d.url) +
          '"><img src="' +
          esc(d.url) +
          '" alt="" width="72" height="54" loading="lazy" /><span>' +
          esc(d.label) +
          "</span></button>"
        );
      })
      .join("");
    return (
      '<div class="bb-tp-se-grid" data-bb-media-editor="1" data-bb-stitch-screen-mobile="Phase 7 - Media Editing - Mobile">' +
      '<div class="bb-tp-se-preview"><img data-bb-se-preview="1" src="' +
      esc(p.imageUrl || "") +
      '" alt="" width="320" height="200" /></div>' +
      '<div class="bb-tp-se-previews"><p class="bb-tp-se-hint">Desktop / mobile fit preview</p>' +
      '<div class="bb-tp-se-preview bb-tp-se-preview--mobile"><img data-bb-se-preview-mobile="1" src="' +
      esc(p.imageUrl || "") +
      '" alt="" /></div></div>' +
      field("Image URL or media path", "imageUrl", p.imageUrl || "") +
      field("Alternative text", "altText", p.altText || "") +
      field("Focal position", "focal", p.focal || "center", {
        type: "select",
        options: [
          { value: "center", label: "Center" },
          { value: "top", label: "Top" },
          { value: "bottom", label: "Bottom" },
          { value: "left", label: "Left" },
          { value: "right", label: "Right" },
        ],
      }) +
      '<div class="bb-tp-se-actions-row">' +
      '<label class="bb-tp-btn bb-tp-btn--ghost bb-tp-btn--touch bb-tp-se-change-photo">Change photo<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" data-bb-se-upload="1" hidden /></label>' +
      '<button type="button" class="bb-tp-btn bb-tp-btn--ghost bb-tp-btn--touch" data-bb-se-library="1">Media library</button>' +
      '<button type="button" class="bb-tp-btn bb-tp-btn--ghost bb-tp-btn--touch" data-bb-se-remove-media="1">Remove image</button>' +
      "</div>" +
      '<div class="bb-tp-se-library" data-bb-se-library-panel="1" hidden></div>' +
      '<p class="bb-tp-se-hint">Or choose a demo image</p><div class="bb-tp-se-demos">' +
      demos +
      "</div></div>"
    );
  }

  function buildVideoForm(p) {
    return (
      '<div class="bb-tp-se-grid">' +
      '<p class="bb-tp-se-hint">Video file upload is not supported. Use a YouTube or Vimeo https link.</p>' +
      field("Video URL", "videoUrl", p.videoUrl || "", { type: "url" }) +
      field("Title", "title", p.title || "") +
      field("Thumbnail URL", "thumbnailUrl", p.thumbnailUrl || "") +
      '<div class="bb-tp-se-preview"><img data-bb-se-preview="1" src="' +
      esc(p.thumbnailUrl || "") +
      '" alt="" width="320" height="180" /></div>' +
      '<button type="button" class="bb-tp-btn bb-tp-btn--ghost bb-tp-btn--sm" data-bb-se-remove-media="1">Remove video</button>' +
      "</div>"
    );
  }

  function buildServiceTimesForm(p) {
    var entries = Array.isArray(p.entries) ? p.entries : [];
    if (!entries.length) {
      entries = [
        {
          id: "svc-new-1",
          name: "",
          day: "sunday",
          startTime: "10:00",
          endTime: "",
          location: "",
          note: "",
          enabled: true,
          primary: true,
          sortOrder: 10,
        },
      ];
    }
    var rows = entries
      .map(function (e, i) {
        return (
          '<fieldset class="bb-tp-se-item" data-bb-svc-index="' +
          i +
          '">' +
          "<legend>Service " +
          (i + 1) +
          "</legend>" +
          field("Name", "name_" + i, e.name || "") +
          field("Day", "day_" + i, e.day || "sunday", {
            type: "select",
            options: [
              "sunday",
              "monday",
              "tuesday",
              "wednesday",
              "thursday",
              "friday",
              "saturday",
            ].map(function (d) {
              return { value: d, label: d.charAt(0).toUpperCase() + d.slice(1) };
            }),
          }) +
          field("Start", "startTime_" + i, e.startTime || "", { type: "time" }) +
          field("End (optional)", "endTime_" + i, e.endTime || "", { type: "time" }) +
          field("Venue", "location_" + i, e.location || "") +
          field("Campus / branch", "campus_" + i, e.campus || "") +
          field("Notes / temporary notice", "note_" + i, e.note || e.temporaryNotice || "", {
            type: "textarea",
            rows: 2,
          }) +
          field("Primary service", "primary_" + i, e.primary, { type: "checkbox" }) +
          field("Visible", "enabled_" + i, e.enabled !== false, { type: "checkbox" }) +
          '<div class="bb-tp-se-actions-row bb-tp-se-svc-order">' +
          '<button type="button" class="bb-tp-btn bb-tp-btn--ghost bb-tp-btn--touch" data-bb-svc-up="' +
          i +
          '" aria-label="Move service ' +
          (i + 1) +
          ' up"' +
          (i === 0 ? " disabled" : "") +
          ">Up</button>" +
          '<button type="button" class="bb-tp-btn bb-tp-btn--ghost bb-tp-btn--touch" data-bb-svc-down="' +
          i +
          '" aria-label="Move service ' +
          (i + 1) +
          ' down"' +
          (i === entries.length - 1 ? " disabled" : "") +
          ">Down</button>" +
          '<button type="button" class="bb-tp-btn bb-tp-btn--ghost bb-tp-btn--touch" data-bb-svc-remove="' +
          i +
          '">Remove</button>' +
          "</div>" +
          "</fieldset>"
        );
      })
      .join("");
    return (
      '<div class="bb-tp-se-collection" data-bb-svc-count="' +
      entries.length +
      '" data-bb-stitch-screen-mobile="Phase 7 - Service Times Editing - Mobile">' +
      '<p class="bb-tp-se-hint">Edits save as draft until you publish. Public visitors keep seeing the current schedule.</p>' +
      rows +
      '<button type="button" class="bb-tp-btn bb-tp-btn--ghost bb-tp-btn--touch" data-bb-svc-add="1">Add another service</button>' +
      "</div>"
    );
  }

  function buildLeaderForm(p) {
    return (
      buildImageForm({ imageUrl: p.imageUrl || "", altText: p.displayName || "Leader photo", focal: "center" }) +
      field("Full name", "displayName", p.displayName || "") +
      field("Role", "roleTitle", p.roleTitle || "") +
      field("Short biography", "biography", p.biography || "", { type: "textarea", rows: 4 }) +
      field("Email (optional)", "email", p.email || "", { type: "email" }) +
      field("Phone (optional)", "phone", p.phone || "") +
      field("Social link (optional)", "socialUrl", p.socialUrl || "", { type: "url" }) +
      field("Show contact publicly", "contactPublic", p.contactPublic, { type: "checkbox" }) +
      field("Senior leader", "seniorLeader", p.seniorLeader, { type: "checkbox" }) +
      field("Visible on website", "visible", p.visible !== false, { type: "checkbox" }) +
      field("Display order", "sortOrder", p.sortOrder != null ? p.sortOrder : 10, { type: "number" })
    );
  }

  function buildMinistryForm(p) {
    return (
      buildImageForm({ imageUrl: p.imageUrl || "", altText: p.name || "Ministry image", focal: "center" }) +
      field("Ministry name", "name", p.name || "") +
      field("Short summary", "summary", p.summary || "", { type: "textarea", rows: 2 }) +
      field("Full description", "description", p.description || "", { type: "textarea", rows: 4 }) +
      field("Meeting schedule", "meetingDay", p.meetingDay || "") +
      field("Intended audience", "audience", p.audience || "") +
      field("Ministry leader", "leaderName", p.leaderName || "") +
      field("Contact email", "contactEmail", p.contactEmail || "", { type: "email" }) +
      field("Learn more / Join link", "joinUrl", p.joinUrl || "") +
      field("Featured", "featured", p.featured, { type: "checkbox" }) +
      field("Visible on website", "visible", p.visible !== false, { type: "checkbox" }) +
      field("Display order", "sortOrder", p.sortOrder != null ? p.sortOrder : 10, { type: "number" })
    );
  }

  function buildEventForm(p) {
    var starts = p.startsAt ? String(p.startsAt) : "";
    var date = "";
    var startTime = "";
    if (starts) {
      var d = new Date(starts);
      if (!Number.isNaN(d.getTime())) {
        date = d.toISOString().slice(0, 10);
        startTime = d.toISOString().slice(11, 16);
      }
    }
    var endTime = "";
    if (p.endsAt) {
      var e = new Date(p.endsAt);
      if (!Number.isNaN(e.getTime())) endTime = e.toISOString().slice(11, 16);
    }
    return (
      buildImageForm({ imageUrl: p.imageUrl || "", altText: p.title || "Event image", focal: "center" }) +
      field("Event title", "title", p.title || "") +
      field("Date", "date", date, { type: "date" }) +
      field("Start time", "startTime", startTime, { type: "time" }) +
      field("End time (optional)", "endTime", endTime, { type: "time" }) +
      field("Location", "location", p.location || "") +
      field("Description", "description", p.summary || p.description || "", { type: "textarea", rows: 4 }) +
      field("Organizer", "organizer", p.organizer || "") +
      field("Registration URL", "registrationUrl", p.registrationUrl || "", { type: "url" }) +
      field("Timezone", "timezone", p.timezone || "UTC") +
      field("Featured", "featured", p.featured, { type: "checkbox" }) +
      field("Visible on website", "visible", p.visible !== false, { type: "checkbox" })
    );
  }

  function buildSermonForm(p) {
    var date = "";
    if (p.preachedAt) {
      var d = new Date(p.preachedAt);
      if (!Number.isNaN(d.getTime())) date = d.toISOString().slice(0, 10);
    }
    return (
      buildImageForm({
        imageUrl: p.imageUrl || p.thumbnailUrl || "",
        altText: p.title || "Sermon thumbnail",
        focal: "center",
      }) +
      field("Sermon title", "title", p.title || "") +
      field("Speaker", "speakerName", p.speakerName || "") +
      field("Date", "date", date, { type: "date" }) +
      field("Scripture reference", "scripture", p.scripture || "") +
      field("Series", "series", p.series || p.category || "") +
      field("Description", "description", p.summary || "", { type: "textarea", rows: 4 }) +
      field("Audio or video URL", "mediaUrl", p.mediaUrl || "", { type: "url" }) +
      '<p class="bb-tp-se-hint">YouTube/Vimeo for video, or https / media path for audio. File upload for video is not supported.</p>' +
      field("Featured", "featured", p.featured, { type: "checkbox" }) +
      field("Visible on website", "visible", p.visible !== false, { type: "checkbox" })
    );
  }

  function buildGivingMethodForm(p) {
    return (
      field("Method type", "methodType", p.methodType || "bank_transfer", {
        type: "select",
        options: [
          { value: "bank_transfer", label: "Bank transfer" },
          { value: "mobile_money", label: "Mobile money" },
          { value: "cash", label: "In person / cash" },
          { value: "online", label: "External / online" },
          { value: "other", label: "Other" },
        ],
      }) +
      field("Method name", "label", p.label || "") +
      field("Description", "description", p.description || "", { type: "textarea", rows: 2 }) +
      field("Payment / account details", "accountDetails", p.accountDetails || "", {
        type: "textarea",
        rows: 3,
      }) +
      field("Instructions", "instructions", p.instructions || "", { type: "textarea", rows: 3 }) +
      field("External payment URL", "externalUrl", p.externalUrl || "", { type: "url" }) +
      field("Button label", "buttonLabel", p.buttonLabel || "Open published link") +
      field("QR image URL (optional)", "qrImageUrl", p.qrImageUrl || "") +
      '<p class="bb-tp-se-hint">Use an uploaded media path, demo image path, or https image URL for QR.</p>' +
      field("Visible on website", "visible", p.visible !== false, { type: "checkbox" }) +
      field("Display order", "sortOrder", p.sortOrder != null ? p.sortOrder : 10, { type: "number" })
    );
  }

  function buildSocialLinkForm(p) {
    return (
      field("Platform", "channelType", p.channelType || "facebook", {
        type: "select",
        options: [
          { value: "facebook", label: "Facebook" },
          { value: "instagram", label: "Instagram" },
          { value: "youtube", label: "YouTube" },
          { value: "twitter", label: "Twitter" },
          { value: "x", label: "X" },
          { value: "linkedin", label: "LinkedIn" },
          { value: "social", label: "Other" },
        ],
      }) +
      field("Display label", "label", p.label || "") +
      field("Profile URL (https)", "value", p.value || p.href || "", { type: "url" }) +
      field("Visible on website", "visible", p.visible !== false, { type: "checkbox" }) +
      field("Display order", "sortOrder", p.sortOrder != null ? p.sortOrder : 10, { type: "number" })
    );
  }

  function titleFor(kind) {
    return (
      {
        image: "Edit image",
        video: "Edit video",
        service_times: "Edit service times",
        leader: "Edit leadership member",
        ministry: "Edit ministry",
        event: "Edit event",
        sermon: "Edit sermon",
        giving_method: "Edit giving method",
        social_link: "Edit social link",
      }[kind] || "Edit"
    );
  }

  function renderForm(kind, payload) {
    if (kind === "image") return buildImageForm(payload);
    if (kind === "video") return buildVideoForm(payload);
    if (kind === "service_times") return buildServiceTimesForm(payload);
    if (kind === "leader") return buildLeaderForm(payload);
    if (kind === "ministry") return buildMinistryForm(payload);
    if (kind === "event") return buildEventForm(payload);
    if (kind === "sermon") return buildSermonForm(payload);
    if (kind === "giving_method") return buildGivingMethodForm(payload);
    if (kind === "social_link") return buildSocialLinkForm(payload);
    return "<p>Unsupported editor.</p>";
  }

  function readForm(kind, body) {
    function val(name) {
      var el = body.querySelector('[name="' + name + '"]');
      if (!el) return "";
      if (el.type === "checkbox") return el.checked;
      return el.value;
    }
    if (kind === "image") {
      return {
        imageUrl: val("imageUrl"),
        altText: val("altText"),
        focal: val("focal"),
        fit: "cover",
      };
    }
    if (kind === "video") {
      return {
        videoUrl: val("videoUrl"),
        title: val("title"),
        thumbnailUrl: val("thumbnailUrl"),
      };
    }
    if (kind === "service_times") {
      var countEl = body.querySelector("[data-bb-svc-count]");
      var count = Number(countEl ? countEl.getAttribute("data-bb-svc-count") : 0);
      var entries = [];
      for (var i = 0; i < count; i += 1) {
        if (!body.querySelector('[data-bb-svc-index="' + i + '"]')) continue;
        entries.push({
          id: "svc-" + (i + 1),
          name: val("name_" + i),
          day: val("day_" + i),
          startTime: val("startTime_" + i),
          endTime: val("endTime_" + i) || null,
          location: val("location_" + i) || null,
          campus: val("campus_" + i) || null,
          note: val("note_" + i) || null,
          temporaryNotice: val("note_" + i) || null,
          primary: Boolean(val("primary_" + i)),
          enabled: Boolean(val("enabled_" + i)),
          sortOrder: (i + 1) * 10,
        });
      }
      return { entries: entries };
    }
    if (kind === "leader") {
      return {
        displayName: val("displayName"),
        roleTitle: val("roleTitle"),
        biography: val("biography"),
        imageUrl: val("imageUrl"),
        email: val("email"),
        phone: val("phone"),
        socialUrl: val("socialUrl"),
        contactPublic: Boolean(val("contactPublic")),
        seniorLeader: Boolean(val("seniorLeader")),
        visible: Boolean(val("visible")),
        sortOrder: Number(val("sortOrder") || 10),
      };
    }
    if (kind === "ministry") {
      return {
        name: val("name"),
        summary: val("summary"),
        description: val("description"),
        meetingDay: val("meetingDay"),
        audience: val("audience"),
        leaderName: val("leaderName"),
        contactEmail: val("contactEmail"),
        joinUrl: val("joinUrl"),
        imageUrl: val("imageUrl"),
        featured: Boolean(val("featured")),
        visible: Boolean(val("visible")),
        sortOrder: Number(val("sortOrder") || 10),
      };
    }
    if (kind === "event") {
      return {
        title: val("title"),
        date: val("date"),
        startTime: val("startTime"),
        endTime: val("endTime"),
        location: val("location"),
        description: val("description"),
        organizer: val("organizer"),
        registrationUrl: val("registrationUrl"),
        timezone: val("timezone") || "UTC",
        imageUrl: val("imageUrl"),
        featured: Boolean(val("featured")),
        visible: Boolean(val("visible")),
      };
    }
    if (kind === "sermon") {
      return {
        title: val("title"),
        speakerName: val("speakerName"),
        date: val("date"),
        scripture: val("scripture"),
        series: val("series"),
        description: val("description"),
        mediaUrl: val("mediaUrl"),
        imageUrl: val("imageUrl"),
        featured: Boolean(val("featured")),
        visible: Boolean(val("visible")),
      };
    }
    if (kind === "giving_method") {
      return {
        methodType: val("methodType") || "other",
        label: val("label"),
        description: val("description"),
        accountDetails: val("accountDetails"),
        instructions: val("instructions"),
        externalUrl: val("externalUrl"),
        buttonLabel: val("buttonLabel"),
        qrImageUrl: val("qrImageUrl") || val("imageUrl"),
        visible: Boolean(val("visible")),
        sortOrder: Number(val("sortOrder") || 10),
      };
    }
    if (kind === "social_link") {
      return {
        channelType: val("channelType") || "social",
        label: val("label"),
        value: val("value"),
        visible: Boolean(val("visible")),
        sortOrder: Number(val("sortOrder") || 10),
      };
    }
    return {};
  }

  function openEditor(cfg) {
    host = $("[data-bb-structured-editor='1']");
    if (!host) return;
    lastFocus = document.activeElement;
    current = {
      kind: cfg.kind,
      entityKey: cfg.entityKey || "default",
      sectionKey: cfg.sectionKey || "",
      pageKey: host.getAttribute("data-bb-page-key") || "",
      previousPayload: cfg.payload || {},
      op: cfg.op || "upsert",
      baselineJson: JSON.stringify(cfg.payload || {}),
    };
    $("[data-bb-structured-body='1']", host).innerHTML = renderForm(current.kind, cfg.payload || {});
    $("#bb-tp-structured-editor-title", host).textContent = titleFor(current.kind);
    setStatus("", "");
    host.hidden = false;
    document.body.classList.add("bb-tp-structured-open");
    document.body.style.overflow = "hidden";
    installFocusTrap();
    var first = host.querySelector("input, textarea, select, button");
    if (first) first.focus();
    if (window.BbWebsiteUnsavedGuard) {
      window.BbWebsiteUnsavedGuard.setActiveController({
        isDirty: function () {
          if (!host || host.hidden || !current) return false;
          var bodyEl = $("[data-bb-structured-body='1']", host);
          var now = readForm(current.kind, bodyEl);
          return JSON.stringify(now) !== String(current.baselineJson || "{}");
        },
        discard: function () {
          closeEditor();
        },
        save: function () {
          return post("save").then(function (result) {
            if (!result || !result.okHttp || !result.data || !result.data.ok) return false;
            closeEditor();
            return true;
          });
        },
      });
    }
  }

  function closeEditor() {
    if (!host) return;
    removeFocusTrap();
    host.hidden = true;
    document.body.classList.remove("bb-tp-structured-open");
    document.body.style.overflow = "";
    current = null;
    setStatus("", "");
    if (lastFocus && typeof lastFocus.focus === "function") lastFocus.focus();
    if (window.BbWebsiteUnsavedGuard) {
      window.BbWebsiteUnsavedGuard.clearActiveController();
    }
  }

  function post(action, payloadExtra) {
    if (!host || !current) return Promise.resolve();
    var saveUrl = host.getAttribute("data-bb-structured-save");
    var csrf = host.getAttribute("data-bb-csrf");
    var bodyEl = $("[data-bb-structured-body='1']", host);
    var payload = payloadExtra || readForm(current.kind, bodyEl);
    setStatus("Saving…", "pending");
    return fetch(saveUrl, {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-CSRF-Token": csrf,
      },
      body: JSON.stringify({
        _csrf: csrf,
        action: action || "save",
        draftKind: current.kind,
        pageKey: current.pageKey,
        sectionKey: current.sectionKey || null,
        entityKey: current.entityKey,
        op: current.op || "upsert",
        payload: payload,
        previousPayload: current.previousPayload || null,
      }),
    }).then(function (res) {
      return res.json().then(function (data) {
        return { okHttp: res.ok, data: data || {} };
      });
    });
  }

  function onSave() {
    post("save")
      .then(function (result) {
        if (!result.okHttp || !result.data.ok) {
          setStatus(
            (result.data && result.data.error) ||
              "Could not save. Your changes are still here — try again or cancel.",
            "error"
          );
          return;
        }
        if (result.data.published) {
          setStatus("Unexpected publish response blocked.", "error");
          return;
        }
        setStatus("Saved", "ok");
        window.setTimeout(function () {
          closeEditor();
          window.location.reload();
        }, 500);
      })
      .catch(function () {
        setStatus("Could not save. Your changes are still here — try again or cancel.", "error");
      });
  }

  function onCancel() {
    // Discard in-progress form only — do not mutate existing drafts.
    closeEditor();
  }

  function applySelectedMedia(url) {
    if (!host || !url) return;
    var input = host.querySelector('[name="imageUrl"]');
    if (input) input.value = url;
    host.querySelectorAll("[data-bb-se-preview], [data-bb-se-preview-mobile]").forEach(function (img) {
      img.src = url;
    });
  }

  function loadMediaLibrary() {
    if (!host) return;
    var panel = host.querySelector("[data-bb-se-library-panel='1']");
    var listUrl = host.getAttribute("data-bb-media-list");
    if (!panel || !listUrl) {
      setStatus("Media library is unavailable.", "error");
      return;
    }
    panel.hidden = false;
    panel.innerHTML = '<p class="bb-tp-se-hint">Loading library…</p>';
    fetch(listUrl + "?visibility=public&limit=24", {
      method: "GET",
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    })
      .then(function (res) {
        return res.json().then(function (data) {
          return { okHttp: res.ok, data: data || {} };
        });
      })
      .then(function (result) {
        if (!result.okHttp || !result.data.ok) {
          panel.innerHTML = '<p class="bb-tp-se-hint">Could not load media library.</p>';
          setStatus("Could not load media library.", "error");
          return;
        }
        var assets = (result.data.assets || []).filter(function (a) {
          return a && String(a.mimeType || "").indexOf("image/") === 0 && a.deliveryPath;
        });
        if (!assets.length) {
          panel.innerHTML =
            '<p class="bb-tp-se-hint">No uploaded images yet. Upload a photo or pick a demo image.</p>';
          return;
        }
        panel.innerHTML =
          '<p class="bb-tp-se-hint">Choose from your media library</p><div class="bb-tp-se-demos bb-tp-se-library-grid">' +
          assets
            .map(function (a) {
              return (
                '<button type="button" class="bb-tp-se-demo" data-bb-demo-url="' +
                esc(a.deliveryPath) +
                '"><img src="' +
                esc(a.deliveryPath) +
                '" alt="" width="72" height="54" loading="lazy" /><span>' +
                esc(a.originalFilename || "Image") +
                "</span></button>"
              );
            })
            .join("") +
          "</div>";
      })
      .catch(function () {
        panel.innerHTML = '<p class="bb-tp-se-hint">Could not load media library.</p>';
        setStatus("Could not load media library.", "error");
      });
  }

  function uploadFile(file) {
    if (!host || !file) return;
    var uploadUrl = host.getAttribute("data-bb-media-upload");
    var csrf = host.getAttribute("data-bb-csrf");
    var fd = new FormData();
    fd.append("file", file);
    fd.append("_csrf", csrf);
    setStatus("Uploading…", "pending");
    var progress = host.querySelector("[data-bb-upload-progress='1']");
    if (!progress) {
      progress = document.createElement("p");
      progress.className = "bb-tp-se-hint";
      progress.setAttribute("data-bb-upload-progress", "1");
      progress.setAttribute("role", "status");
      var bodyEl = $("[data-bb-structured-body='1']", host);
      if (bodyEl) bodyEl.insertBefore(progress, bodyEl.firstChild);
    }
    progress.hidden = false;
    progress.textContent = "Upload in progress…";
    fetch(uploadUrl, {
      method: "POST",
      credentials: "same-origin",
      headers: { "X-CSRF-Token": csrf, Accept: "application/json" },
      body: fd,
    })
      .then(function (res) {
        return res.json().then(function (data) {
          return { okHttp: res.ok, data: data || {} };
        });
      })
      .then(function (result) {
        if (!result.okHttp || !result.data.ok) {
          progress.textContent = "Upload failed — previous image kept.";
          setStatus(
            (result.data && result.data.reason) || "Upload failed. Previous image kept.",
            "error"
          );
          return;
        }
        var path = result.data.deliveryPath || "";
        applySelectedMedia(path);
        progress.textContent = "Upload complete — save draft to keep it.";
        setStatus("Upload ready — save draft to keep it.", "ok");
      })
      .catch(function () {
        progress.textContent = "Upload failed — previous image kept.";
        setStatus("Upload failed. Previous image kept.", "error");
      });
  }

  document.addEventListener("click", function (event) {
    var openBtn = event.target.closest("[data-bb-structured-open='1']");
    if (openBtn) {
      event.preventDefault();
      var payload = {};
      try {
        payload = JSON.parse((openBtn.getAttribute("data-bb-payload") || "{}").replace(/&quot;/g, '"'));
      } catch (e) {
        payload = {};
      }
      openEditor({
        kind: openBtn.getAttribute("data-bb-kind"),
        entityKey: openBtn.getAttribute("data-bb-entity") || "default",
        sectionKey: openBtn.getAttribute("data-bb-section") || "",
        payload: payload,
        op: openBtn.getAttribute("data-bb-op") || "upsert",
      });
      return;
    }

    if (!host || host.hidden) return;

    if (event.target.closest("[data-bb-structured-dismiss='1'], [data-bb-structured-cancel='1']")) {
      event.preventDefault();
      onCancel();
      return;
    }
    if (event.target.closest("[data-bb-structured-save='1']")) {
      event.preventDefault();
      onSave();
      return;
    }
    var demo = event.target.closest("[data-bb-demo-url]");
    if (demo) {
      event.preventDefault();
      var url = demo.getAttribute("data-bb-demo-url");
      applySelectedMedia(url);
      return;
    }
    if (event.target.closest("[data-bb-se-library='1']")) {
      event.preventDefault();
      loadMediaLibrary();
      return;
    }
    if (event.target.closest("[data-bb-se-remove-media='1']")) {
      event.preventDefault();
      ["imageUrl", "videoUrl", "thumbnailUrl"].forEach(function (n) {
        var el = host.querySelector('[name="' + n + '"]');
        if (el) el.value = "";
      });
      host.querySelectorAll("[data-bb-se-preview], [data-bb-se-preview-mobile]").forEach(function (img) {
        img.removeAttribute("src");
      });
      return;
    }
    if (event.target.closest("[data-bb-svc-add='1']") && current && current.kind === "service_times") {
      event.preventDefault();
      var body = $("[data-bb-structured-body='1']", host);
      var payload = readForm("service_times", body);
      payload.entries.push({
        id: "svc-new",
        name: "",
        day: "sunday",
        startTime: "10:00",
        endTime: "",
        location: "",
        note: "",
        enabled: true,
        primary: false,
        sortOrder: (payload.entries.length + 1) * 10,
      });
      body.innerHTML = buildServiceTimesForm(payload);
      return;
    }
    var moveBtn = event.target.closest("[data-bb-svc-up], [data-bb-svc-down]");
    if (moveBtn && current && current.kind === "service_times") {
      event.preventDefault();
      var moveBody = $("[data-bb-structured-body='1']", host);
      var movePayload = readForm("service_times", moveBody);
      var from = Number(
        moveBtn.getAttribute("data-bb-svc-up") != null
          ? moveBtn.getAttribute("data-bb-svc-up")
          : moveBtn.getAttribute("data-bb-svc-down")
      );
      var to = moveBtn.hasAttribute("data-bb-svc-up") ? from - 1 : from + 1;
      if (
        Number.isNaN(from) ||
        to < 0 ||
        to >= movePayload.entries.length ||
        from < 0 ||
        from >= movePayload.entries.length
      ) {
        return;
      }
      var swapped = movePayload.entries[from];
      movePayload.entries[from] = movePayload.entries[to];
      movePayload.entries[to] = swapped;
      movePayload.entries.forEach(function (entry, idx) {
        entry.sortOrder = (idx + 1) * 10;
      });
      moveBody.innerHTML = buildServiceTimesForm(movePayload);
      return;
    }
    var rm = event.target.closest("[data-bb-svc-remove]");
    if (rm && current && current.kind === "service_times") {
      event.preventDefault();
      if (!window.confirm("Remove this service time from the draft?")) return;
      var idx = Number(rm.getAttribute("data-bb-svc-remove"));
      var body2 = $("[data-bb-structured-body='1']", host);
      var payload2 = readForm("service_times", body2);
      payload2.entries.splice(idx, 1);
      body2.innerHTML = buildServiceTimesForm(payload2);
    }
  });

  document.addEventListener("change", function (event) {
    var upload = event.target.closest("[data-bb-se-upload='1']");
    if (upload && upload.files && upload.files[0]) {
      uploadFile(upload.files[0]);
    }
  });

  document.addEventListener("keydown", function (event) {
    if (!host || host.hidden) return;
    if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
    }
  });
})();
