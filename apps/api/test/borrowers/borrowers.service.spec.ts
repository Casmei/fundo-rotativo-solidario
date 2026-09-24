import { ConflictException, NotFoundException } from '@nestjs/common';
import { BorrowersService } from '../../src/borrowers/borrowers.service.js';
import type { Database } from '../../src/db/db.module.js';
import type { Borrower } from '../../src/db/schema.js';

const borrower: Borrower = {
  id: '5f0c2c1e-6c5b-4c1a-9a57-2f1d8a1b9c11',
  name: 'Maria',
  cpf: '52998224725',
  createdAt: new Date(),
  updatedAt: new Date(),
};

const uniqueViolation = new Error('Failed query', { cause: { code: '23505' } });

function createInsertDb(result: () => Promise<Borrower[]>) {
  const returning = vi.fn().mockImplementation(result);
  const values = vi.fn().mockReturnValue({ returning });
  const insert = vi.fn().mockReturnValue({ values });
  return { db: { insert } as unknown as Database, values };
}

function createSelectDb(rows: Borrower[]) {
  const limit = vi.fn().mockResolvedValue(rows);
  const where = vi.fn().mockReturnValue({ limit });
  const orderBy = vi.fn().mockResolvedValue(rows);
  const from = vi.fn().mockReturnValue({ where, orderBy });
  const select = vi.fn().mockReturnValue({ from });
  return { db: { select } as unknown as Database, orderBy };
}

function createUpdateDb(result: () => Promise<Borrower[]>) {
  const returning = vi.fn().mockImplementation(result);
  const where = vi.fn().mockReturnValue({ returning });
  const set = vi.fn().mockReturnValue({ where });
  const update = vi.fn().mockReturnValue({ set });
  return { db: { update } as unknown as Database, update, set };
}

function createDeleteDb(rows: { id: string }[]) {
  const returning = vi.fn().mockResolvedValue(rows);
  const where = vi.fn().mockReturnValue({ returning });
  const del = vi.fn().mockReturnValue({ where });
  return { db: { delete: del } as unknown as Database };
}

describe('BorrowersService', () => {
  describe('create', () => {
    it('stores the normalized CPF and returns the borrower', async () => {
      const { db, values } = createInsertDb(async () => [borrower]);
      const service = new BorrowersService(db);

      const result = await service.create({ name: 'Maria', cpf: '529.982.247-25' });

      expect(values).toHaveBeenCalledWith({ name: 'Maria', cpf: '52998224725' });
      expect(result).toBe(borrower);
    });

    it('throws ConflictException on duplicate CPF', async () => {
      const { db } = createInsertDb(async () => {
        throw uniqueViolation;
      });
      const service = new BorrowersService(db);

      await expect(service.create({ name: 'Maria', cpf: '52998224725' })).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('rethrows unrelated errors', async () => {
      const boom = new Error('boom');
      const { db } = createInsertDb(async () => {
        throw boom;
      });
      const service = new BorrowersService(db);

      await expect(service.create({ name: 'Maria', cpf: '52998224725' })).rejects.toBe(boom);
    });
  });

  describe('findAll', () => {
    it('returns borrowers ordered by name', async () => {
      const { db, orderBy } = createSelectDb([borrower]);
      const service = new BorrowersService(db);

      expect(await service.findAll()).toEqual([borrower]);
      expect(orderBy).toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('returns the borrower', async () => {
      const service = new BorrowersService(createSelectDb([borrower]).db);
      expect(await service.findOne(borrower.id)).toBe(borrower);
    });

    it('throws NotFoundException when missing', async () => {
      const service = new BorrowersService(createSelectDb([]).db);
      await expect(service.findOne(borrower.id)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('update', () => {
    it('updates only the provided fields, normalizing the CPF', async () => {
      const { db, set } = createUpdateDb(async () => [borrower]);
      const service = new BorrowersService(db);

      await service.update(borrower.id, { cpf: '529.982.247-25' });

      expect(set).toHaveBeenCalledWith({ cpf: '52998224725' });
    });

    it('returns the current borrower without writing when the body is empty', async () => {
      const selectDb = createSelectDb([borrower]);
      const { update } = createUpdateDb(async () => []);
      const db = { ...selectDb.db, update } as unknown as Database;
      const service = new BorrowersService(db);

      expect(await service.update(borrower.id, {})).toBe(borrower);
      expect(update).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when missing', async () => {
      const service = new BorrowersService(createUpdateDb(async () => []).db);
      await expect(service.update(borrower.id, { name: 'Ana' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('throws ConflictException on duplicate CPF', async () => {
      const service = new BorrowersService(
        createUpdateDb(async () => {
          throw uniqueViolation;
        }).db,
      );
      await expect(service.update(borrower.id, { cpf: '52998224725' })).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  describe('remove', () => {
    it('resolves when a row was deleted', async () => {
      const service = new BorrowersService(createDeleteDb([{ id: borrower.id }]).db);
      await expect(service.remove(borrower.id)).resolves.toBeUndefined();
    });

    it('throws NotFoundException when missing', async () => {
      const service = new BorrowersService(createDeleteDb([]).db);
      await expect(service.remove(borrower.id)).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
