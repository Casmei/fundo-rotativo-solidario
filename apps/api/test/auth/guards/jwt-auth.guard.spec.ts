import type { ExecutionContext } from '@nestjs/common';
import { UnauthorizedException } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import type { JwtService } from '@nestjs/jwt';
import { extractBearerToken, JwtAuthGuard } from '../../../src/auth/guards/jwt-auth.guard.js';
import { Role } from '../../../src/shared/role.enum.js';

function createContext(request: {
  headers: Record<string, string | undefined>;
  user?: unknown;
}): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => vi.fn(),
    getClass: () => vi.fn(),
  } as unknown as ExecutionContext;
}

function createGuard(overrides?: { isPublic?: boolean; verifyAsync?: () => Promise<unknown> }) {
  const reflector = {
    getAllAndOverride: vi.fn().mockReturnValue(overrides?.isPublic ?? false),
  } as unknown as Reflector;
  const jwtService = {
    verifyAsync:
      overrides?.verifyAsync ??
      vi.fn().mockResolvedValue({ sub: '1', phone: '123', role: Role.FieldAgent, name: 'Luana' }),
  } as unknown as JwtService;

  return new JwtAuthGuard(jwtService, reflector);
}

describe('extractBearerToken', () => {
  it('returns the token when the header is well formed', () => {
    expect(extractBearerToken('Bearer abc.def.ghi')).toBe('abc.def.ghi');
  });

  it('returns undefined when the header is missing', () => {
    expect(extractBearerToken(undefined)).toBeUndefined();
  });

  it('returns undefined when the scheme is not Bearer', () => {
    expect(extractBearerToken('Basic abc')).toBeUndefined();
  });
});

describe('JwtAuthGuard', () => {
  it('allows access to public routes without checking the token', async () => {
    const guard = createGuard({ isPublic: true });
    const context = createContext({ headers: {} });

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('throws when there is no Authorization header', async () => {
    const guard = createGuard();
    const context = createContext({ headers: {} });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('throws when the token is invalid', async () => {
    const guard = createGuard({ verifyAsync: vi.fn().mockRejectedValue(new Error('bad token')) });
    const context = createContext({ headers: { authorization: 'Bearer bad-token' } });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('attaches the decoded payload to the request and allows access', async () => {
    const guard = createGuard();
    const request = { headers: { authorization: 'Bearer good-token' }, user: undefined as unknown };
    const context = createContext(request);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user).toEqual({ sub: '1', phone: '123', role: Role.FieldAgent, name: 'Luana' });
  });
});
