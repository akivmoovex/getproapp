/**
 * Collection + boolean website editor for ActiveClinic (FAQ, menu visibility).
 * Saves through the existing drafts API. Never publishes.
 */
(function () {
  var chrome = document.querySelector("[data-website-chrome]");
  if (!chrome) return;
  var saveUrl = chrome.getAttribute("data-website-save-url") || "";
  if (!saveUrl) return;
  var csrf = document.querySelector('meta[name="csrf-token"]');
  var csrfField = "_csrf";
  var csrfToken = csrf ? csrf.getAttribute("content") : "";

  function postJson(body) {
    var data = {};
    data[csrfField] = csrfToken;
    Object.keys(body || {}).forEach(function (k) {
      data[k] = body[k];
    });
    return fetch(saveUrl, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(data),
    }).then(function (res) {
      return res.json().then(function (out) {
        out = out || {};
        out.httpStatus = res.status;
        return out;
      });
    });
  }

  function setStatus(root, message, isError) {
    var slot = root.querySelector("[data-website-collection-status]");
    if (!slot) return;
    slot.textContent = message || "";
    slot.classList.toggle("is-error", Boolean(isError));
  }

  function readItems(root) {
    return Array.prototype.map.call(root.querySelectorAll("[data-website-collection-item]"), function (row) {
      var question = row.querySelector('[data-website-item-field="question"]');
      var answer = row.querySelector('[data-website-item-field="answer"]');
      return {
        question: question ? String(question.value || "").trim() : "",
        answer: answer ? String(answer.value || "").trim() : "",
      };
    }).filter(function (item) {
      return item.question || item.answer;
    });
  }

  function saveCollection(root) {
    setStatus(root, "Saving…", false);
    return postJson({
      contentKey: root.getAttribute("data-website-collection-key"),
      value: readItems(root),
    }).then(function (out) {
      if (out && out.ok && out.published === true) {
        setStatus(root, "Save must not publish. Draft was not applied as live.", true);
        return out;
      }
      if (out && out.ok) {
        setStatus(root, "Saved to draft.", false);
        return out;
      }
      setStatus(root, (out && (out.reason || out.code)) || "Could not save.", true);
      return out;
    }).catch(function () {
      setStatus(root, "Could not save.", true);
    });
  }

  document.querySelectorAll("[data-website-collection]").forEach(function (root) {
    root.addEventListener("click", function (ev) {
      var add = ev.target.closest("[data-website-collection-add]");
      var remove = ev.target.closest("[data-website-collection-remove]");
      var saveItem = ev.target.closest("[data-website-collection-save-item]");
      var move = ev.target.closest("[data-website-collection-move]");
      if (add) {
        ev.preventDefault();
        var list = root.querySelector("[data-website-collection-list]");
        var first = root.querySelector("[data-website-collection-item]");
        var row;
        if (first) {
          row = first.cloneNode(true);
          row.querySelectorAll("input, textarea").forEach(function (el) {
            el.value = "";
          });
        } else {
          row = document.createElement("li");
          row.className = "ac-website-collection__item";
          row.setAttribute("data-website-collection-item", "1");
          row.innerHTML =
            '<div class="ac-website-collection__fields">' +
            '<label><span>Question</span><input type="text" maxlength="200" data-website-item-field="question"/></label>' +
            '<label><span>Answer</span><textarea rows="3" maxlength="2000" data-website-item-field="answer"></textarea></label>' +
            "</div>" +
            '<div class="ac-website-collection__item-actions">' +
            '<button type="button" class="ac-btn ac-btn--ghost" data-website-collection-save-item="1">Save</button>' +
            '<button type="button" class="ac-btn ac-btn--ghost" data-website-collection-move="up">Up</button>' +
            '<button type="button" class="ac-btn ac-btn--ghost" data-website-collection-move="down">Down</button>' +
            '<button type="button" class="ac-btn ac-btn--ghost" data-website-collection-remove="1">Remove</button>' +
            "</div>";
        }
        if (list) list.appendChild(row);
        return;
      }
      if (remove) {
        ev.preventDefault();
        var item = remove.closest("[data-website-collection-item]");
        if (item && item.parentNode) item.parentNode.removeChild(item);
        saveCollection(root);
        return;
      }
      if (saveItem) {
        ev.preventDefault();
        saveCollection(root);
        return;
      }
      if (move) {
        ev.preventDefault();
        var current = move.closest("[data-website-collection-item]");
        if (!current || !current.parentNode) return;
        if (move.getAttribute("data-website-collection-move") === "up" && current.previousElementSibling) {
          current.parentNode.insertBefore(current, current.previousElementSibling);
        } else if (move.getAttribute("data-website-collection-move") === "down" && current.nextElementSibling) {
          current.parentNode.insertBefore(current.nextElementSibling, current);
        }
        saveCollection(root);
      }
    });
  });

  document.querySelectorAll("[data-website-boolean]").forEach(function (input) {
    input.addEventListener("change", function () {
      postJson({
        contentKey: input.getAttribute("data-website-key"),
        value: input.checked,
      });
    });
  });
})();
