import { eq } from 'drizzle-orm';
import type { Database } from '../../src/db/db.module.js';
import { users } from '../../src/db/schema.js';
import { upsertSeedUser } from '../../src/db/upsert-seed-user.js';

function createMockDb(existingUser: Record<string, unknown> | undefined) {
  const limit = vi.fn().mockResolvedValue(existingUser ? [existingUser] : []);
  const where = vi.fn().mockReturnValue({ limit });
  const from = vi.fn().mockReturnValue({ where });
  const select = vi.fn().mockReturnValue({ from });

  const values = vi.fn().mockResolvedValue(undefined);
  const insert = vi.fn().mockReturnValue({ values });

  return { select, insert, where, values } as unknown as Database & {
    where: typeof where;
    values: typeof values;
  };
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

  it('normalizes a formatted phone before looking it up and before inserting', async () => {
    const db = createMockDb(undefined);

    await upsertSeedUser(db, {
      name: 'Bruno',
      phone: '(11) 91234-5678',
      password: 'bruno-real-password',
      role: 'back_office',
    });

    expect(db.where).toHaveBeenCalledWith(eq(users.phone, '11912345678'));
    expect(db.values).toHaveBeenCalledWith(expect.objectContaining({ phone: '11912345678' }));
  });
});
