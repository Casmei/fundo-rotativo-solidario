import {
  DEV_FALLBACK_BRUNO_PASSWORD,
  DEV_FALLBACK_LUANA_PASSWORD,
  loadSeedEnv,
} from './seed.env.js';

describe('loadSeedEnv', () => {
  it('returns the provided values when all vars are set', () => {
    const env = loadSeedEnv({
      SEED_BRUNO_PHONE: '5533900000001',
      SEED_BRUNO_PASSWORD: 'bruno-real-password',
      SEED_LUANA_PHONE: '5533900000002',
      SEED_LUANA_PASSWORD: 'luana-real-password',
    });

    expect(env.SEED_BRUNO_PHONE).toBe('5533900000001');
    expect(env.SEED_BRUNO_PASSWORD).toBe('bruno-real-password');
    expect(env.SEED_LUANA_PHONE).toBe('5533900000002');
    expect(env.SEED_LUANA_PASSWORD).toBe('luana-real-password');
  });

  it('falls back to dev passwords when they are not set', () => {
    const env = loadSeedEnv({
      SEED_BRUNO_PHONE: '5533900000001',
      SEED_LUANA_PHONE: '5533900000002',
    });

    expect(env.SEED_BRUNO_PASSWORD).toBe(DEV_FALLBACK_BRUNO_PASSWORD);
    expect(env.SEED_LUANA_PASSWORD).toBe(DEV_FALLBACK_LUANA_PASSWORD);
  });

  it('falls back to dev passwords when they are set to an empty string', () => {
    const env = loadSeedEnv({
      SEED_BRUNO_PHONE: '5533900000001',
      SEED_BRUNO_PASSWORD: '',
      SEED_LUANA_PHONE: '5533900000002',
      SEED_LUANA_PASSWORD: '',
    });

    expect(env.SEED_BRUNO_PASSWORD).toBe(DEV_FALLBACK_BRUNO_PASSWORD);
    expect(env.SEED_LUANA_PASSWORD).toBe(DEV_FALLBACK_LUANA_PASSWORD);
  });

  it('throws when SEED_BRUNO_PHONE is missing', () => {
    expect(() => loadSeedEnv({ SEED_LUANA_PHONE: '5533900000002' })).toThrow(/SEED_BRUNO_PHONE/);
  });

  it('throws when SEED_LUANA_PHONE is missing', () => {
    expect(() => loadSeedEnv({ SEED_BRUNO_PHONE: '5533900000001' })).toThrow(/SEED_LUANA_PHONE/);
  });
});
