import { DomainError } from '@/shared/domain/errors/domain.error';

export class ConcurrentBalanceUpdateError extends DomainError {
  constructor(employeeId: string, locationId: string) {
    super(
      `Concurrent balance update detected for employeeId=${employeeId} and locationId=${locationId}.`,
    );
  }
}
