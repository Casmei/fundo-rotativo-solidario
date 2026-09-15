import type { ExecutionContext } from '@nestjs/common';
import type { AuthTokenPayload } from './auth-token-payload.js';
import { getCurrentUserFromContext } from './current-user.decorator.js';

describe('getCurrentUserFromContext', () => {
  it('returns the user attached to the request by JwtAuthGuard', () => {
    const user: AuthTokenPayload = { sub: '1', phone: '123', role: 'field_agent', name: 'Luana' };
    const context = {
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    } as unknown as ExecutionContext;

    expect(getCurrentUserFromContext(context)).toBe(user);
  });
});
