import { Test } from '@nestjs/testing';
import { AuthModule } from '../../src/auth/auth.module.js';

describe('AuthModule', () => {
  it('resolves its dependency graph without errors', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AuthModule] }).compile();
    const app = moduleRef.createNestApplication();

    await app.init();
    await app.close();
  });
});
