import { Controller, Get, type INestApplication, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import type { AuthTokenPayload } from '../../src/auth/auth-token-payload.js';
import { CurrentUser } from '../../src/auth/decorators/current-user.decorator.js';
import { Public } from '../../src/auth/decorators/public.decorator.js';
import { Roles } from '../../src/auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../../src/auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../src/auth/guards/roles.guard.js';
import { Role } from '../../src/shared/role.enum.js';

const TEST_JWT_SECRET = 'test-secret';

@Controller('test')
class GuardTestController {
  @Public()
  @Get('public')
  getPublic() {
    return { ok: true };
  }

  @Get('protected')
  getProtected(@CurrentUser() user: AuthTokenPayload) {
    return { phone: user.phone };
  }

  @Roles(Role.BackOffice)
  @Get('back-office-only')
  getBackOfficeOnly() {
    return { ok: true };
  }
}

@Module({
  imports: [JwtModule.register({ secret: TEST_JWT_SECRET, signOptions: { expiresIn: '1h' } })],
  controllers: [GuardTestController],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
class GuardTestModule {}

describe('Guards (e2e)', () => {
  let app: INestApplication<App>;
  let jwtService: JwtService;

  const fieldAgentPayload: AuthTokenPayload = {
    sub: 'user-1',
    phone: '5533900000001',
    role: Role.FieldAgent,
    name: 'Luana',
  };
  const backOfficePayload: AuthTokenPayload = {
    sub: 'user-2',
    phone: '5533900000002',
    role: Role.BackOffice,
    name: 'Bruno',
  };

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [GuardTestModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    jwtService = moduleFixture.get(JwtService);
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('allows a @Public() route without a token', () => {
    return request(app.getHttpServer()).get('/test/public').expect(200);
  });

  it('rejects a protected route without a token', () => {
    return request(app.getHttpServer()).get('/test/protected').expect(401);
  });

  it('allows a protected route with a valid token', async () => {
    const token = await jwtService.signAsync(fieldAgentPayload);

    return request(app.getHttpServer())
      .get('/test/protected')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
      .expect({ phone: fieldAgentPayload.phone });
  });

  it('rejects a role-restricted route for the wrong role', async () => {
    const token = await jwtService.signAsync(fieldAgentPayload);

    return request(app.getHttpServer())
      .get('/test/back-office-only')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('allows a role-restricted route for the right role', async () => {
    const token = await jwtService.signAsync(backOfficePayload);

    return request(app.getHttpServer())
      .get('/test/back-office-only')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  });
});
