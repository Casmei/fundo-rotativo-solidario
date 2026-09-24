import { UnauthorizedException } from '@nestjs/common';
import type { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcrypt';
import { AuthService } from '../../src/auth/auth.service.js';
import type { Database } from '../../src/db/db.module.js';
import { Role } from '../../src/shared/role.enum.js';

function createMockDb(
  user:
    | {
        id: string;
        phone: string;
        passwordHash: string;
        role: Role;
        name: string;
      }
    | undefined,
) {
  const limit = vi.fn().mockResolvedValue(user ? [user] : []);
  const where = vi.fn().mockReturnValue({ limit });
  const from = vi.fn().mockReturnValue({ where });
  const select = vi.fn().mockReturnValue({ from });

  return { select } as unknown as Database;
}

describe('AuthService', () => {
  it('returns an access token for correct credentials', async () => {
    const passwordHash = await bcrypt.hash('correct-password', 10);
    const db = createMockDb({
      id: '1',
      phone: '123',
      passwordHash,
      role: Role.BackOffice,
      name: 'Bruno',
    });
    const jwtService = {
      signAsync: vi.fn().mockResolvedValue('signed-token'),
    } as unknown as JwtService;
    const service = new AuthService(db, jwtService);

    const result = await service.login('123', 'correct-password');

    expect(result).toEqual({ accessToken: 'signed-token' });
    expect(jwtService.signAsync).toHaveBeenCalledWith({
      sub: '1',
      phone: '123',
      role: Role.BackOffice,
      name: 'Bruno',
    });
  });

  it('throws UnauthorizedException when the phone does not exist', async () => {
    const db = createMockDb(undefined);
    const jwtService = { signAsync: vi.fn() } as unknown as JwtService;
    const service = new AuthService(db, jwtService);

    await expect(service.login('000', 'whatever')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('throws UnauthorizedException when the password is wrong', async () => {
    const passwordHash = await bcrypt.hash('correct-password', 10);
    const db = createMockDb({
      id: '1',
      phone: '123',
      passwordHash,
      role: Role.FieldAgent,
      name: 'Luana',
    });
    const jwtService = { signAsync: vi.fn() } as unknown as JwtService;
    const service = new AuthService(db, jwtService);

    await expect(service.login('123', 'wrong-password')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
