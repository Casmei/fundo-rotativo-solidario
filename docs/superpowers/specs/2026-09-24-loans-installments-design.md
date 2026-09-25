# Design — Empréstimos e Parcelas (FRSBJ)

**Data:** 2026-09-24
**Branch:** `Tiago-Castro/loan-installments`
**Relacionado:** `docs/mvp.md` (RF03 — Cadastrar empréstimo, RF07 — Consultar cadastro,
RNF05 — dado derivável não é armazenado, RNF08 — uso concorrente);
Edital e Regimento Interno do FRSBJ (2023).

## 1. Contexto e objetivo

O `apps/api` já tem autenticação (JWT + `RolesGuard`) e o CRUD de Tomadores
(`borrowers`). Este documento especifica o núcleo financeiro do sistema: cadastrar um
**Empréstimo** para um tomador existente, gerando automaticamente as **Parcelas**, com
base nas regras de um **Fundo**.

As regras do empréstimo (mínimo/máximo de parcelas, contribuição solidária, carência
máxima) pertencem ao fundo, não ao empréstimo. Como no futuro haverá gestão de mais de
um fundo, essas regras ficam **desacopladas** do empréstimo, em versões imutáveis do
fundo. O empréstimo referencia a versão vigente no momento da criação — essa FK é a
"cópia" das condições contratadas.

### Regras extraídas do Edital/Regimento do FRSBJ

| Regra | Valor | Tratamento nesta spec |
|---|---|---|
| Contribuição solidária | 5% sobre o valor recebido, cobrada uma única vez | `contribution_rate_bps = 500` na versão |
| Máximo de parcelas | 10 (prazo máximo de 10 meses após início da devolução) | `max_installments = 10` |
| Mínimo de parcelas | não consta no edital | `min_installments = 1` |
| Carência | até 6 meses | `max_grace_months = 6`, limite rígido |
| Valor máximo | R$ 3.200 individual / R$ 5.000 coletivo | **fora do escopo** — depende do tipo do tomador, ainda inexistente |
| Multa por atraso | 5% a.m. sobre a parcela após 30 dias | **fora do escopo** — pertence à baixa/atraso |
| Novo empréstimo só após quitação | — | **fora do escopo** — entra com a baixa de parcela (RF05) |

## 2. Escopo

**Dentro do escopo:**
- Tabelas `funds`, `fund_versions`, `loans`, `installments` e enum `installment_status`.
- Seed idempotente do fundo FRSBJ com a versão 1.
- `POST /loans`, `GET /loans/:id`, `GET /borrowers/:id/loans`, `GET /funds`.
- Geração automática das parcelas (valores e vencimentos) na criação do empréstimo.
- `DELETE /borrowers/:id` passa a responder `409` quando o tomador tem empréstimos.

**Fora do escopo (decisão explícita):**
- CRUD de fundos e de versões (versões só via seed/migração por enquanto).
- Baixa de parcela (RF05), atraso, multa, quitação, painel de inadimplência.
- Colunas de auditoria de baixa (`paid_at`, `paid_by`) — entram com o RF05.
- Regra "novo empréstimo só após quitar o anterior".
- Valor máximo por tipo de tomador.
- Edição e remoção de empréstimo.
- Paginação e filtros nas listagens.
- Importação em lote (RF01).

## 3. Decisões de arquitetura

