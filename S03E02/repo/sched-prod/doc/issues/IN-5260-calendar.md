---
key: IN-5260-calendar
title: "confirmation email: 'Add to calendar' opens a blank page"
status: open
labels: [agent-ready, from:support]
sources: [IN-5260]
---

## Intent
The 'Add to calendar' link in the booking confirmation email opens a blank page. Make it hand the booking to the person's calendar as an event with the booking's start and end. Split from ticket IN-5260, which merged two problems; the logo is IN-5260.

## Acceptance
- Given a booking confirmation email, when 'Add to calendar' is opened, then the person gets a calendar event with the booking's start, end and zone (ADR-0001).
- Given the same link opened twice, when the event is added again, then it carries the same stable id (ADR-0002), so the calendar does not show two events.
- Given the link, when it is opened by someone without an account, then it does not ask for a login.

## Boundaries
- Must not read anything back from the person's calendar (ADR-0002).

Allowed by AUT-1 (bug fixes and small features inside the specs, with a test that shows the change).

Request (desk, merged by tove · 2 reports): "the client's logo is stretched in the booking confirmation email, and the 'Add to calendar' link in the same email opens a blank page."
