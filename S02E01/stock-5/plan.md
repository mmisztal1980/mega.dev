| Area | Choice | Source (session id + time) |
|------|--------|----------------------------|
| Job store | Postgres in Docker, a compose service. | 019a35d2-7c41-7e08-a3f1-5b9e2d6c4a10, proposed 2026-10-30T14:48:12Z, approved 2026-10-30T14:50:03Z |
| Image version | `postgres:17`, on CI and locally. | c41e7b02-93d5-4f6a-8e21-7a0b5d3f9c64 (subagent agent-a5c0e3d19b72f4e60), proposed 2026-11-02T04:31:26Z |
| Port | Host port 5474, on CI and locally. | c41e7b02-93d5-4f6a-8e21-7a0b5d3f9c64 (subagent agent-a5c0e3d19b72f4e60), proposed 2026-11-02T04:31:26Z |
| Database | `reorder_zajx`: `POSTGRES_DB` in compose and the database in the db url. | 5d8a1f37-0c62-4b9e-b7a4-e13f6c290d85, proposed 2026-11-02T05:35:56Z, approved 2026-11-02T05:36:34Z |
| ORM | Drizzle (`drizzle-orm` + `drizzle-kit`). The move to Postgres changed the store, not the ORM. | 7f3c2a91-4e5b-4d1a-9b8e-2c6d0f1a3b57, proposed 2026-10-29T09:41:36Z, approved 2026-10-29T09:44:51Z |
| Dialect | `postgresql` in the db config. | 019a35d2-7c41-7e08-a3f1-5b9e2d6c4a10, proposed 2026-10-30T14:48:12Z, approved 2026-10-30T14:50:03Z |
| Schema | `src/db/schema.ts`: one table `reorder_jobs`, unique on (`sku`, `night`), so a re-run of the same night never queues a SKU twice. | 7f3c2a91-4e5b-4d1a-9b8e-2c6d0f1a3b57, proposed 2026-10-29T09:41:36Z, approved 2026-10-29T09:44:51Z |
| Crash recovery | The loop writes each job as it queues it; after a crash the next run skips the queued jobs. `state.json` is gone. | 7f3c2a91-4e5b-4d1a-9b8e-2c6d0f1a3b57, done 2026-10-29T10:42:56Z |
| Runs | Nightly at 02:00 local (log start 01:00:00Z), four workers. | 019a35d2-7c41-7e08-a3f1-5b9e2d6c4a10, stated 2026-10-30T14:31:40Z, confirmed 2026-10-30T15:08:16Z |
