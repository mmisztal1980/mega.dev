---
key: SCHED-4486
title: "audit log: keep 90 days"
status: open
labels: [needs-human, from:finance]
---

## Question
Audit log entries are kept now. Finance asks to delete them after 90 days. Should stored audit entries be deleted, and from when?

## Options
1. Delete entries older than 90 days, including the ones already stored.
2. Delete after 90 days only for entries written from now on; keep what is stored.
3. Move entries older than 90 days to an archive instead of deleting them.

## Recommendation
Option 3, unless finance confirms no law or client contract needs the entries for longer.

## Why
Because deleting data that is already stored needs a person (AUT-2), and a deleted audit entry cannot be brought back.
