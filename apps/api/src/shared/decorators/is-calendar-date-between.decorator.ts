import { registerDecorator, type ValidationOptions } from 'class-validator';
import { isCalendarDate } from '../calendar-date.js';

export function IsCalendarDateBetween(
  min: string,
  max: string,
  options?: ValidationOptions,
): PropertyDecorator {
  return (target, propertyName) => {
    registerDecorator({
      name: 'isCalendarDateBetween',
      target: target.constructor,
      propertyName: propertyName as string,
      options: { message: `$property must be between ${min} and ${max}`, ...options },
      validator: {
        validate: (value: unknown) => isCalendarDate(value) && value >= min && value <= max,
      },
    });
  };
}
