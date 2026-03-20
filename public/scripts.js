async function submitLeadForm(e) {
  e.preventDefault();
  const form = e.target;
  const statusEl = document.getElementById("lead_status");
  const submitBtn = form.querySelector("button[type=submit]");

  if (submitBtn) submitBtn.disabled = true;
  if (statusEl) statusEl.textContent = "Sending...";

  const payload = Object.fromEntries(new FormData(form).entries());

  try {
    const resp = await fetch("/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      throw new Error(data.error || `Request failed (${resp.status})`);
    }

    if (statusEl) statusEl.textContent = "Thanks! Our team will contact you shortly.";
    form.reset();
  } catch (err) {
    if (statusEl) statusEl.textContent = err.message || "Something went wrong.";
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("lead_form");
  if (form) form.addEventListener("submit", submitLeadForm);
});