| Decisão | Escolha | Motivo |
|---|---|---|
| Onde ficam as regras | `fund_versions`, imutável (só `INSERT`) | Desacopla regras do empréstimo; mudar regra = nova versão; empréstimos antigos não mudam. |
| "Cópia" das condições | `loans.fund_version_id` (FK `RESTRICT`) | A versão é imutável, então a FK equivale a um snapshot sem duplicar colunas. |
| Versão vigente | Maior `version` do fundo; `UNIQUE (fund_id, version)` | Determinístico e simples; sem datas de vigência. |
| Fundo no empréstimo | Só `fund_version_id`, sem `fund_id` | O fundo é derivável da versão; guardar os dois permitiria inconsistência. |
| Dinheiro | Centavos em `integer` | Sem erro de ponto flutuante. |
| Taxa | Pontos-base em `integer` (`500` = 5%) | Idem. |
| Datas de calendário | `date` (string `YYYY-MM-DD`) | Sem fuso horário. |
| Total, nº de parcelas, status do empréstimo | Derivados das parcelas, não armazenados | RNF05. |
| Carência acima do máximo | Rejeitada (`422`) | Exceção da Comissão = nova versão ou ajuste de limite. |
| Vencimentos | `disbursedAt + (graceMonths + k)` meses, ancorado no dia original | Nenhuma data redundante; datas previsíveis. |
| Resto do rateio | Última parcela | Soma das parcelas = total, sempre. |
| Regras de negócio | Funções puras em `loans/` | Testáveis exaustivamente sem Nest nem banco. |
| Violação de regra do fundo | `422` | Separa "body malformado" (`400`) de "body válido que fere a regra" (`422`). |
| Criação | Transação única (empréstimo + parcelas) | Nunca existe empréstimo sem parcelas. |
| Rota de criação | `POST /loans` com `borrowerId` no body | Empréstimo é recurso próprio (visitas e baixas penduram nele). |

## 4. Estrutura de arquivos

Novos / alterados em `apps/api/src`:

```
funds/
  funds.module.ts               # importa DbModule; exporta FundsService
  funds.controller.ts           # GET /funds
  funds.service.ts              # findCurrentVersion(fundId), findAllWithCurrentVersion()
  fund-response.ts              # toFundResponse
loans/
  loans.module.ts               # importa DbModule, FundsModule
  loans.controller.ts           # POST /loans, GET /loans/:id, GET /borrowers/:id/loans
  loans.service.ts              # create / findOne / findByBorrower
  installment-schedule.ts       # buildInstallmentSchedule (pura)
  loan-terms.ts                 # assertTermsWithinPolicy, LoanPolicyViolation (pura)
  loan-response.ts              # toLoanResponse, toLoanListItem
  dto/
    create-loan.dto.ts
shared/
  calendar-date.ts              # addMonthsClamped, isCalendarDate (datas YYYY-MM-DD)
db/
  schema.ts                     # + funds, fund_versions, loans, installments, installment_status
  is-foreign-key-violation.ts   # espelha is-unique-violation (código 23503)
  seed.ts                       # + fundo FRSBJ v1 (idempotente)
  migrations/0002_*.sql         # gerada via drizzle-kit generate
borrowers/
  borrowers.service.ts          # remove(): 23503 → 409
app.module.ts                   # + FundsModule, LoansModule
```

Testes espelham `src/` em `test/`.

## 5. Modelo de dados

