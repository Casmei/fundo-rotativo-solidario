import { ROLES_KEY, Roles } from '../../../src/auth/decorators/roles.decorator.js';

describe('Roles decorator', () => {
  it('sets the roles metadata on the decorated method', () => {
    class TestController {
      @Roles('back_office', 'field_agent')
      method() {}
    }

    const value = Reflect.getMetadata(ROLES_KEY, TestController.prototype.method);

    expect(value).toEqual(['back_office', 'field_agent']);
  });
});
