import type { Role } from '../shared/role.enum.js';

export interface AuthTokenPayload {
  sub: string;
  phone: string;
  role: Role;
  name: string;
}