```ts
export const funds = pgTable('funds', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull().unique(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const fundVersions = pgTable(
  'fund_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    fundId: uuid('fund_id').notNull().references(() => funds.id, { onDelete: 'restrict' }),
    version: integer('version').notNull(),
    minInstallments: integer('min_installments').notNull(),
    maxInstallments: integer('max_installments').notNull(),
    maxGraceMonths: integer('max_grace_months').notNull(),
    contributionRateBps: integer('contribution_rate_bps').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    unique().on(t.fundId, t.version),
    check('fund_versions_version_positive', sql`${t.version} >= 1`),
    check('fund_versions_min_installments', sql`${t.minInstallments} >= 1`),
    check('fund_versions_max_installments', sql`${t.maxInstallments} >= ${t.minInstallments}`),
    check('fund_versions_max_grace', sql`${t.maxGraceMonths} >= 0`),
    check('fund_versions_rate', sql`${t.contributionRateBps} >= 0`),
  ],
);

export const loans = pgTable(
  'loans',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    borrowerId: uuid('borrower_id').notNull().references(() => borrowers.id, { onDelete: 'restrict' }),
    fundVersionId: uuid('fund_version_id').notNull().references(() => fundVersions.id, { onDelete: 'restrict' }),
    principalCents: integer('principal_cents').notNull(),
    disbursedAt: date('disbursed_at').notNull(),
    graceMonths: integer('grace_months').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [
    index('loans_borrower_id_idx').on(t.borrowerId),
    check('loans_principal_positive', sql`${t.principalCents} > 0`),
    check('loans_grace_non_negative', sql`${t.graceMonths} >= 0`),
  ],
);

export const installmentStatusEnum = pgEnum('installment_status', InstallmentStatus);
// enum InstallmentStatus { Pending = 'pending', Paid = 'paid' } em loans/installment-status.enum.ts

export const installments = pgTable(
  'installments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    loanId: uuid('loan_id').notNull().references(() => loans.id, { onDelete: 'cascade' }),
    number: integer('number').notNull(),
    dueDate: date('due_date').notNull(),
    amountCents: integer('amount_cents').notNull(),
    status: installmentStatusEnum('status').notNull().default(InstallmentStatus.Pending),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [
    unique().on(t.loanId, t.number),
    check('installments_number_positive', sql`${t.number} >= 1`),
    check('installments_amount_positive', sql`${t.amountCents} > 0`),
  ],
);
```

`date(...)` usa o modo padrão `string` do Drizzle (`'YYYY-MM-DD'`).

**Não armazenado, de propósito (RNF05):** valor total a devolver (soma das parcelas),
número de parcelas (contagem), status do empréstimo (ativo/quitado), `fund_id` no
empréstimo (via versão).

**Imutabilidade da versão:** não há rota de `UPDATE`/`DELETE` para `fund_versions`, e
a FK `RESTRICT` impede apagar versão referenciada. Imposição por trigger no banco fica
fora do escopo (YAGNI) enquanto não existir escrita de versões pela API.

**Seed** (`db/seed.ts`): insere, se não existir, o fundo
`"Fundo Rotativo Solidário do Baixo Jequitinhonha"` e sua versão 1 com
`minInstallments = 1`, `maxInstallments = 10`, `maxGraceMonths = 6`,
`contributionRateBps = 500`. Idempotente (`ON CONFLICT DO NOTHING` nas chaves únicas
`funds.name` e `(fund_id, version)`).

## 6. Regras de domínio (funções puras)

### 6.1 Datas — `shared/calendar-date.ts`
- `isCalendarDate(value: string): boolean` — `true` só para `YYYY-MM-DD` que existe no
  calendário (rejeita `2026-02-30`, `2026-13-01`, `2026-1-1`, strings com hora).
- `addMonthsClamped(date: string, months: number): string` — soma meses mantendo o
  dia; se o dia não existir no mês de destino, usa o último dia do mês. Implementada
  com aritmética de ano/mês/dia (sem `Date` local, sem fuso).

### 6.2 Cronograma — `loans/installment-schedule.ts`

```ts
buildInstallmentSchedule(input: {
  principalCents: number;
  contributionRateBps: number;
  installmentCount: number;
  disbursedAt: string;   // YYYY-MM-DD
  graceMonths: number;
}): { totalCents: number; installments: { number: number; dueDate: string; amountCents: number }[] }
```

- **Total:** `totalCents = principalCents + roundHalfUp(principalCents × bps / 10000)`,
  calculado em inteiros: `contribution = floor((principalCents × bps + 5000) / 10000)`.
  Ex.: `320000` a `500` bps → `336000` (R$ 3.200,00 → R$ 3.360,00).
- **Rateio:** `base = floor(totalCents / n)`; parcelas `1..n−1` = `base`; parcela `n` =
  `base + (totalCents mod n)`. Ex.: `105001` em 3 → `35000, 35000, 35001`.
- **Vencimentos:** parcela `k` (1-based) vence em
  `addMonthsClamped(disbursedAt, graceMonths + k)` — sempre a partir da data de
  liberação, nunca encadeando da parcela anterior. Ex.: `2026-01-31`, carência 2,
  3 parcelas → `2026-04-30`, `2026-05-31`, `2026-06-30`.
