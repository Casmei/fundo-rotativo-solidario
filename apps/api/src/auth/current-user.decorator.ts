import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthTokenPayload } from './auth-token-payload.js';

export function getCurrentUserFromContext(ctx: ExecutionContext): AuthTokenPayload {
  const request = ctx.switchToHttp().getRequest<Request & { user: AuthTokenPayload }>();
  return request.user;
}

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) =>
  getCurrentUserFromContext(ctx),
);
