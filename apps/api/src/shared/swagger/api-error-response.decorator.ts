import { ApiResponse } from '@nestjs/swagger';
import { ErrorResponseDto } from './error-response.dto.js';

const STATUS_NAMES: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
};

export function ApiErrorResponse(
  status: keyof typeof STATUS_NAMES,
  description: string,
  message: string | string[] = STATUS_NAMES[status],
) {
  return ApiResponse({
    status,
    description,
    type: ErrorResponseDto,
    example: { statusCode: status, message, error: STATUS_NAMES[status] },
  });
}
