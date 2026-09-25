import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import type { Borrower, Fund, FundVersion } from '../../src/db/schema.js';
import { MAX_PRINCIPAL_CENTS } from '../../src/loans/dto/create-loan.dto.js';
import { Role } from '../../src/shared/role.enum.js';
import { createTestApp, signTestTokens } from '../support/e2e-app.js';
import { FRSBJ_POLICY, LoanFixtures } from '../support/loan-fixtures.js';
import { connectTestDb } from '../support/test-db.js';

const MISSING_ID = '00000000-0000-4000-8000-000000000000';

describe('Loans (e2e)', () => {
  let app: INestApplication<App>;
  let connection: ReturnType<typeof connectTestDb>;
  let fixtures: LoanFixtures;
  let tokens: Record<Role, string>;
  let fund: Fund;
  let oldVersion: FundVersion;
  let currentVersion: FundVersion;
  let borrower: Borrower;

  beforeAll(async () => {
    connection = connectTestDb();
    fixtures = new LoanFixtures(connection.db);
    tokens = await signTestTokens();
    app = await createTestApp();
    const created = await fixtures.fund([{ ...FRSBJ_POLICY, maxInstallments: 4 }, FRSBJ_POLICY]);
    fund = created.fund;
    [oldVersion, currentVersion] = created.versions;
    borrower = await fixtures.borrower();
  });

  afterAll(async () => {
    await app.close();
    await fixtures.cleanUp();
    await connection.close();
  });

  const http = () => request(app.getHttpServer());
  const as = (role: Role, req: request.Test) => req.set('Authorization', `Bearer ${tokens[role]}`);

  const validBody = (borrowerId = borrower.id): Record<string, unknown> => ({
    borrowerId,
    fundId: fund.id,
    principalCents: 320000,
    installmentCount: 3,
    disbursedAt: '2026-01-31',
    graceMonths: 2,
  });

  async function createLoan(body: Record<string, unknown> = validBody()) {
    const response = await as(Role.BackOffice, http().post('/loans')).send(body).expect(201);
    return response.body;
  }

  describe('POST /loans', () => {
    it('creates a loan with its installments', async () => {
      const body = await createLoan();

      expect(body).toEqual({
        id: expect.any(String),
        borrower: { id: borrower.id, name: borrower.name },
        fund: { id: fund.id, name: fund.name },
        fundVersion: { id: currentVersion.id, version: 2, contributionRateBps: 500 },
        principalCents: 320000,
        totalCents: 336000,
        installmentCount: 3,
        disbursedAt: '2026-01-31',
        graceMonths: 2,
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
        installments: [
          {
            id: expect.any(String),
            number: 1,
            dueDate: '2026-04-30',
            amountCents: 112000,
            status: 'pending',
          },
          {
            id: expect.any(String),
            number: 2,
            dueDate: '2026-05-31',
            amountCents: 112000,
            status: 'pending',
          },
          {
            id: expect.any(String),
            number: 3,
            dueDate: '2026-06-30',
            amountCents: 112000,
            status: 'pending',
          },
        ],
      });
      expect(JSON.stringify(body)).not.toContain(borrower.cpf);
    });

    it('ignores client-supplied computed fields', async () => {
      const body = await createLoan({
        ...validBody(),
        id: MISSING_ID,
        totalCents: 1,
        fundVersionId: oldVersion.id,
        installments: [{ number: 1, amountCents: 1 }],
      });

      expect(body.id).not.toBe(MISSING_ID);
      expect(body.totalCents).toBe(336000);
      expect(body.fundVersion.id).toBe(currentVersion.id);
      expect(body.installments).toHaveLength(3);
    });

    it.each([
      ['missing borrowerId', { borrowerId: undefined }],
      ['non-UUID borrowerId', { borrowerId: 'abc' }],
      ['missing fundId', { fundId: undefined }],
      ['principalCents as a string', { principalCents: '320000' }],
      ['principalCents zero', { principalCents: 0 }],
      ['principalCents with fraction', { principalCents: 3200.5 }],
      ['principalCents above the maximum', { principalCents: MAX_PRINCIPAL_CENTS + 1 }],
      ['principalCents beyond a Postgres integer', { principalCents: 3_000_000_000 }],
      ['installmentCount zero', { installmentCount: 0 }],
      ['installmentCount as a string', { installmentCount: '3' }],
      ['graceMonths negative', { graceMonths: -1 }],
      ['impossible disbursedAt', { disbursedAt: '2026-02-30' }],
      ['disbursedAt with time', { disbursedAt: '2026-01-31T03:00:00Z' }],
    ])('rejects %s with 400', async (_, overrides) => {
      await as(Role.BackOffice, http().post('/loans'))
        .send({ ...validBody(), ...overrides })
        .expect(400);
    });

    it('requires authentication', async () => {
      await http().post('/loans').send(validBody()).expect(401);
    });

    it('forbids field agents', async () => {
      await as(Role.FieldAgent, http().post('/loans')).send(validBody()).expect(403);
    });

    it.each([
      ['borrower', { borrowerId: MISSING_ID }, 'Borrower not found'],
      ['fund', { fundId: MISSING_ID }, 'Fund not found'],
    ])('returns 404 for a missing %s', async (_, overrides, message) => {
      const response = await as(Role.BackOffice, http().post('/loans'))
        .send({ ...validBody(), ...overrides })
        .expect(404);
      expect(response.body.message).toBe(message);
    });

    it.each([
      [{ installmentCount: 11 }, 'installmentCount must be between 1 and 10'],
      [{ graceMonths: 7 }, 'graceMonths must be at most 6'],
      [
        { principalCents: 1, installmentCount: 2 },
        'principalCents is too small for 2 installments',
      ],
    ])('returns 422 for %o', async (overrides, message) => {
      const response = await as(Role.BackOffice, http().post('/loans'))
        .send({ ...validBody(), ...overrides })
        .expect(422);
      expect(response.body.message).toBe(message);
    });

    it('returns 422 for a fund without versions', async () => {
      const { fund: empty } = await fixtures.fund();
      const response = await as(Role.BackOffice, http().post('/loans'))
        .send({ ...validBody(), fundId: empty.id })
        .expect(422);
      expect(response.body.message).toBe('Fund has no version');
    });
  });

  describe('GET /loans/:id', () => {
    it.each([Role.BackOffice, Role.FieldAgent])('returns the loan to %s', async (role) => {
      const created = await createLoan();
      const response = await as(role, http().get(`/loans/${created.id}`)).expect(200);
      expect(response.body).toEqual(created);
    });

    it('returns 404 for a missing loan and 400 for a non-UUID id', async () => {
      await as(Role.BackOffice, http().get(`/loans/${MISSING_ID}`)).expect(404);
      await as(Role.BackOffice, http().get('/loans/not-a-uuid')).expect(400);
    });

    it('requires authentication', async () => {
      await http().get(`/loans/${MISSING_ID}`).expect(401);
    });
  });

  describe('GET /borrowers/:id/loans', () => {
    it.each([Role.BackOffice, Role.FieldAgent])(
      'lists the borrower loans to %s, newest disbursement first',
      async (role) => {
        const own = await fixtures.borrower('Ana');
        const older = await createLoan(validBody(own.id));
        const newer = await createLoan({
          ...validBody(own.id),
          disbursedAt: '2026-03-10',
          principalCents: 100000,
          installmentCount: 2,
        });

        const response = await as(role, http().get(`/borrowers/${own.id}/loans`)).expect(200);

        expect(response.body).toEqual([
          {
            id: newer.id,
            fund: { id: fund.id, name: fund.name },
            principalCents: 100000,
            totalCents: 105000,
            installmentCount: 2,
            disbursedAt: '2026-03-10',
            createdAt: newer.createdAt,
          },
          {
            id: older.id,
            fund: { id: fund.id, name: fund.name },
            principalCents: 320000,
            totalCents: 336000,
            installmentCount: 3,
            disbursedAt: '2026-01-31',
            createdAt: older.createdAt,
          },
        ]);
      },
    );

    it('returns 404 for a missing borrower and 400 for a non-UUID id', async () => {
      await as(Role.BackOffice, http().get(`/borrowers/${MISSING_ID}/loans`)).expect(404);
      await as(Role.BackOffice, http().get('/borrowers/not-a-uuid/loans')).expect(400);
    });

    it('requires authentication', async () => {
      await http().get(`/borrowers/${borrower.id}/loans`).expect(401);
    });
  });

  describe('DELETE /borrowers/:id', () => {
    it('returns 409 when the borrower has loans, keeping the borrower', async () => {
      const own = await fixtures.borrower('Joana');
      await createLoan(validBody(own.id));

      const response = await as(Role.BackOffice, http().delete(`/borrowers/${own.id}`)).expect(409);
      expect(response.body.message).toBe('Borrower has loans');
      await as(Role.BackOffice, http().get(`/borrowers/${own.id}`)).expect(200);
    });
  });
});
