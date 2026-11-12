---
key: SCHED-4431
title: "booking page: show remaining seats"
status: open
labels: [agent-ready, from:client]
---

## Intent
Group slots show how many seats are left on the booking page (a Slot has a number of seats, specs/product.md).

## Acceptance
- Given a group slot with 10 seats and 7 bookings, when the booking page shows it, then it says 3 seats left.
- Given a slot with one seat, when the booking page shows it, then no seat count is shown.
- Given a full slot, when the booking page shows it, then the count does not go below 0 and the slot cannot be booked, as now.

## Boundaries
- Must not change how bookings or seats are stored.
- Must not remove anything the booking page shows now.

Allowed by AUT-1 (new columns, filters or fields that add to what is there and take nothing away).