- Pré-condição (garantida por `assertTermsWithinPolicy`): `n ≥ 1` e `totalCents ≥ n`.

### 6.3 Política — `loans/loan-terms.ts`

```ts
class LoanPolicyViolation extends Error {}

assertTermsWithinPolicy(
  terms: { principalCents: number; installmentCount: number; graceMonths: number },
  version: { minInstallments: number; maxInstallments: number; maxGraceMonths: number; contributionRateBps: number },
): void
```

Lança `LoanPolicyViolation` (mensagem em inglês, padrão do projeto) quando:
- `installmentCount` fora de `[minInstallments, maxInstallments]` →
  `"installmentCount must be between {min} and {max}"`;
- `graceMonths > maxGraceMonths` → `"graceMonths must be at most {max}"`;
- total calculado `< installmentCount` →
  `"principalCents is too small for {n} installments"`.

## 7. API

Todas as rotas exigem autenticação (`JwtAuthGuard` global). `:id` passa por
`ParseUUIDPipe`.

| Método | Rota | Papéis | Sucesso | Corpo |
|---|---|---|---|---|
| `POST` | `/loans` | `Role.BackOffice` | `201` | `LoanResponse` |
| `GET` | `/loans/:id` | ambos | `200` | `LoanResponse` |
| `GET` | `/borrowers/:id/loans` | ambos | `200` | `LoanListItem[]`, por `disbursedAt` desc, depois `createdAt` desc |
| `GET` | `/funds` | ambos | `200` | `FundResponse[]`, por `name` asc |

### `CreateLoanDto`
| Campo | Validação |
|---|---|
| `borrowerId` | `@IsUUID()` |
| `fundId` | `@IsUUID()` |
| `principalCents` | `@IsInt()`, `@Min(1)` |
| `installmentCount` | `@IsInt()`, `@Min(1)` |
| `disbursedAt` | string, `isCalendarDate` (decorator `@IsCalendarDate()` em `shared/decorators/`) |
| `graceMonths` | `@IsInt()`, `@Min(0)` |

### Respostas
```ts
type LoanResponse = {
  id: string;
  borrower: { id: string; name: string };
  fund: { id: string; name: string };
  fundVersion: { id: string; version: number; contributionRateBps: number };
  principalCents: number;
  totalCents: number;          // soma das parcelas
  installmentCount: number;    // contagem das parcelas
  disbursedAt: string;
  graceMonths: number;
  createdAt: Date;
  updatedAt: Date;
  installments: { id: string; number: number; dueDate: string; amountCents: number; status: InstallmentStatus }[];
};

type LoanListItem = {
  id: string;
  fund: { id: string; name: string };
  principalCents: number;
  totalCents: number;
  installmentCount: number;
  disbursedAt: string;
  createdAt: Date;
};

type FundResponse = {
  id: string;
  name: string;
  currentVersion: {
    id: string; version: number;
    minInstallments: number; maxInstallments: number;
    maxGraceMonths: number; contributionRateBps: number;
  } | null;
};
```

Nenhuma resposta de empréstimo contém CPF, então são iguais para os dois papéis.
Parcelas sempre ordenadas por `number` asc.

### Fluxo do `POST /loans` (uma transação)
1. Busca o tomador → `404 "Borrower not found"`.
2. Busca a versão vigente do fundo (`ORDER BY version DESC LIMIT 1`, com join em
   `funds`) → fundo inexistente: `404 "Fund not found"`; fundo sem versão:
   `422 "Fund has no version"`.
3. `assertTermsWithinPolicy` → `422` com a mensagem da violação.
4. `buildInstallmentSchedule`.
5. `INSERT` do empréstimo; `INSERT` em lote das parcelas.
6. Retorna o empréstimo montado (`toLoanResponse`).

