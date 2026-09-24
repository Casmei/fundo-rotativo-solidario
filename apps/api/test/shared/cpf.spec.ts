import { isValidCpf, normalizeCpf } from '../../src/shared/cpf.js';

describe('normalizeCpf', () => {
  it('strips mask characters', () => {
    expect(normalizeCpf('529.982.247-25')).toBe('52998224725');
  });

  it('keeps digits-only input unchanged', () => {
    expect(normalizeCpf('52998224725')).toBe('52998224725');
  });
});

describe('isValidCpf', () => {
  it.each(['52998224725', '529.982.247-25', '111.444.777-35', '12345678909', ' 529.982.247-25 '])(
    'accepts %s',
    (cpf) => {
      expect(isValidCpf(cpf)).toBe(true);
    },
  );

  it.each(['52998224724', '52998224715'])('rejects wrong check digits: %s', (cpf) => {
    expect(isValidCpf(cpf)).toBe(false);
  });

  it.each(['00000000000', '11111111111', '999.999.999-99'])(
    'rejects repeated digits: %s',
    (cpf) => {
      expect(isValidCpf(cpf)).toBe(false);
    },
  );

  it.each(['5299822472', '529982247250', ''])('rejects wrong length: %s', (cpf) => {
    expect(isValidCpf(cpf)).toBe(false);
  });

  it('rejects input with non-mask characters', () => {
    expect(isValidCpf('abc529.982.247-25')).toBe(false);
  });
});
