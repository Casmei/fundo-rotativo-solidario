import { registerDecorator, type ValidationOptions } from 'class-validator';
import { isCalendarDate } from '../calendar-date.js';

export function IsCalendarDate(options?: ValidationOptions): PropertyDecorator {
  return (target, propertyName) => {
    registerDecorator({
      name: 'isCalendarDate',
      target: target.constructor,
      propertyName: propertyName as string,
      options: { message: '$property must be a valid date in YYYY-MM-DD format', ...options },
      validator: {
        validate: (value: unknown) => isCalendarDate(value),
      },
    });
  };
}
