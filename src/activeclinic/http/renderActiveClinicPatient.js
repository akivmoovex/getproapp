"use strict";

/**
 * Render patient portal views (AC-V6-P27).
 */

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderPatientView(viewPath, data) {
  const d = data || {};
  const csrfToken = escapeHtml(d.csrfToken || "");
  const csrfField = d.csrfField || "_csrf";
  const clinicKey = escapeHtml(d.clinicKey || "");
  const patientAuth = d.patientAuth || {};
  const patient = patientAuth.patient || {};
  const displayName = patient.preferredName || patient.firstName || "Patient";

  const nav = patientAuth.authenticated
    ? `<nav data-ac-shell="patient">
<a href="/clinics/${clinicKey}/patient">Dashboard</a>
<a href="/clinics/${clinicKey}/patient/bookings">My Bookings</a>
<a href="/clinics/${clinicKey}/patient/profile">Profile</a>
<a href="/clinics/${clinicKey}/patient/security">Security</a>
<form method="POST" action="/clinics/${clinicKey}/patient/logout" style="display:inline;">
<input type="hidden" name="${csrfField}" value="${csrfToken}"/>
<button type="submit">Sign out</button>
</form>
</nav>`
    : "";

  let content = "";
  switch (viewPath) {
    case "patient/login":
      content = `<h1>Patient Portal Sign In</h1>
<form method="POST" action="/clinics/${clinicKey}/patient/login">
<input type="hidden" name="${csrfField}" value="${csrfToken}"/>
${d.error ? `<p style="color:red;">${escapeHtml(d.error)}</p>` : ""}
<label>Phone or Email: <input type="text" name="identifier" required/></label><br/>
<label>Password: <input type="password" name="password" required/></label><br/>
<button type="submit">Sign in</button>
</form>
<p><a href="/clinics/${clinicKey}/patient/register">Register for patient portal</a></p>
<p><a href="/clinics/${clinicKey}/patient/forgot-password">Forgot password?</a></p>`;
      break;

    case "patient/register":
      content = `<h1>Register for Patient Portal</h1>
<form method="POST" action="/clinics/${clinicKey}/patient/register">
<input type="hidden" name="${csrfField}" value="${csrfToken}"/>
${d.error ? `<p style="color:red;">${escapeHtml(d.error)}</p>` : ""}
<p>If you have a guest booking token, enter it below. Otherwise, enter your details to match your patient record.</p>
<label>Guest Token (optional): <input type="text" name="guestToken"/></label><br/>
<label>Phone: <input type="tel" name="phone" required/></label><br/>
<label>Email (optional): <input type="email" name="email"/></label><br/>
<label>First Name: <input type="text" name="firstName"/></label><br/>
<label>Last Name: <input type="text" name="lastName"/></label><br/>
<label>Password (min 8 chars): <input type="password" name="password" required/></label><br/>
<button type="submit">Register</button>
</form>
<p><a href="/clinics/${clinicKey}/patient/login">Already have an account? Sign in</a></p>`;
      break;

    case "patient/forgot-password":
      content = `<h1>Reset Password</h1>
<form method="POST" action="/clinics/${clinicKey}/patient/forgot-password">
<input type="hidden" name="${csrfField}" value="${csrfToken}"/>
${d.error ? `<p style="color:red;">${escapeHtml(d.error)}</p>` : ""}
${d.success ? `<p style="color:green;">${escapeHtml(d.success)}</p>` : ""}
<label>Phone or Email: <input type="text" name="identifier" required/></label><br/>
<button type="submit">Request reset</button>
</form>
<p><strong>Note:</strong> Password reset delivery is currently unavailable. Please contact the clinic directly.</p>
<p><a href="/clinics/${clinicKey}/patient/login">Back to sign in</a></p>`;
      break;

    case "patient/reset-password":
      content = `<h1>Reset Your Password</h1>
<form method="POST" action="/clinics/${clinicKey}/patient/reset-password">
<input type="hidden" name="${csrfField}" value="${csrfToken}"/>
<input type="hidden" name="token" value="${escapeHtml(d.token || "")}"/>
${d.error ? `<p style="color:red;">${escapeHtml(d.error)}</p>` : ""}
<label>New Password (min 8 chars): <input type="password" name="newPassword" required/></label><br/>
<button type="submit">Reset password</button>
</form>`;
      break;

    case "patient/password-updated":
      content = `<h1>Password Updated</h1>
<p>Your password has been changed successfully.</p>
<p><a href="/clinics/${clinicKey}/patient/login">Sign in with your new password</a></p>`;
      break;

    case "patient/dashboard":
      {
        const upcoming = d.upcoming || [];
        const pending = d.pending || [];
        const past = d.past || [];
        const section = (title, items) => {
          if (!items.length) return `<section><h2>${title}</h2><p>None.</p></section>`;
          const lis = items
            .map((b) => {
              const ref = escapeHtml(b.requestNumber || b.id);
              return `<li><a href="/clinics/${clinicKey}/patient/bookings/${ref}">${ref}</a> — ${escapeHtml(b.status || "")}</li>`;
            })
            .join("");
          return `<section><h2>${title}</h2><ul>${lis}</ul></section>`;
        };
        content = `<h1>Welcome, ${escapeHtml(displayName)}</h1>
<p>Patient Number: ${escapeHtml(patient.patientNumber || "")}</p>
${section("Pending requests", pending)}
${section("Upcoming", upcoming)}
${section("Past", past)}
<p><a href="/clinics/${clinicKey}/patient/bookings">View all bookings</a></p>
<p><a href="/clinics/${clinicKey}/patient/profile">Update my profile</a></p>`;
      }
      break;

    case "patient/bookings":
      const bookings = d.bookings || [];
      const rows = bookings.map((b) => {
        const ref = escapeHtml(b.requestNumber || b.id);
        const status = escapeHtml(b.status || "");
        const kind = escapeHtml(b.bookingKind || "");
        return `<tr><td><a href="/clinics/${clinicKey}/patient/bookings/${ref}">${ref}</a></td><td>${kind}</td><td>${status}</td></tr>`;
      }).join("");
      content = `<h1>My Bookings</h1>
${bookings.length === 0 ? "<p>No bookings found.</p>" : `<table><tr><th>Reference</th><th>Type</th><th>Status</th></tr>${rows}</table>`}
<p><a href="/clinics/${clinicKey}/patient">Back to dashboard</a></p>`;
      break;

    case "patient/booking-detail":
      const b = d.booking || {};
      content = `<h1>Booking ${escapeHtml(b.requestNumber || b.id)}</h1>
<p>Status: ${escapeHtml(b.status || "")}</p>
<p>Type: ${escapeHtml(b.bookingKind || "")}</p>
<p>Facility: ${escapeHtml(b.facilityDisplayName || "")}</p>
${b.serviceDisplayName ? `<p>Service: ${escapeHtml(b.serviceDisplayName)}</p>` : ""}
${b.procedureDisplayName ? `<p>Procedure: ${escapeHtml(b.procedureDisplayName)}</p>` : ""}
${b.staffDisplayName ? `<p>Provider: ${escapeHtml(b.staffDisplayName)}</p>` : ""}
${b.visitReason ? `<p>Reason: ${escapeHtml(b.visitReason)}</p>` : ""}
${
  ["submitted_pending_confirmation", "confirmed"].includes(b.status)
    ? `<form method="POST" action="/clinics/${clinicKey}/patient/bookings/${escapeHtml(b.requestNumber || b.id)}/cancel" style="display:inline;">
<input type="hidden" name="${csrfField}" value="${csrfToken}"/>
<button type="submit">Request cancellation</button>
</form>
<form method="POST" action="/clinics/${clinicKey}/patient/bookings/${escapeHtml(b.requestNumber || b.id)}/reschedule" style="display:inline;">
<input type="hidden" name="${csrfField}" value="${csrfToken}"/>
<button type="submit">Request reschedule</button>
</form>`
    : ""
}
<p><a href="/clinics/${clinicKey}/patient/bookings">Back to bookings</a></p>`;
      break;

    case "patient/profile":
      const profile = d.profile || patient;
      content = `<h1>My Profile</h1>
<form method="POST" action="/clinics/${clinicKey}/patient/profile">
<input type="hidden" name="${csrfField}" value="${csrfToken}"/>
${d.error ? `<p style="color:red;">${escapeHtml(d.error)}</p>` : ""}
${d.success ? `<p style="color:green;">${escapeHtml(d.success)}</p>` : ""}
<p><strong>Name:</strong> ${escapeHtml(profile.firstName || "")} ${escapeHtml(profile.lastName || "")} (cannot be changed)</p>
<label>Preferred Name: <input type="text" name="preferredName" value="${escapeHtml(profile.preferredName || "")}"/></label><br/>
<label>Phone: <input type="tel" name="phone" value="${escapeHtml(profile.phoneDisplay || "")}"/></label><br/>
<label>Email: <input type="email" name="email" value="${escapeHtml(profile.emailDisplay || "")}"/></label><br/>
<label>Address Line 1: <input type="text" name="addressLine1" value="${escapeHtml(profile.addressLine1 || "")}"/></label><br/>
<label>Address Line 2: <input type="text" name="addressLine2" value="${escapeHtml(profile.addressLine2 || "")}"/></label><br/>
<label>City: <input type="text" name="addressCity" value="${escapeHtml(profile.addressCity || "")}"/></label><br/>
<label>Province: <input type="text" name="addressProvince" value="${escapeHtml(profile.addressProvince || "")}"/></label><br/>
<button type="submit">Update profile</button>
</form>
<p><a href="/clinics/${clinicKey}/patient">Back to dashboard</a></p>`;
      break;

    case "patient/security":
      content = `<h1>Security Settings</h1>
<h2>Change Password</h2>
<form method="POST" action="/clinics/${clinicKey}/patient/security">
<input type="hidden" name="${csrfField}" value="${csrfToken}"/>
${d.error ? `<p style="color:red;">${escapeHtml(d.error)}</p>` : ""}
${d.success ? `<p style="color:green;">${escapeHtml(d.success)}</p>` : ""}
<label>Current Password: <input type="password" name="currentPassword" required/></label><br/>
<label>New Password (min 8 chars): <input type="password" name="newPassword" required/></label><br/>
<button type="submit">Change password</button>
</form>
<p><a href="/clinics/${clinicKey}/patient">Back to dashboard</a></p>`;
      break;

    case "patient/notifications":
      content = `<h1>Notifications</h1>
<p><strong>Note:</strong> Email and SMS notifications are currently unavailable. Please check your patient portal regularly for updates.</p>
<p>The clinic will contact you directly by phone if urgent communication is needed.</p>
<p><a href="/clinics/${clinicKey}/patient">Back to dashboard</a></p>`;
      break;

    default:
      content = `<h1>Not Found</h1><p>Page not found.</p>`;
  }

  return `<!DOCTYPE html>
<html lang="en" data-ac-shell="patient">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Patient Portal - ActiveClinic</title>
<link rel="stylesheet" href="/activeclinic/ac-patient.css"/>
</head>
<body>
${nav}
<main>${content}</main>
<script src="/activeclinic/ac-patient.js"></script>
</body>
</html>`;
}

module.exports = {
  renderPatientView,
};
