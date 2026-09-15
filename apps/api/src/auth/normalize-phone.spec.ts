import { normalizePhone } from './normalize-phone.js';

describe('normalizePhone', () => {
  it('strips formatting characters, keeping only digits', () => {
    expect(normalizePhone('(11) 91234-5678')).toBe('11912345678');
  });

  it('keeps a string that is already digits-only unchanged', () => {
    expect(normalizePhone('11912345678')).toBe('11912345678');
  });

  it('strips a leading plus sign from an international format', () => {
    expect(normalizePhone('+55 11 91234-5678')).toBe('5511912345678');
  });
});
