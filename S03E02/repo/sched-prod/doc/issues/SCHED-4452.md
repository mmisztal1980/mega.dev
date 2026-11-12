---
key: SCHED-4452
title: "calendar sync: Outlook events arrive twice"
status: open
labels: [agent-ready, from:support]
---

## Intent
Some Outlook calendars show each booking twice after a sync. ADR-0002 says each booking is pushed once, with a stable id, so the calendar can tell an update from a new event. Make the Outlook push follow that.

## Acceptance
- Given a booking pushed to an Outlook calendar, when the sync runs again, then the calendar still shows it once.
- Given a booking that changes in sched-prod, when it is pushed again, then Outlook updates the same event, by the same id, and does not add a second one.
- Given a test, when it runs, then it shows a second sync does not create a duplicate.

## Boundaries
- Must not read events back from external calendars (ADR-0002: sync is one-way).
- Must not change the id of bookings already pushed.

Allowed by AUT-1 (bug fixes and small features inside the specs, with a test that shows the change).
