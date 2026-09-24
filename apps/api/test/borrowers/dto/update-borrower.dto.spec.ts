import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateBorrowerDto } from '../../../src/borrowers/dto/update-borrower.dto.js';

async function errorProperties(body: Record<string, unknown>) {
  const errors = await validate(plainToInstance(UpdateBorrowerDto, body));
  return errors.map((error) => error.property);
}

describe('UpdateBorrowerDto', () => {
  it('accepts an empty body', async () => {
    expect(await errorProperties({})).toEqual([]);
  });

  it('accepts only a name', async () => {
    expect(await errorProperties({ name: 'Maria' })).toEqual([]);
  });

  it('accepts only a valid CPF', async () => {
    expect(await errorProperties({ cpf: '111.444.777-35' })).toEqual([]);
  });

  it('rejects a whitespace-only name', async () => {
    expect(await errorProperties({ name: '   ' })).toEqual(['name']);
  });

  it('rejects an invalid CPF', async () => {
    expect(await errorProperties({ cpf: '11144477736' })).toEqual(['cpf']);
  });

  it('rejects a null name', async () => {
    expect(await errorProperties({ name: null })).toEqual(['name']);
  });

  it('rejects a null CPF', async () => {
    expect(await errorProperties({ cpf: null })).toEqual(['cpf']);
  });

  it('accepts a name with 255 characters', async () => {
    expect(await errorProperties({ name: 'a'.repeat(255) })).toEqual([]);
  });

  it('rejects a name longer than 255 characters', async () => {
    expect(await errorProperties({ name: 'a'.repeat(256) })).toEqual(['name']);
  });
});
