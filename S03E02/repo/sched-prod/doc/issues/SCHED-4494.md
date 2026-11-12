---
key: SCHED-4494
title: "week view: a booking across midnight shows on its first day only"
status: open
labels: [agent-ready, from:support]
---

## Intent
A booking from 23:00 to 01:00 shows on its first day and is missing from the second. Show it on both days in week view, in the viewer's zone (PRD-2).

## Acceptance
- Given a booking from 23:00 to 01:00 in the viewer's zone, when week view shows both days, then it appears on the first day until midnight and on the second from midnight.
- Given that booking, when it is opened from either day, then it is the same one booking (PRD-1), not two.
- Given a booking inside one day, when week view shows it, then it does not appear on any other day.

## Boundaries
- Must not split the stored booking or change its times.

Allowed by AUT-1 (bug fixes and small features inside the specs, with a test that shows the change).
