import type { Borrower } from '../db/schema.js';
import { Role } from '../shared/role.enum.js';

export interface BorrowerListItem {
  id: string;
  name: string;
}

export interface BorrowerResponse {
  id: string;
  name: string;
  cpf?: string;
  createdAt: Date;
  updatedAt: Date;
}

export function toBorrowerListItem(borrower: Borrower): BorrowerListItem {
  return { id: borrower.id, name: borrower.name };
}

export function toBorrowerResponse(borrower: Borrower, role: Role): BorrowerResponse {
  const response: BorrowerResponse = {
    id: borrower.id,
    name: borrower.name,
    createdAt: borrower.createdAt,
    updatedAt: borrower.updatedAt,
  };
  if (role === Role.BackOffice) {
    response.cpf = borrower.cpf;
  }
  return response;
}
