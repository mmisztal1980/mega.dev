import { pgTable, integer, text, unique } from 'drizzle-orm/pg-core';

export const reorderJobs = pgTable('reorder_jobs', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  sku: text('sku').notNull(),
  night: text('night').notNull(),
  qty: integer('qty').notNull(),
  status: text('status').notNull().default('queued'),
}, (t) => [unique('reorder_jobs_sku_night').on(t.sku, t.night)]);
