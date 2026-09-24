import { registerDecorator, type ValidationOptions } from 'class-validator';
import { isValidCpf } from '../cpf.js';

export function IsCpf(options?: ValidationOptions): PropertyDecorator {
  return (target, propertyName) => {
    registerDecorator({
      name: 'isCpf',
      target: target.constructor,
      propertyName: propertyName as string,
      options: { message: '$property must be a valid CPF', ...options },
      validator: {
        validate: (value: unknown) => typeof value === 'string' && isValidCpf(value),
      },
    });
  };
}
