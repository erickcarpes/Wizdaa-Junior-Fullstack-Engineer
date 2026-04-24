import { DomainError } from '@/shared/domain/errors/domain.error';

export class BalanceProjectionNotFoundError extends DomainError {
  constructor(employeeId: string, locationId: string) {
    super(
      `Balance projection not found for employeeId=${employeeId} and locationId=${locationId}.`,
    );
  }
}
