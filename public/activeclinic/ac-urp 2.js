/**
 * ActiveClinic Users / Roles / Permissions — assign form behaviour.
 * Scope/facility rules remain server-authoritative; this only mirrors the UI.
 */
(function () {
  function selectedRoleOption(form) {
    var select = form.querySelector("[data-ac-urp-role]");
    if (!select) return null;
    return select.options[select.selectedIndex] || null;
  }

  function parseScopes(option) {
    if (!option) return [];
    return String(option.getAttribute("data-scopes") || "")
      .split(",")
      .map(function (s) {
        return s.trim();
      })
      .filter(Boolean);
  }

  function syncAssignForm(form) {
    var option = selectedRoleOption(form);
    var scopes = parseScopes(option);
    var orgRadio = form.querySelector('input[name="scope_type"][value="organisation"]');
    var facRadio = form.querySelector('input[name="scope_type"][value="facility"]');
    var facilityWrap = form.querySelector("[data-ac-urp-facility]");
    var facilitySelect = form.querySelector("#facility_id");
    var warning = form.querySelector("[data-ac-urp-scope-warning]");
    var orgOnly = scopes.length === 1 && scopes[0] === "organisation";
    var facOnly = scopes.length === 1 && scopes[0] === "facility";

    if (orgRadio) {
      orgRadio.disabled = facOnly;
      var orgCard = orgRadio.closest(".ac-urp-scope-card");
      if (orgCard) orgCard.style.opacity = facOnly ? "0.55" : "";
    }
    if (facRadio) {
      facRadio.disabled = orgOnly;
      var facCard = facRadio.closest(".ac-urp-scope-card");
      if (facCard) facCard.style.opacity = orgOnly ? "0.55" : "";
    }

    if (orgOnly && orgRadio) orgRadio.checked = true;
    if (facOnly && facRadio) facRadio.checked = true;

    var checked = form.querySelector('input[name="scope_type"]:checked');
    var scope = checked ? checked.value : "";
    var showFacility = scope === "facility" && !orgOnly;
    if (facilityWrap) {
      facilityWrap.hidden = !showFacility;
      if (facilitySelect) facilitySelect.disabled = !showFacility;
    }
    if (warning) {
      var invalid = (orgOnly && scope === "facility") || (facOnly && scope === "organisation");
      warning.hidden = !invalid;
    }
  }

  function bind(form) {
    form.addEventListener("change", function () {
      syncAssignForm(form);
    });
    syncAssignForm(form);
  }

  document.querySelectorAll("[data-ac-urp-assign]").forEach(bind);
})();
