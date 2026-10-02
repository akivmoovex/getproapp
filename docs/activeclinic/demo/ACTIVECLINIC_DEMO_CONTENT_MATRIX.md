# ActiveClinic demo content matrix

Statuses: `COMPLETE` | `PARTIAL` | `MISSING` | `NOT_SUPPORTED`

Juflona reference = supported public structure (tests + routes), not a live DB tenant.

| Category | Juflona reference | ActiveClinic Demo Centre | Julflona Clinic | Status |
|----------|-------------------|--------------------------|-----------------|--------|
| organization | supported | populated | populated | COMPLETE |
| healthcare organization | supported | populated | populated | COMPLETE |
| facility | supported | populated | populated | COMPLETE |
| public identity | supported | populated | populated | COMPLETE |
| logo/fallback | optional URL | fallback brand text | fallback brand text | PARTIAL |
| hero | tagline + about | demo banner + about | demo banner + about | COMPLETE |
| About page | `/about` | populated | populated | COMPLETE |
| public contact | phone/email display | fictional demo contacts | fictional demo contacts | COMPLETE |
| location | facility address | Lusaka sample address | Lusaka sample address | COMPLETE |
| operating hours | `public_hours_json` | populated | populated | COMPLETE |
| services | public bookable types | 7 services | 7 services | COMPLETE |
| service details | `/services/:key` | populated | populated | COMPLETE |
| doctors | public profiles | 3 sample clinicians | 3 sample clinicians | COMPLETE |
| doctor details | `/doctors/:key` | sample disclaimer | sample disclaimer | COMPLETE |
| pricing patterns | no price columns yet | honest empty state | honest empty state | NOT_SUPPORTED |
| booking entry | `/book` | enabled | enabled | COMPLETE |
| procedure booking | `/book/procedures` | 2 sample procedures | 2 sample procedures | COMPLETE |
| My Booking | `/my-booking` | entry page | entry page | COMPLETE |
| patient portal entry | `/patient/login` | entry page | entry page | COMPLETE |
| SEO | page meta | shell meta present | shell meta present | PARTIAL |
| website published | flag | true | true | COMPLETE |
| directory published | facility flags | true | true | COMPLETE |
| demo banner | required for demos | present on tenant shell | present on tenant shell | COMPLETE |
| mobile content | responsive CSS | responsive public CSS | responsive public CSS | COMPLETE |

## Notes

- Pricing: product does not yet store public fee amounts; pages correctly show “Fees not listed online”.
- Patient portal shell does not reuse the tenant header demo banner (portal uses patient layout).
- Demo banner text: `Demonstration clinic — sample information only`
- Clinician disclaimer: `Sample profile for demonstration only`
