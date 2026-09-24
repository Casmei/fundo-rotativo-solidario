import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, type TestingModule } from '@nestjs/testing';
import { inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../../src/app.module.js';
import type { AuthTokenPayload } from '../../src/auth/auth-token-payload.js';
import { loadEnv } from '../../src/config/env.js';
import type { Database } from '../../src/db/db.module.js';
import * as schema from '../../src/db/schema.js';
import { Role } from '../../src/shared/role.enum.js';

const CPF_A = '52998224725';
const CPF_B = '11144477735';
const TEST_CPFS = [CPF_A, CPF_B];
const MISSING_ID = '00000000-0000-4000-8000-000000000000';

describe('BorrowersController (e2e)', () => {
  let app: INestApplication<App>;
  let queryClient: ReturnType<typeof postgres>;
  let db: Database;
  let backOfficeToken: string;
  let fieldAgentToken: string;

  const cleanUp = () => db.delete(schema.borrowers).where(inArray(schema.borrowers.cpf, TEST_CPFS));

  beforeAll(async () => {
    const env = loadEnv();
    queryClient = postgres(env.DATABASE_URL);
    db = drizzle(queryClient, { schema });

    const jwt = new JwtService({ secret: env.JWT_SECRET });
    const payload = (role: Role): AuthTokenPayload => ({
      sub: 'e2e',
      phone: '0',
      role,
      name: 'E2E',
    });
    backOfficeToken = await jwt.signAsync(payload(Role.BackOffice));
    fieldAgentToken = await jwt.signAsync(payload(Role.FieldAgent));
  });

  afterAll(async () => {
    await cleanUp();
    await queryClient.end();
  });

  beforeEach(async () => {
    await cleanUp();
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  const asBackOffice = (req: request.Test) => req.set('Authorization', `Bearer ${backOfficeToken}`);
  const asFieldAgent = (req: request.Test) => req.set('Authorization', `Bearer ${fieldAgentToken}`);

  async function createBorrower(
    body: Record<string, unknown> = { name: 'Maria', cpf: '529.982.247-25' },
  ) {
    const response = await asBackOffice(request(app.getHttpServer()).post('/borrowers'))
      .send(body)
      .expect(201);
    return response.body as { id: string; name: string; cpf: string; createdAt: string };
  }

  it('creates a borrower with a normalized CPF', async () => {
    const created = await createBorrower();
    expect(created).toMatchObject({ name: 'Maria', cpf: CPF_A });
    expect(typeof created.id).toBe('string');
  });

  it('ignores client-supplied id and createdAt', async () => {
    const created = await createBorrower({
      name: 'Maria',
      cpf: CPF_A,
      id: MISSING_ID,
      createdAt: '2000-01-01',
    });
    expect(created.id).not.toBe(MISSING_ID);
    expect(new Date(created.createdAt).getFullYear()).not.toBe(2000);
  });

  it('rejects an invalid CPF with 400', async () => {
    await asBackOffice(request(app.getHttpServer()).post('/borrowers'))
      .send({ name: 'Maria', cpf: '52998224724' })
      .expect(400);
  });

  it('rejects a duplicate CPF with 409', async () => {
    await createBorrower();
    await asBackOffice(request(app.getHttpServer()).post('/borrowers'))
      .send({ name: 'Outra', cpf: CPF_A })
      .expect(409);
  });

  it('forbids field agents from creating', async () => {
    await asFieldAgent(request(app.getHttpServer()).post('/borrowers'))
      .send({ name: 'Maria', cpf: CPF_A })
      .expect(403);
  });

  it('requires authentication', async () => {
    await request(app.getHttpServer()).get('/borrowers').expect(401);
  });

  it('lists borrowers without CPF, for both roles', async () => {
    await createBorrower();
    for (const as of [asBackOffice, asFieldAgent]) {
      const response = await as(request(app.getHttpServer()).get('/borrowers')).expect(200);
      const item = response.body.find((b: { name: string }) => b.name === 'Maria');
      expect(Object.keys(item).sort()).toEqual(['id', 'name']);
    }
  });

  it('shows CPF on detail only to back office', async () => {
    const { id } = await createBorrower();

    const backOffice = await asBackOffice(
      request(app.getHttpServer()).get(`/borrowers/${id}`),
    ).expect(200);
    expect(backOffice.body.cpf).toBe(CPF_A);

    const fieldAgent = await asFieldAgent(
      request(app.getHttpServer()).get(`/borrowers/${id}`),
    ).expect(200);
    expect(fieldAgent.body).not.toHaveProperty('cpf');
    expect(fieldAgent.body.name).toBe('Maria');
  });

  it('returns 404 for a missing borrower and 400 for a non-UUID id', async () => {
    await asBackOffice(request(app.getHttpServer()).get(`/borrowers/${MISSING_ID}`)).expect(404);
    await asBackOffice(request(app.getHttpServer()).get('/borrowers/not-a-uuid')).expect(400);
  });

  it('updates name and CPF', async () => {
    const { id } = await createBorrower();
    const response = await asBackOffice(request(app.getHttpServer()).patch(`/borrowers/${id}`))
      .send({ name: 'Maria Silva', cpf: '111.444.777-35' })
      .expect(200);
    expect(response.body).toMatchObject({ id, name: 'Maria Silva', cpf: CPF_B });
  });

  it('allows re-sending the same CPF on update', async () => {
    const { id } = await createBorrower();
    await asBackOffice(request(app.getHttpServer()).patch(`/borrowers/${id}`))
      .send({ cpf: '529.982.247-25' })
      .expect(200);
  });

  it('rejects updating to another borrower CPF with 409', async () => {
    await createBorrower();
    const other = await createBorrower({ name: 'Ana', cpf: CPF_B });
    await asBackOffice(request(app.getHttpServer()).patch(`/borrowers/${other.id}`))
      .send({ cpf: CPF_A })
      .expect(409);
  });

  it('forbids field agents from updating and deleting', async () => {
    const { id } = await createBorrower();
    await asFieldAgent(request(app.getHttpServer()).patch(`/borrowers/${id}`))
      .send({ name: 'X' })
      .expect(403);
    await asFieldAgent(request(app.getHttpServer()).delete(`/borrowers/${id}`)).expect(403);
  });

  it('deletes a borrower, then returns 404', async () => {
    const { id } = await createBorrower();
    await asBackOffice(request(app.getHttpServer()).delete(`/borrowers/${id}`)).expect(204);
    await asBackOffice(request(app.getHttpServer()).get(`/borrowers/${id}`)).expect(404);
    await asBackOffice(request(app.getHttpServer()).delete(`/borrowers/${id}`)).expect(404);
  });

  it('rejects null fields on update with 400', async () => {
    const { id } = await createBorrower();
    await asBackOffice(request(app.getHttpServer()).patch(`/borrowers/${id}`))
      .send({ name: null })
      .expect(400);
    await asBackOffice(request(app.getHttpServer()).patch(`/borrowers/${id}`))
      .send({ cpf: null })
      .expect(400);
  });
});
