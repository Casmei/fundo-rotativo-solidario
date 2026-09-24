import { ROLES_KEY, Roles } from '../../../src/auth/decorators/roles.decorator.js';
import { Role } from '../../../src/shared/role.enum.js';

describe('Roles decorator', () => {
  it('sets the roles metadata on the decorated method', () => {
    class TestController {
      @Roles(Role.BackOffice, Role.FieldAgent)
      method() {}
    }

    const value = Reflect.getMetadata(ROLES_KEY, TestController.prototype.method);

    expect(value).toEqual([Role.BackOffice, Role.FieldAgent]);
  });
});
