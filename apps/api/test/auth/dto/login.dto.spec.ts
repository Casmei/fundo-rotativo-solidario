import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { LoginDto } from '../../../src/auth/dto/login.dto.js';

describe('LoginDto', () => {
  it('passes validation with phone and password', async () => {
    const dto = plainToInstance(LoginDto, { phone: '11912345678', password: 'secret123' });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('fails validation when phone is missing', async () => {
    const dto = plainToInstance(LoginDto, { password: 'secret123' });

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'phone')).toBe(true);
  });

  it('fails validation when password is missing', async () => {
    const dto = plainToInstance(LoginDto, { phone: '11912345678' });

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'password')).toBe(true);
  });
});
