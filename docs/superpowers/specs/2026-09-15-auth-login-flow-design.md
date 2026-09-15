# Design — Fluxo de login no backend (FRSBJ)

**Data:** 2026-09-15
**Branch:** `Tiago-Castro/criao-do-fluxo-de-login-no-bac`
**Relacionado:** `docs/mvp.md` (RF09 — Controle de acesso por perfil, RNF04 — Controle de acesso)

## 1. Contexto e objetivo

O `apps/api` é hoje um scaffold NestJS limpo, sem ORM, sem tabela de usuário e sem
nenhum fluxo de autenticação. O `docs/mvp.md` exige (RF09/RNF04) autenticação
obrigatória com restrição de funcionalidades por perfil (Técnico de Campo /
Administrativo). Este documento especifica o subsistema de autenticação que serve de
base para todo o controle de acesso do sistema.

## 2. Escopo

**Dentro do escopo:**
- Tabela `users` (Postgres, via Drizzle ORM).
- Login por telefone + senha, retornando um JWT.
- Guards para proteger rotas e restringir por papel (`role`).
- Script de seed com as duas contas reais iniciais (Bruno / Luana).
- Validação de variáveis de ambiente (envalid).
- Tasks de Turborepo para migration e seed.

**Fora do escopo (decisão explícita):**
- Endpoint de cadastro de usuário (self-service ou via Administrativo/`back_office`).
  Novos usuários, por ora, só entram via seed/inserção manual.
- Refresh token / revogação de sessão — access token de vida longa (7 dias), sem
  refresh flow.
- Troca de senha / recuperação de senha.
- Qualquer entidade de negócio além de `users` (Tomador, Empréstimo, Parcela,
  Visita ficam para specs futuras, reaproveitando a mesma base Drizzle).

## 3. Decisões de arquitetura

| Decisão | Escolha | Motivo |
|---|---|---|
| Mecanismo de autenticação | JWT (Bearer token) | API stateless, consumida por um front (web/mobile) ainda não criado no monorepo; evita gerenciar sessão em servidor. |
| ORM | Drizzle | Escolha do usuário — schema leve, SQL-like, vai servir de base para as demais entidades do MVP. |
| Verificação de token | Guard custom (`@nestjs/jwt`), sem Passport | YAGNI — só há uma estratégia (JWT) e dois papéis; Passport só compensaria com múltiplas estratégias de auth. |
| Identificador de login | `phone` (não `username`/`email`) | Poucos usuários internos, sem autocadastro; telefone é o dado que a Cáritas já usa para identificar tecnicos/administrativos em campo. |
| Expiração do JWT | Access token único, 7 dias, sem refresh | Técnicos de campo passam o dia em locais com conectividade ruim (RNF07 em aberto); simplicidade para um MVP sem front-end ainda. |
| Idioma do código | Tudo em inglês (tabela, colunas, enum, DTOs) | Consistência de codebase; documentação de negócio (`mvp.md`) continua em português. |
| Seed | Serve dev **e** produção | Contas de Bruno e Luana são reais; telefone e senha vêm de env vars (sem PII/segredo hardcoded no git). |

## 4. Módulos e dependências novas

Novas dependências em `apps/api`:
- `drizzle-orm`, `drizzle-kit`, `postgres` (driver `postgres.js`) — acesso ao Postgres.
- `@nestjs/jwt` — assinatura/verificação do token.
- `bcrypt` — hash de senha.
- `class-validator`, `class-transformer` — validação de DTOs via `ValidationPipe` global.
- `envalid` — validação de variáveis de ambiente no boot.

Estrutura nova em `apps/api/src`:
```
config/
  env.ts               # envalid: DATABASE_URL, JWT_SECRET, PORT
db/
  schema.ts            # tabela users (Drizzle)
  client.ts            # instância do Drizzle conectada via DATABASE_URL
  migrations/          # geradas pelo drizzle-kit
  seed.ts              # script de seed (Bruno/Luana)
  seed.env.ts          # envalid: SEED_BRUNO_PHONE/PASSWORD, SEED_LUANA_PHONE/PASSWORD
auth/
  auth.module.ts
  auth.controller.ts   # POST /auth/login
  auth.service.ts      # valida credenciais, assina JWT
  dto/
    login.dto.ts        # { phone, password } com class-validator
  jwt-auth.guard.ts     # CanActivate: valida Bearer token (global via APP_GUARD)
  roles.guard.ts        # CanActivate: valida @Roles(...) contra o role do token (global via APP_GUARD)
  public.decorator.ts   # @Public() — pula o JwtAuthGuard
  roles.decorator.ts    # @Roles('field_agent' | 'back_office')
  current-user.decorator.ts # @CurrentUser() — extrai payload do request
```

`AppModule` importa `AuthModule`; módulos de domínio futuros reaproveitam o mesmo
`db/client.ts`.

## 5. Modelo de dados

```ts
export const roleEnum = pgEnum('role', ['field_agent', 'back_office']);

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  phone: text('phone').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: roleEnum('role').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});
```

- `role`: `field_agent` (Técnico de Campo) / `back_office` (Administrativo). Mapeamento
  registrado também em `docs/mvp.md` (seção 3 — Atores).
