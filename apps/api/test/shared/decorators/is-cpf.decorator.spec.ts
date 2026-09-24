import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { IsCpf } from '../../../src/shared/decorators/is-cpf.decorator.js';

class Target {
  @IsCpf()
  cpf: unknown;
}

async function errorsFor(cpf: unknown) {
  return validate(plainToInstance(Target, { cpf }));
}

describe('IsCpf', () => {
  it('passes for a valid masked CPF', async () => {
    expect(await errorsFor('529.982.247-25')).toHaveLength(0);
  });

  it('fails for an invalid CPF with a readable message', async () => {
    const [error] = await errorsFor('52998224724');
    expect(error.constraints).toEqual({ isCpf: 'cpf must be a valid CPF' });
  });

  it('fails for a non-string value', async () => {
    expect(await errorsFor(52998224725)).toHaveLength(1);
  });

  it('fails when missing', async () => {
    expect(await errorsFor(undefined)).toHaveLength(1);
  });
});
