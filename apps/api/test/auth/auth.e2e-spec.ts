import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import bcrypt from 'bcrypt';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../../src/app.module.js';
import { loadEnv } from '../../src/config/env.js';
import * as schema from '../../src/db/schema.js';
import { Role } from '../../src/shared/role.enum.js';

const TEST_USER = {
  name: 'Teste E2E',
  phone: '5533900009999',
  password: 'correct-password',
  role: Role.FieldAgent,
};

describe('AuthController (e2e)', () => {
  let app: INestApplication<App>;
  let queryClient: ReturnType<typeof postgres>;

  beforeAll(async () => {
    const env = loadEnv();
    queryClient = postgres(env.DATABASE_URL);
    const db = drizzle(queryClient, { schema });

    const passwordHash = await bcrypt.hash(TEST_USER.password, 10);
    await db.delete(schema.users).where(eq(schema.users.phone, TEST_USER.phone));
    await db.insert(schema.users).values({
      name: TEST_USER.name,
      phone: TEST_USER.phone,
      passwordHash,
      role: TEST_USER.role,
    });
  });

  afterAll(async () => {
    const db = drizzle(queryClient, { schema });
    await db.delete(schema.users).where(eq(schema.users.phone, TEST_USER.phone));
    await queryClient.end();
  });

  beforeEach(async () => {
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

  it('returns an access token for valid credentials', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ phone: TEST_USER.phone, password: TEST_USER.password })
      .expect(200);

    expect(typeof response.body.accessToken).toBe('string');
  });

  it('rejects an incorrect password', () => {
    return request(app.getHttpServer())
      .post('/auth/login')
      .send({ phone: TEST_USER.phone, password: 'wrong-password' })
      .expect(401);
  });

  it('rejects a phone number that does not exist', () => {
    return request(app.getHttpServer())
      .post('/auth/login')
      .send({ phone: '5533900000000', password: 'whatever12' })
      .expect(401);
  });

  it('rejects a request missing the password field', () => {
    return request(app.getHttpServer())
      .post('/auth/login')
      .send({ phone: TEST_USER.phone })
      .expect(400);
  });
});
