import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { setupSwagger } from './swagger.js';

export const GLOBAL_PREFIX = 'api';

export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix(GLOBAL_PREFIX);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  setupSwagger(app);
}
