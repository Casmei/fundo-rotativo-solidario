# Design — CRUD de Tomadores (FRSBJ)

**Data:** 2026-09-23
**Branch:** `Tiago-Castro/add-borrowers-crud`
**Relacionado:** `docs/mvp.md` (RF02 — Cadastrar tomador, RF07 — Consultar cadastro,
RF09 / RNF03 — CPF visível só para Administrativo, RNF06 — sem duplicidade de tomador)

## 1. Contexto e objetivo

O `apps/api` já tem autenticação por JWT, guards globais (`JwtAuthGuard`, `RolesGuard`)
e Drizzle configurado com a tabela `users`. Este documento especifica a primeira
entidade de negócio do MVP: o **Tomador** (`borrower`), com um CRUD simples.

Aproveitando a mudança, os papéis (`field_agent` / `back_office`) deixam de ser strings
soltas e passam a ser um `enum` compartilhado, e as funções utilitárias de telefone e
CPF passam a morar num diretório `shared/` reutilizável por todos os módulos.

## 2. Escopo

**Dentro do escopo:**
- Tabela `borrowers` com `name` e `cpf`.
- Endpoints de criar, listar, detalhar, editar e remover (hard delete) tomador.
- CPF obrigatório, único, normalizado e com dígito verificador validado.
- CPF nunca aparece na listagem; no detalhe, só aparece para `back_office`.
- Criação de `src/shared/` com:
  - `enum Role` (substitui as strings mágicas de papel em todo o código e testes);
  - `normalizePhone` (movido de `src/auth/normalize-phone.ts`);
  - `normalizeCpf` / `isValidCpf` e o decorator `@IsCpf()`.

**Fora do escopo (decisão explícita):**
- Campos `tipo` (individual/coletivo), `integrantes` e `endereço` do tomador — ficam
  para uma spec futura.
- Empréstimo, Parcela, Visita.
- Paginação, busca e filtros na listagem.
- Soft delete / histórico de alterações.
- Importação em lote (RF01).

## 3. Decisões de arquitetura

| Decisão | Escolha | Motivo |
|---|---|---|
| Esconder CPF por papel | Mapper explícito no controller (`toBorrowerResponse(borrower, role)`) | Regra visível e testável como função pura; evita interceptor global de serialização (`class-transformer` groups) e evita misturar regra de apresentação na query. |
| Remoção | Hard delete | Ainda não há entidades que referenciem o tomador. Quando Empréstimo existir, a FK usará `ON DELETE RESTRICT`. |
| Duplicidade de CPF | Constraint `unique` no banco + tradução do erro `23505` para `409` | Sem `SELECT` prévio, então sem corrida entre dois cadastros simultâneos (RNF08). |
| Formato do CPF armazenado | Só os 11 dígitos | Mesmo padrão do `phone`: evita duplicidade por formatação. |
| Papéis | `enum Role` TypeScript em `src/shared/role.enum.ts`, usado para gerar o `pgEnum` | Elimina strings mágicas; o banco não muda (mesmos valores). |
| Utilitários compartilhados | `src/shared/` | Telefone e CPF são conceitos de domínio usados por mais de um módulo (auth, seed, borrowers). |
| Paginação | Nenhuma | Poucos tomadores no MVP (YAGNI). |

## 4. Estrutura de arquivos

Novos / alterados em `apps/api/src`:

```
shared/
  role.enum.ts                 # enum Role { FieldAgent = 'field_agent', BackOffice = 'back_office' }
  phone.ts                     # normalizePhone (movido de auth/normalize-phone.ts)
  cpf.ts                       # normalizeCpf, isValidCpf
  decorators/
    is-cpf.decorator.ts        # @IsCpf() — class-validator, usa isValidCpf
borrowers/
  borrowers.module.ts          # importa DbModule
  borrowers.controller.ts      # 5 rotas
  borrowers.service.ts         # create / findAll / findOne / update / remove
  borrower-response.ts         # toBorrowerResponse, toBorrowerListItem
  dto/
    create-borrower.dto.ts
    update-borrower.dto.ts
db/
  schema.ts                    # roleEnum gerado a partir de Role; + tabela borrowers
  migrations/0001_*.sql        # gerada via drizzle-kit generate
app.module.ts                  # + BorrowersModule
```

Removido: `src/auth/normalize-phone.ts` (os imports em `auth.service.ts` e
`db/upsert-seed-user.ts` passam a apontar para `shared/phone.ts`).

Testes espelham `src/` em `test/` (`test/shared/...`, `test/borrowers/...`);
`test/auth/normalize-phone.spec.ts` vira `test/shared/phone.spec.ts`.

## 5. Enum `Role`

```ts
// src/shared/role.enum.ts
export enum Role {
  FieldAgent = 'field_agent',
  BackOffice = 'back_office',
}
```

```ts
// src/db/schema.ts
export const roleEnum = pgEnum('role', Role);
```

- O tipo `Role` deixa de ser exportado por `db/schema.ts`; `auth-token-payload.ts`,
  `roles.decorator.ts`, `upsert-seed-user.ts` passam a importar de `shared/role.enum.ts`.
- `@Roles('back_office')` vira `@Roles(Role.BackOffice)`; `seed.ts` e todos os testes
  trocam literais por `Role.FieldAgent` / `Role.BackOffice`.
