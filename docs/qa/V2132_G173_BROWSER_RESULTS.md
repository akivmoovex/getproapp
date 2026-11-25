# G173 browser results

Full files, not a grep filter, after the consultation test was added.

| Run | ActiveClinic | BlessBoard |
| --- | --- | --- |
| 1 | 29 passed, 0 failed, 51.2s | 23 passed, 0 failed, 53.6s |
| 2 | 29 passed, 0 failed, 51.7s | 23 passed, 0 failed, 53.3s |

The first focused probe of the new test failed because the clinic administrator cannot edit clinical notes. The journey was moved to the clinician after the administrator created the patient and started the encounter. The focused probe then passed in 7.0s. The two full cycles above include that repaired journey.

Selectors are field ids and existing data attributes. No sleep was added. Synthetic names only. Failed-probe traces were not committed.
