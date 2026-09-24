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

export const borrowers = pgTable('borrowers', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  cpf: text('cpf').notNull().unique(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at')
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type Borrower = typeof borrowers.$inferSelect;
export type NewBorrower = typeof borrowers.$inferInsert;
