---
key: SCHED-4446
title: "CSV export: times carry no UTC offset"
status: open
labels: [agent-ready, from:analytics]
---

## Intent
Start and end times in the CSV export have no offset, so every tool that reads them has to guess the zone. Add a UTC offset column next to them, as ADR-0001 asks of data that leaves the product.

## Acceptance
- Given an export for an account in Europe/Berlin in summer, when it is generated, then each row has a UTC offset column with +02:00 next to start and end.
- Given an existing export, when it is generated after the change, then every column it had is still there, with the same name, order and value format (PRD-3).
- Given a row, when its offset is read, then it is not blank.

## Boundaries
- Must not change, rename, reorder or reformat the existing start and end columns.
- Must not remove any column.

Allowed by AUT-1 (new columns, filters or fields that add to what is there and take nothing away).
