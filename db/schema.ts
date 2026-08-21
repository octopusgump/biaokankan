import { sql } from "drizzle-orm";
import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const managedSources = sqliteTable("managed_sources", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  entry: text("entry").notNull(),
  listEntry: text("list_entry").notNull().default(""),
  region: text("region").notNull().default("河南省"),
  type: text("type").notNull().default("公共资源交易中心"),
  note: text("note").notNull().default(""),
  adapter: text("adapter"),
  status: text("status").notNull().default("候选"),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(false),
  lastScan: text("last_scan"),
  result: text("result").notNull().default("候选"),
  found: integer("found").notNull().default(0),
  read: integer("read").notNull().default(0),
  lastError: text("last_error"),
  projectsJson: text("projects_json").notNull().default("[]"),
  createdBy: text("created_by").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("idx_managed_sources_entry").on(table.entry),
  uniqueIndex("idx_managed_sources_name_entry").on(table.name, table.entry),
]);
