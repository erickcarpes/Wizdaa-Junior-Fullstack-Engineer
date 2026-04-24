import { DomainError } from '@/shared/domain/errors/domain.error';

export class InsufficientBalanceError extends DomainError {
  constructor(requestedDays: number, availableDays: number) {
    super(
      `Insufficient balance. Requested ${requestedDays} day(s), but only ${availableDays} day(s) are available.`,
    );
  }
}