Qualquer erro entre 5 e 6 faz rollback — nunca fica empréstimo sem parcelas.

## 8. Erros

| Situação | Status |
|---|---|
| Body malformado, UUID inválido, data inexistente | `400` |
| Sem token / token inválido | `401` |
| `field_agent` em `POST /loans` | `403` |
| Tomador, fundo ou empréstimo inexistente (inclui `GET /borrowers/:id/loans` com tomador inexistente) | `404` |
| Viola regra do fundo / fundo sem versão | `422` |
| `DELETE /borrowers/:id` com empréstimos | `409 "Borrower has loans"` |

`LoanPolicyViolation` é convertida em `UnprocessableEntityException` no
`LoansService`. `isForeignKeyViolation` (código `23503`, checando `error` e
`error.cause`, como `isUniqueViolation`) é usada no `BorrowersService.remove`.

## 9. Testes (TDD, vitest)

**Unitários:**
- `test/shared/calendar-date.spec.ts` — datas válidas/inválidas; `addMonthsClamped`
  com dias 29/30/31, fevereiro bissexto e não bissexto, virada de ano, `months = 0`.
- `test/loans/installment-schedule.spec.ts` — taxa 0 e 500 bps; arredondamento
  half-up no limite de meio centavo; resto de 0 a `n−1`; `n = 1` e `n = 10`;
  carência 0 e máxima; âncora em dia 31 (`2026-01-31` → `04-30`, `05-31`, `06-30`).
  **Teste de propriedade** com gerador determinístico (sem dependência nova), sobre
  centenas de combinações de principal (1..500000), `n` (1..12), taxa (0..1000):
  soma = total; toda parcela ≥ 1; parcelas 1..n−1 iguais; última − base < n;
  vencimentos estritamente crescentes.
- `test/loans/loan-terms.spec.ts` — min−1, min, max, max+1; carência max e max+1;
  total < n.
- `test/loans/dto/create-loan.dto.spec.ts` — cada campo: tipo errado, não inteiro,
  negativo, ausente; `disbursedAt` `2026-02-30`, `2026-13-01`, com hora.
- `test/shared/decorators/is-calendar-date.decorator.spec.ts`.
- `test/loans/loan-response.spec.ts` — total/contagem derivados; ordenação das parcelas.
- `test/loans/loans.service.spec.ts` — db mockado: 404 tomador/fundo/empréstimo; 422
  sem versão e por violação; usa a versão de maior número. Se o teste de atomicidade
  no e2e se mostrar frágil, ele vem para cá com a transação mockada.
- `test/funds/funds.service.spec.ts` — versão vigente; fundo sem versão → `null`.
- `test/db/is-foreign-key-violation.spec.ts`.
- `test/borrowers/borrowers.service.spec.ts` — `23503` → `409`.

**E2E** (banco real, padrão de `borrowers.e2e-spec.ts`; cada suíte cria fundo próprio
com versões v1 e v2 de limites diferentes e tomador próprio, e limpa no `afterAll`):
- `test/loans/loans.e2e-spec.ts`:
  - Criação usa a v2; parcelas gravadas conferidas literalmente (valores e datas).
  - Imutabilidade: após criar, insere v3 com outros limites → o empréstimo continua
    na v2 com os mesmos valores; novo empréstimo usa v3.
  - Atomicidade: falha forçada no insert das parcelas → nenhum empréstimo órfão.
  - `403` para `field_agent` no `POST`; `GET /loans/:id` para ambos os papéis;
    `GET /borrowers/:id/loans`; `400`, `401`, `404` (cada recurso), `422` (cada motivo).
  - `DELETE /borrowers/:id` com empréstimo → `409`.
- `test/funds/funds.e2e-spec.ts` — lista com a versão vigente; fundo sem versão →
  `currentVersion: null`.

**Verificação final:** `pnpm lint`, `pnpm test`, `pnpm test:integration`, e
`db:generate` gerando apenas as 4 tabelas novas e o enum `installment_status`.
