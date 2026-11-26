# G231 clinical printing

Confirmed supported print actions include patient cards, billing/cashier
documents, the G224 laboratory result view, and the G229 radiology report
view. Laboratory and radiology print controls are authorized by the existing
request scope and render the patient, request, findings/summary and status in
a print-ready region. Browser and HTTP journeys assert the print control is
present after a recorded result/report.

SOAP notes, encounter summaries, prescriptions and referrals do not have an
equivalent independently verified print journey. A browser presence check
would be insufficient, so these remain incomplete P1 coverage where the
source exposes no approved print contract. No PDF format or new clinical
document policy was invented.
