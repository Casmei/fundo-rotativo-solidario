import { applyDecorators } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { ApiErrorResponse } from './api-error-response.decorator.js';
import { BEARER_AUTH } from './bearer-auth.js';

export function ApiAuthenticated() {
  return applyDecorators(
    ApiBearerAuth(BEARER_AUTH),
    ApiErrorResponse(401, 'Token ausente, inválido ou expirado.'),
  );
}

export function ApiBackOfficeOnly() {
  return ApiErrorResponse(403, 'Ação restrita ao perfil `back_office`.');
}
