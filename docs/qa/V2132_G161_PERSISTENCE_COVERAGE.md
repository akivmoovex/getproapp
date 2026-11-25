# G161 persistence coverage

Every database write in the official runs used `getpro_v13_e2e_g78d2301` on `127.0.0.1:55432`. Preflight printed that database name before each HTTP run. Port 5432 was not used. No migration, reset, or truncate was run.

Read-back that this cycle executed:

- Patient portal activation: `count(*)` for the new patient number is 1 before and after the unknown and wrong-clinic attempts.
- Staff phone search: the same count stays 1 after search and after opening the chart.
- Vitals: the patient id is read back, then the page still shows 72 bpm and 80 bpm after a denied post.
- Member profile: the created email and stamp survive reload. Directory search returns that stamp. A nonsense query does not.
- Website, sermon, event, and announcement: public GET after publish shows the title. The draft title is absent. The other tenant does not show it.
- Appointments: two clients, one stored row for the colliding staff interval, retry rejected, other staff stored separately.
- Unauthorized clinical and pharmacy calls: HTTP denials for the other organization. The denied browser post does not add 140 bpm.

Rows are owned by the synthetic organization created for the run. No production patient data was used.

Consultation signing and a stocked dispense still have no new persistence read-back in this cycle.