- Rodar `db:generate` após a mudança **não pode** gerar migration para o enum `role`
  (valores idênticos). Se a versão do Drizzle não aceitar o enum TS diretamente em
  `pgEnum`, usar `pgEnum('role', [Role.FieldAgent, Role.BackOffice])`.

## 6. Modelo de dados

```ts
export const borrowers = pgTable('borrowers', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  cpf: text('cpf').notNull().unique(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
});

export type Borrower = typeof borrowers.$inferSelect;
export type NewBorrower = typeof borrowers.$inferInsert;
```

## 7. CPF

`src/shared/cpf.ts`:
- `normalizeCpf(cpf: string): string` — remove tudo que não é dígito.
- `isValidCpf(cpf: string): boolean` — normaliza; exige 11 dígitos; rejeita sequências
  de dígito repetido (`00000000000` … `99999999999`); confere os dois dígitos
  verificadores.

`@IsCpf()` (`shared/decorators/is-cpf.decorator.ts`): decorator do `class-validator`
que falha se o valor não for string ou se `isValidCpf` retornar `false`. Mensagem:
`"cpf must be a valid CPF"`.

O DTO aceita CPF formatado (`123.456.789-09`) ou só dígitos; o **service** normaliza
com `normalizeCpf` antes de gravar (mesmo padrão do `normalizePhone` no login).

## 8. API

Todas as rotas exigem autenticação (via `JwtAuthGuard` global). `:id` passa por
`ParseUUIDPipe`.

| Método | Rota | Papéis | Sucesso | Corpo da resposta |
|---|---|---|---|---|
| `POST` | `/borrowers` | `Role.BackOffice` | `201` | `{ id, name, cpf, createdAt, updatedAt }` |
| `GET` | `/borrowers` | ambos | `200` | `[{ id, name }]`, ordenado por `name` asc |
| `GET` | `/borrowers/:id` | ambos | `200` | `{ id, name, cpf?, createdAt, updatedAt }` — `cpf` só para `back_office` |
| `PATCH` | `/borrowers/:id` | `Role.BackOffice` | `200` | `{ id, name, cpf, createdAt, updatedAt }` |
| `DELETE` | `/borrowers/:id` | `Role.BackOffice` | `204` | vazio |

### DTOs
- `CreateBorrowerDto`: `name` (`@IsString`, `@IsNotEmpty`, trim via `@Transform`),
  `cpf` (`@IsCpf`).
- `UpdateBorrowerDto`: mesmos campos, ambos `@IsOptional`. Body vazio é aceito e
  devolve o tomador sem alteração.

### Mappers (`borrower-response.ts`)
- `toBorrowerListItem(borrower) → { id, name }`.
- `toBorrowerResponse(borrower, role) → { id, name, createdAt, updatedAt }` + `cpf`
  somente quando `role === Role.BackOffice`.

O controller obtém o papel via `@CurrentUser()`. `POST` e `PATCH` também passam pelo
mapper (sempre `back_office`, então sempre com CPF).

## 9. Erros

| Situação | Status |
|---|---|
| Body inválido (nome vazio, CPF inválido), `:id` não-UUID | `400` |
| Sem token / token inválido | `401` |
| `field_agent` em `POST` / `PATCH` / `DELETE` | `403` |
| Tomador inexistente em `GET /:id`, `PATCH`, `DELETE` | `404` |
| CPF já cadastrado (create ou update) | `409` — `"Borrower with this CPF already exists"` |

O service identifica o conflito inspecionando o código `23505` no erro do Postgres
(o Drizzle o expõe em `error.cause`; checar também o próprio `error` por robustez) e
lança `ConflictException`. Qualquer outro erro é relançado.

## 10. Testes (TDD, vitest)

**Unitários:**
- `test/shared/cpf.spec.ts` — normalização; CPFs válidos (com e sem máscara); dígito
  verificador errado; sequências repetidas; tamanho errado.
- `test/shared/phone.spec.ts` — testes existentes movidos.
- `test/shared/decorators/is-cpf.decorator.spec.ts` — via `validate()` do class-validator.
- `test/borrowers/dto/*.spec.ts` — validação dos DTOs.
- `test/borrowers/borrower-response.spec.ts` — CPF presente para `back_office`,
  ausente para `field_agent`; list item nunca tem CPF.
- `test/borrowers/borrowers.service.spec.ts` — db mockado: normaliza CPF; `23505` → `409`;
  resultado vazio → `404`; outros erros relançados.
- Testes existentes de auth/seed atualizados para usar `Role`.

**E2E** (`test/borrowers/borrowers.e2e-spec.ts`, banco real, como `auth.e2e-spec.ts`,
tokens assinados com `JwtService` a partir do `JWT_SECRET` do env):
- CRUD completo como `back_office`.
- `403` em `POST` / `PATCH` / `DELETE` como `field_agent`.
- Listagem sem CPF; detalhe sem CPF para `field_agent` e com CPF para `back_office`.
- `409` em CPF duplicado (create e update); `404`; `400` para CPF e UUID inválidos;
  `401` sem token.
- Limpeza dos tomadores criados no `afterAll`.

**Verificação final:** `pnpm lint`, `pnpm test`, `pnpm test:integration`, e
`db:generate` gerando apenas a criação da tabela `borrowers`.