- `phone` normalizado (só dígitos) antes de gravar/consultar, para evitar duplicidade
  por formatação (`"(11) 91234-5678"` vs `"11912345678"`).
- Migration gerada via `drizzle-kit generate` e aplicada via `pnpm turbo db:migrate`.

## 6. Fluxo de autenticação

### `POST /auth/login`
Body: `{ phone: string, password: string }`

1. `ValidationPipe` valida o DTO (`class-validator`).
2. `AuthService` normaliza `phone` e busca o `user` correspondente.
3. Compara `password` com `passwordHash` via `bcrypt.compare`.
4. Se usuário não existe **ou** senha não confere → `401 Unauthorized`, mensagem
   genérica ("Invalid credentials") — não revela qual dos dois campos errou.
5. Se válido → assina JWT (`JwtService.signAsync`, `expiresIn: '7d'`) com payload
   `{ sub: user.id, phone, role, name }`.
6. Retorna `{ accessToken }`.

### Guards (globais, via `APP_GUARD`, nessa ordem)
1. **`JwtAuthGuard`** — roda em toda rota por padrão (secure-by-default). Lê
   `Authorization: Bearer <token>`, verifica com `JwtService.verifyAsync`, popula
   `req.user`. Rotas com `@Public()` pulam o guard (usado em `POST /auth/login`).
   Token ausente/inválido/expirado → `401`.
2. **`RolesGuard`** — se a rota tiver `@Roles(...)`, compara com `req.user.role`;
   sem o decorator, qualquer usuário autenticado passa. Role sem permissão → `403`.

### Decorators auxiliares
- `@Public()` — marca rota como isenta de autenticação.
- `@Roles(...roles: Role[])` — restringe rota a papéis específicos.
- `@CurrentUser()` — extrai `req.user` tipado (`{ sub, phone, role, name }`).

## 7. Configuração e variáveis de ambiente (envalid)

`apps/api/src/config/env.ts` — validado no boot (`main.ts`), falha rápido se faltar algo:
- `DATABASE_URL` (`str`, obrigatório)
- `JWT_SECRET` (`str`, obrigatório)
- `PORT` (`port`, default `3000`)

`apps/api/src/db/seed.env.ts` — validado só na execução do seed:
- `SEED_BRUNO_PHONE`, `SEED_LUANA_PHONE` (`str`, obrigatórios, sem default)
- `SEED_BRUNO_PASSWORD`, `SEED_LUANA_PASSWORD` (`str`, com `default(...)` de dev;
  loga aviso no console se cair no default)

Um `.env.example` novo documenta todas essas chaves.

## 8. Seed

`apps/api/src/db/seed.ts`, rodado via `pnpm turbo db:seed` (ou
`pnpm --filter api db:seed`):

- Cria Bruno (`role: 'back_office'`) e Luana (`role: 'field_agent'`) com
  `name`/`phone`/senha vindos de env vars.
- **Idempotente:** se já existe `user` com aquele `phone`, pula a criação (log
  informativo) — evita sobrescrever a senha de alguém que já trocou a própria senha
  depois, e torna seguro rodar o seed de novo em produção (ex.: novo deploy).

## 9. Turborepo

Novas tasks em `turbo.json`, sem `dependsOn`/`outputs` (scripts side-effecting,
rodam direto via `tsx` contra os `.ts`, não cacheáveis):
```json
"db:migrate": { "cache": false },
"db:seed": { "cache": false }
```
Scripts correspondentes em `apps/api/package.json` (`db:migrate`, `db:seed`,
`db:generate` para `drizzle-kit generate`).

## 10. Erros

| Situação | Status | Mensagem |
|---|---|---|
| `phone`/`password` ausentes ou mal formatados | `400` | erro de validação do `class-validator` |
| `phone` não cadastrado ou senha incorreta | `401` | "Invalid credentials" (genérica) |
| Token ausente, inválido ou expirado | `401` | "Unauthorized" |
| Token válido, role sem permissão | `403` | "Forbidden" |

## 11. Testes

- **Unitários:** `AuthService` (login com credenciais corretas/erradas/usuário
  inexistente), `JwtAuthGuard`/`RolesGuard` (com `ExecutionContext` mockado).
- **E2E** (`vitest.config.e2e.ts`, já existente no projeto): `POST /auth/login`
  (sucesso, senha errada, telefone inexistente, body inválido); uma rota protegida
  de exemplo confirmando `401` sem token e `403` com role errada.

## 12. Alterações em `docs/mvp.md`

- Seção 3 (Atores): anotar o identificador de código ao lado de cada papel —
  "Técnico de Campo (`field_agent`)", "Administrativo (`back_office`)".
- Seção 6.1 (ERD) / 6.2 (matriz de permissões): mesma nota de mapeamento PT↔EN
  junto ao campo `perfil`/`role` da entidade `USUARIO`.

## 13. Fora de escopo / considerações futuras

- Endpoint de cadastro de usuário pelo `back_office`.
- Refresh token / logout / revogação de token.
- Troca e recuperação de senha.
- Suporte offline (RNF07 do `mvp.md` segue em aberto — não endereçado aqui).
