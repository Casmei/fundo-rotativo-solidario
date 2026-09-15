import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcrypt';
import { eq } from 'drizzle-orm';
import type { Database } from '../db/db.module.js';
import { DRIZZLE } from '../db/db.module.js';
import { users } from '../db/schema.js';
import type { AuthTokenPayload } from './auth-token-payload.js';
import { normalizePhone } from './normalize-phone.js';

@Injectable()
export class AuthService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly jwtService: JwtService,
  ) {}

  async login(phone: string, password: string): Promise<{ accessToken: string }> {
    const normalizedPhone = normalizePhone(phone);
    const [user] = await this.db
      .select()
      .from(users)
      .where(eq(users.phone, normalizedPhone))
      .limit(1);

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const payload: AuthTokenPayload = {
      sub: user.id,
      phone: user.phone,
      role: user.role,
      name: user.name,
    };

    const accessToken = await this.jwtService.signAsync(payload);
    return { accessToken };
  }
}
