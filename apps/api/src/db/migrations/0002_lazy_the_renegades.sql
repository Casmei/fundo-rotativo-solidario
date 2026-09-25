CREATE TYPE "public"."installment_status" AS ENUM('pending', 'paid');--> statement-breakpoint
CREATE TABLE "fund_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fund_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"min_installments" integer NOT NULL,
	"max_installments" integer NOT NULL,
	"max_grace_months" integer NOT NULL,
	"contribution_rate_bps" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "fund_versions_fund_id_version_unique" UNIQUE("fund_id","version"),
	CONSTRAINT "fund_versions_version_positive" CHECK ("fund_versions"."version" >= 1),
	CONSTRAINT "fund_versions_min_installments_positive" CHECK ("fund_versions"."min_installments" >= 1),
	CONSTRAINT "fund_versions_max_installments_gte_min" CHECK ("fund_versions"."max_installments" >= "fund_versions"."min_installments"),
	CONSTRAINT "fund_versions_max_grace_non_negative" CHECK ("fund_versions"."max_grace_months" >= 0),
	CONSTRAINT "fund_versions_rate_non_negative" CHECK ("fund_versions"."contribution_rate_bps" >= 0)
);
--> statement-breakpoint
CREATE TABLE "funds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "funds_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "installments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"loan_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"due_date" date NOT NULL,
	"amount_cents" integer NOT NULL,
	"status" "installment_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "installments_loan_id_number_unique" UNIQUE("loan_id","number"),
	CONSTRAINT "installments_number_positive" CHECK ("installments"."number" >= 1),
	CONSTRAINT "installments_amount_positive" CHECK ("installments"."amount_cents" > 0)
);
--> statement-breakpoint
CREATE TABLE "loans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"borrower_id" uuid NOT NULL,
	"fund_version_id" uuid NOT NULL,
	"principal_cents" integer NOT NULL,
	"disbursed_at" date NOT NULL,
	"grace_months" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "loans_principal_positive" CHECK ("loans"."principal_cents" > 0),
	CONSTRAINT "loans_grace_non_negative" CHECK ("loans"."grace_months" >= 0)
);
--> statement-breakpoint
ALTER TABLE "fund_versions" ADD CONSTRAINT "fund_versions_fund_id_funds_id_fk" FOREIGN KEY ("fund_id") REFERENCES "public"."funds"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "installments" ADD CONSTRAINT "installments_loan_id_loans_id_fk" FOREIGN KEY ("loan_id") REFERENCES "public"."loans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loans" ADD CONSTRAINT "loans_borrower_id_borrowers_id_fk" FOREIGN KEY ("borrower_id") REFERENCES "public"."borrowers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loans" ADD CONSTRAINT "loans_fund_version_id_fund_versions_id_fk" FOREIGN KEY ("fund_version_id") REFERENCES "public"."fund_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "loans_borrower_id_idx" ON "loans" USING btree ("borrower_id");