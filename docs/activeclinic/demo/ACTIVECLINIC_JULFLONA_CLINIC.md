# Julflona Clinic (ActiveClinic demo tenant)

**Organization key:** `julflona-clinic`  
**Public clinic name:** Julflona Clinic  
**Primary facility:** Julflona Clinic – Lusaka  
**Public URL:** `/clinics/julflona-clinic`  
**Directory:** included via normal publication filters (not hard-coded)

## Location

- Country: Zambia (`ZM`)
- Province: Lusaka Province
- City: Lusaka
- Timezone: Africa/Lusaka
- Currency label: ZMW (display only; no billing seed)

## Publication

- Platform organization: active (`data_environment=demo`)
- ActiveClinic product enrolment: active
- Healthcare organization: active + `website_published` + `public_booking_enabled`
- Facility: active + `show_in_directory` + `website_published`

## Administrator

- Display name: Julflona Clinic Administrator
- Login email: `julflona@gmail.com`
- Role: Clinic Administrator → `activeclinic_facility_admin` (facility scope)
- Tenant scope: `julflona-clinic` only
- Facility scope: Julflona Clinic – Lusaka
- `must_change_password`: true after seed
- Requested plaintext credential length 8 is rejected by global policy (min 10)
- Temporary policy-compliant secret is issued only through the seed CLI handoff (not stored in docs)

## Content

Fictional Julflona-specific sample wording with demonstration banner. Does not copy private Juflona operational data.

## Related command

See `ACTIVECLINIC_DEMO_SEED_COMMAND.md`.
