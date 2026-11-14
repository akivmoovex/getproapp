# Distributed persistence gaps

The store is a process-local `Map`. A second `createOtpService` with its own store cannot verify a challenge created by the first. The in-process test observed `verification_failed` and `sessionComplete: false`. That is the missing distributed behavior, not a passing persistence test.

The prepared database runner in `tests/v13/integration/d16-platform-otp.integration.test.js` checks `platform.otp_challenges` and then expects a second worker to read the same challenge. It stays behind `runGated`. This stage did not open a database and did not create the table.

What a later approved design still has to provide:

- One durable challenge row visible to every worker.
- Compare-and-set on verify so two workers cannot both accept the same code.
- Expiry and attempt count stored with the row, not in memory.
- No plaintext code column.
- A migration file only after approval, and no execution in this stage.

Replay of a verified challenge on the same store returns `replay`. Wrong purpose returns `wrong_purpose`. Another organization returns `cross_tenant`. Five wrong codes return `exhausted`. Those checks die with the process that holds the map.
