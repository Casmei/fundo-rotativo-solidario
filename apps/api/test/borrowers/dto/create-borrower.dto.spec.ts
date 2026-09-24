import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateBorrowerDto } from '../../../src/borrowers/dto/create-borrower.dto.js';

async function errorProperties(body: Record<string, unknown>) {
  const errors = await validate(plainToInstance(CreateBorrowerDto, body));
  return errors.map((error) => error.property);
}

describe('CreateBorrowerDto', () => {
  it('accepts a name and a valid CPF', async () => {
    expect(await errorProperties({ name: 'Maria', cpf: '529.982.247-25' })).toEqual([]);
  });

  it('trims the name', () => {
    const dto = plainToInstance(CreateBorrowerDto, { name: '  Maria  ', cpf: '52998224725' });
    expect(dto.name).toBe('Maria');
  });

  it('rejects a whitespace-only name', async () => {
    expect(await errorProperties({ name: '   ', cpf: '52998224725' })).toEqual(['name']);
  });

  it('rejects a missing name', async () => {
    expect(await errorProperties({ cpf: '52998224725' })).toEqual(['name']);
  });

  it('rejects a missing CPF', async () => {
    expect(await errorProperties({ name: 'Maria' })).toEqual(['cpf']);
  });

  it('rejects an invalid CPF', async () => {
    expect(await errorProperties({ name: 'Maria', cpf: '52998224724' })).toEqual(['cpf']);
  });

  it('rejects a numeric CPF', async () => {
    expect(await errorProperties({ name: 'Maria', cpf: 52998224725 })).toEqual(['cpf']);
  });

  it('accepts a name with 255 characters', async () => {
    expect(await errorProperties({ name: 'a'.repeat(255), cpf: '52998224725' })).toEqual([]);
  });

  it('rejects a name longer than 255 characters', async () => {
    expect(await errorProperties({ name: 'a'.repeat(256), cpf: '52998224725' })).toEqual(['name']);
  });
});
