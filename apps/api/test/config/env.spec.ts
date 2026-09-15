import { loadEnv } from '../../src/config/env.js';

describe('loadEnv', () => {
  it('returns parsed values when all required vars are present', () => {
    const env = loadEnv({
      DATABASE_URL: 'postgresql://frs:frs@localhost:5432/frs',
      JWT_SECRET: 'test-secret',
      PORT: '4000',
    });

    expect(env.DATABASE_URL).toBe('postgresql://frs:frs@localhost:5432/frs');
    expect(env.JWT_SECRET).toBe('test-secret');
    expect(env.PORT).toBe(4000);
  });

  it('defaults PORT to 3000 when not set', () => {
    const env = loadEnv({
      DATABASE_URL: 'postgresql://frs:frs@localhost:5432/frs',
      JWT_SECRET: 'test-secret',
    });

    expect(env.PORT).toBe(3000);
  });

  it('throws when DATABASE_URL is missing', () => {
    expect(() => loadEnv({ JWT_SECRET: 'test-secret' })).toThrow(/DATABASE_URL/);
  });

  it('throws when JWT_SECRET is missing', () => {
    expect(() => loadEnv({ DATABASE_URL: 'postgresql://frs:frs@localhost:5432/frs' })).toThrow(
      /JWT_SECRET/,
    );
  });

  it('throws when DATABASE_URL is an empty string', () => {
    expect(() => loadEnv({ DATABASE_URL: '', JWT_SECRET: 'secret' })).toThrow(/DATABASE_URL/);
  });
});
