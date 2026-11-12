---
key: SCHED-4418
title: "week view: first day of the week follows the account locale"
status: open
labels: [agent-ready, from:support]
sources: [IN-1966]
---

## Intent
Week view always starts on Sunday. Start it on the first day of the week that the account's locale gives (an Account has a locale, specs/product.md).

## Acceptance
- Given an account with locale de-DE, when week view opens, then the week starts on Monday.
- Given an account with locale en-US, when week view opens, then the week starts on Sunday, as now.
- Given any locale, when the week start changes, then no booking moves to another day and no stored time changes (PRD-2): bookings are not moved, only the column order is.

Request IN-1966 (desk): a studio in Berlin says the calendar starts the week on Sunday; their staff expect Monday.

## Boundaries
- Must not change stored bookings or times.
- Must not add a per-user setting; the account locale decides.

Allowed by AUT-1 (bug fixes and small features inside the specs, with a test that shows the change).
