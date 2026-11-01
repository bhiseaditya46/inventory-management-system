import {
  index,
  integer,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const productsTable = pgTable(
  "inventory_products",
  {
    id: serial("id").primaryKey(),
    sku: varchar("sku", { length: 80 }).notNull(),
    name: varchar("name", { length: 160 }).notNull(),
    category: varchar("category", { length: 80 }).notNull(),
    quantity: integer("quantity").notNull().default(0),
    reorderLevel: integer("reorder_level").notNull().default(5),
    unitPrice: numeric("unit_price", {
      precision: 12,
      scale: 2,
      mode: "number",
    })
      .notNull()
      .default(0),
    description: text("description"),
    supplier: varchar("supplier", { length: 160 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("inventory_products_sku_lower_unique").on(
      sql`lower(${table.sku})`,
    ),
    index("inventory_products_category_idx").on(table.category),
  ],
);

export const adminUsersTable = pgTable("inventory_admin_users", {
  clerkUserId: varchar("clerk_user_id", { length: 255 }).primaryKey(),
  email: varchar("email", { length: 320 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const stockMovementsTable = pgTable(
  "inventory_stock_movements",
  {
    id: serial("id").primaryKey(),
    productId: integer("product_id")
      .notNull()
      .references(() => productsTable.id, { onDelete: "cascade" }),
    delta: integer("delta").notNull(),
    note: varchar("note", { length: 300 }).notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("inventory_stock_movements_product_idx").on(table.productId)],
);
