import type { Role } from '../db/schema.js';

export interface AuthTokenPayload {
  sub: string;
  phone: string;
  role: Role;
  name: string;
}
