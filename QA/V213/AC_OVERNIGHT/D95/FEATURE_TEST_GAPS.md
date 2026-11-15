# Feature and test gaps

Implemented behavior that still lacks acceptance evidence: the 17 partial areas have G1 fakes and no stored-row or browser result. Portal activation, billing, documents, consent, and the current clinical state machine are in that set. D86 through D90 are outside Stage A, so a future Stage A run would not execute them.

Tests blocked because the feature is absent: slot capacity, merge lineage, retention and legal hold, restore, offline writes, accessibility targets, a versioned clinical API, and a clinical outbox. Those tests must not be written as passes.

Tests blocked by design approval: amendment, critical escalation, substitution, allergy blocking, identifier formats outside `AC-YYYY-NNNNNN`, and any new migration. Break-glass and Juflona stay deferred, so their tests stay inactive.

Database and browser dependencies: G2 needs both write flags, a run id, testing identity, and a local disposable name. G3 needs those plus the browser flag. Concurrency evidence needs two sessions against that database, and it also needs the capacity decision before a lock is added.
