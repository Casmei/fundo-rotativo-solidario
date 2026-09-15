import type { ExecutionContext } from '@nestjs/common';
import { ForbiddenException } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import type { AuthTokenPayload } from '../../../src/auth/auth-token-payload.js';
import { RolesGuard } from '../../../src/auth/guards/roles.guard.js';

function createContext(user: AuthTokenPayload | undefined): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => vi.fn(),
    getClass: () => vi.fn(),
  } as unknown as ExecutionContext;
}

function createGuard(requiredRoles: AuthTokenPayload['role'][] | undefined) {
  const reflector = {
    getAllAndOverride: vi.fn().mockReturnValue(requiredRoles),
  } as unknown as Reflector;
  return new RolesGuard(reflector);
}

describe('RolesGuard', () => {
  const backOfficeUser: AuthTokenPayload = {
    sub: '1',
    phone: '1',
    role: 'back_office',
    name: 'Bruno',
  };
  const fieldAgentUser: AuthTokenPayload = {
    sub: '2',
    phone: '2',
    role: 'field_agent',
    name: 'Luana',
  };

  it('allows access when no roles are required', () => {
    const guard = createGuard(undefined);

    expect(guard.canActivate(createContext(fieldAgentUser))).toBe(true);
  });

  it('allows access when the user has one of the required roles', () => {
    const guard = createGuard(['back_office']);

    expect(guard.canActivate(createContext(backOfficeUser))).toBe(true);
  });

  it('throws when the user role is not among the required roles', () => {
    const guard = createGuard(['back_office']);

    expect(() => guard.canActivate(createContext(fieldAgentUser))).toThrow(ForbiddenException);
  });

  it('throws when there is no authenticated user', () => {
    const guard = createGuard(['back_office']);

    expect(() => guard.canActivate(createContext(undefined))).toThrow(ForbiddenException);
  });
});
