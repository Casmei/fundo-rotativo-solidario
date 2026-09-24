import { pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { Role } from '../shared/role.enum.js';

export const roleEnum = pgEnum('role', Role);

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  phone: text('phone').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: roleEnum('role').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
