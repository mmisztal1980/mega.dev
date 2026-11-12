---
key: SCHED-4465
title: "API: rate-limit replies carry no Retry-After header"
status: open
labels: [agent-ready, from:client]
---

## Intent
When the API rate-limits a caller, the 429 reply does not say when to try again. Add a Retry-After header with the seconds until the limit resets.

## Acceptance
- Given a caller over the rate limit, when it calls the API, then the reply is 429 with a Retry-After header in whole seconds.
- Given a caller under the limit, when it calls the API, then the reply has no Retry-After header and is not changed otherwise.
- Given the 429 reply, when it is read, then its status and body are the same as before.

## Boundaries
- Must not change the rate limits themselves.
- Must not change any reply body.

Allowed by AUT-1 (new columns, filters or fields that add to what is there and take nothing away).
