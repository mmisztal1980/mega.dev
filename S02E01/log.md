# S02E01 log
- start-challenge: repo + sessions received. No ticket in the reply.
- Sessions read: store decided 2026-10-29 (7f3c2a91: SQLite + Drizzle), replaced 2026-10-30 (019a35d2: Postgres 16, 5432). plan-draft.md is stale. shelf-labels (884e2b73: PG15/5435/Prisma) is another project.
- Plan check-in: sent plan.md.
- Plan check-in accepted; receipt v1.eyJ…(masked), kept in scratchpad, expires 2026-11-09. Build wants plan, compose, drizzleConfig, schema, receipt.
- Build 1 rejected: "Your plan doesnt say which image version." Split image and port into own rows.
- Build 2 rejected on Job store row. Removed the SQLite wording from it.
- Build 3 rejected: "Something changed since your check-in." Archive gained late session c41e7b02: postgres:17, host port 5474, same locally. Plan, compose, config updated; container swap pending human yes.
- Build 4 rejected: job store row source. Cursor and nonce received (masked). Job store row now cites 019a35d2.
- Archive gained 5d8a1f37: database reorder_zajx (approved). Plan, compose, config updated; database created in the running container.
