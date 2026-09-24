import type { ExecutionContext } from '@nestjs/common';
import type { AuthTokenPayload } from '../../../src/auth/auth-token-payload.js';
import { getCurrentUserFromContext } from '../../../src/auth/decorators/current-user.decorator.js';
import { Role } from '../../../src/shared/role.enum.js';

describe('getCurrentUserFromContext', () => {
  it('returns the user attached to the request by JwtAuthGuard', () => {
    const user: AuthTokenPayload = { sub: '1', phone: '123', role: Role.FieldAgent, name: 'Luana' };
    const context = {
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    } as unknown as ExecutionContext;

    expect(getCurrentUserFromContext(context)).toBe(user);
  });
});
