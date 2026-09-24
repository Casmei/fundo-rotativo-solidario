import { toBorrowerListItem, toBorrowerResponse } from '../../src/borrowers/borrower-response.js';
import type { Borrower } from '../../src/db/schema.js';
import { Role } from '../../src/shared/role.enum.js';

const borrower: Borrower = {
  id: '5f0c2c1e-6c5b-4c1a-9a57-2f1d8a1b9c11',
  name: 'Maria',
  cpf: '52998224725',
  createdAt: new Date('2026-09-01T00:00:00Z'),
  updatedAt: new Date('2026-09-02T00:00:00Z'),
};

describe('toBorrowerResponse', () => {
  it('includes the CPF for back office', () => {
    expect(toBorrowerResponse(borrower, Role.BackOffice)).toEqual(borrower);
  });

  it('omits the CPF for field agents', () => {
    const response = toBorrowerResponse(borrower, Role.FieldAgent);
    expect(response).toEqual({
      id: borrower.id,
      name: 'Maria',
      createdAt: borrower.createdAt,
      updatedAt: borrower.updatedAt,
    });
    expect(response).not.toHaveProperty('cpf');
  });
});

describe('toBorrowerListItem', () => {
  it('returns only id and name', () => {
    expect(toBorrowerListItem(borrower)).toEqual({ id: borrower.id, name: 'Maria' });
  });
});
