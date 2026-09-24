import { roleEnum } from '../../src/db/schema.js';
import { Role } from '../../src/shared/role.enum.js';

describe('Role', () => {
  it('maps to the persisted role values', () => {
    expect(Role.FieldAgent).toBe('field_agent');
    expect(Role.BackOffice).toBe('back_office');
  });

  it('is the source of the database role enum', () => {
    expect([...roleEnum.enumValues].sort()).toEqual(['back_office', 'field_agent']);
  });
});
