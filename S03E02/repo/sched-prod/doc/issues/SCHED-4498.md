---
key: SCHED-4498
title: "confirmation email: the cancel link opens the login page"
status: open
labels: [agent-ready, from:support, from:client]
sources: [IN-5481]
---

## Intent
The cancel link in the booking confirmation email asks for a login, but people who booked have no account. Make it open the booking without a login, as the cancel link in the reminder email already does.

## Acceptance
- Given a booking confirmation email, when its cancel link is opened by someone without an account, then the booking opens with its cancel action, with no login page.
- Given the reminder email, when its cancel link is opened, then it works as now.
- Given a cancel link for one booking, when it is opened, then it does not show or cancel any other booking.

## Boundaries
- Must not change the reminder email or the sender address.
- Must not open other account pages without a login.

Request IN-5481 (mail): "People who booked with us can't cancel: the link in their confirmation email sends them to a login page."

Allowed by AUT-1 (bug fixes and small features inside the specs, with a test that shows the change).
