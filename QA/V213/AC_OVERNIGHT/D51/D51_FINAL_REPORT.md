# D51 final report

Patient-visible results now join the request and the facility only inside the result’s organization, and only a released row is readable. A consent withdrawal that no longer matches a granted row in that organization does not write an event.

Quarantine, retention, legal hold, restore, offline writes, monitors, and Juflona signing were not added. G1 passed 307 and failed 0. No database write, commit, or push was made.
