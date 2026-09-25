import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { Role } from '../../src/shared/role.enum.js';
import { createTestApp, signTestTokens } from '../support/e2e-app.js';
import { FRSBJ_POLICY, LoanFixtures } from '../support/loan-fixtures.js';
import { connectTestDb } from '../support/test-db.js';

describe('GET /funds (e2e)', () => {
  let app: INestApplication<App>;
  let connection: ReturnType<typeof connectTestDb>;
  let fixtures: LoanFixtures;
  let tokens: Record<Role, string>;

  beforeAll(async () => {
    connection = connectTestDb();
    fixtures = new LoanFixtures(connection.db);
    tokens = await signTestTokens();
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
    await fixtures.cleanUp();
    await connection.close();
  });

  it('requires authentication', async () => {
    await request(app.getHttpServer()).get('/funds').expect(401);
  });

  it.each([Role.BackOffice, Role.FieldAgent])(
    'lists funds with their current rules for %s',
    async (role) => {
      const withVersions = await fixtures.fund([
        { ...FRSBJ_POLICY, maxInstallments: 4 },
        FRSBJ_POLICY,
      ]);
      const withoutVersion = await fixtures.fund();

      const response = await request(app.getHttpServer())
        .get('/funds')
        .set('Authorization', `Bearer ${tokens[role]}`)
        .expect(200);

      const byId = new Map(response.body.map((fund: { id: string }) => [fund.id, fund]));
      expect(byId.get(withVersions.fund.id)).toEqual({
        id: withVersions.fund.id,
        name: withVersions.fund.name,
        currentVersion: { id: withVersions.versions[1].id, version: 2, ...FRSBJ_POLICY },
      });
      expect(byId.get(withoutVersion.fund.id)).toEqual({
        id: withoutVersion.fund.id,
        name: withoutVersion.fund.name,
        currentVersion: null,
      });
    },
  );
});
