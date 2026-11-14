# Blocked features

| Item | Why it was not implemented |
|---|---|
| Live AC-05 denial | Needs an authenticated session. The route guards were not removed |
| Stored portal activation | Needs a disposable database. No row was written |
| Single-use booking receipt | Revoking the lookup token would stop a patient opening the same booking again. That is a different operation from portal activation |
| Registration enumeration | The register page still uses distinct messages. Unifying them was not an approved copy change |
| Missing phone and national ID | D21-04 is pending. No substitute identifier was added |
| OTP production | D21-11 is pending. No provider, migration, or `1234` production path |
| Clinical role grants | D21-01 is pending. No role catalogue edit |
| Merge | D21-03 is pending |
| Appointment capacity | D21-05 is pending. Public booking code was not changed |

Acceptance stays 0 passed, 83 not run, and 1 blocked (`SEC-01-02`). The eight supplementary criteria stay pending.
