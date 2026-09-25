import { sql } from 'drizzle-orm';
import {
  check,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { InstallmentStatus } from '../loans/installment-status.enum.js';
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

export const installmentStatusEnum = pgEnum('installment_status', InstallmentStatus);

export const funds = pgTable('funds', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull().unique(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export type Fund = typeof funds.$inferSelect;
export type NewFund = typeof funds.$inferInsert;

export const fundVersions = pgTable(
  'fund_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    fundId: uuid('fund_id')
      .notNull()
      .references(() => funds.id, { onDelete: 'restrict' }),
    version: integer('version').notNull(),
    minInstallments: integer('min_installments').notNull(),
    maxInstallments: integer('max_installments').notNull(),
    maxGraceMonths: integer('max_grace_months').notNull(),
    contributionRateBps: integer('contribution_rate_bps').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    unique('fund_versions_fund_id_version_unique').on(table.fundId, table.version),
    check('fund_versions_version_positive', sql`${table.version} >= 1`),
    check('fund_versions_min_installments_positive', sql`${table.minInstallments} >= 1`),
    check(
      'fund_versions_max_installments_gte_min',
      sql`${table.maxInstallments} >= ${table.minInstallments}`,
    ),
    check('fund_versions_max_grace_non_negative', sql`${table.maxGraceMonths} >= 0`),
    check('fund_versions_rate_non_negative', sql`${table.contributionRateBps} >= 0`),
  ],
);

export type FundVersion = typeof fundVersions.$inferSelect;
export type NewFundVersion = typeof fundVersions.$inferInsert;

export const loans = pgTable(
  'loans',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    borrowerId: uuid('borrower_id')
      .notNull()
      .references(() => borrowers.id, { onDelete: 'restrict' }),
    fundVersionId: uuid('fund_version_id')
      .notNull()
      .references(() => fundVersions.id, { onDelete: 'restrict' }),
    principalCents: integer('principal_cents').notNull(),
    disbursedAt: date('disbursed_at').notNull(),
    graceMonths: integer('grace_months').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at')
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('loans_borrower_id_idx').on(table.borrowerId),
    check('loans_principal_positive', sql`${table.principalCents} > 0`),
    check('loans_grace_non_negative', sql`${table.graceMonths} >= 0`),
  ],
);

export type Loan = typeof loans.$inferSelect;
export type NewLoan = typeof loans.$inferInsert;

export const installments = pgTable(
  'installments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    loanId: uuid('loan_id')
      .notNull()
      .references(() => loans.id, { onDelete: 'cascade' }),
    number: integer('number').notNull(),
    dueDate: date('due_date').notNull(),
    amountCents: integer('amount_cents').notNull(),
    status: installmentStatusEnum('status').notNull().default(InstallmentStatus.Pending),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at')
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    unique('installments_loan_id_number_unique').on(table.loanId, table.number),
    check('installments_number_positive', sql`${table.number} >= 1`),
    check('installments_amount_positive', sql`${table.amountCents} > 0`),
  ],
);

export type Installment = typeof installments.$inferSelect;
export type NewInstallment = typeof installments.$inferInsert;
