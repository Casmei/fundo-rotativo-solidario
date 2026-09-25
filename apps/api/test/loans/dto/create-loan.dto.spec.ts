import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateLoanDto, MAX_PRINCIPAL_CENTS } from '../../../src/loans/dto/create-loan.dto.js';

const valid = {
  borrowerId: '5f0c2c1e-6c5b-4c1a-9a57-2f1d8a1b9c11',
  fundId: '9d7f1a3e-1111-4a57-9a57-2f1d8a1b9c11',
  principalCents: 320000,
  installmentCount: 3,
  disbursedAt: '2026-01-31',
  graceMonths: 2,
};

async function errorProperties(body: Record<string, unknown>) {
  const errors = await validate(plainToInstance(CreateLoanDto, body));
  return errors.map((error) => error.property);
}

describe('CreateLoanDto', () => {
  it('accepts a valid body', async () => {
    expect(await errorProperties(valid)).toEqual([]);
  });

  it('accepts the boundaries', async () => {
    expect(
      await errorProperties({
        ...valid,
        principalCents: MAX_PRINCIPAL_CENTS,
        installmentCount: 1,
        graceMonths: 0,
      }),
    ).toEqual([]);
    expect(await errorProperties({ ...valid, principalCents: 1 })).toEqual([]);
  });

  it.each(Object.keys(valid))('rejects a missing %s', async (field) => {
    const body = Object.fromEntries(Object.entries(valid).filter(([key]) => key !== field));
    expect(await errorProperties(body)).toEqual([field]);
  });

  it.each([
    ['borrowerId', 'abc'],
    ['borrowerId', 123],
    ['fundId', 'not-a-uuid'],
    ['principalCents', 0],
    ['principalCents', -1],
    ['principalCents', 3200.5],
    ['principalCents', '320000'],
    ['principalCents', MAX_PRINCIPAL_CENTS + 1],
    ['principalCents', null],
    ['installmentCount', 0],
    ['installmentCount', 2.5],
    ['installmentCount', '3'],
    ['graceMonths', -1],
    ['graceMonths', 0.5],
    ['graceMonths', '2'],
    ['disbursedAt', '2026-02-30'],
    ['disbursedAt', '2026-01-31T00:00:00Z'],
    ['disbursedAt', 20260131],
    ['disbursedAt', ''],
  ])('rejects %s = %j', async (field, value) => {
    expect(await errorProperties({ ...valid, [field]: value })).toEqual([field]);
  });
});
