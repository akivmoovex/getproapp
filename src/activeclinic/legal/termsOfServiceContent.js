"use strict";

/**
 * ActiveClinic Terms of Service — operational draft sections.
 * Contact / jurisdiction use legalMetadata placeholders only.
 */

const { getLegalMetadata, buildPublicContactInstructions } = require("./legalMetadata");

function buildTermsOfServiceContent() {
  const meta = getLegalMetadata();
  const contactHtml = buildPublicContactInstructions(meta);
  const jurisdictionHtml = meta.pending.governingLawJurisdiction
    ? `<p>These Terms are governed by the laws of ${meta.pending.governingLawJurisdiction}, without regard to conflict-of-law principles, except where mandatory local consumer, healthcare, or privacy laws apply.</p>`
    : `<p>Governing law and dispute venue are <strong>pending owner and legal confirmation</strong> and are not stated as a specific jurisdiction on this page. Nothing in these Terms limits rights that cannot lawfully be limited in your location.</p>`;
  const liabilityHtml = meta.pending.liabilityCap
    ? `<p>To the extent permitted by law, ActiveClinic’s aggregate liability arising from these Terms is limited to ${meta.pending.liabilityCap}.</p>`
    : `<p>No monetary liability cap is stated on this page. Any limitation of liability is <strong>pending owner and legal confirmation</strong> and does not override rights that cannot lawfully be limited.</p>`;

  const sections = [
    {
      id: "about-activeclinic",
      number: "1",
      title: "About ActiveClinic",
      html: `
<p>ActiveClinic provides software and platform services that help clinics and healthcare organisations operate digitally. Depending on plan, configuration, region, and product availability, features may include public clinic websites, directory listings, appointment requests, staff operations, clinical and administrative workflows, and related tools.</p>
<p>${meta.platformTechnologyNote}</p>
<p>ActiveClinic itself is <strong>not</strong> the healthcare provider. It does not diagnose, treat, or care for patients. Clinics remain responsible for clinical decisions, diagnosis, treatment, and patient care.</p>`,
    },
    {
      id: "agreement",
      number: "2",
      title: "Agreement to the Terms",
      html: `
<p>By creating a clinic on ActiveClinic, signing in as an administrator or authorized staff member, or otherwise using the platform, you agree to these Terms of Service and acknowledge the <a href="/privacy">Privacy Policy</a>.</p>
<p>If you do not agree, do not register a clinic or use the service. Clinic registration creates the organisation and administrator account immediately when these Terms are accepted. A public clinic website is not published automatically.</p>`,
    },
    {
      id: "authority",
      number: "3",
      title: "Authority to Register a Clinic",
      html: `
<p>You must have authority to register and administer the clinic or healthcare organisation you name. You must provide accurate information. You must not impersonate another person or organisation, or register a clinic you are not authorized to represent.</p>
<p>If you are registering on behalf of an organisation, you confirm that you are permitted to bind that organisation to these Terms.</p>`,
    },
    {
      id: "administrator-responsibilities",
      number: "4",
      title: "Account and Administrator Responsibilities",
      html: `
<p>Clinic administrators are responsible for authorized staff access, including inviting, assigning, reviewing, and removing users and roles. Administrators must keep contact details current, protect sign-in credentials, and notify the clinic or the platform of suspected unauthorized access.</p>
<p>Users must not share privileged accounts. Clinics remain responsible for activity that occurs under their administrator and staff accounts.</p>`,
    },
    {
      id: "services",
      number: "5",
      title: "Description of ActiveClinic Services",
      html: `
<p>ActiveClinic provides software/platform services. Feature availability may differ by selected plan, organisation settings, enabled modules, and ongoing product development. Capabilities labelled Pilot or Planned on public pages are not live guarantees.</p>
<p>The platform may include unpublished clinic workspaces, optional public websites, directory listings when a clinic publishes, and authenticated operational tools. Public pages show only what a clinic chooses to publish.</p>`,
    },
    {
      id: "clinic-responsibilities",
      number: "6",
      title: "Clinic Responsibilities",
      html: `
<p>Clinics are responsible for the accuracy of information they enter, for complying with applicable healthcare, privacy, employment, and consumer laws, and for their own internal policies. Clinics decide what to publish publicly and must not publish clinical records or other patient information on public website pages.</p>
<p>Clinics remain responsible for how they use the software in their operations, including staff training and local regulatory obligations.</p>`,
    },
    {
      id: "clinical-responsibility",
      number: "7",
      title: "Healthcare and Clinical Responsibility",
      html: `
<p>ActiveClinic is not a hospital, clinic, doctor, or other healthcare provider. It does not provide medical advice, diagnosis, or treatment through these Terms or the public website.</p>
<p>Clinics remain responsible for clinical decisions, diagnosis, treatment, and patient care. Software outputs, forms, reminders, and records tools do not replace professional clinical judgement.</p>`,
    },
    {
      id: "patient-information",
      number: "8",
      title: "Patient and Health Information Responsibilities",
      html: `
<p>Patient and health information must only be accessed by authorized users for legitimate purposes related to care, clinic operations, or legal obligations. Clinical records are not public website content.</p>
<p>Clinics are responsible for granting only appropriate access, monitoring staff use, and handling patient information in accordance with applicable law and their own privacy notices.</p>`,
    },
    {
      id: "privacy-data",
      number: "9",
      title: "Data Protection and Privacy",
      html: `
<p>Please read our separate <a href="/privacy">Privacy Policy</a>.</p>
<p>Each clinic may act as the primary decision-maker regarding patient and staff information entered into its tenant account, while ActiveClinic may process that information to provide the service. Formal controller/processor classifications can vary by jurisdiction and arrangement and are subject to legal review.</p>`,
    },
    {
      id: "security",
      number: "10",
      title: "Account and Platform Security",
      html: `
<p>Users must protect passwords, not attempt unauthorized access, and use the service in a manner that does not compromise other organisations. ActiveClinic may suspend access where security issues, abuse, fraud, or unauthorized activity is suspected.</p>
<p>No security measure is perfect. Clinics should use strong unique passwords and promptly revoke access when staff leave.</p>`,
    },
    {
      id: "public-websites",
      number: "11",
      title: "Public Clinic Websites and Publishing",
      html: `
<p>A clinic website is <strong>not</strong> automatically published when the clinic is created. Administrators publish separately when they choose. Unpublished websites are not a public directory listing.</p>
<p>Clinics are responsible for information they publish publicly. Public content may be viewed and indexed by third parties. Do not publish clinical records, patient identifiers, or other non-public health information on public pages.</p>`,
    },
    {
      id: "appointments",
      number: "12",
      title: "Appointments and Patient-Facing Functions",
      html: `
<p>Where booking or appointment-request features are enabled, a patient request is not a confirmed appointment until the clinic confirms it according to its own processes. The platform does not guarantee real-time availability, automated SMS, or instant confirmation unless a specific integration is enabled and working.</p>
<p>Clinics remain responsible for how they manage appointments, waitlists, and patient communications.</p>`,
    },
    {
      id: "acceptable-use",
      number: "13",
      title: "Acceptable Use",
      html: `
<p>You must not use the service for unlawful purposes; harassment; fraud; impersonation; unauthorized access; malware; interference with the platform; mass unsolicited messaging; uploading content without permission; violating privacy or intellectual-property rights; scraping or extracting data without authorization; using another clinic’s tenant or data; or attempting to bypass role or subscription limits.</p>`,
    },
    {
      id: "plans-fees",
      number: "14",
      title: "Plans, Subscriptions and Fees",
      html: `
<p>Some services may be available on a free or trial basis. Paid features may require a subscription. Current plan descriptions, if published, appear on ActiveClinic public pages or in a separate order agreement.</p>
<p>Specific prices, billing cycles, refunds, and tax treatment are not invented on this page. If a paid plan is offered, those commercial terms will be shown at purchase or in a written agreement.</p>`,
    },
    {
      id: "availability",
      number: "15",
      title: "Availability, Maintenance and Changes",
      html: `
<p>The service may be unavailable during maintenance, failures, or circumstances beyond reasonable control. ActiveClinic may change, add, or remove features, provided this does not remove obligations that cannot legally be changed without notice where notice is required.</p>
<p>Pilot and planned capabilities may change before they become generally available.</p>`,
    },
    {
      id: "suspension",
      number: "16",
      title: "Suspension and Termination",
      html: `
<p>ActiveClinic may suspend or terminate access for material breach of these Terms, suspected fraud or abuse, security risk, non-payment where a paid plan applies, or as required by law. Clinics may stop using the service and request account closure through available administrative or onboarding channels.</p>
<p>After termination, public pages may be unpublished. Retention of remaining records is described in the Privacy Policy and any applicable legal holds.</p>`,
    },
    {
      id: "clinic-ip",
      number: "17",
      title: "Clinic Content and Intellectual Property",
      html: `
<p>Clinics and users retain ownership of content they upload, including logos, photos, service descriptions, and other clinic materials. ActiveClinic receives a limited permission to host, process, display, back up, and transmit that content only as needed to operate the service.</p>
<p>You must have the right to upload materials you provide. ActiveClinic may remove content that is unlawful, unsafe, abusive, technically harmful, or that violates these Terms.</p>`,
    },
    {
      id: "activeclinic-ip",
      number: "18",
      title: "ActiveClinic Intellectual Property",
      html: `
<p>The ActiveClinic name, software, design system, documentation, and platform content (other than clinic-uploaded materials) are owned by the operator of ActiveClinic or its licensors. You may not copy, reverse engineer, or redistribute the platform except as allowed by law or a written license.</p>
<p>${meta.platformTechnologyNote}</p>`,
    },
    {
      id: "third-parties",
      number: "19",
      title: "Third-Party Services and Integrations",
      html: `
<p>The service may rely on hosting, databases, email delivery, storage, fonts, or other infrastructure providers. If a clinic enables a third-party integration (for example messaging or payments), that provider’s terms apply to the integrated function.</p>
<p>Vendor names are not listed here unless confirmed for publication. ActiveClinic is not responsible for third-party services it does not control.</p>`,
    },
    {
      id: "disclaimers",
      number: "20",
      title: "Disclaimers",
      html: `
<p>The service is provided on an available basis. ActiveClinic does not warrant uninterrupted operation, error-free software, or that the platform will meet every clinical or regulatory requirement of every clinic.</p>
<p>Public directory and website content is supplied by clinics. ActiveClinic does not independently verify clinical quality, licensing, or outcomes of listed organisations.</p>`,
    },
    {
      id: "liability",
      number: "21",
      title: "Limitation of Liability",
      html: `
<p>To the extent permitted by applicable law, ActiveClinic is not liable for clinical outcomes, clinic-published content, or third-party actions.</p>
${liabilityHtml}
<p>Nothing in these Terms excludes liability that cannot legally be excluded, including for death or personal injury caused by negligence where such exclusion is prohibited.</p>`,
    },
    {
      id: "changes",
      number: "22",
      title: "Changes to These Terms",
      html: `
<p>These Terms may be updated. The Terms version and effective date appear at the top of this page. Material changes will be indicated by a new version date. Continued use after an update constitutes acceptance of the revised Terms where permitted by law.</p>
<p>The current Terms version is <code>${meta.termsVersion}</code>.</p>`,
    },
    {
      id: "governing-law",
      number: "23",
      title: "Governing Law and Dispute Handling",
      html: `
${jurisdictionHtml}
<p>No arbitration clause is stated on this page. Mandatory consumer, healthcare, or privacy dispute rights in your location are not waived.</p>`,
    },
    {
      id: "contact",
      number: "24",
      title: "Contact Information",
      html: `<p>${contactHtml}</p>`,
    },
  ];

  return {
    title: "Terms of Service",
    intro:
      "These Terms govern use of the ActiveClinic software platform, including clinic registration, administrator accounts, and related public and authenticated services.",
    draftBanner: meta.draftBanner,
    effectiveDateIso: meta.effectiveDateIso,
    effectiveDateDisplay: meta.effectiveDateDisplay,
    documentVersion: meta.termsVersion,
    sections,
  };
}

module.exports = {
  buildTermsOfServiceContent,
};
