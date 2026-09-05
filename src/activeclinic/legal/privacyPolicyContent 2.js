"use strict";

/**
 * ActiveClinic Privacy Policy — operational draft.
 * Does not claim certifications the product does not possess.
 */

const { getLegalMetadata, buildPublicContactInstructions } = require("./legalMetadata");

function buildPrivacyPolicyContent() {
  const meta = getLegalMetadata();
  const contactHtml = buildPublicContactInstructions(meta);

  const sections = [
    {
      id: "information-collected",
      number: "1",
      title: "Information Collected",
      html: `
<p>Depending on how the service is used, ActiveClinic may process:</p>
<ul>
  <li>Clinic registration details such as clinic name, contact name, email, phone, location, and optional notes.</li>
  <li>Administrator account details used to sign in.</li>
  <li>Staff, role, and facility information entered by the clinic.</li>
  <li>Patient and clinical information entered by authorized clinic users in the authenticated application.</li>
  <li>Public website content a clinic chooses to publish.</li>
  <li>Technical data such as IP address, browser and device information, timestamps, request identifiers, and security logs.</li>
</ul>
<p>ActiveClinic does not require extra personal information solely to record Terms acceptance beyond the registration association, Terms version, and acceptance time.</p>`,
    },
    {
      id: "registration-data",
      number: "2",
      title: "Account and Clinic Registration Data",
      html: `
<p>When you register a clinic, we store the details you submit so we can create the organisation and administrator account, prevent duplicate registrations, communicate about the account, and keep an audit of Terms of Service acceptance (version and timestamp) linked to that registration.</p>
<p>Passwords are stored as one-way hashes, not in recoverable form.</p>`,
    },
    {
      id: "clinical-roles",
      number: "3",
      title: "Patient and Clinical Data Roles",
      html: `
<p>Clinics decide which patient and clinical information to enter and which staff may access it. Clinical records are not published on public clinic websites.</p>
<p>ActiveClinic provides the software used to store and process that information for the clinic. Formal legal roles (for example controller or processor) depend on jurisdiction and contract and are subject to legal review. This policy does not claim ISO, HIPAA, or other certifications that are not independently confirmed.</p>`,
    },
    {
      id: "purposes",
      number: "4",
      title: "Purposes of Processing",
      html: `
<p>Information may be used to operate the platform; create and administer clinic organisations; authenticate users; provide unpublished and published clinic websites; support booking requests where enabled; protect accounts; prevent fraud and abuse; diagnose errors; maintain audit trails; send service communications; and comply with legal obligations.</p>
<p>ActiveClinic does not use public marketing pages for targeted third-party advertising.</p>`,
    },
    {
      id: "service-providers",
      number: "5",
      title: "Service Providers",
      html: `
<p>Hosting, databases, email delivery, storage, security, and similar infrastructure providers may process information on behalf of the platform. Vendor names are not listed on this page unless confirmed for publication.</p>
<p>If a clinic enables a third-party integration, that provider’s privacy terms apply to the integrated function.</p>`,
    },
    {
      id: "security",
      number: "6",
      title: "Security",
      html: `
<p>Access to authenticated clinic tools requires sign-in. Role-based permissions, CSRF protection on forms, hashed passwords, and transport encryption (HTTPS on public hosts) are used to protect the service.</p>
<p>No method of transmission or storage is completely secure. Clinics should use strong unique passwords and limit staff access.</p>`,
    },
    {
      id: "retention",
      number: "7",
      title: "Retention",
      html: `
<p>Registration, account, and operational records are retained while the clinic account is active and for a further period needed for security, dispute, or legal obligations. Specific retention schedules by record type are pending owner confirmation and are not invented here.</p>
<p>Public website content remains published until the clinic unpublishes it or the account is closed.</p>`,
    },
    {
      id: "rights",
      number: "8",
      title: "Data Subject Rights",
      html: `
<p>Depending on applicable law, individuals may have rights to access, correct, delete, or restrict certain information, or to object to certain processing. Clinic-managed patient records should usually be requested from the clinic first.</p>
<p>Requests about platform account data may use the contact routes below. A named data protection officer and supervisory authority are not listed pending confirmation.</p>`,
    },
    {
      id: "international",
      number: "9",
      title: "International Processing and Transfers",
      html: `
<p>Information may be hosted or processed in countries different from the user’s country, depending on infrastructure used to operate the service.</p>
<p>Specific data-centre locations and transfer mechanisms are not listed on this page unless confirmed for publication.</p>`,
    },
    {
      id: "cookies",
      number: "10",
      title: "Cookies and Session Information",
      html: `
<p>ActiveClinic uses essential cookies and related mechanisms required for security and signed-in sessions. Cookie names follow the deployment profile and typically include a session cookie (for example <code>activeclinic_org_sid</code>) and a CSRF cookie (for example <code>activeclinic_org_csrf</code>).</p>
<p>These cookies are necessary for core functionality and are not used for advertising. Public ActiveClinic pages do not load third-party advertising analytics trackers. Fonts may be loaded from Google Fonts to display typography.</p>`,
    },
    {
      id: "contact",
      number: "11",
      title: "Contact",
      html: `<p>${contactHtml}</p>`,
    },
    {
      id: "changes",
      number: "12",
      title: "Policy Changes",
      html: `
<p>This Privacy Policy may be updated. The version and effective date appear at the top of this page. The current Privacy Policy version is <code>${meta.privacyVersion}</code>.</p>`,
    },
    {
      id: "effective-date",
      number: "13",
      title: "Effective Date and Version",
      html: `
<p>Effective date: ${meta.effectiveDateDisplay}. Document version: <code>${meta.privacyVersion}</code>.</p>
<p>${meta.draftBanner}</p>`,
    },
  ];

  return {
    title: "Privacy Policy",
    intro:
      "This Privacy Policy describes how ActiveClinic processes information when people use the public website, clinic registration, clinic websites, and authenticated clinic tools.",
    draftBanner: meta.draftBanner,
    effectiveDateIso: meta.effectiveDateIso,
    effectiveDateDisplay: meta.effectiveDateDisplay,
    documentVersion: meta.privacyVersion,
    sections,
  };
}

module.exports = {
  buildPrivacyPolicyContent,
};
