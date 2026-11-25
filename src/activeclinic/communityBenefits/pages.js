"use strict";

function esc(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  }[char]));
}

function page(title, body) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)}</title>
  <style>
    body { font-family: "Hanken Grotesk", sans-serif; margin: 0; background: #f6f4ef; color: #1d1a16; }
    main { max-width: 40rem; margin: 0 auto; padding: 1.5rem; }
    h1 { font-size: 1.5rem; }
    form, section { background: #fff; border: 1px solid #e4ddd2; border-radius: 12px; padding: 1rem; margin: 0 0 1rem; }
    label { display: block; font-weight: 600; margin: 0.75rem 0 0.25rem; }
    input, select, button { font: inherit; }
    input, select { width: 100%; box-sizing: border-box; padding: 0.6rem; }
    button { background: #6C5CE7; color: #fff; border: 0; border-radius: 8px; padding: 0.7rem 1rem; margin-top: 0.8rem; }
    .error { color: #8a1f11; font-weight: 700; }
    .muted { color: #5c564e; }
    @media (max-width: 420px) { main { padding: 1rem; } h1 { font-size: 1.25rem; } }
  </style>
</head>
<body>
<main>
  <h1>${esc(title)}</h1>
  ${body}
</main>
</body>
</html>`;
}

function hidden(name, value) {
  return `<input type="hidden" name="${esc(name)}" value="${esc(value)}">`;
}

function enrollPage(vm) {
  return page("Community membership", `
    <form method="post" action="/app/community/enroll">
      ${hidden("csrf", vm.csrf)}
      <label for="display_name">Preferred name</label>
      <input id="display_name" name="display_name" required autocomplete="name">
      <button type="submit">Request enrollment</button>
    </form>
    ${vm.nextHref ? `<p><a href="${esc(vm.nextHref)}">Continue to community pass</a></p>` : ""}
    ${vm.message ? `<p class="${vm.error ? "error" : "muted"}" role="${vm.error ? "alert" : "status"}">${esc(vm.message)}</p>` : ""}
  `);
}

function passPage(vm) {
  return page("Community pass", `
    <section>
      <p>Status: <strong id="membership_status">${esc(vm.status || "none")}</strong></p>
      <p class="muted">This code is only a presentation credential. It is not a medical record and it does not apply a discount.</p>
      ${vm.token ? `<p>Fallback code <code id="fallback_code">${esc(vm.fallbackCode)}</code></p>
      <p id="pass_token" data-pass-token="${esc(vm.token)}">Show this code at reception.</p>` : `<p class="error" role="alert">${esc(vm.message || "No active pass.")}</p>`}
    </section>
    <form method="post" action="/app/community/pass">
      ${hidden("csrf", vm.csrf)}
      ${hidden("person_id", vm.personId)}
      <button type="submit">Issue pass</button>
    </form>
    <form method="post" action="/app/community/pass/rotate">
      ${hidden("csrf", vm.csrf)}
      ${hidden("person_id", vm.personId)}
      <button type="submit">Rotate pass</button>
    </form>
  `);
}

function checkInPage(vm) {
  return page("Community Check-in", `
    <p>Clinic <strong id="clinic_name">${esc(vm.clinicName)}</strong></p>
    <form method="post" action="/app/reception/community-check-in">
      ${hidden("csrf", vm.csrf)}
      <label for="clinic_id">Clinic</label>
      <select id="clinic_id" name="clinic_id">
        ${(vm.clinics || []).map((clinic) => `<option value="${esc(clinic.id)}"${clinic.id === vm.clinicId ? " selected" : ""}>${esc(clinic.name)}</option>`).join("")}
      </select>
      <label for="pass_code">QR or fallback code</label>
      <input id="pass_code" name="pass_code" autocomplete="off" inputmode="text">
      <label for="service_code">Service</label>
      <select id="service_code" name="service_code">
        <option value="consultation">Consultation</option>
        <option value="cosmetic">Cosmetic</option>
      </select>
      <label for="amount_minor">Quoted amount in ngwee</label>
      <input id="amount_minor" name="amount_minor" inputmode="numeric" value="100000">
      <label for="patient_id">Existing local patient</label>
      <input id="patient_id" name="patient_id" autocomplete="off">
      <label for="confirm_link"><input id="confirm_link" name="confirm_link" type="checkbox" value="yes"> I confirmed this is the same person</label>
      <button type="submit" name="action" value="preview">Check in</button>
      <button type="submit" name="action" value="cancel">Cancel</button>
    </form>
    ${vm.message ? `<p class="${vm.error ? "error" : "muted"}" id="checkin_result" role="${vm.error ? "alert" : "status"}">${esc(vm.message)}</p>` : ""}
    ${vm.disclosure ? `<p id="benefit_disclosure">${esc(vm.disclosure)}</p>` : ""}
    ${vm.decision ? `<p id="eligibility_decision">${esc(vm.decision)} ${esc(vm.reason || "")}</p>` : ""}
  `);
}

module.exports = {
  enrollPage,
  passPage,
  checkInPage,
};
