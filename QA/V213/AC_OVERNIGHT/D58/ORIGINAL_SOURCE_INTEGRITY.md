# Original source integrity

SHA-256 after the sandbox runs matches the hash taken before them.

| File | SHA-256 |
|---|---|
| `src/activeclinic/services/activeClinicFinanceAuthz.js` | `835237020427545ee482ee9808369c8fb21e6d9bb0d34c684ba2b5502ac4e45d` |
| `src/activeclinic/repositories/facilityRepository.js` | `2e597866932eb1d9f494bb39bce125a88937054dee59082b133453c294d1645d` |
| `src/platform/otp/otpService.js` | `f5823ab3aeab616e26cdfa45ce4642678fe10d734d2c3e7731bab4fc32a25747` |
| `src/activeclinic/repositories/appointmentRepository.js` | `205fba55f2061d90181479e638d999792235d6b47ebfeabf9febfd03c7249f8a` |
| `src/activeclinic/services/activeClinicBillingService.js` | `119eb24fce76b8db05525a697d7f185981d59c5ecdfd2e41cefce7e90ffbbadc` |
| `src/activeclinic/services/activeClinicClinicalService.js` | `62dffe2e3448ee4bc96008eb01f3f9fad5061c02bafa10b20bdeeb22c8892be8` |
| `src/activeclinic/services/activeClinicPatientConsentService.js` | `3729c777820e15ebebc965d39249cd4f3ec192f7e0d5577aec815106d27f4e45` |
| `src/activeclinic/services/activeClinicClinicalDocumentService.js` | `39113d4f190279f3dbc4cdd58cf5526dabc95ab1ad1c156b600d620a09073969` |
| `tests/v13/unit/d57-behavioral-strengthening.test.js` | `672dc01630ec405ecdfa89e4f5512827a87fe08f35c7ba7f2dcc102da85d0f85` |

HEAD remains `b8f6b420d25e908de64ba292866c218c32edc30c`. The unmodified D57 file passed again. G1, including the new guard, passed 318 and failed 0. The log is `/tmp/d58-g1.log`.
