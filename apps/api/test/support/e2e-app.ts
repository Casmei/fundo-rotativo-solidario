import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import type { App } from 'supertest/types.js';
import { AppModule } from '../../src/app.module.js';
import type { AuthTokenPayload } from '../../src/auth/auth-token-payload.js';
import { loadEnv } from '../../src/config/env.js';
import { Role } from '../../src/shared/role.enum.js';

export async function createTestApp(): Promise<INestApplication<App>> {
  const moduleFixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleFixture.createNestApplication<INestApplication<App>>();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.init();
  return app;
}

export async function signTestTokens(): Promise<Record<Role, string>> {
  const jwt = new JwtService({ secret: loadEnv().JWT_SECRET });
  const payload = (role: Role): AuthTokenPayload => ({ sub: 'e2e', phone: '0', role, name: 'E2E' });
  return {
    [Role.BackOffice]: await jwt.signAsync(payload(Role.BackOffice)),
    [Role.FieldAgent]: await jwt.signAsync(payload(Role.FieldAgent)),
  };
}
