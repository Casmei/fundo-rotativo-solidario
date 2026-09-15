import type { Database } from './db.module.js';
import { upsertSeedUser } from './upsert-seed-user.js';

function createMockDb(existingUser: Record<string, unknown> | undefined) {
  const limit = vi.fn().mockResolvedValue(existingUser ? [existingUser] : []);
  const where = vi.fn().mockReturnValue({ limit });
  const from = vi.fn().mockReturnValue({ where });
  const select = vi.fn().mockReturnValue({ from });

  const values = vi.fn().mockResolvedValue(undefined);
  const insert = vi.fn().mockReturnValue({ values });

  return { select, insert } as unknown as Database;
}

describe('upsertSeedUser', () => {
  it('creates a new user when no user with that phone exists', async () => {
    const db = createMockDb(undefined);

    const result = await upsertSeedUser(db, {
      name: 'Bruno',
      phone: '5533900000001',
      password: 'bruno-real-password',
      role: 'back_office',
    });

    expect(result).toBe('created');
    expect(db.insert).toHaveBeenCalled();
  });

  it('skips when a user with that phone already exists', async () => {
    const db = createMockDb({ id: '1', phone: '5533900000001' });

    const result = await upsertSeedUser(db, {
      name: 'Bruno',
      phone: '5533900000001',
      password: 'bruno-real-password',
      role: 'back_office',
    });

    expect(result).toBe('skipped');
    expect(db.insert).not.toHaveBeenCalled();
  });
});
