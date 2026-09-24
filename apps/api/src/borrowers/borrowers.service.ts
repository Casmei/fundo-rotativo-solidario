import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';
import type { Database } from '../db/db.module.js';
import { DRIZZLE } from '../db/db.module.js';
import { isUniqueViolation } from '../db/is-unique-violation.js';
import { type Borrower, borrowers, type NewBorrower } from '../db/schema.js';
import { normalizeCpf } from '../shared/cpf.js';
import type { CreateBorrowerDto } from './dto/create-borrower.dto.js';
import type { UpdateBorrowerDto } from './dto/update-borrower.dto.js';

function rethrowAsConflict(error: unknown): never {
  if (isUniqueViolation(error)) {
    throw new ConflictException('Borrower with this CPF already exists');
  }
  throw error;
}

@Injectable()
export class BorrowersService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async create(input: CreateBorrowerDto): Promise<Borrower> {
    try {
      const [borrower] = await this.db
        .insert(borrowers)
        .values({ name: input.name, cpf: normalizeCpf(input.cpf) })
        .returning();
      return borrower;
    } catch (error) {
      rethrowAsConflict(error);
    }
  }

  findAll(): Promise<Borrower[]> {
    return this.db.select().from(borrowers).orderBy(asc(borrowers.name));
  }

  async findOne(id: string): Promise<Borrower> {
    const [borrower] = await this.db.select().from(borrowers).where(eq(borrowers.id, id)).limit(1);
    if (!borrower) {
      throw new NotFoundException('Borrower not found');
    }
    return borrower;
  }

  async update(id: string, input: UpdateBorrowerDto): Promise<Borrower> {
    const changes: Partial<NewBorrower> = {};
    if (input.name !== undefined) {
      changes.name = input.name;
    }
    if (input.cpf !== undefined) {
      changes.cpf = normalizeCpf(input.cpf);
    }
    if (Object.keys(changes).length === 0) {
      return this.findOne(id);
    }

    let updated: Borrower | undefined;
    try {
      [updated] = await this.db
        .update(borrowers)
        .set(changes)
        .where(eq(borrowers.id, id))
        .returning();
    } catch (error) {
      rethrowAsConflict(error);
    }
    if (!updated) {
      throw new NotFoundException('Borrower not found');
    }
    return updated;
  }

  async remove(id: string): Promise<void> {
    const [deleted] = await this.db
      .delete(borrowers)
      .where(eq(borrowers.id, id))
      .returning({ id: borrowers.id });
    if (!deleted) {
      throw new NotFoundException('Borrower not found');
    }
  }
}
