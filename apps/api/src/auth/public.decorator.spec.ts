import { IS_PUBLIC_KEY, Public } from './public.decorator.js';

describe('Public decorator', () => {
  it('sets the isPublic metadata to true on the decorated method', () => {
    class TestController {
      @Public()
      method() {}
    }

    const value = Reflect.getMetadata(IS_PUBLIC_KEY, TestController.prototype.method);

    expect(value).toBe(true);
  });
});
