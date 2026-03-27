import { text } from "drizzle-orm/sqlite-core";

const nowIsoString = () => new Date().toISOString();

/**
 * Shared base columns for application entities.
 *
 * `updatedAt` is automatically set on updates when the query is executed via Drizzle ORM.
 */
export const baseColumns = {
  id: text("id").primaryKey(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull().$defaultFn(nowIsoString).$onUpdateFn(nowIsoString),
};
